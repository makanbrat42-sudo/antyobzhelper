import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(secret: string, data: string, encoding: "hex" | "base64" = "hex"): string {
  return createHmac("sha256", secret).update(data).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** PKCE (RFC 7636): code_verifier 43–128 символов, code_challenge = BASE64URL(SHA256(verifier)). */
export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url"); // 64 символа
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Подписанное значение для cookie: value.signature */
export function signValue(secret: string, value: string): string {
  return `${value}.${hmacSha256(secret, value, "hex").slice(0, 43)}`;
}

export function unsignValue(secret: string, signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = hmacSha256(secret, value, "hex").slice(0, 43);
  return safeEqual(sig, expected) ? value : null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function humanCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
