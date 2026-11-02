import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { clientIp, errors, json, parseBody, route } from "@/server/http";
import { claimInitialAdmin } from "@/server/services/staff";

// Защищённая первоначальная настройка администратора (SETUP_TOKEN из переменных окружения).
export const POST = route(async (req) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  if (user.status === "BLOCKED") throw errors.forbidden();
  const { token } = await parseBody(req, z.object({ token: z.string().min(1).max(500) }));
  await claimInitialAdmin(user.id, token, clientIp(req));
  return json({ ok: true });
});
