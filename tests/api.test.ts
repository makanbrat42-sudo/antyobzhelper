import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaff, mockVkApi, prisma, resetDb, signedFormRequest, submission, type VkCall } from "./helpers";
import { POST as googleFormsPOST } from "@/app/api/integrations/google-forms/route";
import { POST as vkCallbackPOST } from "@/app/api/integrations/vk/callback/route";
import { GET as cronGET } from "@/app/api/cron/maintenance/route";
import { claimApplication, finishCall, startCall } from "@/server/services/calls";
import type { AuthUser } from "@/server/auth/rbac";

let curator: AuthUser;
let deputy: AuthUser;
let moderator: AuthUser;
let caller: AuthUser;
let vk: ReturnType<typeof mockVkApi>;

beforeEach(async () => {
  await resetDb();
  curator = await createStaff({ nickname: "Максим", main: "curator", leadership: { approve: true, reject: true } });
  deputy = await createStaff({ nickname: "Андрей", main: "deputy_curator", leadership: { approve: true, reject: true } });
  moderator = await createStaff({ nickname: "Сергей", main: "moderator" });
  caller = await createStaff({ nickname: "Обзвонщик", main: "helper", caller: "junior_caller" });
  vk = mockVkApi();
});

afterEach(() => {
  vk.restore();
  vi.restoreAllMocks();
});

function vkEvent(type: string, object: unknown, opts: { secret?: string; eventId?: string } = {}) {
  return new Request("https://antyobzhelp.test/api/integrations/vk/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type,
      group_id: 777,
      event_id: opts.eventId ?? `ev-${Math.random().toString(36).slice(2)}`,
      secret: opts.secret ?? "test-vk-secret",
      object,
    }),
  });
}

function buttonPress(user: AuthUser, action: "approve" | "reject", id: number, eventId?: string) {
  return vkEvent(
    "message_event",
    { user_id: Number(user.vkId), peer_id: Number(user.vkId), event_id: `btn-${Math.random()}`, payload: { a: action, id } },
    { eventId },
  );
}

const sends = (calls: VkCall[]) => calls.filter((c) => c.method === "messages.send");

async function postForm(vkLink: string) {
  const res = await googleFormsPOST(signedFormRequest(submission({ vk: vkLink, nickname: "Иван Иванов" })));
  return { status: res.status, body: (await res.json()) as { ok: boolean; applicationId?: number; status?: string; duplicateActive?: boolean } };
}

describe("API Google Forms", () => {
  it("принимает подписанную анкету и рассылает её руководству в личные сообщения", async () => {
    const { status, body } = await postForm("https://vk.com/id555");
    expect(status).toBe(200);
    expect(body.status).toBe("PENDING_REVIEW");
    const s = sends(vk.calls);
    const peers = s.map((c) => c.params.peer_ids).sort();
    expect(peers).toEqual([curator.vkId, deputy.vkId].sort());
    expect(s[0]!.params.message).toContain(`Номер: #${body.applicationId}`);
    expect(s[0]!.params.keyboard).toContain("ПРИНЯТЬ");
    const deliveries = await prisma.integrationDelivery.findMany();
    expect(deliveries.every((d) => d.status === "SENT")).toBe(true);
    const ev = await prisma.integrationEvent.findFirstOrThrow({ where: { source: "GOOGLE_FORMS" } });
    expect(ev.status).toBe("PROCESSED");
  });

  it("отклоняет неверную подпись", async () => {
    const res = await googleFormsPOST(signedFormRequest(submission({ vk: "vk.com/id1" }), { secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(await prisma.application.count()).toBe(0);
    expect(await prisma.integrationEvent.count({ where: { status: "REJECTED" } })).toBe(1);
  });

  it("отклоняет устаревшую метку времени (защита от повтора)", async () => {
    const res = await googleFormsPOST(signedFormRequest(submission({ vk: "vk.com/id1" }), { ts: Date.now() - 3600_000 }));
    expect(res.status).toBe(401);
  });

  it("отклоняет некорректную структуру", async () => {
    const res = await googleFormsPOST(signedFormRequest({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  it("повторная доставка — ok + duplicate, вторая рассылка не делается", async () => {
    const sub = submission({ vk: "vk.com/id556" });
    await googleFormsPOST(signedFormRequest(sub));
    const before = sends(vk.calls).length;
    const res = await googleFormsPOST(signedFormRequest(sub));
    expect(((await res.json()) as { duplicate: boolean }).duplicate).toBe(true);
    expect(sends(vk.calls).length).toBe(before);
    expect(await prisma.integrationEvent.count({ where: { status: "DUPLICATE" } })).toBe(1);
  });

  it("ошибка доставки VK сохраняется с описанием", async () => {
    vk.restore();
    vk = mockVkApi((c) =>
      c.method === "messages.send" && c.params.peer_ids === deputy.vkId
        ? { response: [{ peer_id: Number(deputy.vkId), error: { code: 901, description: "Can't send messages for users without permission" } }] }
        : undefined,
    );
    await postForm("vk.com/id557");
    const failed = await prisma.integrationDelivery.findFirstOrThrow({ where: { status: "FAILED" } });
    expect(failed.recipientId).toBe(deputy.id);
    expect(failed.errorCode).toBe(901);
    expect(failed.lastError).toMatch(/не разрешил сообщения/);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: deputy.id } });
    expect(u.vkMessagesAllowed).toBe(false);
  });
});

describe("API VK Callback", () => {
  it("подтверждение адреса возвращает строку подтверждения", async () => {
    const res = await vkCallbackPOST(vkEvent("confirmation", undefined));
    expect(await res.text()).toBe("confirm123");
  });

  it("подтверждение без секрета работает только для своего сообщества", async () => {
    const noSecret = (groupId: number) =>
      new Request("https://antyobzhelp.test/api/integrations/vk/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "confirmation", group_id: groupId }),
      });
    expect(await (await vkCallbackPOST(noSecret(777))).text()).toBe("confirm123");
    expect((await vkCallbackPOST(noSecret(555))).status).toBe(403);
    expect((await vkCallbackPOST(vkEvent("confirmation", undefined, { secret: "wrong" }))).status).toBe(403);
  });

  it("событие без секрета — 403", async () => {
    const res = await vkCallbackPOST(
      new Request("https://antyobzhelp.test/api/integrations/vk/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "message_new", group_id: 777, event_id: "x1", object: {} }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("неверный секрет — 403", async () => {
    const res = await vkCallbackPOST(vkEvent("message_event", {}, { secret: "nope" }));
    expect(res.status).toBe(403);
  });

  it("кнопка «Принять»: заявка в очереди, записан принявший; повтор события VK не обрабатывается дважды", async () => {
    const { body } = await postForm("vk.com/id600");
    const id = body.applicationId!;
    const req1 = buttonPress(curator, "approve", id, "same-event");
    expect(await (await vkCallbackPOST(req1)).text()).toBe("ok");
    const req2 = buttonPress(curator, "approve", id, "same-event");
    expect(await (await vkCallbackPOST(req2)).text()).toBe("ok");
    const app = await prisma.application.findUniqueOrThrow({ where: { id }, include: { decision: true } });
    expect(app.status).toBe("APPROVED_WAITING_CALLER");
    expect(app.decision?.userId).toBe(curator.id);
    expect(app.decision?.channel).toBe("VK_BOT");
    expect(await prisma.integrationEvent.count({ where: { source: "VK_CALLBACK", dedupeKey: "same-event" } })).toBe(1);
    // Сообщения у руководства обновлены (кнопки убраны)
    expect(vk.calls.some((c) => c.method === "messages.edit" && c.params.message.includes("Принята — Максим"))).toBe(true);
  });

  it("второй сотрудник получает «Заявка уже обработана»", async () => {
    const { body } = await postForm("vk.com/id601");
    const id = body.applicationId!;
    await vkCallbackPOST(buttonPress(curator, "approve", id));
    vk.calls.length = 0;
    await vkCallbackPOST(buttonPress(deputy, "reject", id));
    const snack = vk.calls.find((c) => c.method === "messages.sendMessageEventAnswer");
    expect(snack?.params.event_data).toContain("Заявка уже обработана");
    const msg = sends(vk.calls).find((c) => c.params.peer_ids === deputy.vkId);
    expect(msg?.params.message).toContain("Заявка уже обработана");
    const app = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(app.status).toBe("APPROVED_WAITING_CALLER");
  });

  it("одновременные нажатия двух руководителей — одно решение", async () => {
    const { body } = await postForm("vk.com/id602");
    const id = body.applicationId!;
    await Promise.all([vkCallbackPOST(buttonPress(curator, "approve", id)), vkCallbackPOST(buttonPress(deputy, "reject", id))]);
    expect(await prisma.applicationDecision.count({ where: { applicationId: id } })).toBe(1);
  });

  it("«Отклонить» → бот просит причину → причина сохраняется", async () => {
    const { body } = await postForm("vk.com/id603");
    const id = body.applicationId!;
    await vkCallbackPOST(buttonPress(deputy, "reject", id));
    expect(sends(vk.calls).some((c) => c.params.peer_ids === deputy.vkId && c.params.message.includes("Укажите причину"))).toBe(true);
    await vkCallbackPOST(
      vkEvent("message_new", { message: { from_id: Number(deputy.vkId), peer_id: Number(deputy.vkId), text: "Неполная анкета" } }),
    );
    const app = await prisma.application.findUniqueOrThrow({ where: { id }, include: { decision: true } });
    expect(app.status).toBe("REJECTED");
    expect(app.rejectReason).toBe("Неполная анкета");
    expect(app.decision?.userNickname).toBe("Андрей");
  });

  it("нажатие сотрудника без полномочий отклоняется", async () => {
    const { body } = await postForm("vk.com/id604");
    const id = body.applicationId!;
    await vkCallbackPOST(buttonPress(moderator, "approve", id));
    const app = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(app.status).toBe("PENDING_REVIEW");
    expect(await prisma.auditLog.count({ where: { result: "DENIED", applicationId: id } })).toBe(1);
  });

  it("полномочия проверяются при каждом нажатии: снятие флага в «Руководство КП» запрещает решение", async () => {
    const { body } = await postForm("vk.com/id605");
    const id = body.applicationId!;
    await prisma.leadershipMember.update({ where: { userId: curator.id }, data: { canApprove: false } });
    await vkCallbackPOST(buttonPress(curator, "approve", id));
    expect((await prisma.application.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_REVIEW");
  });

  it("неизвестный пользователь VK (не сотрудник) не может нажимать кнопки", async () => {
    const { body } = await postForm("vk.com/id606");
    const id = body.applicationId!;
    const fake = { vkId: "999999" } as AuthUser;
    await vkCallbackPOST(buttonPress(fake, "approve", id));
    expect((await prisma.application.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_REVIEW");
  });

  it("сообщения от кандидата игнорируются — бот не отвечает", async () => {
    vk.calls.length = 0;
    await vkCallbackPOST(vkEvent("message_new", { message: { from_id: 12345, peer_id: 12345, text: "Привет, что с моей заявкой?" } }));
    expect(sends(vk.calls).length).toBe(0);
  });
});

describe("Никаких автоматических сообщений кандидатам", () => {
  it("полный цикл: подача → принятие → обзвон «Не прошёл» → автоотказ — сообщения только сотрудникам", async () => {
    // Ссылка без подтверждения: в режиме LINK её достаточно для автоотказа (STRICT отправил бы на проверку VK ID).
    await prisma.systemSetting.create({ data: { key: "identity.cooldownMode", value: "LINK" } });
    const candidateVk = "700700";
    const { body } = await postForm(`https://vk.com/id${candidateVk}`);
    const id = body.applicationId!;
    await vkCallbackPOST(buttonPress(curator, "approve", id));
    await claimApplication(caller, id);
    await startCall(caller, id);
    await finishCall(caller, id, { outcome: "FAILED", reason: "Не ответил на вопросы" });
    const second = await postForm(`https://vk.com/id${candidateVk}`);
    expect(second.body.status).toBe("AUTO_REJECTED_COOLDOWN");
    // Отклонённая заявка в другом сценарии
    const third = await postForm("https://vk.com/id700701");
    await vkCallbackPOST(buttonPress(deputy, "reject", third.body.applicationId!));
    // Повтор неудачных доставок по cron
    await cronGET(new Request("https://antyobzhelp.test/api/cron/maintenance", { headers: { authorization: "Bearer x" } }));

    const staffVkIds = new Set([curator.vkId, deputy.vkId, moderator.vkId, caller.vkId]);
    const peerTargets = vk.calls
      .filter((c) => ["messages.send", "messages.edit", "messages.sendMessageEventAnswer"].includes(c.method))
      .flatMap((c) => [c.params.peer_ids, c.params.peer_id, c.params.user_id].filter(Boolean));
    expect(peerTargets.length).toBeGreaterThan(0);
    for (const p of peerTargets) expect(staffVkIds.has(p!)).toBe(true);
    expect(peerTargets).not.toContain(candidateVk);
    expect(peerTargets).not.toContain("700701");
    const deliveries = await prisma.integrationDelivery.findMany();
    expect(deliveries.every((d) => staffVkIds.has(d.peerId))).toBe(true);
  });
});
