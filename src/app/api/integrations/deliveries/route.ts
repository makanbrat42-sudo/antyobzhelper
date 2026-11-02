import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { errors, json, parseBody, parseQuery, route } from "@/server/http";
import { prisma } from "@/server/db";
import { attemptDelivery } from "@/server/services/vk-bot";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/services/staff";

export const GET = route(async (req) => {
  await requireUser(["integrations.manage", "leadership.manage"]);
  const q = parseQuery(
    req,
    z.object({ status: z.enum(["PENDING", "SENT", "FAILED"]).optional(), page: z.coerce.number().int().min(1).default(1) }),
  );
  const where = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.integrationDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * 30,
      take: 30,
      include: { recipient: { select: { id: true, nickname: true, vkId: true } } },
    }),
    prisma.integrationDelivery.count({ where }),
  ]);
  return json({ rows, total, page: q.page, pageSize: 30 });
});

// Повторная попытка доставки.
export const POST = route(async (req) => {
  const me = await requireUser(["integrations.manage", "leadership.manage"]);
  const { id } = await parseBody(req, z.object({ id: z.string().max(64) }));
  const d = await prisma.integrationDelivery.findUnique({ where: { id } });
  if (!d) throw errors.notFound();
  const r = await attemptDelivery(id);
  await audit(prisma, { actor: actorOf(me), action: "vkbot.retry_delivery", entityType: "IntegrationDelivery", entityId: id, details: { status: r.status } });
  return json({ ok: true, status: r.status, error: r.lastError });
});
