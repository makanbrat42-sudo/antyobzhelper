import { cookies } from "next/headers";
import type { PermissionKey } from "@/lib/permissions";
import { prisma } from "../db";
import { randomToken, sha256 } from "../crypto";
import { errors } from "../http";
import { can, loadAuthUser, type AuthUser } from "./rbac";

export const SESSION_COOKIE = "aoh_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ip: meta.ip },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь по cookie сессии (любой статус) или null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return loadAuthUser(session.userId);
}

/**
 * Требует активного сотрудника и (опционально) разрешение.
 * `perm` как массив — достаточно любого из перечисленных.
 */
export async function requireUser(perm?: PermissionKey | PermissionKey[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  if (user.status !== "ACTIVE") throw errors.forbidden("Учётная запись не активна");
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => can(user, p))) throw errors.forbidden();
  }
  return user;
}
