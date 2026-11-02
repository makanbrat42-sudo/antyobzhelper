import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { json, route } from "@/server/http";
import { hasActiveAdmin } from "@/server/services/staff";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";

export const GET = route(async () => {
  const user = await getCurrentUser();
  const [adminExists, settings] = await Promise.all([hasActiveAdmin(), getSettings()]);
  let registration = null;
  if (user && user.status !== "ACTIVE") {
    registration = await prisma.registrationRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, comment: true, reviewedAt: true },
    });
  }
  return json({
    user,
    registration,
    setupAvailable: !adminExists && !!env.setupToken,
    vkConfigured: !!env.vkIdClientId,
    devLogin: env.devLoginEnabled,
    site: {
      name: settings["site.name"],
      logoUrl: settings["site.logoUrl"],
      accentColor: settings["site.accentColor"],
      accentColor2: settings["site.accentColor2"],
      discordInviteUrl: user?.status === "ACTIVE" ? settings["discord.inviteUrl"] : "",
      timezone: settings.timezone,
      cooldownHours: settings["cooldown.hours"],
    },
  });
});
