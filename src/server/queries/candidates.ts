import { prisma } from "../db";
import { getSetting } from "../settings";
import { checkCooldown } from "../services/cooldown";

export async function searchCandidates(q: string, page = 1, pageSize = 20) {
  const s = q.trim().replace(/^https?:\/\/(m\.)?vk\.(com|ru)\/id/i, "").replace(/^id/i, "");
  const where = s
    ? /^\d+$/.test(s)
      ? { vkId: s }
      : { OR: [{ nickname: { contains: s, mode: "insensitive" as const } }, { vkScreenName: { contains: s.toLowerCase() } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { applications: true } },
        applications: { orderBy: { submittedAt: "desc" }, take: 1, select: { id: true, status: true, submittedAt: true } },
        cooldowns: { where: { liftedAt: null, endsAt: { gt: new Date() } }, orderBy: { endsAt: "desc" }, take: 1 },
      },
    }),
    prisma.candidate.count({ where }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((c) => ({
      id: c.id,
      vkId: c.vkId,
      nickname: c.nickname,
      fullName: c.fullName,
      verified: !!c.vkVerifiedAt,
      applications: c._count.applications,
      last: c.applications[0] ?? null,
      cooldownUntil: c.cooldowns[0]?.endsAt ?? null,
    })),
  };
}

/** Полная история кандидата по VK ID: заявки, решения, обзвоны, ограничения, хронология. */
export async function getCandidateHistory(idOrVk: string) {
  const cand = await prisma.candidate.findFirst({
    where: /^\d+$/.test(idOrVk) ? { vkId: idOrVk } : { id: idOrVk },
    include: {
      applications: {
        orderBy: { submittedAt: "desc" },
        include: {
          decision: { include: { user: { select: { id: true, nickname: true } } } },
          callSessions: {
            include: { result: true, caller: { select: { id: true, nickname: true } } },
            orderBy: { startedAt: "desc" },
          },
          currentAssignee: { select: { id: true, nickname: true } },
        },
      },
      cooldowns: { orderBy: { failedAt: "desc" }, include: { liftedBy: { select: { id: true, nickname: true } } } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 300,
        include: { actor: { select: { id: true, nickname: true } } },
      },
    },
  });
  if (!cand) return null;
  // События по заявкам кандидата, у которых candidateId не был проставлен (например, до проверки VK ID).
  const appIds = cand.applications.map((a) => a.id);
  const extraEvents = appIds.length
    ? await prisma.applicationEvent.findMany({
        where: { applicationId: { in: appIds }, candidateId: null },
        include: { actor: { select: { id: true, nickname: true } } },
      })
    : [];
  const events = [...cand.events, ...extraEvents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const hours = await getSetting("cooldown.hours");
  const current = await checkCooldown(cand.id, new Date(), hours);
  return {
    candidate: {
      id: cand.id,
      vkId: cand.vkId,
      vkScreenName: cand.vkScreenName,
      nickname: cand.nickname,
      fullName: cand.fullName,
      discordId: cand.discordId,
      vkVerifiedAt: cand.vkVerifiedAt,
      createdAt: cand.createdAt,
    },
    restriction: current.restricted
      ? { active: true, lastFailedAt: current.lastFailedAt, allowedFrom: current.endsAt }
      : { active: false, lastFailedAt: current.lastFailedAt, allowedFrom: null },
    applications: cand.applications,
    cooldowns: cand.cooldowns,
    events,
  };
}
