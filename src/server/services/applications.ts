import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { formatDateTime } from "@/lib/labels";

import { prisma, type Tx } from "../db";

import { appEvent, audit, auditDenied, publish, SYSTEM_ACTOR, type Actor } from "../audit";

import { errors, isUniqueViolation } from "../http";

import { getSettings, type Settings } from "../settings";

import { can, loadAuthUser, type AuthUser } from "../auth/rbac";

import { checkCooldown } from "./cooldown";

import { resolveIdentity, type IdentityResult, type ScreenResolver } from "./identity";

import { refreshLeadershipMessages, sendApplicationToLeadership } from "./vk-bot";

// ───────────────────────── Побочные эффекты после фиксации транзакции ─────────────────────────

// Вынесены в объект, чтобы в тестах можно было перехватить рассылку и убедиться,

// что никаких сообщений кандидатам не отправляется.

export const effects = {

  sendToLeadership: async (applicationId: number) => {

    await sendApplicationToLeadership(applicationId);

  },

  refreshLeadership: async (applicationId: number) => {

    await refreshLeadershipMessages(applicationId);

  },

};

async function runEffect(fn: () => Promise<void>) {

  try {

    await fn();

  } catch (e) {

    console.error("[effects] ошибка побочного действия", e);

  }

}

// ───────────────────────── Приём анкет ─────────────────────────

export const formSubmissionSchema = z.object({

  responseId: z.string().min(1).max(200),

  formId: z.string().max(200).optional(),

  timestamp: z.string().min(1).max(64),

  respondentEmail: z.string().max(320).optional().nullable(),

  answers: z

    .array(

      z.object({

        question: z.string().max(2000),

        answer: z.union([z.string(), z.array(z.string()), z.null()]).transform((v) =>

          Array.isArray(v) ? v.join(", ") : (v ?? ""),

        ),

        itemId: z.union([z.string(), z.number()]).optional(),

      }),

    )

    .max(300),

});

export type FormSubmission = z.infer<typeof formSubmissionSchema>;

function norm(s: string) {

  return s

    .toLowerCase()

    .replace(/ё/g, "е")

    .replace(/[\*:?!.]+$/g, "")

    .replace(/\s+/g, " ")

    .trim();

}

export function mapFormFields(answers: FormSubmission["answers"], fieldMap: Settings["googleForms.fieldMap"]) {

  const find = (titles: string[]) => {

    const set = new Set(titles.map(norm));

    return answers.find((a) => set.has(norm(a.question)))?.answer?.trim() || null;

  };

  const linkCodeTitles = new Set(fieldMap.linkCode.map(norm));

  return {

    nickname: find(fieldMap.nickname),

    fullName: find(fieldMap.fullName),

    vkProfile:
      find(fieldMap.vkProfile) ??
      answers.find((a) => /ссылк[уаи].*вконтакте|ссылк[уаи].*вк|vk.?профиль/i.test(a.question))?.answer?.trim() ??
      null,

    vkId: find(fieldMap.vkId),

    linkCode: find(fieldMap.linkCode),

    answers: answers

      .filter((a) => !linkCodeTitles.has(norm(a.question)))

      .map((a, i) => ({ position: i + 1, question: a.question.slice(0, 2000), answer: a.answer.slice(0, 10000) })),

  };

}

export type IngestResult =

  | { outcome: "created"; applicationId: number; status: string }

  | { outcome: "already_processed"; applicationId: number }

  | { outcome: "duplicate_active"; activeApplicationId: number }

  | { outcome: "disabled" };

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**

 * Приём анкеты: идемпотентность по responseId, определение кандидата,

 * защита от дубликатов, автоотказ по ограничению, сохранение и передача руководству.

 */

export async function ingestSubmission(

  sub: FormSubmission,

  opts: { resolver?: ScreenResolver; now?: Date; integrationEventId?: string } = {},

): Promise<IngestResult> {

  const now = opts.now ?? new Date();

  const settings = await getSettings();

  if (!settings["googleForms.enabled"]) return { outcome: "disabled" };

  const already = await prisma.application.findUnique({

    where: { source_externalId: { source: "GOOGLE_FORMS", externalId: sub.responseId } },

  });

  if (already) return { outcome: "already_processed", applicationId: already.id };

  const fields = mapFormFields(sub.answers, settings["googleForms.fieldMap"]);

  const identity = await resolveIdentity(

    { vkProfile: fields.vkProfile, vkIdField: fields.vkId, linkCode: fields.linkCode },

    { resolver: opts.resolver },

  );

  // Время подачи — отметка Google (передаётся под HMAC-подписью); не позже серверного «сейчас».

  const formTs = new Date(sub.timestamp);

  const submittedAt =

    Number.isNaN(formTs.getTime()) || formTs.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS ? now : formTs;

  const base = {

    source: "GOOGLE_FORMS" as const,

    externalId: sub.responseId,

    nickname: (fields.nickname || fields.fullName || "Без ника").slice(0, 120),

    fullName: fields.fullName?.slice(0, 200) ?? null,

    vkProfileRaw: fields.vkProfile?.slice(0, 300) ?? fields.vkId?.slice(0, 300) ?? null,

    submittedAt,

    receivedAt: now,

  };

  let result: IngestResult;

  try {

    result = await prisma.$transaction(async (tx) => {

      const r = await createApplicationTx(tx, { base, identity, answers: fields.answers, settings, now });

      if (opts.integrationEventId) {

        await tx.integrationEvent.update({

          where: { id: opts.integrationEventId },

          data:

            r.outcome === "created"

              ? { status: "PROCESSED", applicationId: r.applicationId, processedAt: new Date() }

              : r.outcome === "duplicate_active"

                ? { status: "DUPLICATE", applicationId: r.activeApplicationId, processedAt: new Date(), error: "У кандидата уже есть активная заявка" }

                : { status: "PROCESSED", processedAt: new Date() },

        });

      }

      return r;

    });

  } catch (e) {

    if (isUniqueViolation(e)) {

      // Гонка: параллельная доставка того же ответа или параллельная активная заявка.

      const again = await prisma.application.findUnique({

        where: { source_externalId: { source: "GOOGLE_FORMS", externalId: sub.responseId } },

      });

      if (again) return { outcome: "already_processed", applicationId: again.id };

      if (identity.vkId) {

        const cand = await prisma.candidate.findUnique({ where: { vkId: identity.vkId } });

        const active = cand ? await prisma.application.findUnique({ where: { activeCandidateKey: cand.id } }) : null;

        if (active) {

          await recordDuplicate(cand!.id, active.id, sub.responseId, opts.integrationEventId);

          return { outcome: "duplicate_active", activeApplicationId: active.id };

        }

      }

    }

    throw e;

  }

  if (result.outcome === "created" && result.status === "PENDING_REVIEW") {

    await runEffect(() => effects.sendToLeadership(result.applicationId));

  }

  return result;

}

async function recordDuplicate(candidateId: string, activeId: number, responseId: string, eventId?: string) {

  await prisma.$transaction(async (tx) => {

    await appEvent(tx, {

      candidateId,

      applicationId: activeId,

      type: "DUPLICATE_SUBMISSION",

      actor: SYSTEM_ACTOR,

      comment: `Повторная отправка анкеты (ответ ${responseId}) при активной заявке #${activeId}`,

    });

    if (eventId) {

      await tx.integrationEvent.update({

        where: { id: eventId },

        data: { status: "DUPLICATE", applicationId: activeId, processedAt: new Date(), error: "У кандидата уже есть активная заявка" },

      });

    }

  });

}

type BaseFields = {

  source: "GOOGLE_FORMS" | "MANUAL" | "DISCORD";

  externalId: string | null;

  nickname: string;

  fullName: string | null;

  vkProfileRaw: string | null;

  submittedAt: Date;

  receivedAt: Date;

};

async function lockCandidate(tx: Tx, vkId: string, data: { nickname: string; fullName: string | null; screenName: string | null; verified: boolean }) {

  const cand = await tx.candidate.upsert({

    where: { vkId },

    create: {

      vkId,

      nickname: data.nickname,

      fullName: data.fullName,

      vkScreenName: data.screenName,

      vkVerifiedAt: data.verified ? new Date() : null,

    },

    update: {

      nickname: data.nickname,

      ...(data.fullName ? { fullName: data.fullName } : {}),

      ...(data.screenName ? { vkScreenName: data.screenName } : {}),

    },

  });

  // Сериализуем проверки по одному кандидату (дубликаты/ограничение).

  await tx.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${cand.id} FOR UPDATE`;

  return cand;

}

async function createApplicationTx(

  tx: Tx,

  p: { base: BaseFields; identity: IdentityResult; answers: { position: number; question: string; answer: string }[]; settings: Settings; now: Date },

): Promise<IngestResult> {

  const { base, identity, settings } = p;

  const answersCreate = { create: p.answers };

  // VK не определён или противоречив → ручная проверка VK ID, без кандидата.

  if (!identity.vkId) {

    const app = await tx.application.create({

      data: {

        ...base,

        vkId: null,

        identityStatus: identity.status,

        identityNote: identity.note,

        status: "IDENTITY_CHECK",

        answers: answersCreate,

      },

    });

    await appEvent(tx, { applicationId: app.id, type: "SUBMITTED", actor: SYSTEM_ACTOR });

    await appEvent(tx, { applicationId: app.id, type: "IDENTITY_CHECK_REQUIRED", actor: SYSTEM_ACTOR, comment: identity.note });

    await audit(tx, { actor: SYSTEM_ACTOR, action: "application.identity_check", applicationId: app.id, entityType: "Application", entityId: app.id });

    await publish(tx, "applications");

    return { outcome: "created", applicationId: app.id, status: app.status };

  }

  const cand = await lockCandidate(tx, identity.vkId, {

    nickname: base.nickname,

    fullName: base.fullName,

    screenName: identity.screenName,

    verified: identity.status === "VERIFIED",

  });

  if (identity.status === "VERIFIED" && !cand.vkVerifiedAt) {

    await tx.candidate.update({ where: { id: cand.id }, data: { vkVerifiedAt: new Date() } });

  }

  // Защита от дубликатов: не более одной активной заявки на кандидата.

  const active = await tx.application.findUnique({ where: { activeCandidateKey: cand.id } });

  if (active) {

    await appEvent(tx, {

      candidateId: cand.id,

      applicationId: active.id,

      type: "DUPLICATE_SUBMISSION",

      actor: SYSTEM_ACTOR,

      comment: `Повторная отправка анкеты${base.externalId ? ` (ответ ${base.externalId})` : ""} при активной заявке #${active.id}`,

    });

    await audit(tx, {

      actor: SYSTEM_ACTOR,

      action: "application.duplicate_ignored",

      applicationId: active.id,

      entityType: "Candidate",

      entityId: cand.id,

      details: { externalId: base.externalId },

    });

    return { outcome: "duplicate_active", activeApplicationId: active.id };

  }

  const cooldown = await checkCooldown(cand.id, base.submittedAt, settings["cooldown.hours"], tx);

  const trustedIdentity = identity.status === "VERIFIED" || settings["identity.cooldownMode"] === "LINK";

  if (cooldown.restricted && trustedIdentity) {

    const reason = `Повторная подача раньше срока: последний обзвон «Не прошёл» ${formatDateTime(cooldown.lastFailedAt, settings.timezone)}, подача разрешена с ${formatDateTime(cooldown.endsAt, settings.timezone)}`;

    const app = await tx.application.create({

      data: {

        ...base,

        candidateId: cand.id,

        vkId: identity.vkId,

        identityStatus: identity.status,

        identityNote: identity.note,

        status: "AUTO_REJECTED_COOLDOWN",

        decisionSource: "SYSTEM",

        decidedAt: p.now,

        rejectReason: reason,

        cooldownLastFailedAt: cooldown.lastFailedAt,

        cooldownUntil: cooldown.endsAt,

        answers: answersCreate,

      },

    });

    await tx.applicationDecision.create({

      data: { applicationId: app.id, decision: "AUTO_REJECTED", source: "SYSTEM", channel: "SYSTEM", reason },

    });

    await appEvent(tx, { applicationId: app.id, candidateId: cand.id, type: "SUBMITTED", actor: SYSTEM_ACTOR });

    await appEvent(tx, {

      applicationId: app.id,

      candidateId: cand.id,

      type: "AUTO_REJECTED",

      actor: SYSTEM_ACTOR,

      comment: reason,

      meta: { lastFailedAt: cooldown.lastFailedAt.toISOString(), endsAt: cooldown.endsAt.toISOString(), failedApplicationId: cooldown.applicationId },

    });

    await audit(tx, {

      actor: SYSTEM_ACTOR,

      action: "application.auto_rejected_cooldown",

      applicationId: app.id,

      entityType: "Application",

      entityId: app.id,

      details: { endsAt: cooldown.endsAt.toISOString() },

    });

    await publish(tx, "applications");

    return { outcome: "created", applicationId: app.id, status: app.status };

  }

  const needsIdentityCheck = cooldown.restricted && !trustedIdentity;

  const note = needsIdentityCheck

    ? [

        `VK id${identity.vkId} из ссылки совпадает с кандидатом, у которого действует ограничение до ${formatDateTime(cooldown.endsAt, settings.timezone)}. Ссылка не подтверждает владение аккаунтом — подтвердите личность вручную.`,

        identity.note,

      ]

        .filter(Boolean)

        .join("; ")

    : identity.note;

  const app = await tx.application.create({

    data: {

      ...base,

      candidateId: cand.id,

      activeCandidateKey: cand.id,

      vkId: identity.vkId,

      identityStatus: identity.status,

      identityNote: note,

      status: needsIdentityCheck ? "IDENTITY_CHECK" : "PENDING_REVIEW",

      cooldownLastFailedAt: needsIdentityCheck ? cooldown.lastFailedAt : null,

      cooldownUntil: needsIdentityCheck ? cooldown.endsAt : null,

      answers: answersCreate,

    },

  });

  if (identity.linkCodeId) {

    await tx.candidateLinkCode.update({ where: { id: identity.linkCodeId }, data: { usedAt: new Date() } });

  }

  await appEvent(tx, { applicationId: app.id, candidateId: cand.id, type: "SUBMITTED", actor: SYSTEM_ACTOR });

  if (needsIdentityCheck) {

    await appEvent(tx, { applicationId: app.id, candidateId: cand.id, type: "IDENTITY_CHECK_REQUIRED", actor: SYSTEM_ACTOR, comment: note });

  }

  await audit(tx, {

    actor: SYSTEM_ACTOR,

    action: needsIdentityCheck ? "application.identity_check" : "application.received",

    applicationId: app.id,

    entityType: "Application",

    entityId: app.id,

  });

  await publish(tx, "applications");

  return { outcome: "created", applicationId: app.id, status: app.status };

}

// ───────────────────────── Ручная проверка VK ID ─────────────────────────

/**

 * Сотрудник подтверждает VK ID кандидата для заявки в статусе IDENTITY_CHECK.

 * Затем применяются те же проверки: дубликат и ограничение (VK ID считается подтверждённым).

 */

export async function confirmIdentity(actor: AuthUser, applicationId: number, vkIdInput: string, comment?: string) {

  if (!can(actor, "applications.review")) throw errors.forbidden();

  const vkId = vkIdInput.trim().replace(/^id/i, "");

  if (!/^\d{1,12}$/.test(vkId) || vkId === "0") throw errors.badRequest("Укажите числовой VK ID");

  const settings = await getSettings();

  const actorRef: Actor = { type: "USER", id: actor.id, label: actor.nickname };

  const outcome = await prisma.$transaction(async (tx) => {

    const app = await tx.application.findUnique({ where: { id: applicationId } });

    if (!app) throw errors.notFound("Заявка не найдена");

    if (app.status !== "IDENTITY_CHECK") throw errors.conflict("Заявка не ожидает проверки VK ID");

    const cand = await lockCandidate(tx, vkId, { nickname: app.nickname, fullName: app.fullName, screenName: null, verified: false });

    const active = await tx.application.findUnique({ where: { activeCandidateKey: cand.id } });

    if (active && active.id !== app.id) {

      throw errors.conflict(`У кандидата id${vkId} уже есть активная заявка #${active.id}. Отмените одну из заявок.`);

    }

    const cooldown = await checkCooldown(cand.id, app.submittedAt, settings["cooldown.hours"], tx);

    await appEvent(tx, {

      applicationId: app.id,

      candidateId: cand.id,

      type: "IDENTITY_RESOLVED",

      actor: actorRef,

      comment: comment ?? `VK ID подтверждён: id${vkId}`,

    });

    if (cooldown.restricted) {

      const reason = `Повторная подача раньше срока: последний обзвон «Не прошёл» ${formatDateTime(cooldown.lastFailedAt, settings.timezone)}, подача разрешена с ${formatDateTime(cooldown.endsAt, settings.timezone)}`;

      await tx.application.update({

        where: { id: app.id },

        data: {

          candidateId: cand.id,

          vkId,

          activeCandidateKey: null,

          identityStatus: "MANUAL",

          status: "AUTO_REJECTED_COOLDOWN",

          decisionSource: "SYSTEM",

          decidedAt: new Date(),

          rejectReason: reason,

          cooldownLastFailedAt: cooldown.lastFailedAt,

          cooldownUntil: cooldown.endsAt,

        },

      });

      await tx.applicationDecision.create({

        data: { applicationId: app.id, decision: "AUTO_REJECTED", source: "SYSTEM", channel: "SYSTEM", reason },

      });

      await appEvent(tx, { applicationId: app.id, candidateId: cand.id, type: "AUTO_REJECTED", actor: SYSTEM_ACTOR, comment: reason });

      await audit(tx, { actor: actorRef, action: "application.identity_confirmed", applicationId: app.id, details: { vkId, result: "AUTO_REJECTED_COOLDOWN" } });

      await publish(tx, "applications");

      return "AUTO_REJECTED_COOLDOWN" as const;

    }

    await tx.application.update({

      where: { id: app.id },

      data: {

        candidateId: cand.id,

        vkId,

        activeCandidateKey: cand.id,

        identityStatus: "MANUAL",

        status: "PENDING_REVIEW",

        cooldownLastFailedAt: null,

        cooldownUntil: null,

      },

    });

    await audit(tx, { actor: actorRef, action: "application.identity_confirmed", applicationId: app.id, details: { vkId, result: "PENDING_REVIEW" } });

    await publish(tx, "applications");

    return "PENDING_REVIEW" as const;

  });

  if (outcome === "PENDING_REVIEW") await runEffect(() => effects.sendToLeadership(applicationId));

  return { status: outcome };

}

export async function cancelApplication(actor: AuthUser, applicationId: number, reason: string) {

  if (!can(actor, "applications.review")) throw errors.forbidden();

  const actorRef: Actor = { type: "USER", id: actor.id, label: actor.nickname };

  await prisma.$transaction(async (tx) => {

    const r = await tx.application.updateMany({

      where: { id: applicationId, status: { in: ["IDENTITY_CHECK", "PENDING_REVIEW", "APPROVED_WAITING_CALLER", "ASSIGNED"] } },

      data: { status: "CANCELLED", activeCandidateKey: null, currentAssigneeId: null, completedAt: new Date() },

    });

    if (r.count === 0) throw errors.conflict("Заявку нельзя отменить в текущем статусе");

    await tx.applicationAssignment.updateMany({ where: { activeKey: applicationId }, data: { activeKey: null, releasedAt: new Date() } });

    const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });

    await appEvent(tx, { applicationId, candidateId: app.candidateId, type: "CANCELLED", actor: actorRef, comment: reason });

    await audit(tx, { actor: actorRef, action: "application.cancelled", applicationId, details: { reason } });

    await publish(tx, "applications");

  });

  await runEffect(() => effects.refreshLeadership(applicationId));

}

// ───────────────────────── Решение руководства ─────────────────────────

export type DecisionInput = {

  applicationId: number;

  decision: "APPROVED" | "REJECTED";

  channel: "VK_BOT" | "WEB";

  reason?: string | null;

};

export type DecisionOutcome =

  | { ok: true; status: "APPROVED_WAITING_CALLER" | "REJECTED" }

  | { ok: false; code: "FORBIDDEN" | "ALREADY_PROCESSED" | "NOT_FOUND" | "INACTIVE"; message: string };

/**

 * Атомарное решение по заявке. Права проверяются заново при каждом вызове.

 * Через VK-бота дополнительно требуется членство в «Руководстве КП» с соответствующим флагом.

 * Из двух одновременных решений применяется только одно (условный UPDATE + уникальность решения).

 */

export async function decideApplication(actorUserId: string, input: DecisionInput): Promise<DecisionOutcome> {

  const user = await loadAuthUser(actorUserId);

  const perm = input.decision === "APPROVED" ? "applications.approve" : "applications.reject";

  if (!user || user.status !== "ACTIVE") return { ok: false, code: "INACTIVE", message: "Учётная запись не активна" };

  let allowed = can(user, perm);

  if (allowed && input.channel === "VK_BOT") {

    const member = await prisma.leadershipMember.findUnique({ where: { userId: user.id } });

    allowed = !!member && (input.decision === "APPROVED" ? member.canApprove : member.canReject);

  }

  if (!allowed) {

    await auditDenied({

      actor: { type: input.channel === "VK_BOT" ? "BOT" : "USER", id: user.id, label: user.nickname },

      action: input.decision === "APPROVED" ? "application.approve" : "application.reject",

      applicationId: input.applicationId,

      details: { channel: input.channel },

    });

    return { ok: false, code: "FORBIDDEN", message: "Недостаточно прав для этого решения" };

  }

  const actorRef: Actor =

    input.channel === "VK_BOT" ? { type: "BOT", id: user.id, label: user.nickname } : { type: "USER", id: user.id, label: user.nickname };

  const now = new Date();

  const newStatus = input.decision === "APPROVED" ? "APPROVED_WAITING_CALLER" : "REJECTED";

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 1000) : null;

  try {

    const res = await prisma.$transaction(async (tx) => {

      const upd = await tx.application.updateMany({

        where: { id: input.applicationId, status: "PENDING_REVIEW" },

        data: {

          status: newStatus,

          decidedById: user.id,

          decidedAt: now,

          decisionSource: "USER",

          rejectReason: input.decision === "REJECTED" ? reason : null,

          ...(input.decision === "REJECTED" ? { activeCandidateKey: null } : {}),

        },

      });

      if (upd.count === 0) {

        const exists = await tx.application.findUnique({ where: { id: input.applicationId }, select: { id: true } });

        return exists ? ("ALREADY" as const) : ("NOT_FOUND" as const);

      }

      await tx.applicationDecision.create({

        data: {

          applicationId: input.applicationId,

          decision: input.decision,

          source: "USER",

          channel: input.channel,

          userId: user.id,

          userNickname: user.nickname,

          reason,

        },

      });

      const app = await tx.application.findUniqueOrThrow({ where: { id: input.applicationId } });

      await appEvent(tx, {

        applicationId: app.id,

        candidateId: app.candidateId,

        type: input.decision,

        actor: actorRef,

        comment: reason,

        meta: { channel: input.channel },

      });

      await audit(tx, {

        actor: actorRef,

        action: input.decision === "APPROVED" ? "application.approved" : "application.rejected",

        applicationId: app.id,

        entityType: "Application",

        entityId: app.id,

        details: { channel: input.channel, reason },

      });

      if (input.decision === "APPROVED") {

        // Внутренние уведомления обзвонщикам на сайте (не кандидату).

        const callers = await tx.user.findMany({

          where: {

            status: "ACTIVE",

            OR: [

              { roles: { some: { role: { permissions: { some: { permission: { key: "applications.assign" } } } } } } },

              { permissionOverrides: { some: { granted: true, permission: { key: "applications.assign" } } } },

            ],

          },

          select: { id: true },

        });

        if (callers.length) {

          await tx.notification.createMany({

            data: callers.map((c) => ({

              userId: c.id,

              type: "queue",

              title: `Заявка #${app.id} ожидает обзвонщика`,

              body: app.nickname,

              link: "/queue",

            })),

          });

        }

      }

      await publish(tx, "applications", { id: app.id, status: newStatus } as Prisma.InputJsonValue);

      return "OK" as const;

    });

    if (res === "ALREADY") return { ok: false, code: "ALREADY_PROCESSED", message: "Заявка уже обработана" };

    if (res === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: "Заявка не найдена" };

  } catch (e) {

    if (isUniqueViolation(e)) return { ok: false, code: "ALREADY_PROCESSED", message: "Заявка уже обработана" };

    throw e;

  }

  await runEffect(() => effects.refreshLeadership(input.applicationId));

  return { ok: true, status: newStatus };

}

/** Причина отказа, указанная после нажатия «Отклонить» (только автор решения, только для REJECTED). */

export async function updateRejectReason(actorUserId: string, applicationId: number, reason: string) {

  const r = reason.trim().slice(0, 1000);

  const ok = await prisma.$transaction(async (tx) => {

    const app = await tx.application.findUnique({ where: { id: applicationId }, include: { decision: true } });

    if (!app || app.status !== "REJECTED" || app.decision?.userId !== actorUserId) return false;

    await tx.application.update({ where: { id: applicationId }, data: { rejectReason: r } });

    await tx.applicationDecision.update({ where: { applicationId }, data: { reason: r } });

    await appEvent(tx, { applicationId, candidateId: app.candidateId, type: "REJECT_REASON_UPDATED", actor: { type: "BOT", id: actorUserId }, comment: r });

    await audit(tx, { actor: { type: "BOT", id: actorUserId }, action: "application.reject_reason", applicationId, details: { reason: r } });

    await publish(tx, "applications");

    return true;

  });

  if (ok) await runEffect(() => effects.refreshLeadership(applicationId));

  return ok;

}

// ───────────────────────── Отметка «Кандидат уведомлён» и комментарии ─────────────────────────

/** Только отметка в базе. Никаких сообщений не отправляется. */

export async function setCandidateNotified(actor: AuthUser, applicationId: number, notified: boolean) {

  if (!can(actor, "applications.review")) throw errors.forbidden();

  const actorRef: Actor = { type: "USER", id: actor.id, label: actor.nickname };

  return prisma.$transaction(async (tx) => {

    const app = await tx.application.findUnique({ where: { id: applicationId } });

    if (!app) throw errors.notFound("Заявка не найдена");

    const updated = await tx.application.update({

      where: { id: applicationId },

      data: notified

        ? { candidateNotified: true, candidateNotifiedById: actor.id, candidateNotifiedAt: new Date() }

        : { candidateNotified: false, candidateNotifiedById: actor.id, candidateNotifiedAt: new Date() },

    });

    await appEvent(tx, {

      applicationId,

      candidateId: app.candidateId,

      type: notified ? "CANDIDATE_NOTIFIED" : "CANDIDATE_NOTIFIED_CLEARED",

      actor: actorRef,

    });

    await audit(tx, { actor: actorRef, action: notified ? "application.notified_set" : "application.notified_cleared", applicationId });

    await publish(tx, "applications");

    return updated;

  });

}

export async function addComment(actor: AuthUser, applicationId: number, text: string) {

  const app = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!app) throw errors.notFound("Заявка не найдена");

  const allowed =

    app.currentAssigneeId === actor.id || can(actor, "calls.view_all") || can(actor, "applications.review");

  if (!allowed) throw errors.forbidden("Комментировать может закреплённый обзвонщик или руководство");

  const actorRef: Actor = { type: "USER", id: actor.id, label: actor.nickname };

  return prisma.$transaction(async (tx) => {

    const c = await tx.applicationComment.create({ data: { applicationId, authorId: actor.id, text: text.slice(0, 4000) } });

    await appEvent(tx, { applicationId, candidateId: app.candidateId, type: "COMMENT", actor: actorRef, comment: text.slice(0, 4000) });

    await audit(tx, { actor: actorRef, action: "application.comment", applicationId });

    await publish(tx, "applications");

    return c;

  });

}
