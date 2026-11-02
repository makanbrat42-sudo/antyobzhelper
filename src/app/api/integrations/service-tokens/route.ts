import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { errors, json, parseBody, route } from "@/server/http";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/services/staff";
import { issueServiceToken, SERVICE_SCOPES, type ServiceScope } from "@/server/auth/service";

export const GET = route(async () => {
  await requireUser("integrations.manage");
  const rows = await prisma.serviceToken.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, tokenPrefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true, createdBy: { select: { nickname: true } } },
  });
  return json({ rows, scopes: SERVICE_SCOPES });
});

const scopeEnum = z.enum(Object.keys(SERVICE_SCOPES) as [ServiceScope, ...ServiceScope[]]);

export const POST = route(async (req) => {
  const me = await requireUser("integrations.manage");
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60), scopes: z.array(scopeEnum).min(1) }));
  const r = await issueServiceToken(body.name, body.scopes, me.id);
  await audit(prisma, { actor: actorOf(me), action: "service_token.created", entityType: "ServiceToken", entityId: r.id, details: body });
  // Токен показывается один раз; в базе хранится только хеш.
  return json({ ok: true, id: r.id, token: r.token });
});

export const DELETE = route(async (req) => {
  const me = await requireUser("integrations.manage");
  const { id } = await parseBody(req, z.object({ id: z.string().max(64) }));
  const r = await prisma.serviceToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) throw errors.notFound();
  await audit(prisma, { actor: actorOf(me), action: "service_token.revoked", entityType: "ServiceToken", entityId: id });
  return json({ ok: true });
});
