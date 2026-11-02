import { requireUser } from "@/server/auth/session";
import { errors, json, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { sendApplicationToLeadership } from "@/server/services/vk-bot";

// Повторная рассылка заявки руководству (например, после ошибок доставки).
export const POST = route<IdCtx>(async (_req, ctx) => {
  const user = await requireUser(["integrations.manage", "leadership.manage"]);
  const id = await intId(ctx);
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) throw errors.notFound("Заявка не найдена");
  if (app.status !== "PENDING_REVIEW") throw errors.conflict("Рассылать можно только заявки, ожидающие рассмотрения");
  const r = await sendApplicationToLeadership(id);
  await audit(prisma, { actor: { type: "USER", id: user.id, label: user.nickname }, action: "vkbot.resend", applicationId: id, details: r });
  return json({ ok: true, ...r });
});
