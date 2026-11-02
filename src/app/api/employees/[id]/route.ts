import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { can, loadAuthUser } from "@/server/auth/rbac";
import { errors, json, parseBody, route } from "@/server/http";
import { strId, type IdCtx } from "@/server/route-utils";
import { prisma } from "@/server/db";
import { updateEmployee } from "@/server/services/staff";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export const GET = route<IdCtx>(async (_req, ctx) => {
  const me = await requireUser();
  const id = await strId(ctx);
  if (id !== me.id && !can(me, "employees.view") && !can(me, "employees.manage")) throw errors.forbidden();
  const u = await prisma.user.findUnique({
    where: { id },
    include: { permissionOverrides: { include: { permission: true } }, leadership: true },
  });
  if (!u) throw errors.notFound("Сотрудник не найден");
  const auth = await loadAuthUser(id);
  const [byOutcome, decisions, recentCalls, activeAssigned] = await Promise.all([
    prisma.callResult.groupBy({ by: ["outcome"], where: { recordedById: id }, _count: { _all: true } }),
    prisma.applicationDecision.groupBy({ by: ["decision"], where: { userId: id }, _count: { _all: true } }),
    prisma.callSession.findMany({
      where: { callerId: id, status: "FINISHED" },
      orderBy: { endedAt: "desc" },
      take: 15,
      include: { result: true, application: { select: { id: true, nickname: true, vkId: true } } },
    }),
    prisma.application.count({ where: { currentAssigneeId: id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
  ]);
  const showPrivate = can(me, "employees.manage") || id === me.id;
  return json({
    user: {
      id: u.id,
      vkId: u.vkId,
      nickname: u.nickname,
      firstName: u.firstName,
      lastName: u.lastName,
      avatarUrl: u.avatarUrl,
      discordId: showPrivate ? u.discordId : null,
      status: u.status,
      blockedReason: showPrivate ? u.blockedReason : null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      vkMessagesAllowed: u.vkMessagesAllowed,
      mainRole: auth?.mainRole ?? null,
      callerRole: auth?.callerRole ?? null,
      permissions: showPrivate ? (auth?.permissions ?? []) : [],
      overrides: showPrivate ? u.permissionOverrides.map((o) => ({ key: o.permission.key, granted: o.granted })) : [],
      leadership: u.leadership,
    },
    stats: {
      outcomes: Object.fromEntries(byOutcome.map((b) => [b.outcome, b._count._all])),
      decisions: Object.fromEntries(decisions.map((d) => [d.decision, d._count._all])),
      activeAssigned,
    },
    recentCalls,
    canManage: can(me, "employees.manage"),
    canManageRoles: can(me, "roles.manage"),
  });
});

const patchSchema = z.object({
  nickname: z.string().trim().min(1).max(60).optional(),
  discordId: z.string().regex(/^\d{5,25}$/).or(z.literal("")).nullable().optional(),
  mainRoleId: z.string().max(64).nullable().optional(),
  callerRoleId: z.string().max(64).nullable().optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  blockedReason: z.string().max(500).nullable().optional(),
  permissionOverrides: z
    .array(z.object({ key: z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]]), granted: z.boolean().nullable() }))
    .optional(),
});

export const PATCH = route<IdCtx>(async (req, ctx) => {
  const me = await requireUser("employees.manage");
  const id = await strId(ctx);
  const body = await parseBody(req, patchSchema);
  await updateEmployee(me, id, body);
  return json({ ok: true });
});
