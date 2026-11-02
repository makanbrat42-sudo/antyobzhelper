import { getCurrentUser } from "@/server/auth/session";
import { errors, json, route } from "@/server/http";
import { reapplyRegistration } from "@/server/services/staff";

export const POST = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  await reapplyRegistration(user.id);
  return json({ ok: true });
});
