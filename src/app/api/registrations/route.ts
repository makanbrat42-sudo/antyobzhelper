import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { prisma } from "@/server/db";

export const GET = route(async (req) => {
  await requireUser("employees.manage");
  const { status } = parseQuery(req, z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "all"]).default("PENDING") }));
  const rows = await prisma.registrationRequest.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, vkId: true, nickname: true, avatarUrl: true, firstName: true, lastName: true, status: true } },
      reviewedBy: { select: { id: true, nickname: true } },
    },
  });
  return json({ rows });
});
