import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaff, mockVkApi, prisma, resetDb, shiftCallEnd, submission } from "./helpers";
import { decideApplication, effects, ingestSubmission, setCandidateNotified, confirmIdentity } from "@/server/services/applications";
import { claimApplication, finishCall, postponeCall, reassignApplication, startCall, liftCooldown } from "@/server/services/calls";
import { getApplicationsReport, reportQuerySchema } from "@/server/queries/applications";
import { getCandidateHistory } from "@/server/queries/candidates";
import { getDashboard, getRating } from "@/server/queries/stats";
import type { AuthUser } from "@/server/auth/rbac";
import { humanCode } from "@/server/crypto";

const H = 3600_000;

let admin: AuthUser;
let curator: AuthUser;
let caller: AuthUser;
let caller2: AuthUser;
let sendSpy: ReturnType<typeof vi.fn<(id: number) => Promise<void>>>;

beforeEach(async () => {
  await resetDb();
  admin = await createStaff({ nickname: "Иван", main: "admin", leadership: { approve: true, reject: true } });
  curator = await createStaff({ nickname: "Максим", main: "curator", leadership: { approve: true, reject: true } });
  caller = await createStaff({ nickname: "Обзвонщик1", main: "helper", caller: "junior_caller" });
  caller2 = await createStaff({ nickname: "Обзвонщик2", main: "helper", caller: "senior_caller" });
  sendSpy = vi.fn<(id: number) => Promise<void>>(async () => {});
  vi.spyOn(effects, "sendToLeadership").mockImplementation(sendSpy);
  vi.spyOn(effects, "refreshLeadership").mockImplementation(async () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Кандидат подтвердил VK через VK ID (/link) и получил код для анкеты. */
async function verifiedCode(vkId: string) {
  const cand = await prisma.candidate.upsert({
    where: { vkId },
    create: { vkId, vkVerifiedAt: new Date() },
    update: { vkVerifiedAt: new Date() },
  });
  const code = humanCode();
  await prisma.candidateLinkCode.create({ data: { code, candidateId: cand.id, expiresAt: new Date(Date.now() + 86_400_000) } });
  return code;
}

async function submit(vkId: string, at = new Date(), now = at, verified = true) {
  const extra: [string, string][] = verified ? [["Код подтверждения VK", await verifiedCode(vkId)]] : [];
  const r = await ingestSubmission(submission({ vk: `https://vk.com/id${vkId}`, nickname: `cand${vkId}`, at, extra }), { now });
  return r;
}

/** Проводит заявку до результата обзвона. */
async function runToOutcome(vkId: string, outcome: "PASSED" | "FAILED" | "REFUSED" | "POSTPONED") {
  const r = await submit(vkId);
  if (r.outcome !== "created") throw new Error("не создана");
  const dec = await decideApplication(curator.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "WEB" });
  expect(dec.ok).toBe(true);
  await claimApplication(caller, r.applicationId);
  await startCall(caller, r.applicationId);
  const res = await finishCall(caller, r.applicationId, { outcome, reason: "тест" });
  return { applicationId: r.applicationId, sessionId: res.sessionId };
}

describe("Приём заявок", () => {
  it("создаёт заявку PENDING_REVIEW и передаёт её руководству", async () => {
    const r = await submit("5001");
    expect(r.outcome).toBe("created");
    if (r.outcome !== "created") return;
    expect(r.status).toBe("PENDING_REVIEW");
    expect(r.applicationId).toBeGreaterThanOrEqual(1001);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId }, include: { answers: true } });
    expect(app.vkId).toBe("5001");
    expect(app.identityStatus).toBe("VERIFIED");
    expect(app.source).toBe("GOOGLE_FORMS");
    expect(app.candidateNotified).toBe(false);
    expect(app.answers.length).toBe(3);
    expect(sendSpy).toHaveBeenCalledWith(r.applicationId);
  });

  it("повторная доставка того же ответа Google Forms не создаёт вторую заявку", async () => {
    const sub = submission({ vk: "vk.com/id5002" });
    const a = await ingestSubmission(sub);
    const b = await ingestSubmission(sub);
    expect(a.outcome).toBe("created");
    expect(b.outcome).toBe("already_processed");
    expect(await prisma.application.count()).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("параллельная доставка одного ответа — одна заявка", async () => {
    const sub = submission({ vk: "vk.com/id5003" });
    const rs = await Promise.all([ingestSubmission(sub), ingestSubmission(sub), ingestSubmission(sub)]);
    expect(rs.filter((r) => r.outcome === "created").length).toBe(1);
    expect(await prisma.application.count()).toBe(1);
  });

  it("без VK-ссылки — ручная проверка VK ID, руководству не отправляется", async () => {
    const r = await ingestSubmission(submission({ vk: "" }));
    expect(r.outcome === "created" && r.status).toBe("IDENTITY_CHECK");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("противоречивые VK ID — ручная проверка", async () => {
    const r = await ingestSubmission(submission({ vk: "vk.com/id1", extra: [["VK ID", "2"]] }));
    expect(r.outcome === "created" && r.status).toBe("IDENTITY_CHECK");
    const app = await prisma.application.findFirstOrThrow();
    expect(app.identityStatus).toBe("CONFLICT");
  });
});

describe("Защита от дубликатов", () => {
  for (const status of ["PENDING_REVIEW", "APPROVED_WAITING_CALLER", "ASSIGNED", "IN_PROGRESS"] as const) {
    it(`при активной заявке ${status} новая не создаётся и руководству не отправляется`, async () => {
      const first = await submit("6001");
      if (first.outcome !== "created") throw new Error();
      if (status !== "PENDING_REVIEW") {
        await decideApplication(curator.id, { applicationId: first.applicationId, decision: "APPROVED", channel: "WEB" });
      }
      if (status === "ASSIGNED" || status === "IN_PROGRESS") await claimApplication(caller, first.applicationId);
      if (status === "IN_PROGRESS") await startCall(caller, first.applicationId);
      sendSpy.mockClear();

      const second = await submit("6001");
      expect(second).toEqual({ outcome: "duplicate_active", activeApplicationId: first.applicationId });
      expect(await prisma.application.count()).toBe(1);
      expect(sendSpy).not.toHaveBeenCalled();
      const dupEvent = await prisma.applicationEvent.findFirst({ where: { type: "DUPLICATE_SUBMISSION" } });
      expect(dupEvent?.applicationId).toBe(first.applicationId);
    });
  }

  it("параллельные анкеты одного кандидата — одна активная заявка", async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => submit("6002")));
    expect(rs.filter((r) => r.outcome === "created").length).toBe(1);
    expect(rs.filter((r) => r.outcome === "duplicate_active").length).toBe(4);
  });

  it("после отклонения можно подать снова", async () => {
    const first = await submit("6003");
    if (first.outcome !== "created") throw new Error();
    await decideApplication(curator.id, { applicationId: first.applicationId, decision: "REJECTED", channel: "WEB" });
    const second = await submit("6003");
    expect(second.outcome === "created" && second.status).toBe("PENDING_REVIEW");
  });
});

describe("Автоотказ на 5 суток", () => {
  async function failedThenSubmitAfter(hoursAgo: number) {
    const vk = String(7000 + Math.round(hoursAgo));
    const { sessionId } = await runToOutcome(vk, "FAILED");
    const now = new Date();
    await shiftCallEnd(sessionId, new Date(now.getTime() - hoursAgo * H));
    sendSpy.mockClear();
    return { r: await submit(vk, now, now), vk };
  }

  it("2 дня — автоотказ", async () => {
    const { r } = await failedThenSubmitAfter(48);
    expect(r.outcome === "created" && r.status).toBe("AUTO_REJECTED_COOLDOWN");
  });

  it("4 дня — автоотказ; сохраняются причина, даты и источник SYSTEM; руководству и в очередь не попадает", async () => {
    const { r } = await failedThenSubmitAfter(96);
    if (r.outcome !== "created") throw new Error();
    expect(r.status).toBe("AUTO_REJECTED_COOLDOWN");
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId }, include: { decision: true } });
    expect(app.decisionSource).toBe("SYSTEM");
    expect(app.decision?.source).toBe("SYSTEM");
    expect(app.decision?.decision).toBe("AUTO_REJECTED");
    expect(app.rejectReason).toMatch(/Не прошёл/);
    expect(app.cooldownLastFailedAt).toBeTruthy();
    expect(app.cooldownUntil!.getTime() - app.cooldownLastFailedAt!.getTime()).toBe(120 * H);
    expect(app.activeCandidateKey).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();
    const queue = await prisma.application.count({ where: { status: "APPROVED_WAITING_CALLER" } });
    expect(queue).toBe(0);
  });

  it("ровно 120 часов — заявка разрешена", async () => {
    const vk = "7120";
    const { sessionId } = await runToOutcome(vk, "FAILED");
    const now = new Date();
    await shiftCallEnd(sessionId, new Date(now.getTime() - 120 * H));
    const r = await submit(vk, now, now);
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("за минуту до 120 часов — автоотказ", async () => {
    const vk = "7119";
    const { sessionId } = await runToOutcome(vk, "FAILED");
    const now = new Date();
    await shiftCallEnd(sessionId, new Date(now.getTime() - 120 * H + 60_000));
    const r = await submit(vk, now, now);
    expect(r.outcome === "created" && r.status).toBe("AUTO_REJECTED_COOLDOWN");
  });

  it("6 дней — заявка разрешена", async () => {
    const { r } = await failedThenSubmitAfter(144);
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("отказ руководства — ограничение не применяется", async () => {
    const first = await submit("7201");
    if (first.outcome !== "created") throw new Error();
    await decideApplication(curator.id, { applicationId: first.applicationId, decision: "REJECTED", channel: "WEB", reason: "нет" });
    const r = await submit("7201");
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("перенос — ограничение не применяется", async () => {
    const { applicationId } = await runToOutcome("7202", "POSTPONED");
    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.status).toBe("ASSIGNED"); // остаётся у обзвонщика
    expect(await prisma.cooldownRestriction.count()).toBe(0);
    // Заявка ещё активна → дубликат, но не автоотказ
    const r = await submit("7202");
    expect(r.outcome).toBe("duplicate_active");
  });

  it("отказ кандидата от проверки — ограничение не применяется", async () => {
    await runToOutcome("7203", "REFUSED");
    expect(await prisma.cooldownRestriction.count()).toBe(0);
    const r = await submit("7203");
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("прошёл — ограничение не применяется", async () => {
    await runToOutcome("7204", "PASSED");
    const r = await submit("7204");
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("ограничение отсчитывается от ПОСЛЕДНЕГО неуспешного обзвона", async () => {
    const vk = "7205";
    const a = await runToOutcome(vk, "FAILED");
    const now = Date.now();
    await shiftCallEnd(a.sessionId, new Date(now - 200 * H));
    const b = await runToOutcome(vk, "FAILED");
    await shiftCallEnd(b.sessionId, new Date(now - 24 * H));
    const r = await submit(vk);
    expect(r.outcome === "created" && r.status).toBe("AUTO_REJECTED_COOLDOWN");
  });

  it("другой VK ID с тем же ником не затрагивается", async () => {
    await runToOutcome("7206", "FAILED");
    const r = await ingestSubmission(submission({ vk: "vk.com/id7207", nickname: "cand7206" }));
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("снятое администратором ограничение не применяется", async () => {
    await runToOutcome("7208", "FAILED");
    const cr = await prisma.cooldownRestriction.findFirstOrThrow();
    await liftCooldown(admin, cr.id, "ошибка обзвонщика");
    const r = await submit("7208");
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });

  it("STRICT (по умолчанию): ссылка без подтверждения при ограничении → проверка VK ID, а не автоотказ; после подтверждения — автоотказ", async () => {
    await runToOutcome("7209", "FAILED");
    sendSpy.mockClear();
    // Короткое имя резолвится в тот же VK ID, но ссылка не доказывает владение аккаунтом.
    const r = await ingestSubmission(submission({ vk: "https://vk.com/somebody" }), { resolver: async () => "7209" });
    expect(r.outcome === "created" && r.status).toBe("IDENTITY_CHECK");
    expect(sendSpy).not.toHaveBeenCalled();
    if (r.outcome !== "created") return;
    const res = await confirmIdentity(curator, r.applicationId, "7209");
    expect(res.status).toBe("AUTO_REJECTED_COOLDOWN");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("STRICT: при подтверждении другого VK ID заявка идёт на рассмотрение", async () => {
    await runToOutcome("7210", "FAILED");
    const r = await submit("7210", new Date(), new Date(), false);
    expect(r.outcome === "created" && r.status).toBe("IDENTITY_CHECK");
    if (r.outcome !== "created") return;
    // Сотрудник выяснил, что это другой человек, который ошибся в ссылке.
    const res = await confirmIdentity(curator, r.applicationId, "7299");
    expect(res.status).toBe("PENDING_REVIEW");
  });

  it("режим LINK: ссылки из анкеты достаточно для автоотказа", async () => {
    await prisma.systemSetting.create({ data: { key: "identity.cooldownMode", value: "LINK" } });
    await runToOutcome("7211", "FAILED");
    const r = await submit("7211", new Date(), new Date(), false);
    expect(r.outcome === "created" && r.status).toBe("AUTO_REJECTED_COOLDOWN");
  });

  it("срок ограничения настраивается (48 ч)", async () => {
    await prisma.systemSetting.create({ data: { key: "cooldown.hours", value: 48 } });
    const { sessionId } = await runToOutcome("7212", "FAILED");
    const now = new Date();
    await shiftCallEnd(sessionId, new Date(now.getTime() - 50 * H));
    const r = await submit("7212", now, now);
    expect(r.outcome === "created" && r.status).toBe("PENDING_REVIEW");
  });
});

describe("Решения руководства", () => {
  it("принятие: статус APPROVED_WAITING_CALLER, записан сотрудник", async () => {
    const r = await submit("8001");
    if (r.outcome !== "created") throw new Error();
    const d = await decideApplication(curator.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "VK_BOT" });
    expect(d).toEqual({ ok: true, status: "APPROVED_WAITING_CALLER" });
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId }, include: { decision: true } });
    expect(app.decidedById).toBe(curator.id);
    expect(app.decision?.userNickname).toBe("Максим");
    expect(app.decision?.channel).toBe("VK_BOT");
  });

  it("отклонение с причиной", async () => {
    const r = await submit("8002");
    if (r.outcome !== "created") throw new Error();
    await decideApplication(curator.id, { applicationId: r.applicationId, decision: "REJECTED", channel: "WEB", reason: "Мало опыта" });
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId } });
    expect(app.status).toBe("REJECTED");
    expect(app.rejectReason).toBe("Мало опыта");
    expect(app.decidedAt).toBeTruthy();
  });

  it("одновременные решения: применяется только одно, второе — «Заявка уже обработана»", async () => {
    const r = await submit("8003");
    if (r.outcome !== "created") throw new Error();
    const results = await Promise.all([
      decideApplication(curator.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "VK_BOT" }),
      decideApplication(admin.id, { applicationId: r.applicationId, decision: "REJECTED", channel: "VK_BOT" }),
      decideApplication(curator.id, { applicationId: r.applicationId, decision: "REJECTED", channel: "WEB" }),
    ]);
    expect(results.filter((x) => x.ok).length).toBe(1);
    const failed = results.filter((x) => !x.ok);
    expect(failed.every((x) => !x.ok && x.message === "Заявка уже обработана")).toBe(true);
    expect(await prisma.applicationDecision.count({ where: { applicationId: r.applicationId } })).toBe(1);
  });

  it("без права applications.approve — отказ и запись в журнал", async () => {
    const r = await submit("8004");
    if (r.outcome !== "created") throw new Error();
    const d = await decideApplication(caller.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "WEB" });
    expect(d.ok).toBe(false);
    expect(!d.ok && d.code).toBe("FORBIDDEN");
    expect(await prisma.auditLog.count({ where: { result: "DENIED", applicationId: r.applicationId } })).toBe(1);
  });

  it("VK-бот: право есть, но нет флага в «Руководство КП» — отказ", async () => {
    const deputy = await createStaff({ nickname: "Андрей", main: "deputy_curator", leadership: { approve: false, reject: true } });
    const r = await submit("8005");
    if (r.outcome !== "created") throw new Error();
    const d = await decideApplication(deputy.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "VK_BOT" });
    expect(!d.ok && d.code).toBe("FORBIDDEN");
    const d2 = await decideApplication(deputy.id, { applicationId: r.applicationId, decision: "REJECTED", channel: "VK_BOT" });
    expect(d2.ok).toBe(true);
  });

  it("заблокированный сотрудник не может принимать решения (права проверяются заново)", async () => {
    const r = await submit("8006");
    if (r.outcome !== "created") throw new Error();
    await prisma.user.update({ where: { id: curator.id }, data: { status: "BLOCKED" } });
    const d = await decideApplication(curator.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "VK_BOT" });
    expect(!d.ok && d.code).toBe("INACTIVE");
  });

  it("отметка «Кандидат уведомлён» сохраняет автора и время, сообщения не отправляются", async () => {
    const r = await submit("8007");
    if (r.outcome !== "created") throw new Error();
    const vk = mockVkApi();
    await setCandidateNotified(curator, r.applicationId, true);
    vk.restore();
    expect(vk.calls.length).toBe(0);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId } });
    expect(app.candidateNotified).toBe(true);
    expect(app.candidateNotifiedById).toBe(curator.id);
    expect(app.candidateNotifiedAt).toBeTruthy();
  });
});

describe("Очередь обзвонщиков", () => {
  async function approved(vk: string) {
    const r = await submit(vk);
    if (r.outcome !== "created") throw new Error();
    await decideApplication(curator.id, { applicationId: r.applicationId, decision: "APPROVED", channel: "WEB" });
    return r.applicationId;
  }

  it("«Взять на себя» закрепляет заявку", async () => {
    const id = await approved("9001");
    await claimApplication(caller, id);
    const app = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(app.status).toBe("ASSIGNED");
    expect(app.currentAssigneeId).toBe(caller.id);
    expect(app.assignedAt).toBeTruthy();
  });

  it("два обзвонщика одновременно — заявку получает только один", async () => {
    const id = await approved("9002");
    const rs = await Promise.allSettled([claimApplication(caller, id), claimApplication(caller2, id), claimApplication(caller, id)]);
    expect(rs.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(await prisma.applicationAssignment.count({ where: { applicationId: id } })).toBe(1);
  });

  it("сотрудник без прав обзвонщика не может взять заявку", async () => {
    const id = await approved("9003");
    const helper = await createStaff({ nickname: "Хелпер", main: "helper" });
    await expect(claimApplication(helper, id)).rejects.toThrow(/права/);
  });

  it("нельзя взять заявку, ожидающую рассмотрения", async () => {
    const r = await submit("9004");
    if (r.outcome !== "created") throw new Error();
    await expect(claimApplication(caller, r.applicationId)).rejects.toThrow();
  });

  it("обзвон: начать/завершить может только закреплённый обзвонщик; длительность считается на сервере", async () => {
    const id = await approved("9005");
    await claimApplication(caller, id);
    await expect(startCall(caller2, id)).rejects.toThrow();
    await startCall(caller, id);
    await expect(startCall(caller, id)).rejects.toThrow();
    await expect(finishCall(caller2, id, { outcome: "PASSED" })).rejects.toThrow();
    const r = await finishCall(caller, id, { outcome: "PASSED", comment: "Отлично" });
    expect(r.durationSec).toBeGreaterThanOrEqual(0);
    const app = await prisma.application.findUniqueOrThrow({ where: { id }, include: { callSessions: { include: { result: true } } } });
    expect(app.status).toBe("COMPLETED");
    expect(app.activeCandidateKey).toBeNull();
    expect(app.callSessions[0]!.result!.outcome).toBe("PASSED");
  });

  it("перенос до начала обзвона сохраняет попытку", async () => {
    const id = await approved("9006");
    await claimApplication(caller, id);
    await postponeCall(caller, id, { reason: "Кандидат занят" });
    const app = await prisma.application.findUniqueOrThrow({ where: { id }, include: { callSessions: { include: { result: true } } } });
    expect(app.status).toBe("ASSIGNED");
    expect(app.callSessions[0]!.result!.outcome).toBe("POSTPONED");
  });

  it("переназначение администратором и возврат в очередь", async () => {
    const id = await approved("9007");
    await claimApplication(caller, id);
    await expect(reassignApplication(caller, id, caller2.id)).rejects.toThrow();
    await reassignApplication(admin, id, caller2.id, "болеет");
    let app = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(app.currentAssigneeId).toBe(caller2.id);
    await reassignApplication(admin, id, null);
    app = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(app.status).toBe("APPROVED_WAITING_CALLER");
    expect(app.currentAssigneeId).toBeNull();
    expect(await prisma.applicationAssignment.count({ where: { activeKey: id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { applicationId: id, action: { in: ["application.reassigned", "application.returned_to_queue"] } } })).toBe(2);
  });
});

describe("Отчёты, история, статистика", () => {
  it("отчёт показывает, кто принял/отклонил; автоотказ — Система; без решения — пусто", async () => {
    const a = await submit("9101");
    const b = await submit("9102");
    const c = await submit("9103");
    if (a.outcome !== "created" || b.outcome !== "created" || c.outcome !== "created") throw new Error();
    await decideApplication(curator.id, { applicationId: a.applicationId, decision: "APPROVED", channel: "VK_BOT" });
    await decideApplication(admin.id, { applicationId: b.applicationId, decision: "REJECTED", channel: "WEB" });
    const { sessionId } = await runToOutcome("9104", "FAILED");
    void sessionId;
    await submit("9104");

    const report = await getApplicationsReport(reportQuerySchema.parse({}));
    const byVk = Object.fromEntries(report.rows.map((r) => [r.vkId, r]));
    expect(byVk["9101"]!.decidedBy?.nickname).toBe("Максим");
    expect(byVk["9101"]!.decision).toBe("APPROVED");
    expect(byVk["9102"]!.decidedBy?.nickname).toBe("Иван");
    expect(byVk["9102"]!.decision).toBe("REJECTED");
    expect(byVk["9103"]!.decision).toBeNull();
    const auto = report.rows.find((r) => r.status === "AUTO_REJECTED_COOLDOWN")!;
    expect(auto.decisionSource).toBe("SYSTEM");
    expect(auto.decidedBy).toBeNull();

    expect(report.stats).toMatchObject({ total: 5, approved: 2, rejected: 1, auto: 1, pending: 1 });

    const onlyAuto = await getApplicationsReport(reportQuerySchema.parse({ decision: "auto" }));
    expect(onlyAuto.total).toBe(1);
    const byStaff = await getApplicationsReport(reportQuerySchema.parse({ staffId: admin.id }));
    expect(byStaff.rows.map((r) => r.vkId)).toEqual(["9102"]);
    const byVkFilter = await getApplicationsReport(reportQuerySchema.parse({ vkId: "id9101" }));
    expect(byVkFilter.total).toBe(1);
    const paged = await getApplicationsReport(reportQuerySchema.parse({ pageSize: 5, page: 2 }));
    expect(paged.rows.length).toBe(0);
    const sorted = await getApplicationsReport(reportQuerySchema.parse({ sort: "id", dir: "asc" }));
    expect(sorted.rows[0]!.id).toBeLessThan(sorted.rows[1]!.id);
  });

  it("история кандидата: заявки, обзвоны, ограничение и дата повторной подачи", async () => {
    await runToOutcome("9201", "FAILED");
    await submit("9201");
    const h = await getCandidateHistory("9201");
    expect(h).not.toBeNull();
    expect(h!.applications.length).toBe(2);
    expect(h!.restriction.active).toBe(true);
    expect(h!.restriction.allowedFrom).toBeTruthy();
    const types = h!.events.map((e) => e.type);
    for (const t of ["SUBMITTED", "APPROVED", "ASSIGNED", "CALL_STARTED", "CALL_FINISHED", "COOLDOWN_STARTED", "AUTO_REJECTED"]) {
      expect(types).toContain(t);
    }
  });

  it("дашборд и рейтинг считаются из базы", async () => {
    await runToOutcome("9301", "PASSED");
    await runToOutcome("9302", "FAILED");
    await submit("9303");
    const d = await getDashboard(caller.id, "Europe/Moscow");
    expect(d.totals.total).toBe(3);
    expect(d.totals.completed).toBe(2);
    expect(d.totals.pendingReview).toBe(1);
    expect(d.caller).toMatchObject({ today: 2, week: 2, passed: 1, failed: 1, myActive: 0 });
    const rating = await getRating("today", "Europe/Moscow");
    const me = rating.find((r) => r.user.id === caller.id)!;
    expect(me).toMatchObject({ completed: 2, passed: 1, failed: 1 });
  });
});
