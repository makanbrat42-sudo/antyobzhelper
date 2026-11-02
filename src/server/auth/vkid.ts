import { z } from "zod";
import { env } from "../env";

// VK ID: OAuth 2.1 Authorization Code + PKCE (S256). Секрет приложения не используется.
// Документация: https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/

export const OAUTH_COOKIE = "aoh_oauth";
export type OAuthPurpose = "staff" | "candidate";

export function vkRedirectUri() {
  return `${env.appUrl}/api/auth/vk/callback`;
}

export function buildAuthorizeUrl(p: { state: string; codeChallenge: string }) {
  const clientId = env.vkIdClientId;
  if (!clientId) throw new Error("VK_ID_CLIENT_ID не задан");
  const u = new URL(`${env.vkIdBaseUrl}/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", vkRedirectUri());
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  // Минимальный набор прав VK ID: имя, фамилия, аватар (без почты и телефона).
  u.searchParams.set("scope", "vkid.personal_info");
  u.searchParams.set("lang_id", "0");
  u.searchParams.set("scheme", "dark");
  return u.toString();
}

/** Параметры, с которыми VK ID возвращает пользователя: плоские query или JSON в `payload`. */
export function parseCallbackParams(url: URL): { code?: string; state?: string; deviceId?: string; error?: string } {
  const payload = url.searchParams.get("payload");
  if (payload) {
    try {
      const p = JSON.parse(payload) as Record<string, unknown>;
      return {
        code: typeof p.code === "string" ? p.code : undefined,
        state: typeof p.state === "string" ? p.state : undefined,
        deviceId: typeof p.device_id === "string" ? p.device_id : undefined,
      };
    } catch {
      return { error: "invalid_payload" };
    }
  }
  return {
    code: url.searchParams.get("code") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    deviceId: url.searchParams.get("device_id") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
  };
}

const tokenSchema = z.object({
  access_token: z.string(),
  user_id: z.union([z.number(), z.string()]).transform(String),
  state: z.string().optional(),
});

const userInfoSchema = z.object({
  user: z.object({
    user_id: z.union([z.number(), z.string()]).transform(String),
    first_name: z.string().optional().default(""),
    last_name: z.string().optional().default(""),
    avatar: z.string().optional(),
  }),
});

export type VkProfile = { vkId: string; firstName: string; lastName: string; avatarUrl: string | null };

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data || "error" in data) {
    const msg = data && typeof data.error_description === "string" ? data.error_description : `HTTP ${res.status}`;
    throw new Error(`VK ID: ${msg}`);
  }
  return data;
}

/**
 * Обмен кода на токен и получение подтверждённого профиля.
 * VK ID пользователя берётся только из ответов серверов VK, а не из параметров браузера.
 */
export async function exchangeCodeForProfile(p: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  state: string;
}): Promise<VkProfile> {
  const clientId = env.vkIdClientId;
  if (!clientId) throw new Error("VK_ID_CLIENT_ID не задан");
  const token = tokenSchema.parse(
    await postForm(`${env.vkIdBaseUrl}/oauth2/auth`, {
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.codeVerifier,
      client_id: clientId,
      device_id: p.deviceId,
      redirect_uri: vkRedirectUri(),
      state: p.state,
    }),
  );
  if (token.state && token.state !== p.state) throw new Error("VK ID: state не совпадает");
  const info = userInfoSchema.parse(
    await postForm(`${env.vkIdBaseUrl}/oauth2/user_info`, { client_id: clientId, access_token: token.access_token }),
  );
  if (info.user.user_id !== token.user_id) throw new Error("VK ID: несовпадение user_id");
  return {
    vkId: info.user.user_id,
    firstName: info.user.first_name,
    lastName: info.user.last_name,
    avatarUrl: info.user.avatar ?? null,
  };
}
