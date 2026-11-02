import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { prisma } from "@/server/db";

export const GET = route(async (req) => {
  await requireUser("integrations.manage");
  const q = parseQuery(
    req,
    z.object({
      source: z.enum(["GOOGLE_FORMS", "VK_CALLBACK", "DISCORD"]),
      status: z.enum(["RECEIVED", "PROCESSED", "DUPLICATE", "REJECTED", "ERROR"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
  );
  const where = { source: q.source, ...(q.status ? { status: q.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.integrationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * 30,
      take: 30,
      select: {
        id: true,
        eventType: true,
        externalId: true,
        status: true,
        error: true,
        applicationId: true,
        createdAt: true,
        processedAt: true,
      },
    }),
    prisma.integrationEvent.count({ where }),
  ]);
  return json({ rows, total, page: q.page, pageSize: 30 });
});
