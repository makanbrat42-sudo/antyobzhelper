import { createHash } from "node:crypto";
import { formatDate, formatDateTime } from "@/lib/labels";
import { prisma } from "../db";
import { env } from "../env";
import { getSettings, getSetting } from "../settings";
import { publish } from "../audit";
import { describeVkError, VK_ERROR_HINTS, vkBotConfigured, vkCall } from "./vk-api";

// VK-бот пишет ТОЛЬКО сотрудникам (активным пользователям системы).
// Отправка произвольному peer_id намеренно не предусмотрена — кандидаты не получают автоматических сообщений.

export type BotAction = "approve" | "reject";
export type ButtonPayload = { a: BotAction; id: number };

const MAX_LEN = 3900;

function randomIdFor(key: string): number {
  // Детерминированный random_id: повторная попытка доставки не создаст дубль сообщения у VK.
  const h = createHash("sha256").update(key).digest();
  return (h.readUInt32BE(0) & 0x7fffffff) || 1;
}

type AppForMessage = {
  id: number;
  nickname: string;
  fullName: string | null;
  vkId: string | null;
  vkProfileRaw: string | null;
  submittedAt: Date;
  answers: { question: string; answer: string; position: number }[];
};

export function formatApplicationMessage(app: AppForMessage, statusLine: string, tz = "Europe/Moscow"): string {
  const vk = app.vkId ? `vk.com/id${app.vkId}` : (app.vkProfileRaw ?? "—");
  const head = [
    "ANTYOBZHELP | НОВАЯ ЗАЯВКА",
    "",
    `Номер: #${app.id}`,
    `Кандидат: ${app.nickname}${app.fullName ? ` (${app.fullName})` : ""}`,
    `VK: ${vk}`,
    `Дата: ${formatDate(app.submittedAt, tz)}`,
    "",
    "АНКЕТА",
  ].join("\n");
  const tail = `\n\nСтатус: ${statusLine}`;
  let body = "";
  const sorted = [...app.answers].sort((a, b) => a.position - b.position);
  sorted.forEach((a, i) => {
    body += `\n\nВопрос ${i + 1}: ${a.question}\nОтвет: ${a.answer || "—"}`;
  });
  if (head.length + body.length + tail.length > MAX_LEN) {
    const link = `\n\n… анкета сокращена. Полностью: ${env.appUrl}/applications/${app.id}`;
    body = body.slice(0, MAX_LEN - head.length - tail.length - link.length) + link;
  }
  return head + body + tail;
}

export function reviewKeyboard(appId: number, opts: { approve: boolean; reject: boolean }) {
  const row: unknown[] = [];
  if (opts.approve) {
    row.push({ action: { type: "callback", label: "✅ ПРИНЯТЬ", payload: JSON.stringify({ a: "approve", id: appId }) }, color: "positive" });
  }
  if (opts.reject) {
    row.push({ action: { type: "callback", label: "❌ ОТКЛОНИТЬ", payload: JSON.stringify({ a: "reject", id: appId }) }, color: "negative" });
  }
  const buttons: unknown[][] = [];
  if (row.length) buttons.push(row);
  buttons.push([{ action: { type: "open_link", label: "Открыть на сайте", link: `${env.appUrl}/applications/${appId}` } }]);
  return JSON.stringify({ inline: true, buttons });
}

const EMPTY_KEYBOARD = JSON.stringify({ inline: true, buttons: [] });

export function parseButtonPayload(raw: unknown): ButtonPayload | null {
  let p: unknown = raw;
  if (typeof raw === "string") {
    try {
      p = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if ((o.a === "approve" || o.a === "reject") && typeof o.id === "number" && Number.isInteger(o.id)) {
    return { a: o.a, id: o.id };
  }
  return null;
}

type SendResult = { ok: true; conversationMessageId?: number; messageId?: number } | { ok: false; code: number | null; error: string };

async function vkSend(peerId: string, text: string, keyboard: string | undefined, randomId: number): Promise<SendResult> {
  try {
    const r = await vkCall<unknown>("messages.send", {
      peer_ids: peerId,
      random_id: randomId,
      message: text,
      keyboard,
      dont_parse_links: 1,
    });
    // С peer_ids VK возвращает массив [{ peer_id, message_id, conversation_message_id, error? }]
    if (Array.isArray(r)) {
      const item = r[0] as { message_id?: number; conversation_message_id?: number; error?: { code: number; description: string } } | undefined;
      if (item?.error) return { ok: false, code: item.error.code, error: `${VK_ERROR_HINTS[item.error.code] ?? "Ошибка VK"} (${item.error.code}: ${item.error.description})` };
      return { ok: true, messageId: item?.message_id, conversationMessageId: item?.conversation_message_id };
    }
    return { ok: true, messageId: typeof r === "number" ? r : undefined };
  } catch (e) {
    const d = describeVkError(e);
    return { ok: false, code: d.code, error: d.message };
  }
}

/**
 * Отправка сообщения сотруднику. recipientUserId — ID пользователя системы; peer берётся из его VK ID.
 * Отказывает, если получатель не является активным сотрудником.
 */
export async function sendStaffMessage(input: {
  recipientUserId: string;
  text: string;
  kind: "APPLICATION_REVIEW" | "INFO" | "TEST";
  applicationId?: number;
  keyboard?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.recipientUserId } });
  if (!user || user.status !== "ACTIVE") {
    throw new Error("Получатель не является активным сотрудником — отправка запрещена");
  }
  const delivery = await prisma.integrationDelivery.create({
    data: {
      kind: input.kind,
      applicationId: input.applicationId,
      recipientId: user.id,
      peerId: user.vkId,
      messageText: input.text,
      status: "PENDING",
    },
  });
  return attemptDelivery(delivery.id, input.keyboard);
}

/** Попытка (повторной) отправки записи доставки. */
export async function attemptDelivery(deliveryId: string, keyboard?: string) {
  const d = await prisma.integrationDelivery.findUnique({ where: { id: deliveryId }, include: { recipient: true } });
  if (!d) throw new Error("Доставка не найдена");
  if (d.status === "SENT") return d;
  if (!d.recipient || d.recipient.status !== "ACTIVE") {
    return prisma.integrationDelivery.update({
      where: { id: d.id },
      data: { status: "FAILED", lastError: "Получатель не является активным сотрудником", attempts: { increment: 1 } },
    });
  }
  if (!vkBotConfigured()) {
    return prisma.integrationDelivery.update({
      where: { id: d.id },
      data: { status: "FAILED", lastError: "VK-бот не настроен (VK_GROUP_TOKEN / VK_GROUP_ID)", attempts: { increment: 1 } },
    });
  }
  let kb = keyboard;
  if (!kb && d.kind === "APPLICATION_REVIEW" && d.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: d.applicationId } });
    if (app?.status === "PENDING_REVIEW") {
      const member = await prisma.leadershipMember.findUnique({ where: { userId: d.recipient.id } });
      kb = reviewKeyboard(d.applicationId, { approve: !!member?.canApprove, reject: !!member?.canReject });
    }
  }
  const res = await vkSend(d.peerId, d.messageText ?? "", kb, randomIdFor(d.id));
  if (res.ok) {
    const updated = await prisma.integrationDelivery.update({
      where: { id: d.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
        errorCode: null,
        vkMessageId: res.messageId ?? null,
        conversationMessageId: res.conversationMessageId ?? null,
      },
    });
    if (d.recipient.vkMessagesAllowed !== true) {
      await prisma.user.update({ where: { id: d.recipient.id }, data: { vkMessagesAllowed: true, vkMessagesCheckedAt: new Date() } });
    }
    return updated;
  }
  if (res.code === 901 || res.code === 902 || res.code === 900) {
    await prisma.user.update({ where: { id: d.recipient.id }, data: { vkMessagesAllowed: false, vkMessagesCheckedAt: new Date() } });
  }
  const failed = await prisma.integrationDelivery.update({
    where: { id: d.id },
    data: { status: "FAILED", lastError: res.error, errorCode: res.code, attempts: { increment: 1 } },
  });
  await publish(prisma, "deliveries");
  return failed;
}

/** Рассылка новой заявки уполномоченным сотрудникам (Руководство КП) в личные сообщения. */
export async function sendApplicationToLeadership(applicationId: number) {
  const [app, settings] = await Promise.all([
    prisma.application.findUnique({ where: { id: applicationId }, include: { answers: true } }),
    getSettings(),
  ]);
  if (!app || app.status !== "PENDING_REVIEW") return { sent: 0, failed: 0, skipped: true };
  if (!settings["vkBot.enabled"]) return { sent: 0, failed: 0, skipped: true };
  const members = await prisma.leadershipMember.findMany({
    where: { receiveApplications: true, user: { status: "ACTIVE" } },
    include: { user: true },
  });
  const text = formatApplicationMessage(app, "Ожидает рассмотрения.", settings.timezone);
  let sent = 0;
  let failed = 0;
  for (const m of members) {
    // Не дублируем рассылку одному сотруднику по одной заявке.
    const exists = await prisma.integrationDelivery.findFirst({
      where: { applicationId, recipientId: m.userId, kind: "APPLICATION_REVIEW" },
    });
    const keyboard = reviewKeyboard(applicationId, { approve: m.canApprove, reject: m.canReject });
    const d = exists
      ? await attemptDelivery(exists.id, keyboard)
      : await sendStaffMessage({ recipientUserId: m.userId, text, kind: "APPLICATION_REVIEW", applicationId, keyboard });
    if (d.status === "SENT") sent++;
    else failed++;
  }
  return { sent, failed, skipped: false };
}

/** После решения обновляет разосланные сообщения: новый статус, кнопки убираются. */
export async function refreshLeadershipMessages(applicationId: number) {
  if (!vkBotConfigured()) return;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { answers: true, decision: true },
  });
  if (!app) return;
  const tz = await getSetting("timezone");
  const status = statusLineFor(app, tz);
  const text = formatApplicationMessage(app, status, tz);
  const deliveries = await prisma.integrationDelivery.findMany({
    where: { applicationId, kind: "APPLICATION_REVIEW", status: "SENT", conversationMessageId: { not: null } },
  });
  for (const d of deliveries) {
    try {
      await vkCall("messages.edit", {
        peer_id: d.peerId,
        conversation_message_id: d.conversationMessageId!,
        message: text,
        keyboard: EMPTY_KEYBOARD,
        dont_parse_links: 1,
      });
    } catch (e) {
      console.warn("[vk-bot] не удалось обновить сообщение", d.id, describeVkError(e).message);
    }
  }
}

function statusLineFor(
  app: { status: string; decision: { decision: string; userNickname: string | null; reason: string | null; createdAt: Date } | null },
  tz: string,
) {
  const dec = app.decision;
  if (!dec) return "Ожидает рассмотрения.";
  const when = formatDateTime(dec.createdAt, tz);
  if (dec.decision === "APPROVED") return `✅ Принята — ${dec.userNickname ?? "—"} (${when}). Заявка в очереди обзвонщиков.`;
  if (dec.decision === "REJECTED")
    return `❌ Отклонена — ${dec.userNickname ?? "—"} (${when})${dec.reason ? `. Причина: ${dec.reason}` : ""}`;
  return `Автоотказ (${when})`;
}

/** Проверка: разрешил ли сотрудник сообщения от сообщества. */
export async function checkMessagesAllowed(userId: string): Promise<boolean | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !vkBotConfigured()) return null;
  try {
    const r = await vkCall<{ is_allowed: 0 | 1 }>("messages.isMessagesFromGroupAllowed", {
      group_id: env.vkGroupId,
      user_id: user.vkId,
    });
    const allowed = r.is_allowed === 1;
    await prisma.user.update({ where: { id: userId }, data: { vkMessagesAllowed: allowed, vkMessagesCheckedAt: new Date() } });
    return allowed;
  } catch (e) {
    console.warn("[vk-bot] isMessagesFromGroupAllowed", describeVkError(e).message);
    return null;
  }
}

export async function answerMessageEvent(p: { eventId: string; userId: string; peerId: string; text: string }) {
  try {
    await vkCall("messages.sendMessageEventAnswer", {
      event_id: p.eventId,
      user_id: p.userId,
      peer_id: p.peerId,
      event_data: JSON.stringify({ type: "show_snackbar", text: p.text.slice(0, 90) }),
    });
  } catch (e) {
    console.warn("[vk-bot] sendMessageEventAnswer", describeVkError(e).message);
  }
}
