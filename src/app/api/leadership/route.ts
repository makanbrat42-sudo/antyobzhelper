import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { can, loadAuthUser } from "@/server/auth/rbac";
import { errors, json, parseBody, route } from "@/server/http";
import { prisma } from "@/server/db";
import { audit, publish } from "@/server/audit";
import { actorOf } from "@/server/services/staff";
import { checkMessagesAllowed } from "@/server/services/vk-bot";

// «Руководство КП» — кому VK-бот присылает заявки и кто может нажимать кнопки.
export const GET = route(async () => {
  await requireUser("leadership.manage");
  const members = await prisma.leadershipMember.findMany({
    include: { user: { include: { roles: { include: { role: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = await Promise.all(
    members.map(async (m) => {
      const auth = await loadAuthUser(m.userId);
      const main = m.user.roles.find((r) => r.kind === "MAIN")?.role;
      const [failed, lastFailed] = await Promise.all([
        prisma.integrationDelivery.count({ where: { recipientId: m.userId, status: "FAILED" } }),
        prisma.integrationDelivery.findFirst({ where: { recipientId: m.userId, status: "FAILED" }, orderBy: { updatedAt: "desc" } }),
      ]);
      return {
        id: m.id,
        userId: m.userId,
        nickname: m.user.nickname,
        avatarUrl: m.user.avatarUrl,
        vkId: m.user.vkId,
        status: m.user.status,
        mainRole: main ? { name: main.name, color: main.color } : null,
        receiveApplications: m.receiveApplications,
        canApprove: m.canApprove,
        canReject: m.canReject,
        hasApprovePerm: can(auth, "applications.approve"),
        hasRejectPerm: can(auth, "applications.reject"),
        vkMessagesAllowed: m.user.vkMessagesAllowed,
        vkMessagesCheckedAt: m.user.vkMessagesCheckedAt,
        failedDeliveries: failed,
        lastError: lastFailed?.lastError ?? null,
      };
    }),
  );
  const decisions = await prisma.applicationDecision.findMany({
    where: { source: "USER" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { id: true, nickname: true } }, application: { select: { id: true, nickname: true, vkId: true } } },
  });
  return json({ rows, decisions });
});

const upsertSchema = z.object({
  userId: z.string().max(64),
  receiveApplications: z.boolean(),
  canApprove: z.boolean(),
  canReject: z.boolean(),
});

export const POST = route(async (req) => {
  const me = await requireUser("leadership.manage");
  const body = await parseBody(req, upsertSchema);
  const target = await loadAuthUser(body.userId);
  if (!target || target.status !== "ACTIVE") throw errors.badRequest("Сотрудник не активен");
  // Флаги бота не расширяют RBAC: кнопка сработает, только если есть и флаг, и разрешение.
  if (body.canApprove && !can(target, "applications.approve")) {
    throw errors.badRequest("У сотрудника нет разрешения applications.approve — выдайте его через должность или индивидуально");
  }
  if (body.canReject && !can(target, "applications.reject")) {
    throw errors.badRequest("У сотрудника нет разрешения applications.reject — выдайте его через должность или индивидуально");
  }
  await prisma.$transaction(async (tx) => {
    await tx.leadershipMember.upsert({
      where: { userId: body.userId },
      create: body,
      update: { receiveApplications: body.receiveApplications, canApprove: body.canApprove, canReject: body.canReject },
    });
    await audit(tx, { actor: actorOf(me), action: "leadership.updated", entityType: "User", entityId: body.userId, details: body });
    await publish(tx, "leadership");
  });
  void checkMessagesAllowed(body.userId);
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const me = await requireUser("leadership.manage");
  const { userId } = await parseBody(req, z.object({ userId: z.string().max(64) }));
  await prisma.$transaction(async (tx) => {
    await tx.leadershipMember.deleteMany({ where: { userId } });
    await audit(tx, { actor: actorOf(me), action: "leadership.removed", entityType: "User", entityId: userId });
    await publish(tx, "leadership");
  });
  return json({ ok: true });
});
