import { prisma } from "../db";
import { appEvent, audit, publish } from "../audit";
import { errors, isUniqueViolation } from "../http";
import { ACTIVE_APPLICATION_STATUSES } from "@/lib/labels";

// Сервисный слой для будущего Discord-бота. Бот действует по сервисному токену, а не от имени администратора.

const svcActor = (name: string) => ({ type: "SERVICE" as const, label: `discord:${name}` });

/**
 * Привязка Discord ID к кандидату по коду, полученному кандидатом после входа через VK ID (/link).
 * Так Discord ID связывается только с ПОДТВЕРЖДЁННЫМ VK ID.
 */
export async function linkDiscordByCode(service: { name: string }, code: string, discordId: string) {
  const normalized = code.trim().toUpperCase();
  const lc = await prisma.candidateLinkCode.findUnique({ where: { code: normalized }, include: { candidate: true } });
  if (!lc || lc.expiresAt.getTime() < Date.now() || !lc.candidate.vkVerifiedAt) throw errors.badRequest("Код недействителен или истёк");
  try {
    await prisma.$transaction(async (tx) => {
      const other = await tx.candidate.findUnique({ where: { discordId } });
      if (other && other.id !== lc.candidateId) throw errors.conflict("Этот Discord уже привязан к другому VK");
      await tx.candidate.update({ where: { id: lc.candidateId }, data: { discordId } });
      await appEvent(tx, { candidateId: lc.candidateId, type: "DISCORD_LINKED", actor: svcActor(service.name), comment: `Discord ${discordId}` });
      await audit(tx, { actor: svcActor(service.name), action: "discord.linked", entityType: "Candidate", entityId: lc.candidateId, details: { discordId } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("Этот Discord уже привязан к другому VK");
    throw e;
  }
  return candidateByDiscord(discordId);
}

export async function candidateByDiscord(discordId: string) {
  const cand = await prisma.candidate.findUnique({ where: { discordId } });
  if (!cand) return null;
  const active = await prisma.application.findFirst({
    where: { candidateId: cand.id, status: { in: [...ACTIVE_APPLICATION_STATUSES] } },
    include: { currentAssignee: { select: { id: true, nickname: true, discordId: true, vkId: true } } },
  });
  return {
    candidate: { id: cand.id, vkId: cand.vkId, nickname: cand.nickname, discordId: cand.discordId, vkVerified: !!cand.vkVerifiedAt },
    activeApplication: active
      ? { id: active.id, status: active.status, nickname: active.nickname, assignee: active.currentAssignee }
      : null,
  };
}

export async function staffByDiscord(discordId: string) {
  const u = await prisma.user.findUnique({
    where: { discordId },
    include: { roles: { include: { role: true } } },
  });
  if (!u || u.status !== "ACTIVE") return null;
  const assigned = await prisma.application.findMany({
    where: { currentAssigneeId: u.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    select: { id: true, status: true, nickname: true, candidate: { select: { discordId: true, vkId: true } } },
  });
  return {
    user: { id: u.id, nickname: u.nickname, vkId: u.vkId, roles: u.roles.map((r) => ({ kind: r.kind, name: r.role.name })) },
    assigned,
  };
}

export type VoiceEvent = {
  applicationId: number;
  type: "CHANNEL_CREATED" | "CALLER_JOINED" | "CANDIDATE_JOINED" | "CHANNEL_DELETED";
  channelId: string;
};

/** Синхронизация голосового канала: фиксируется в хронологии заявки; ID канала — в активном обзвоне. */
export async function recordVoiceEvent(service: { name: string }, ev: VoiceEvent) {
  const app = await prisma.application.findUnique({ where: { id: ev.applicationId } });
  if (!app) throw errors.notFound("Заявка не найдена");
  await prisma.$transaction(async (tx) => {
    if (ev.type === "CHANNEL_CREATED" || ev.type === "CALLER_JOINED") {
      await tx.callSession.updateMany({ where: { activeKey: ev.applicationId }, data: { discordChannelId: ev.channelId } });
    }
    await appEvent(tx, {
      applicationId: app.id,
      candidateId: app.candidateId,
      type: "DISCORD_VOICE",
      actor: svcActor(service.name),
      comment: ev.type,
      meta: { channelId: ev.channelId, type: ev.type },
    });
    await publish(tx, "applications", { id: app.id });
  });
  return { ok: true, status: app.status };
}
