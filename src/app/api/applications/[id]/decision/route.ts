import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ApiError, json, parseBody, route } from "@/server/http";
import { intId, type IdCtx } from "@/server/route-utils";
import { decideApplication } from "@/server/services/applications";

const schema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().max(1000).optional().nullable() });

// Решение руководства через сайт (дублирует кнопки VK-бота).
export const POST = route<IdCtx>(async (req, ctx) => {
  const user = await requireUser();
  const id = await intId(ctx);
  const body = await parseBody(req, schema);
  const r = await decideApplication(user.id, { applicationId: id, decision: body.decision, channel: "WEB", reason: body.reason });
  if (!r.ok) {
    const status = r.code === "FORBIDDEN" || r.code === "INACTIVE" ? 403 : r.code === "NOT_FOUND" ? 404 : 409;
    throw new ApiError(status, r.code, r.message);
  }
  return json(r);
});
