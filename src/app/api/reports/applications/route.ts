import { requireUser } from "@/server/auth/session";
import { json, parseQuery, route } from "@/server/http";
import { getApplicationsReport, reportQuerySchema } from "@/server/queries/applications";

export const GET = route(async (req) => {
  await requireUser("applications.reports.view");
  return json(await getApplicationsReport(parseQuery(req, reportQuerySchema)));
});
