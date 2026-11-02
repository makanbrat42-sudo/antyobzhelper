import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { reassignApplication } from "@/server/services/calls";

const schema = z.object({ userId: z.string().max(64).nullable(), comment: z.string().max(1000).optional() });

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser("applications.reassign");
  const body = await parseBody(req, schema);
  await reassignApplication(user, await intId(ctx), body.userId, body.comment);
  return json({ ok: true });
});
