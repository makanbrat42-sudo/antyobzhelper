import { z } from "zod";
import { json, parseBody, route } from "@/server/http";
import { requireService } from "@/server/auth/service";
import { linkDiscordByCode } from "@/server/services/discord";

// POST { code, discordId } — привязка Discord кандидата к подтверждённому VK ID.
export const POST = route(async (req) => {
  const svc = await requireService(req, "discord.link");
  const body = await parseBody(req, z.object({ code: z.string().min(4).max(20), discordId: z.string().regex(/^\d{5,25}$/) }));
  return json(await linkDiscordByCode(svc, body.code, body.discordId));
});
