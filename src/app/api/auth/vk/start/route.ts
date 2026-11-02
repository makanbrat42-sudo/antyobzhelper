import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { pkcePair, randomToken, signValue } from "@/server/crypto";
import { buildAuthorizeUrl, OAUTH_COOKIE, type OAuthPurpose } from "@/server/auth/vkid";

// Начало входа через VK ID: генерируем state и PKCE, сохраняем в подписанной httpOnly cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const purpose: OAuthPurpose = url.searchParams.get("purpose") === "candidate" ? "candidate" : "staff";
  if (!env.vkIdClientId) {
    const back = purpose === "candidate" ? "/link" : "/login";
    return NextResponse.redirect(new URL(`${back}?error=vk_not_configured`, env.appUrl));
  }
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const payload = Buffer.from(JSON.stringify({ s: state, v: verifier, p: purpose, e: Date.now() + 10 * 60_000 })).toString("base64url");
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, signValue(env.sessionSecret, payload), {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/api/auth/vk",
    maxAge: 600,
  });
  return NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge: challenge }));
}
