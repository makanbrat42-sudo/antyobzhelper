import { z } from "zod";
import { json, parseQuery, route } from "@/server/http";
import { requireService } from "@/server/auth/service";
import { candidateByDiscord, staffByDiscord } from "@/server/services/discord";

// GET ?discordId=...&kind=candidate|staff — заявка кандидата или закреплённые заявки сотрудника.
export const GET = route(async (req) => {
  await requireService(req, "discord.read");
  const q = parseQuery(req, z.object({ discordId: z.string().regex(/^\d{5,25}$/), kind: z.enum(["candidate", "staff"]) }));
  const data = q.kind === "candidate" ? await candidateByDiscord(q.discordId) : await staffByDiscord(q.discordId);
  return json({ found: !!data, data });
});
