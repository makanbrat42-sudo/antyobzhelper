import { prisma } from "../db";

function startOfDayUtcFor(tz: string, d = new Date()): Date {
  // Начало текущих суток в часовом поясе tz, выраженное в UTC.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const utcGuess = Date.UTC(get("year"), get("month") - 1, get("day"));
  const offsetMs = tzOffsetMs(tz, new Date(utcGuess));
  return new Date(utcGuess - offsetMs);
}

function tzOffsetMs(tz: string, d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(s.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - d.getTime();
}

export function periodStart(period: "today" | "week" | "month" | "all", tz: string): Date | null {
  if (period === "all") return null;
  const today = startOfDayUtcFor(tz);
  if (period === "today") return today;
  const days = period === "week" ? 6 : 29;
  return new Date(today.getTime() - days * 86_400_000);
}

export async function getDashboard(userId: string, tz: string) {
  const today = periodStart("today", tz)!;
  const week = periodStart("week", tz)!;
  const [byStatus, myActive, myToday, myWeek, myPassed, myFailed, recent, daily] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.count({ where: { currentAssigneeId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.callResult.count({ where: { recordedById: userId, outcome: { not: "POSTPONED" }, createdAt: { gte: today } } }),
    prisma.callResult.count({ where: { recordedById: userId, outcome: { not: "POSTPONED" }, createdAt: { gte: week } } }),
    prisma.callResult.count({ where: { recordedById: userId, outcome: "PASSED" } }),
    prisma.callResult.count({ where: { recordedById: userId, outcome: "FAILED" } }),
    prisma.applicationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      where: { type: { notIn: ["COMMENT"] } },
      include: { actor: { select: { id: true, nickname: true } }, application: { select: { id: true, nickname: true } } },
    }),
    dailySeries(tz, 14),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((acc, b) => acc + b._count._all, 0);
  return {
    totals: {
      total,
      pendingReview: count("PENDING_REVIEW") + count("IDENTITY_CHECK"),
      identityCheck: count("IDENTITY_CHECK"),
      waitingCaller: count("APPROVED_WAITING_CALLER"),
      inWork: count("ASSIGNED") + count("IN_PROGRESS"),
      completed: count("COMPLETED"),
      rejected: count("REJECTED"),
      autoRejected: count("AUTO_REJECTED_COOLDOWN"),
    },
    caller: { myActive, today: myToday, week: myWeek, passed: myPassed, failed: myFailed },
    recent: recent.map((e) => ({
      id: e.id,
      type: e.type,
      createdAt: e.createdAt,
      actorType: e.actorType,
      actor: e.actor,
      application: e.application,
      comment: e.comment,
    })),
    daily,
  };
}

/** Серия по дням: поступившие заявки, принятые, отклонённые, автоотказы, завершённые проверки. */
async function dailySeries(tz: string, days: number) {
  const start = new Date(periodStart("today", tz)!.getTime() - (days - 1) * 86_400_000);
  const [apps, decisions, calls] = await Promise.all([
    prisma.application.findMany({ where: { submittedAt: { gte: start } }, select: { submittedAt: true } }),
    prisma.applicationDecision.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, decision: true } }),
    prisma.callResult.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, outcome: true } }),
  ]);
  const fmt = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit" });
  const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const buckets = new Map<string, { label: string; submitted: number; approved: number; rejected: number; auto: number; passed: number; failed: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000 + 12 * 3_600_000);
    buckets.set(keyFmt.format(d), { label: fmt.format(d), submitted: 0, approved: 0, rejected: 0, auto: 0, passed: 0, failed: 0 });
  }
  for (const a of apps) {
    const b = buckets.get(keyFmt.format(a.submittedAt));
    if (b) b.submitted++;
  }
  for (const d of decisions) {
    const b = buckets.get(keyFmt.format(d.createdAt));
    if (!b) continue;
    if (d.decision === "APPROVED") b.approved++;
    else if (d.decision === "REJECTED") b.rejected++;
    else b.auto++;
  }
  for (const c of calls) {
    const b = buckets.get(keyFmt.format(c.createdAt));
    if (!b) continue;
    if (c.outcome === "PASSED") b.passed++;
    else if (c.outcome === "FAILED") b.failed++;
  }
  return [...buckets.values()];
}

export async function getRating(period: "today" | "week" | "month" | "all", tz: string) {
  const since = periodStart(period, tz);
  const results = await prisma.callResult.groupBy({
    by: ["recordedById", "outcome"],
    where: since ? { createdAt: { gte: since } } : {},
    _count: { _all: true },
  });
  const durations = await prisma.callSession.groupBy({
    by: ["callerId"],
    where: { status: "FINISHED", durationSec: { gt: 0 }, ...(since ? { endedAt: { gte: since } } : {}) },
    _avg: { durationSec: true },
  });
  const map = new Map<string, { completed: number; passed: number; failed: number; refused: number; postponed: number }>();
  for (const r of results) {
    const m = map.get(r.recordedById) ?? { completed: 0, passed: 0, failed: 0, refused: 0, postponed: 0 };
    const n = r._count._all;
    if (r.outcome === "PASSED") m.passed += n;
    if (r.outcome === "FAILED") m.failed += n;
    if (r.outcome === "REFUSED") m.refused += n;
    if (r.outcome === "POSTPONED") m.postponed += n;
    if (r.outcome !== "POSTPONED") m.completed += n;
    map.set(r.recordedById, m);
  }
  const users = await prisma.user.findMany({
    where: {
      OR: [{ id: { in: [...map.keys()] } }, { roles: { some: { kind: "CALLER" } }, status: "ACTIVE" }],
    },
    include: { roles: { include: { role: true } } },
  });
  return users
    .map((u) => {
      const m = map.get(u.id) ?? { completed: 0, passed: 0, failed: 0, refused: 0, postponed: 0 };
      const caller = u.roles.find((r) => r.kind === "CALLER")?.role;
      return {
        user: { id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl, vkId: u.vkId },
        callerRole: caller ? { name: caller.name, color: caller.color } : null,
        ...m,
        avgDurationSec: Math.round(durations.find((d) => d.callerId === u.id)?._avg.durationSec ?? 0) || null,
      };
    })
    .sort((a, b) => b.completed - a.completed || b.passed - a.passed || a.user.nickname.localeCompare(b.user.nickname));
}
