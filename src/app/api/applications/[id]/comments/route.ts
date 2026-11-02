import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { addComment } from "@/server/services/applications";

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser();
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(1).max(4000) }));
  const c = await addComment(user, await intId(ctx), text);
  return json({ ok: true, id: c.id });
});
