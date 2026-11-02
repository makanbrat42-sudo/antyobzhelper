import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { setCandidateNotified } from "@/server/services/applications";

// Отметка «Кандидат уведомлён» — только запись в базе, сообщения не отправляются.
export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser("applications.review");
  const { notified } = await parseBody(req, z.object({ notified: z.boolean() }));
  await setCandidateNotified(user, await intId(ctx), notified);
  return json({ ok: true });
});
