import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { createRole, listRoles, roleInputSchema } from "@/server/services/roles";
import { PERMISSIONS } from "@/lib/permissions";

export const GET = route(async () => {
  await requireUser();
  return json({ roles: await listRoles(), permissions: PERMISSIONS });
});

export const POST = route(async (req) => {
  const me = await requireUser("roles.manage");
  const body = await parseBody(req, roleInputSchema.extend({ kind: z.enum(["MAIN", "CALLER"]) }));
  const role = await createRole(me, body);
  return json({ ok: true, id: role.id });
});
