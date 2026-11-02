import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { getRating } from "@/server/queries/stats";
import { getSetting } from "@/server/settings";

export const GET = route(async (req) => {
  await requireUser();
  const { period } = parseQuery(req, z.object({ period: z.enum(["today", "week", "month", "all"]).default("week") }));
  const tz = await getSetting("timezone");
  return json({ rows: await getRating(period, tz) });
});
