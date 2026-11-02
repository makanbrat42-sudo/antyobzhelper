import { z } from "zod";
import { json, parseBody, route } from "@/server/http";
import { requireService } from "@/server/auth/service";
import { recordVoiceEvent } from "@/server/services/discord";

// POST { applicationId, type, channelId } — события временного голосового канала обзвона.
export const POST = route(async (req) => {
  const svc = await requireService(req, "discord.voice");
  const body = await parseBody(
    req,
    z.object({
      applicationId: z.number().int().positive(),
      type: z.enum(["CHANNEL_CREATED", "CALLER_JOINED", "CANDIDATE_JOINED", "CHANNEL_DELETED"]),
      channelId: z.string().regex(/^\d{5,25}$/),
    }),
  );
  return json(await recordVoiceEvent(svc, body));
});
