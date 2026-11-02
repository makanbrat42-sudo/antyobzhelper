import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { searchCandidates } from "@/server/queries/candidates";

export const GET = route(async (req) => {
  await requireUser("applications.reports.view");
  const q = parseQuery(req, z.object({ q: z.string().max(200).default(""), page: z.coerce.number().int().min(1).default(1) }));
  return json(await searchCandidates(q.q, q.page));
});
