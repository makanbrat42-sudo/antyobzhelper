import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

export const reportQuerySchema = z.object({
  decision: z.enum(["all", "approved", "rejected", "auto", "pending", "cancelled"]).default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
  vkId: z.string().optional(),
  staffId: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["id", "submittedAt", "nickname", "decidedAt"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(Date.parse(from))) f.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    const d = new Date(to);
    // Дата без времени — включаем весь день.
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCDate(d.getUTCDate() + 1);
    f.lt = d;
  }
  return Object.keys(f).length ? f : undefined;
}

function baseWhere(q: ReportQuery): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  const range = dateRange(q.from, q.to);
  if (range) and.push({ submittedAt: range });
  if (q.vkId?.trim()) and.push({ vkId: q.vkId.trim().replace(/^id/i, "") });
  if (q.staffId) and.push({ decidedById: q.staffId });
  if (q.q?.trim()) {
    const s = q.q.trim();
    const or: Prisma.ApplicationWhereInput[] = [
      { nickname: { contains: s, mode: "insensitive" } },
      { fullName: { contains: s, mode: "insensitive" } },
      { vkProfileRaw: { contains: s, mode: "insensitive" } },
    ];
    const num = s.replace(/^#/, "");
    if (/^\d+$/.test(num)) {
      or.push({ vkId: num });
      if (Number(num) < 2_147_483_647) or.push({ id: Number(num) });
    }
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

const DECISION_WHERE: Record<ReportQuery["decision"], Prisma.ApplicationWhereInput> = {
  all: {},
  approved: { decision: { is: { decision: "APPROVED" } } },
  rejected: { decision: { is: { decision: "REJECTED" } } },
  auto: { status: "AUTO_REJECTED_COOLDOWN" },
  pending: { status: { in: ["PENDING_REVIEW", "IDENTITY_CHECK"] } },
  cancelled: { status: "CANCELLED" },
};

export async function getApplicationsReport(q: ReportQuery) {
  const base = baseWhere(q);
  const where: Prisma.ApplicationWhereInput = { AND: [base, DECISION_WHERE[q.decision]] };
  const orderBy: Prisma.ApplicationOrderByWithRelationInput[] =
    q.sort === "decidedAt"
      ? [{ decidedAt: { sort: q.dir, nulls: "last" } }, { id: "desc" }]
      : [{ [q.sort]: q.dir }, { id: "desc" }];

  const [rows, total, stats] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        decision: { include: { user: { select: { id: true, nickname: true, avatarUrl: true } } } },
        currentAssignee: { select: { id: true, nickname: true } },
      },
    }),
    prisma.application.count({ where }),
    reportStats(base),
  ]);

  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    stats,
    rows: rows.map((a) => ({
      id: a.id,
      nickname: a.nickname,
      fullName: a.fullName,
      vkId: a.vkId,
      vkProfileRaw: a.vkProfileRaw,
      submittedAt: a.submittedAt,
      status: a.status,
      decision: a.decision?.decision ?? null,
      decisionSource: a.decision?.source ?? null,
      decisionChannel: a.decision?.channel ?? null,
      decidedAt: a.decision?.createdAt ?? null,
      decidedBy: a.decision?.user
        ? { id: a.decision.user.id, nickname: a.decision.user.nickname }
        : a.decision?.userNickname
          ? { id: null, nickname: a.decision.userNickname }
          : null,
      reason: a.decision?.reason ?? a.rejectReason,
      cooldownUntil: a.cooldownUntil,
      assignee: a.currentAssignee,
      candidateNotified: a.candidateNotified,
    })),
  };
}

export async function reportStats(base: Prisma.ApplicationWhereInput = {}) {
  const [total, approved, rejected, auto, pending] = await Promise.all([
    prisma.application.count({ where: base }),
    prisma.application.count({ where: { AND: [base, DECISION_WHERE.approved] } }),
    prisma.application.count({ where: { AND: [base, DECISION_WHERE.rejected] } }),
    prisma.application.count({ where: { AND: [base, DECISION_WHERE.auto] } }),
    prisma.application.count({ where: { AND: [base, DECISION_WHERE.pending] } }),
  ]);
  return { total, approved, rejected, auto, pending };
}

const listInclude = {
  decision: { include: { user: { select: { id: true, nickname: true } } } },
  currentAssignee: { select: { id: true, nickname: true, avatarUrl: true } },
} satisfies Prisma.ApplicationInclude;

export async function getQueue() {
  return prisma.application.findMany({
    where: { status: "APPROVED_WAITING_CALLER", currentAssigneeId: null },
    orderBy: [{ decidedAt: "asc" }, { id: "asc" }],
    include: listInclude,
  });
}

export async function getReviewList() {
  return prisma.application.findMany({
    where: { status: { in: ["PENDING_REVIEW", "IDENTITY_CHECK"] } },
    orderBy: [{ submittedAt: "asc" }],
    include: listInclude,
  });
}

export async function getMyApplications(userId: string, includeFinished: boolean) {
  return prisma.application.findMany({
    where: includeFinished
      ? { OR: [{ currentAssigneeId: userId }, { callSessions: { some: { callerId: userId } } }] }
      : { currentAssigneeId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    orderBy: [{ assignedAt: "desc" }],
    take: 200,
    include: {
      ...listInclude,
      answers: { orderBy: { position: "asc" } },
      callSessions: { include: { result: true }, orderBy: { startedAt: "desc" } },
      comments: { include: { author: { select: { id: true, nickname: true } } }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

export async function getApplicationDetail(id: number) {
  return prisma.application.findUnique({
    where: { id },
    include: {
      answers: { orderBy: { position: "asc" } },
      decision: { include: { user: { select: { id: true, nickname: true, avatarUrl: true } } } },
      currentAssignee: { select: { id: true, nickname: true, avatarUrl: true, vkId: true } },
      candidateNotifiedBy: { select: { id: true, nickname: true } },
      candidate: { select: { id: true, vkId: true, vkVerifiedAt: true, discordId: true } },
      assignments: {
        include: { user: { select: { id: true, nickname: true } }, assignedBy: { select: { id: true, nickname: true } } },
        orderBy: { assignedAt: "desc" },
      },
      callSessions: {
        include: { result: true, caller: { select: { id: true, nickname: true } } },
        orderBy: { startedAt: "desc" },
      },
      comments: { include: { author: { select: { id: true, nickname: true, avatarUrl: true } } }, orderBy: { createdAt: "desc" } },
      events: { include: { actor: { select: { id: true, nickname: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      deliveries: {
        where: { kind: "APPLICATION_REVIEW" },
        include: { recipient: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}
