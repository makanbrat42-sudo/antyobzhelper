import { z } from "zod";
import { prisma } from "../db";
import { env } from "../env";
import { safeEqual } from "../crypto";
import { isUniqueViolation } from "../http";
import { audit } from "../audit";
import { decideApplication, updateRejectReason } from "./applications";
import { answerMessageEvent, parseButtonPayload, sendStaffMessage } from "./vk-bot";

// Обработка VK Callback API. Ответ VK всегда "ok" (кроме подтверждения адреса),
// иначе VK будет повторять доставку. Повторы отсекаются по event_id.

const callbackSchema = z.object({
  type: z.string(),
  group_id: z.union([z.number(), z.string()]).transform(String).optional(),
  event_id: z.string().optional(),
  secret: z.string().optional(),
  object: z.unknown().optional(),
});

const REASON_WAIT_MS = 15 * 60 * 1000;

export type CallbackResult = { status: number; body: string };

export async function handleVkCallback(raw: unknown): Promise<CallbackResult> {
  const parsed = callbackSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: "bad request" };
  const ev = parsed.data;

  if (env.vkGroupId && ev.group_id && ev.group_id !== env.vkGroupId) {
    return { status: 403, body: "forbidden" };
  }

  const expectedSecret = env.vkCallbackSecret;
  const secretOk = !!expectedSecret && !!ev.secret && safeEqual(ev.secret, expectedSecret);

  // Подтверждение адреса: строка подтверждения не даёт доступа к данным, поэтому её можно вернуть
  // и без секрета (если секретный ключ в VK ещё не сохранён), но только для своего сообщества.
  if (ev.type === "confirmation") {
    const groupOk = !!env.vkGroupId && ev.group_id === env.vkGroupId;
    if (ev.secret ? !secretOk : !groupOk) return { status: 403, body: "forbidden" };
    return { status: 200, body: env.vkCallbackConfirmation ?? "" };
  }

  if (!secretOk) return { status: 403, body: "forbidden" };

  // Идемпотентность: каждое событие обрабатывается один раз.
  let eventRowId: string | null = null;
  try {
    const row = await prisma.integrationEvent.create({
      data: {
        source: "VK_CALLBACK",
        eventType: ev.type,
        externalId: ev.event_id ?? null,
        dedupeKey: ev.event_id ?? null,
        payload: { type: ev.type, object: (ev.object ?? null) as object },
      },
    });
    eventRowId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { status: 200, body: "ok" };
    throw e;
  }

  try {
    if (ev.type === "message_event") await onMessageEvent(ev.object);
    else if (ev.type === "message_new") await onMessageNew(ev.object);
    else if (ev.type === "message_allow" || ev.type === "message_deny") await onAllowDeny(ev.type, ev.object);
    await prisma.integrationEvent.update({ where: { id: eventRowId }, data: { status: "PROCESSED", processedAt: new Date() } });
  } catch (e) {
    console.error("[vk-callback] ошибка обработки", e);
    await prisma.integrationEvent
      .update({ where: { id: eventRowId }, data: { status: "ERROR", error: (e as Error).message?.slice(0, 1000), processedAt: new Date() } })
      .catch(() => {});
  }
  return { status: 200, body: "ok" };
}

const messageEventSchema = z.object({
  user_id: z.union([z.number(), z.string()]).transform(String),
  peer_id: z.union([z.number(), z.string()]).transform(String),
  event_id: z.string(),
  payload: z.unknown(),
});

async function onMessageEvent(obj: unknown) {
  const o = messageEventSchema.parse(obj);
  const payload = parseButtonPayload(o.payload);
  const reply = (text: string) => answerMessageEvent({ eventId: o.event_id, userId: o.user_id, peerId: o.peer_id, text });
  if (!payload) {
    await reply("Неизвестная команда");
    return;
  }
  // VK ID нажавшего берётся из события VK (подписано секретом Callback API).
  const user = await prisma.user.findUnique({ where: { vkId: o.user_id } });
  if (!user || user.status !== "ACTIVE") {
    await audit(prisma, {
      actor: { type: "BOT", label: `vk${o.user_id}` },
      action: payload.a === "approve" ? "application.approve" : "application.reject",
      applicationId: payload.id,
      result: "DENIED",
      details: { reason: "not_active_staff", vkId: o.user_id },
    });
    await reply("Вы не являетесь активным сотрудником");
    return;
  }

  const res = await decideApplication(user.id, {
    applicationId: payload.id,
    decision: payload.a === "approve" ? "APPROVED" : "REJECTED",
    channel: "VK_BOT",
  });

  if (!res.ok) {
    await reply(res.message);
    if (res.code === "ALREADY_PROCESSED") {
      await sendStaffMessage({ recipientUserId: user.id, text: `Заявка #${payload.id}: Заявка уже обработана`, kind: "INFO", applicationId: payload.id });
    }
    return;
  }

  if (payload.a === "approve") {
    await reply(`Заявка #${payload.id} принята`);
    return;
  }
  // Отклонено: предлагаем указать причину следующим сообщением.
  await prisma.botConversationState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, action: "REJECT_REASON", applicationId: payload.id, expiresAt: new Date(Date.now() + REASON_WAIT_MS) },
    update: { action: "REJECT_REASON", applicationId: payload.id, expiresAt: new Date(Date.now() + REASON_WAIT_MS) },
  });
  await reply(`Заявка #${payload.id} отклонена`);
  await sendStaffMessage({
    recipientUserId: user.id,
    text: `Заявка #${payload.id} отклонена.\nУкажите причину отказа следующим сообщением (в течение 15 минут) или отправьте «-», чтобы оставить без причины.`,
    kind: "INFO",
    applicationId: payload.id,
  });
}

const messageNewSchema = z.object({
  message: z.object({
    from_id: z.union([z.number(), z.string()]).transform(String),
    peer_id: z.union([z.number(), z.string()]).transform(String),
    text: z.string().default(""),
  }),
});

async function onMessageNew(obj: unknown) {
  const o = messageNewSchema.safeParse(obj);
  if (!o.success) return;
  const m = o.data.message;
  // Только личные диалоги (peer_id == from_id). Беседы игнорируются.
  if (m.peer_id !== m.from_id) return;
  const user = await prisma.user.findUnique({ where: { vkId: m.from_id } });
  // Сообщения не-сотрудников (в т.ч. кандидатов) игнорируются: бот им не отвечает.
  if (!user || user.status !== "ACTIVE") return;

  const state = await prisma.botConversationState.findUnique({ where: { userId: user.id } });
  if (state && state.expiresAt.getTime() > Date.now() && state.action === "REJECT_REASON") {
    await prisma.botConversationState.delete({ where: { id: state.id } });
    const text = m.text.trim();
    if (text === "-" || text === "") {
      await sendStaffMessage({ recipientUserId: user.id, text: `Заявка #${state.applicationId}: причина не указана.`, kind: "INFO" });
      return;
    }
    const ok = await updateRejectReason(user.id, state.applicationId, text);
    await sendStaffMessage({
      recipientUserId: user.id,
      text: ok ? `Причина отказа по заявке #${state.applicationId} сохранена.` : `Не удалось сохранить причину по заявке #${state.applicationId}.`,
      kind: "INFO",
      applicationId: state.applicationId,
    });
    return;
  }
  if (/^(\/?start|начать|помощь|help)$/i.test(m.text.trim())) {
    await sendStaffMessage({
      recipientUserId: user.id,
      text: `AntyObzhelp: сюда приходят новые заявки для рассмотрения.\nКнопки «Принять» / «Отклонить» работают, если вам выданы соответствующие полномочия в разделе «Руководство КП».\nСайт: ${env.appUrl}`,
      kind: "INFO",
    });
  }
}

async function onAllowDeny(type: string, obj: unknown) {
  const o = z.object({ user_id: z.union([z.number(), z.string()]).transform(String) }).safeParse(obj);
  if (!o.success) return;
  await prisma.user.updateMany({
    where: { vkId: o.data.user_id },
    data: { vkMessagesAllowed: type === "message_allow", vkMessagesCheckedAt: new Date() },
  });
}
