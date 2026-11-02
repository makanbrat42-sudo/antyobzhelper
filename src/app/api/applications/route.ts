import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { errors, json, parseQuery, route } from "@/server/http";
import { getMyApplications, getQueue, getReviewList } from "@/server/queries/applications";

const schema = z.object({
  view: z.enum(["queue", "review", "my", "my_all"]),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const { view } = parseQuery(req, schema);
  if (view === "queue") {
    if (!can(user, "applications.view") && !can(user, "applications.assign")) throw errors.forbidden();
    return json({ rows: await getQueue() });
  }
  if (view === "review") {
    if (!can(user, "applications.view") && !can(user, "applications.approve") && !can(user, "applications.reject")) {
      throw errors.forbidden();
    }
    return json({ rows: await getReviewList() });
  }
  return json({ rows: await getMyApplications(user.id, view === "my_all") });
});
