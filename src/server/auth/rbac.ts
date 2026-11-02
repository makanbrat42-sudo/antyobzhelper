import { isPermissionKey, type PermissionKey } from "@/lib/permissions";
import { prisma, type Db } from "../db";

const userInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  permissionOverrides: { include: { permission: true } },
} as const;

export type AuthUser = {
  id: string;
  vkId: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "BLOCKED";
  mainRole: { id: string; key: string; name: string; color: string } | null;
  callerRole: { id: string; key: string; name: string; color: string } | null;
  permissions: PermissionKey[];
};

type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadRaw>>>;

function loadRaw(db: Db, where: { id: string } | { vkId: string }) {
  return db.user.findUnique({ where, include: userInclude });
}

/**
 * Итоговые права = права должностей ∪ индивидуально выданные − индивидуально запрещённые.
 * Неактивный сотрудник не имеет прав.
 */
export function computePermissions(user: LoadedUser): PermissionKey[] {
  if (user.status !== "ACTIVE") return [];
  const set = new Set<PermissionKey>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      if (isPermissionKey(rp.permission.key)) set.add(rp.permission.key);
    }
  }
  for (const o of user.permissionOverrides) {
    if (!isPermissionKey(o.permission.key)) continue;
    if (o.granted) set.add(o.permission.key);
    else set.delete(o.permission.key);
  }
  return [...set].sort();
}

function toAuthUser(u: LoadedUser): AuthUser {
  const main = u.roles.find((r) => r.kind === "MAIN")?.role;
  const caller = u.roles.find((r) => r.kind === "CALLER")?.role;
  const pick = (r: typeof main) => (r ? { id: r.id, key: r.key, name: r.name, color: r.color } : null);
  return {
    id: u.id,
    vkId: u.vkId,
    nickname: u.nickname,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    status: u.status,
    mainRole: pick(main),
    callerRole: pick(caller),
    permissions: computePermissions(u),
  };
}

export async function loadAuthUser(userId: string, db: Db = prisma): Promise<AuthUser | null> {
  const u = await loadRaw(db, { id: userId });
  return u ? toAuthUser(u) : null;
}

export async function loadAuthUserByVkId(vkId: string, db: Db = prisma): Promise<AuthUser | null> {
  const u = await loadRaw(db, { vkId });
  return u ? toAuthUser(u) : null;
}

export function can(user: Pick<AuthUser, "permissions" | "status"> | null | undefined, perm: PermissionKey): boolean {
  return !!user && user.status === "ACTIVE" && user.permissions.includes(perm);
}

export function canAny(user: Pick<AuthUser, "permissions" | "status"> | null | undefined, perms: PermissionKey[]): boolean {
  return perms.some((p) => can(user, p));
}
