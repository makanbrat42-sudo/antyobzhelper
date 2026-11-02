import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export const GET = route(async (req) => {
  await requireUser("audit.view");
  const q = parseQuery(
    req,
    z.object({
      action: z.string().max(100).optional(),
      actorId: z.string().max(64).optional(),
      applicationId: z.coerce.number().int().optional(),
      result: z.enum(["SUCCESS", "DENIED", "ERROR"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(30),
    }),
  );
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { contains: q.action } } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.applicationId ? { applicationId: q.applicationId } : {}),
    ...(q.result ? { result: q.result } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { actor: { select: { id: true, nickname: true, avatarUrl: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return json({ rows, total, page: q.page, pageSize: q.pageSize });
});
