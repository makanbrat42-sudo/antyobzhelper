import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { safeEqual, unsignValue } from "@/server/crypto";
import { exchangeCodeForProfile, OAUTH_COOKIE, parseCallbackParams, type OAuthPurpose } from "@/server/auth/vkid";
import { createSession } from "@/server/auth/session";
import { completeStaffLogin } from "@/server/services/staff";
import { issueCandidateLinkCode, LINK_COOKIE } from "@/server/services/candidate-link";
import { clientIp } from "@/server/http";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

function fail(purpose: OAuthPurpose, code: string) {
  const back = purpose === "candidate" ? "/link" : "/login";
  return NextResponse.redirect(new URL(`${back}?error=${code}`, env.appUrl));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = unsignValue(env.sessionSecret, jar.get(OAUTH_COOKIE)?.value);
  jar.delete({ name: OAUTH_COOKIE, path: "/api/auth/vk" });
  if (!raw) return fail("staff", "state");
  let st: { s: string; v: string; p: OAuthPurpose; e: number };
  try {
    st = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return fail("staff", "state");
  }
  const purpose = st.p;
  if (Date.now() > st.e) return fail(purpose, "expired");

  const params = parseCallbackParams(url);
  if (params.error) return fail(purpose, "denied");
  if (!params.code || !params.state || !params.deviceId) return fail(purpose, "params");
  if (!safeEqual(params.state, st.s)) return fail(purpose, "state");

  let profile;
  try {
    profile = await exchangeCodeForProfile({ code: params.code, codeVerifier: st.v, deviceId: params.deviceId, state: params.state });
  } catch (e) {
    console.error("[vkid] ошибка обмена кода", e);
    return fail(purpose, "exchange");
  }

  if (purpose === "candidate") {
    const code = await issueCandidateLinkCode(profile);
    jar.set(LINK_COOKIE, code.signed, { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/", maxAge: 3600 });
    return NextResponse.redirect(new URL("/link?done=1", env.appUrl));
  }

  const user = await completeStaffLogin(profile);
  if (user.status === "BLOCKED") {
    await audit(prisma, { actor: { type: "USER", id: user.id, label: user.nickname }, action: "auth.login", result: "DENIED", ip: clientIp(req) });
    return fail("staff", "blocked");
  }
  await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req) });
  await audit(prisma, { actor: { type: "USER", id: user.id, label: user.nickname }, action: "auth.login", ip: clientIp(req) });
  return NextResponse.redirect(new URL(user.status === "ACTIVE" ? "/dashboard" : "/pending", env.appUrl));
}
