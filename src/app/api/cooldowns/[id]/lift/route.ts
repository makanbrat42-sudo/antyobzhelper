import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { strId, type IdCtx } from "@/server/route-utils";
import { liftCooldown } from "@/server/services/calls";

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser("candidates.cooldown.manage");
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(1000) }));
  await liftCooldown(user, await strId(ctx), reason);
  return json({ ok: true });
});
