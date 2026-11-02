import { prisma } from "../db";
import { env } from "../env";
import { humanCode, signValue, unsignValue } from "../crypto";
import { appEvent } from "../audit";
import type { VkProfile } from "../auth/vkid";

export const LINK_COOKIE = "aoh_link";
const CODE_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * Кандидат вошёл через VK ID — владение VK подтверждено. Выдаём код, который он укажет в анкете
 * (и позже — Discord-боту), чтобы связать заявку с подтверждённым VK ID.
 */
export async function issueCandidateLinkCode(profile: VkProfile) {
  const nickname = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;
  const cand = await prisma.candidate.upsert({
    where: { vkId: profile.vkId },
    create: { vkId: profile.vkId, nickname, vkVerifiedAt: new Date() },
    update: { vkVerifiedAt: new Date() },
  });
  // Действующий код переиспользуется, чтобы кандидат не путался в нескольких кодах.
  const existing = await prisma.candidateLinkCode.findFirst({
    where: { candidateId: cand.id, usedAt: null, expiresAt: { gt: new Date(Date.now() + 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
  });
  let code = existing?.code;
  if (!code) {
    for (let i = 0; i < 5 && !code; i++) {
      const c = humanCode();
      try {
        await prisma.candidateLinkCode.create({ data: { code: c, candidateId: cand.id, expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
        code = c;
      } catch {
        /* коллизия — пробуем ещё */
      }
    }
  }
  if (!code) throw new Error("Не удалось выдать код");
  await appEvent(prisma, { candidateId: cand.id, type: "IDENTITY_RESOLVED", actor: { type: "SYSTEM" }, comment: "Кандидат подтвердил VK через VK ID" });
  const payload = Buffer.from(JSON.stringify({ c: code, n: nickname, v: profile.vkId })).toString("base64url");
  return { code, signed: signValue(env.sessionSecret, payload) };
}

export function readLinkCookie(value: string | undefined): { code: string; nickname: string | null; vkId: string } | null {
  const raw = unsignValue(env.sessionSecret, value);
  if (!raw) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { c: string; n: string | null; v: string };
    return { code: p.c, nickname: p.n, vkId: p.v };
  } catch {
    return null;
  }
}
