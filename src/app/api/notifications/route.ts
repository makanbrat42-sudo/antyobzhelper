import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { prisma } from "@/server/db";

export const GET = route(async () => {
  const me = await requireUser();
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  return json({ rows, unread });
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const { ids } = await parseBody(req, z.object({ ids: z.array(z.string().max(64)).max(100).optional() }));
  await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return json({ ok: true });
});
