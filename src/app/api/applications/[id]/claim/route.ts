import { requireUser } from "@/server/auth/session";
import { json, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { claimApplication } from "@/server/services/calls";

export const POST = route<IdCtx>(async (_req, ctx) => {
  const user = await requireUser("applications.assign");
  await claimApplication(user, await intId(ctx));
  return json({ ok: true });
});
