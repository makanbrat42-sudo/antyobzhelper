import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { errors, json, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { getApplicationDetail } from "@/server/queries/applications";
import { prisma } from "@/server/db";

export const GET = route<IdCtx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = await intId(ctx);
  const app = await getApplicationDetail(id);
  if (!app) throw errors.notFound("Заявка не найдена");

  const isAssignee = app.currentAssigneeId === user.id || app.callSessions.some((s) => s.callerId === user.id);
  const isReport = can(user, "applications.reports.view");
  // Автоотказы видны только в отчётах и разрешённой истории.
  const allowed =
    isReport ||
    isAssignee ||
    can(user, "calls.view_all") ||
    (can(user, "applications.view") && app.status !== "AUTO_REJECTED_COOLDOWN");
  if (!allowed) throw errors.forbidden();

  // Предыдущие заявки и обзвоны кандидата (история проверок).
  const previous = app.candidateId
    ? await prisma.application.findMany({
        where: { candidateId: app.candidateId, id: { not: app.id } },
        orderBy: { submittedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          callSessions: { select: { endedAt: true, result: { select: { outcome: true } } }, orderBy: { startedAt: "desc" } },
        },
      })
    : [];

  return json({
    application: {
      ...app,
      deliveries: can(user, "integrations.manage") || can(user, "leadership.manage") || isReport ? app.deliveries : [],
      events: isReport || isAssignee || can(user, "calls.view_all") ? app.events : [],
    },
    previous,
    can: {
      approve: can(user, "applications.approve") && app.status === "PENDING_REVIEW",
      reject: can(user, "applications.reject") && app.status === "PENDING_REVIEW",
      review: can(user, "applications.review"),
      claim: can(user, "applications.assign") && app.status === "APPROVED_WAITING_CALLER" && !app.currentAssigneeId,
      reassign: can(user, "applications.reassign") && (app.status === "ASSIGNED" || app.status === "APPROVED_WAITING_CALLER"),
      start: can(user, "calls.start") && app.status === "ASSIGNED" && app.currentAssigneeId === user.id,
      finish: can(user, "calls.finish") && app.status === "IN_PROGRESS" && app.currentAssigneeId === user.id,
      postpone: can(user, "calls.finish") && (app.status === "ASSIGNED" || app.status === "IN_PROGRESS") && app.currentAssigneeId === user.id,
      comment: app.currentAssigneeId === user.id || can(user, "calls.view_all") || can(user, "applications.review"),
      confirmIdentity: can(user, "applications.review") && app.status === "IDENTITY_CHECK",
      cancel:
        can(user, "applications.review") &&
        ["IDENTITY_CHECK", "PENDING_REVIEW", "APPROVED_WAITING_CALLER", "ASSIGNED"].includes(app.status),
    },
  });
});
