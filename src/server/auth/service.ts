import { prisma } from "../db";
import { randomToken, sha256 } from "../crypto";
import { errors } from "../http";

// Сервисная авторизация ботов (Discord): Authorization: Bearer aoh_svc_...
// Токен не связан с учётной записью администратора; права ограничены scopes.

export const SERVICE_SCOPES = {
  "discord.link": "Привязка Discord ↔ подтверждённый VK кандидата",
  "discord.read": "Чтение заявок кандидата и сотрудников по Discord ID",
  "discord.voice": "Синхронизация голосовых каналов обзвона",
} as const;
export type ServiceScope = keyof typeof SERVICE_SCOPES;

export async function issueServiceToken(name: string, scopes: ServiceScope[], createdById: string) {
  const token = `aoh_svc_${randomToken(32)}`;
  const row = await prisma.serviceToken.create({
    data: { name, scopes, tokenHash: sha256(token), tokenPrefix: token.slice(0, 14), createdById },
  });
  return { token, id: row.id };
}

export async function requireService(req: Request, scope: ServiceScope) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(aoh_svc_[A-Za-z0-9_-]{20,})$/);
  if (!m) throw errors.unauthorized();
  const row = await prisma.serviceToken.findUnique({ where: { tokenHash: sha256(m[1]!) } });
  if (!row || row.revokedAt) throw errors.unauthorized();
  if (!row.scopes.includes(scope)) throw errors.forbidden(`Токену не выдан scope ${scope}`);
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.serviceToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { id: row.id, name: row.name };
}
