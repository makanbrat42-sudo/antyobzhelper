import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { strId, type IdCtx } from "@/server/route-utils";
import { deleteRole, roleInputSchema, updateRole } from "@/server/services/roles";

export const PATCH = route<IdCtx>(async (req, ctx) => {
  const me = await requireUser("roles.manage");
  const body = await parseBody(req, roleInputSchema.partial());
  await updateRole(me, await strId(ctx), body);
  return json({ ok: true });
});

export const DELETE = route<IdCtx>(async (_req, ctx) => {
  const me = await requireUser("roles.manage");
  await deleteRole(me, await strId(ctx));
  return json({ ok: true });
});
