import { requireUser } from "@/server/auth/session";
import { errors, json, route } from "@/server/http";
import { strId, type IdCtx } from "@/server/route-utils";
import { getCandidateHistory } from "@/server/queries/candidates";

// id — числовой VK ID или внутренний ID кандидата.
export const GET = route<IdCtx>(async (_req, ctx) => {
  await requireUser("applications.reports.view");
  const h = await getCandidateHistory((await strId(ctx)).replace(/^id/i, ""));
  if (!h) throw errors.notFound("Кандидат не найден");
  return json(h);
});
