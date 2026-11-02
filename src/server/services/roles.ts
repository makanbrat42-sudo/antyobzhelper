import { z } from "zod";
import { ADMIN_ROLE_KEY, ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { prisma } from "../db";
import { audit, publish } from "../audit";
import { errors, isUniqueViolation } from "../http";
import type { AuthUser } from "../auth/rbac";
import { actorOf } from "./staff";

const permEnum = z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]]);

export const roleInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  permissions: z.array(permEnum).optional(),
});

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    kind: r.kind,
    color: r.color,
    sortOrder: r.sortOrder,
    isSystem: r.isSystem,
    users: r._count.users,
    permissions: r.permissions.map((p) => p.permission.key),
  }));
}

async function setRolePermissions(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], roleId: string, perms: PermissionKey[]) {
  const all = await tx.permission.findMany({ where: { key: { in: perms } } });
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (all.length) await tx.rolePermission.createMany({ data: all.map((p) => ({ roleId, permissionId: p.id })) });
}

function guardPerms(actor: AuthUser, perms: PermissionKey[] | undefined) {
  // Нельзя выдать должности разрешения, которых нет у себя.
  if (!perms) return;
  const missing = perms.filter((p) => !actor.permissions.includes(p));
  if (missing.length) throw errors.forbidden(`Нельзя выдать разрешения, которых нет у вас: ${missing.join(", ")}`);
}

export async function createRole(actor: AuthUser, input: z.infer<typeof roleInputSchema> & { kind: "MAIN" | "CALLER" }) {
  guardPerms(actor, input.permissions);
  const key = `custom_${Date.now().toString(36)}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { key, name: input.name, color: input.color, kind: input.kind, sortOrder: input.sortOrder ?? 100 },
      });
      if (input.permissions) await setRolePermissions(tx, role.id, input.permissions);
      await audit(tx, { actor: actorOf(actor), action: "role.created", entityType: "Role", entityId: role.id, details: input });
      await publish(tx, "roles");
      return role;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("Должность уже существует");
    throw e;
  }
}

export async function updateRole(actor: AuthUser, roleId: string, input: Partial<z.infer<typeof roleInputSchema>>) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw errors.notFound("Должность не найдена");
  if (role.key === ADMIN_ROLE_KEY && input.permissions) throw errors.badRequest("Разрешения администратора не изменяются");
  guardPerms(actor, input.permissions);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id: roleId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    if (input.permissions) await setRolePermissions(tx, roleId, input.permissions);
    await audit(tx, { actor: actorOf(actor), action: "role.updated", entityType: "Role", entityId: roleId, details: input });
    await publish(tx, "roles");
    return updated;
  });
}

export async function deleteRole(actor: AuthUser, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role) throw errors.notFound("Должность не найдена");
  if (role.isSystem) throw errors.badRequest("Системную должность удалить нельзя");
  if (role._count.users > 0) throw errors.conflict("Должность назначена сотрудникам — сначала снимите её");
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await audit(tx, { actor: actorOf(actor), action: "role.deleted", entityType: "Role", entityId: roleId, details: { name: role.name } });
    await publish(tx, "roles");
  });
}
