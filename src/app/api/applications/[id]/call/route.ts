import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { finishCall, postponeCall, startCall } from "@/server/services/calls";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("finish"),
    outcome: z.enum(["PASSED", "FAILED", "REFUSED", "POSTPONED"]),
    reason: z.string().max(1000).optional().nullable(),
    comment: z.string().max(4000).optional().nullable(),
  }),
  z.object({
    action: z.literal("postpone"),
    reason: z.string().max(1000).optional().nullable(),
    comment: z.string().max(4000).optional().nullable(),
  }),
]);

export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser();
  const id = await intId(ctx);
  const body = await parseBody(req, schema);
  if (body.action === "start") {
    const s = await startCall(user, id);
    return json({ ok: true, sessionId: s.id, startedAt: s.startedAt });
  }
  if (body.action === "finish") {
    const r = await finishCall(user, id, { outcome: body.outcome, reason: body.reason, comment: body.comment });
    return json({ ok: true, ...r });
  }
  const r = await postponeCall(user, id, { reason: body.reason, comment: body.comment });
  return json({ ok: true, ...r });
});
