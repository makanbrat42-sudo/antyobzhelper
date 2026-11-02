import { ADMIN_ROLE_KEY, ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from "@/lib/permissions";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Идемпотентная начальная настройка справочников: разрешения, должности по умолчанию.
 * Существующие должности не перезаписываются (их можно менять в админ-панели),
 * но должность администратора всегда получает полный набор разрешений.
 */
export async function bootstrapReferenceData(prisma: PrismaClient) {
  for (const key of ALL_PERMISSIONS) {
    const p = PERMISSIONS[key];
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: p.description, group: p.group },
      update: { description: p.description, group: p.group },
    });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: r.key } });
    if (existing) continue;
    await prisma.role.create({
      data: {
        key: r.key,
        name: r.name,
        kind: r.kind,
        color: r.color,
        sortOrder: r.sortOrder,
        isSystem: r.key === ADMIN_ROLE_KEY,
        permissions: { create: r.permissions.map((k) => ({ permissionId: permId.get(k)! })) },
      },
    });
  }
  const admin = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
  for (const id of permId.values()) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: id } },
      create: { roleId: admin.id, permissionId: id },
      update: {},
    });
  }
  // Номера заявок начинаются с #1001.
  const count = await prisma.application.count();
  if (count === 0) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Application"', 'id'), 1000, true)`);
  }
}
