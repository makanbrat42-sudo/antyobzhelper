import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { json, route } from "@/server/http";
import { prisma } from "@/server/db";

// Счётчики для бейджей бокового меню.
export const GET = route(async () => {
  const me = await requireUser();
  const [review, queue, my, registrations, unread] = await Promise.all([
    can(me, "applications.view") || can(me, "applications.approve")
      ? prisma.application.count({ where: { status: { in: ["PENDING_REVIEW", "IDENTITY_CHECK"] } } })
      : 0,
    can(me, "applications.view") || can(me, "applications.assign")
      ? prisma.application.count({ where: { status: "APPROVED_WAITING_CALLER", currentAssigneeId: null } })
      : 0,
    prisma.application.count({ where: { currentAssigneeId: me.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    can(me, "employees.manage") ? prisma.registrationRequest.count({ where: { status: "PENDING" } }) : 0,
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  return json({ review, queue, my, registrations, unread });
});
