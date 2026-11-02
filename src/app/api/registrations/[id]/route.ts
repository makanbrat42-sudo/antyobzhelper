import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { strId, type IdCtx } from "@/server/route-utils";
import { reviewRegistration } from "@/server/services/staff";

const schema = z.object({
  approve: z.boolean(),
  comment: z.string().max(500).optional(),
  mainRoleId: z.string().max(64).nullable().optional(),
  callerRoleId: z.string().max(64).nullable().optional(),
});

export const POST = route<IdCtx>(async (req, ctx) => {
  const me = await requireUser("employees.manage");
  const body = await parseBody(req, schema);
  await reviewRegistration(me, await strId(ctx), body);
  return json({ ok: true });
});
