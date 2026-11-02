import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export const GET = route(async (req) => {
  await requireUser(["employees.view", "employees.manage"]);
  const q = parseQuery(
    req,
    z.object({
      q: z.string().max(100).default(""),
      status: z.enum(["all", "ACTIVE", "PENDING", "BLOCKED", "REJECTED"]).default("all"),
      callers: z.enum(["0", "1"]).default("0"),
    }),
  );
  const where: Prisma.UserWhereInput = {
    ...(q.status !== "all" ? { status: q.status } : {}),
    ...(q.callers === "1" ? { status: "ACTIVE", roles: { some: { kind: "CALLER" } } } : {}),
    ...(q.q.trim()
      ? { OR: [{ nickname: { contains: q.q.trim(), mode: "insensitive" } }, { vkId: q.q.trim().replace(/^id/i, "") }] }
      : {}),
  };
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ status: "asc" }, { nickname: "asc" }],
    include: { roles: { include: { role: true } }, _count: { select: { callResults: true } } },
  });
  const passed = await prisma.callResult.groupBy({ by: ["recordedById"], where: { outcome: "PASSED" }, _count: { _all: true } });
  return json({
    rows: users.map((u) => {
      const main = u.roles.find((r) => r.kind === "MAIN")?.role;
      const caller = u.roles.find((r) => r.kind === "CALLER")?.role;
      return {
        id: u.id,
        vkId: u.vkId,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        status: u.status,
        mainRole: main ? { id: main.id, name: main.name, color: main.color } : null,
        callerRole: caller ? { id: caller.id, name: caller.name, color: caller.color } : null,
        calls: u._count.callResults,
        passed: passed.find((p) => p.recordedById === u.id)?._count._all ?? 0,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        vkMessagesAllowed: u.vkMessagesAllowed,
      };
    }),
  });
});
