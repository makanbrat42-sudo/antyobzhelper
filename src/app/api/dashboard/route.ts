import { requireUser } from "@/server/auth/session";
import { json, route } from "@/server/http";
import { getDashboard } from "@/server/queries/stats";
import { getSetting } from "@/server/settings";

export const GET = route(async () => {
  const user = await requireUser();
  const tz = await getSetting("timezone");
  return json(await getDashboard(user.id, tz));
});
