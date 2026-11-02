import { prisma } from "../db";
import { appEvent, audit, publish, type Actor } from "../audit";
import { errors, isUniqueViolation } from "../http";
import { getSetting } from "../settings";
import { can, canAny, loadAuthUser, type AuthUser } from "../auth/rbac";
import { cooldownEndsAt } from "./cooldown";

const ref = (u: AuthUser): Actor => ({ type: "USER", id: u.id, label: u.nickname });

/** «Взять на себя»: атомарное закрепление свободной заявки из очереди. */
export async function claimApplication(actor: AuthUser, applicationId: number) {
  if (!can(actor, "applications.assign")) throw errors.forbidden("Нет права брать заявки");
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const upd = await tx.application.updateMany({
        where: { id: applicationId, status: "APPROVED_WAITING_CALLER", currentAssigneeId: null },
        data: { status: "ASSIGNED", currentAssigneeId: actor.id, assignedAt: now },
      });
      if (upd.count === 0) {
        const app = await tx.application.findUnique({ where: { id: applicationId } });
        if (!app) throw errors.notFound("Заявка не найдена");
        throw errors.conflict("Заявку уже взял другой обзвонщик", "ALREADY_TAKEN");
      }
      await tx.applicationAssignment.create({
        data: { applicationId, userId: actor.id, kind: "TAKEN", activeKey: applicationId, assignedAt: now },
      });
      const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
      await appEvent(tx, { applicationId, candidateId: app.candidateId, type: "ASSIGNED", actor: ref(actor) });
      await audit(tx, { actor: ref(actor), action: "application.claimed", applicationId, entityType: "Application", entityId: applicationId });
      await publish(tx, "applications", { id: applicationId });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("Заявку уже взял другой обзвонщик", "ALREADY_TAKEN");
    throw e;
  }
}

/** Переназначение (или возврат в очередь при toUserId = null). Недоступно во время идущего обзвона. */
export async function reassignApplication(actor: AuthUser, applicationId: number, toUserId: string | null, comment?: string) {
  if (!can(actor, "applications.reassign")) throw errors.forbidden("Нет права переназначать заявки");
  if (toUserId) {
    const target = await loadAuthUser(toUserId);
    if (!target || target.status !== "ACTIVE") throw errors.badRequest("Сотрудник не активен");
    if (!canAny(target, ["applications.assign", "calls.start"])) throw errors.badRequest("У сотрудника нет прав обзвонщика");
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { id: applicationId } });
    if (!app) throw errors.notFound("Заявка не найдена");
    if (app.status === "IN_PROGRESS") throw errors.conflict("Идёт обзвон — сначала завершите или перенесите его");
    if (app.status !== "ASSIGNED" && app.status !== "APPROVED_WAITING_CALLER") {
      throw errors.conflict("Переназначать можно только принятые заявки, ожидающие проверки");
    }
    if (toUserId && app.currentAssigneeId === toUserId) throw errors.conflict("Заявка уже закреплена за этим сотрудником");
    const upd = await tx.application.updateMany({
      where: { id: applicationId, status: app.status, currentAssigneeId: app.currentAssigneeId },
      data: toUserId
        ? { status: "ASSIGNED", currentAssigneeId: toUserId, assignedAt: now }
        : { status: "APPROVED_WAITING_CALLER", currentAssigneeId: null, assignedAt: null },
    });
    if (upd.count === 0) throw errors.conflict("Заявка изменилась, обновите страницу");
    await tx.applicationAssignment.updateMany({ where: { activeKey: applicationId }, data: { activeKey: null, releasedAt: now } });
    if (toUserId) {
      await tx.applicationAssignment.create({
        data: { applicationId, userId: toUserId, assignedById: actor.id, kind: "REASSIGNED", activeKey: applicationId, assignedAt: now },
      });
      await tx.notification.create({
        data: { userId: toUserId, type: "assigned", title: `Вам назначена заявка #${applicationId}`, body: app.nickname, link: `/applications/${applicationId}` },
      });
    }
    await appEvent(tx, {
      applicationId,
      candidateId: app.candidateId,
      type: "REASSIGNED",
      actor: ref(actor),
      comment: comment ?? null,
      meta: { from: app.currentAssigneeId, to: toUserId },
    });
    await audit(tx, {
      actor: ref(actor),
      action: toUserId ? "application.reassigned" : "application.returned_to_queue",
      applicationId,
      details: { from: app.currentAssigneeId, to: toUserId, comment: comment ?? null },
    });
    await publish(tx, "applications", { id: applicationId });
  });
}

/** Начало обзвона. Время фиксируется на сервере. */
export async function startCall(actor: AuthUser, applicationId: number) {
  if (!can(actor, "calls.start")) throw errors.forbidden("Нет права начинать обзвон");
  try {
    return await prisma.$transaction(async (tx) => {
      const upd = await tx.application.updateMany({
        where: { id: applicationId, status: "ASSIGNED", currentAssigneeId: actor.id },
        data: { status: "IN_PROGRESS" },
      });
      if (upd.count === 0) throw errors.conflict("Начать обзвон можно только по своей закреплённой заявке");
      const session = await tx.callSession.create({ data: { applicationId, callerId: actor.id, activeKey: applicationId } });
      const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
      await appEvent(tx, { applicationId, candidateId: app.candidateId, type: "CALL_STARTED", actor: ref(actor) });
      await audit(tx, { actor: ref(actor), action: "call.started", applicationId, entityType: "CallSession", entityId: session.id });
      await publish(tx, "applications", { id: applicationId });
      return session;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("Обзвон по этой заявке уже идёт");
    throw e;
  }
}

export type FinishInput = {
  outcome: "PASSED" | "FAILED" | "REFUSED" | "POSTPONED";
  reason?: string | null;
  comment?: string | null;
};

/**
 * Завершение обзвона. «Не прошёл» запускает ограничение повторной подачи (по умолчанию 120 ч от серверного времени завершения).
 * «Перенос» возвращает заявку в «Мои заявки» того же обзвонщика.
 */
export async function finishCall(actor: AuthUser, applicationId: number, input: FinishInput) {
  if (!can(actor, "calls.finish")) throw errors.forbidden("Нет права завершать обзвон");
  const hours = await getSetting("cooldown.hours");
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { id: applicationId } });
    if (!app) throw errors.notFound("Заявка не найдена");
    if (app.status !== "IN_PROGRESS" || app.currentAssigneeId !== actor.id) {
      throw errors.conflict("Завершить можно только свой идущий обзвон");
    }
    const session = await tx.callSession.findUnique({ where: { activeKey: applicationId } });
    if (!session) throw errors.conflict("Активный обзвон не найден");
    const endedAt = new Date();
    const durationSec = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));
    const closed = await tx.callSession.updateMany({
      where: { id: session.id, status: "IN_PROGRESS" },
      data: { status: "FINISHED", endedAt, durationSec, activeKey: null },
    });
    if (closed.count === 0) throw errors.conflict("Обзвон уже завершён");
    await tx.callResult.create({
      data: {
        callSessionId: session.id,
        outcome: input.outcome,
        reason: input.reason?.trim() || null,
        comment: input.comment?.trim() || null,
        recordedById: actor.id,
      },
    });

    if (input.outcome === "POSTPONED") {
      await tx.application.update({ where: { id: applicationId }, data: { status: "ASSIGNED" } });
    } else {
      await tx.application.update({
        where: { id: applicationId },
        data: { status: "COMPLETED", completedAt: endedAt, activeCandidateKey: null },
      });
      await tx.applicationAssignment.updateMany({ where: { activeKey: applicationId }, data: { activeKey: null, releasedAt: endedAt } });
    }

    if (input.outcome === "FAILED" && app.candidateId && app.vkId) {
      const endsAt = cooldownEndsAt(endedAt, hours);
      await tx.cooldownRestriction.create({
        data: { candidateId: app.candidateId, vkId: app.vkId, callSessionId: session.id, failedAt: endedAt, endsAt },
      });
      await appEvent(tx, {
        applicationId,
        candidateId: app.candidateId,
        type: "COOLDOWN_STARTED",
        actor: { type: "SYSTEM" },
        comment: `Повторная подача разрешена с ${endsAt.toISOString()}`,
        meta: { endsAt: endsAt.toISOString(), hours },
      });
    }
    await appEvent(tx, {
      applicationId,
      candidateId: app.candidateId,
      type: "CALL_FINISHED",
      actor: ref(actor),
      comment: [input.reason, input.comment].filter(Boolean).join(" — ") || null,
      meta: { outcome: input.outcome, durationSec },
    });
    await audit(tx, {
      actor: ref(actor),
      action: "call.finished",
      applicationId,
      entityType: "CallSession",
      entityId: session.id,
      details: { outcome: input.outcome, durationSec },
    });
    await publish(tx, "applications", { id: applicationId });
    return { sessionId: session.id, durationSec, endedAt };
  });
}

/**
 * «Перенести»: если обзвон идёт — завершает его с результатом «Перенос»;
 * если ещё не начат — фиксирует попытку с результатом «Перенос». Ограничение не применяется.
 */
export async function postponeCall(actor: AuthUser, applicationId: number, input: { reason?: string | null; comment?: string | null }) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) throw errors.notFound("Заявка не найдена");
  if (app.status === "IN_PROGRESS") return finishCall(actor, applicationId, { outcome: "POSTPONED", ...input });
  if (!can(actor, "calls.finish")) throw errors.forbidden();
  if (app.status !== "ASSIGNED" || app.currentAssigneeId !== actor.id) throw errors.conflict("Перенести можно только свою заявку");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const s = await tx.callSession.create({
      data: { applicationId, callerId: actor.id, status: "FINISHED", startedAt: now, endedAt: now, durationSec: 0 },
    });
    await tx.callResult.create({
      data: { callSessionId: s.id, outcome: "POSTPONED", reason: input.reason?.trim() || null, comment: input.comment?.trim() || null, recordedById: actor.id },
    });
    await appEvent(tx, {
      applicationId,
      candidateId: app.candidateId,
      type: "CALL_FINISHED",
      actor: ref(actor),
      comment: [input.reason, input.comment].filter(Boolean).join(" — ") || null,
      meta: { outcome: "POSTPONED", durationSec: 0 },
    });
    await audit(tx, { actor: ref(actor), action: "call.postponed", applicationId, entityType: "CallSession", entityId: s.id });
    await publish(tx, "applications", { id: applicationId });
    return { sessionId: s.id, durationSec: 0, endedAt: now };
  });
}

export async function liftCooldown(actor: AuthUser, restrictionId: string, reason: string) {
  if (!can(actor, "candidates.cooldown.manage")) throw errors.forbidden();
  await prisma.$transaction(async (tx) => {
    const r = await tx.cooldownRestriction.updateMany({
      where: { id: restrictionId, liftedAt: null },
      data: { liftedAt: new Date(), liftedById: actor.id, liftReason: reason },
    });
    if (r.count === 0) throw errors.conflict("Ограничение уже снято или не найдено");
    const cr = await tx.cooldownRestriction.findUniqueOrThrow({ where: { id: restrictionId } });
    await appEvent(tx, { candidateId: cr.candidateId, type: "COOLDOWN_LIFTED", actor: ref(actor), comment: reason });
    await audit(tx, { actor: ref(actor), action: "cooldown.lifted", entityType: "CooldownRestriction", entityId: restrictionId, details: { reason } });
    await publish(tx, "candidates");
  });
}
