import { z } from "zod";
import { env } from "@/server/env";
import { createSession } from "@/server/auth/session";
import { clientIp, errors, json, parseBody, route } from "@/server/http";
import { completeStaffLogin } from "@/server/services/staff";

// ТОЛЬКО для локальной разработки без VK ID: NODE_ENV !== production и DEV_LOGIN_ENABLED=true.
export const POST = route(async (req) => {
  if (!env.devLoginEnabled) throw errors.notFound();
  const body = await parseBody(
    req,
    z.object({ vkId: z.string().regex(/^\d{1,12}$/), firstName: z.string().min(1).max(60), lastName: z.string().max(60).default("") }),
  );
  const user = await completeStaffLogin({ vkId: body.vkId, firstName: body.firstName, lastName: body.lastName, avatarUrl: null });
  if (user.status === "BLOCKED") throw errors.forbidden("Учётная запись заблокирована");
  await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req) });
  return json({ ok: true, status: user.status });
});
