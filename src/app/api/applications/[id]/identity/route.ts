import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { confirmIdentity } from "@/server/services/applications";

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser("applications.review");
  const body = await parseBody(req, z.object({ vkId: z.string().min(1).max(20), comment: z.string().max(1000).optional() }));
  const r = await confirmIdentity(user, await intId(ctx), body.vkId, body.comment);
  return json({ ok: true, ...r });
});
