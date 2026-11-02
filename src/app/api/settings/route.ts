import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { getSettings, settingsUpdateSchema, updateSettings } from "@/server/settings";
import { audit, publish } from "@/server/audit";
import { prisma } from "@/server/db";
import { actorOf } from "@/server/services/staff";

export const GET = route(async () => {
  await requireUser(["system.manage", "integrations.manage"]);
  return json({ settings: await getSettings() });
});

export const PATCH = route(async (req) => {
  const me = await requireUser("system.manage");
  const patch = await parseBody(req, settingsUpdateSchema);
  const settings = await updateSettings(patch, me.id);
  await audit(prisma, { actor: actorOf(me), action: "settings.updated", details: patch as object });
  await publish(prisma, "settings");
  return json({ settings });
});
