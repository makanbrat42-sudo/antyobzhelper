import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { cancelApplication } from "@/server/services/applications";

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser("applications.review");
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(1000) }));
  await cancelApplication(user, await intId(ctx), reason);
  return json({ ok: true });
});
