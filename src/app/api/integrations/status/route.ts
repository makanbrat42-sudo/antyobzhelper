import { requireUser } from "@/server/auth/session";
import { json, route } from "@/server/http";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { vkBotConfigured, vkCall, describeVkError } from "@/server/services/vk-api";
import { getSettings } from "@/server/settings";

export const GET = route(async (req) => {
  await requireUser("integrations.manage");
  const live = new URL(req.url).searchParams.get("live") === "1";
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [settings, gfLast, gfCounts, vkLast, vkCounts, deliveryCounts] = await Promise.all([
    getSettings(),
    prisma.integrationEvent.findFirst({ where: { source: "GOOGLE_FORMS" }, orderBy: { createdAt: "desc" } }),
    prisma.integrationEvent.groupBy({ by: ["status"], where: { source: "GOOGLE_FORMS", createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.integrationEvent.findFirst({ where: { source: "VK_CALLBACK" }, orderBy: { createdAt: "desc" } }),
    prisma.integrationEvent.groupBy({ by: ["status"], where: { source: "VK_CALLBACK", createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.integrationDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  let group: { ok: boolean; name?: string; error?: string } | null = null;
  if (live && vkBotConfigured()) {
    try {
      const r = await vkCall<{ groups?: { name: string }[] } | { name: string }[]>("groups.getById", { group_id: env.vkGroupId });
      const list = Array.isArray(r) ? r : (r.groups ?? []);
      group = { ok: true, name: list[0]?.name };
    } catch (e) {
      group = { ok: false, error: describeVkError(e).message };
    }
  }
  const toMap = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return json({
    appUrl: env.appUrl,
    googleForms: {
      configured: !!env.googleFormsSecret,
      enabled: settings["googleForms.enabled"],
      endpoint: `${env.appUrl}/api/integrations/google-forms`,
      lastEventAt: gfLast?.createdAt ?? null,
      last7d: toMap(gfCounts),
      fieldMap: settings["googleForms.fieldMap"],
    },
    vkBot: {
      configured: vkBotConfigured(),
      enabled: settings["vkBot.enabled"],
      callbackConfigured: !!(env.vkCallbackSecret && env.vkCallbackConfirmation),
      groupId: env.vkGroupId ?? null,
      endpoint: `${env.appUrl}/api/integrations/vk/callback`,
      lastEventAt: vkLast?.createdAt ?? null,
      last7d: toMap(vkCounts),
      deliveries7d: toMap(deliveryCounts),
      group,
    },
    vkId: { configured: !!env.vkIdClientId, redirectUri: `${env.appUrl}/api/auth/vk/callback` },
  });
});
