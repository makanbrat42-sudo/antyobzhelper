import { ADMIN_ROLE_KEY, type PermissionKey } from "@/lib/permissions";
import { prisma } from "../db";
import { audit, publish, type Actor } from "../audit";
import { errors } from "../http";
import { safeEqual } from "../crypto";
import { env } from "../env";
import type { VkProfile } from "../auth/vkid";
import type { AuthUser } from "../auth/rbac";

/** Вход сотрудника: находит/создаёт пользователя. Новый пользователь получает статус PENDING и заявку на регистрацию. */
export async function completeStaffLogin(profile: VkProfile) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { vkId: profile.vkId } });
    if (existing) {
      return tx.user.update({
        where: { id: existing.id },
        data: {
          firstName: profile.firstName || existing.firstName,
          lastName: profile.lastName || existing.lastName,
          avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
          lastLoginAt: new Date(),
        },
      });
    }
    const nickname = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || `id${profile.vkId}`;
    const user = await tx.user.create({
      data: {
        vkId: profile.vkId,
        nickname,
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        avatarUrl: profile.avatarUrl,
        status: "PENDING",
        lastLoginAt: new Date(),
      },
    });
    await tx.registrationRequest.create({ data: { userId: user.id } });
    await audit(tx, {
      actor: { type: "USER", id: user.id, label: nickname },
      action: "registration.requested",
      entityType: "User",
      entityId: user.id,
    });
    await publish(tx, "registrations");
    return user;
  });
}

/** Сотрудник повторно отправляет заявку на регистрацию после отклонения. */
export async function reapplyRegistration(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw errors.notFound();
    if (user.status !== "REJECTED") throw errors.conflict("Повторная заявка возможна только после отклонения");
    const pending = await tx.registrationRequest.findFirst({ where: { userId, status: "PENDING" } });
    if (!pending) await tx.registrationRequest.create({ data: { userId } });
    await tx.user.update({ where: { id: userId }, data: { status: "PENDING" } });
    await publish(tx, "registrations");
  });
}

export async function hasActiveAdmin(): Promise<boolean> {
  const n = await prisma.userRole.count({
    where: { role: { key: ADMIN_ROLE_KEY }, user: { status: "ACTIVE" } },
  });
  return n > 0;
}

/**
 * Первоначальная настройка: вошедший через VK пользователь вводит SETUP_TOKEN из переменных окружения
 * и становится администратором. Работает, только пока нет ни одного активного администратора.
 */
export async function claimInitialAdmin(userId: string, token: string, ip?: string) {
  const expected = env.setupToken;
  if (!expected || expected.length < 12) throw errors.forbidden("Первоначальная настройка отключена: SETUP_TOKEN не задан (мин. 12 символов)");
  if (!safeEqual(token, expected)) {
    await audit(prisma, { actor: { type: "USER", id: userId }, action: "setup.claim_admin", result: "DENIED", ip });
    throw errors.forbidden("Неверный токен настройки");
  }
  return prisma.$transaction(async (tx) => {
    // Блокировка, чтобы два одновременных запроса не создали двух администраторов.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const admins = await tx.userRole.count({ where: { role: { key: ADMIN_ROLE_KEY }, user: { status: "ACTIVE" } } });
    if (admins > 0) throw errors.conflict("Администратор уже назначен");
    const role = await tx.role.findUnique({ where: { key: ADMIN_ROLE_KEY } });
    if (!role) throw errors.conflict("Должность администратора не найдена — выполните npm run db:seed");
    await tx.userRole.upsert({
      where: { userId_kind: { userId, kind: "MAIN" } },
      create: { userId, roleId: role.id, kind: "MAIN" },
      update: { roleId: role.id },
    });
    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    await tx.registrationRequest.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: new Date(), comment: "Первоначальная настройка" },
    });
    await tx.leadershipMember.upsert({
      where: { userId },
      create: { userId, receiveApplications: true, canApprove: true, canReject: true },
      update: {},
    });
    await audit(tx, { actor: { type: "USER", id: userId }, action: "setup.claim_admin", entityType: "User", entityId: userId, ip });
  });
}

export async function reviewRegistration(
  actor: AuthUser,
  requestId: string,
  input: { approve: boolean; comment?: string; mainRoleId?: string | null; callerRoleId?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.registrationRequest.findUnique({ where: { id: requestId } });
    if (!req) throw errors.notFound("Заявка на регистрацию не найдена");
    const updated = await tx.registrationRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        reviewedAt: new Date(),
        reviewedById: actor.id,
        comment: input.comment ?? null,
      },
    });
    if (updated.count === 0) throw errors.conflict("Заявка уже рассмотрена");
    await tx.user.update({ where: { id: req.userId }, data: { status: input.approve ? "ACTIVE" : "REJECTED" } });
    if (input.approve) {
      if (input.mainRoleId) await setUserRoleTx(tx, req.userId, "MAIN", input.mainRoleId, actor);
      if (input.callerRoleId) await setUserRoleTx(tx, req.userId, "CALLER", input.callerRoleId, actor);
    }
    await audit(tx, {
      actor: { type: "USER", id: actor.id, label: actor.nickname },
      action: input.approve ? "registration.approved" : "registration.rejected",
      entityType: "User",
      entityId: req.userId,
      details: { comment: input.comment ?? null },
    });
    await tx.notification.create({
      data: {
        userId: req.userId,
        type: "registration",
        title: input.approve ? "Регистрация одобрена" : "Регистрация отклонена",
        body: input.comment ?? null,
      },
    });
    await publish(tx, "registrations");
    await publish(tx, "employees");
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function guardAdminRoleChange(tx: Tx, actor: AuthUser, roleKey: string | undefined) {
  // Должность администратора может выдавать/снимать только сотрудник с system.manage.
  if (roleKey === ADMIN_ROLE_KEY && !actor.permissions.includes("system.manage")) {
    throw errors.forbidden("Назначать администраторов может только администратор");
  }
  void tx;
}

export async function setUserRoleTx(tx: Tx, userId: string, kind: "MAIN" | "CALLER", roleId: string | null, actor: AuthUser) {
  const current = await tx.userRole.findUnique({ where: { userId_kind: { userId, kind } }, include: { role: true } });
  await guardAdminRoleChange(tx, actor, current?.role.key);
  if (roleId === null) {
    if (current) {
      if (current.role.key === ADMIN_ROLE_KEY) await ensureNotLastAdmin(tx, userId);
      await tx.userRole.delete({ where: { id: current.id } });
    }
    return;
  }
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role) throw errors.badRequest("Должность не найдена");
  if (role.kind !== kind) throw errors.badRequest("Тип должности не совпадает");
  await guardAdminRoleChange(tx, actor, role.key);
  if (current?.role.key === ADMIN_ROLE_KEY && role.key !== ADMIN_ROLE_KEY) await ensureNotLastAdmin(tx, userId);
  await tx.userRole.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, roleId, kind },
    update: { roleId },
  });
}

async function ensureNotLastAdmin(tx: Tx, userId: string) {
  const others = await tx.userRole.count({
    where: { role: { key: ADMIN_ROLE_KEY }, user: { status: "ACTIVE" }, userId: { not: userId } },
  });
  if (others === 0) throw errors.conflict("Нельзя снять последнего администратора");
}

export async function updateEmployee(
  actor: AuthUser,
  userId: string,
  input: {
    nickname?: string;
    discordId?: string | null;
    mainRoleId?: string | null;
    callerRoleId?: string | null;
    status?: "ACTIVE" | "BLOCKED";
    blockedReason?: string | null;
    permissionOverrides?: { key: PermissionKey; granted: boolean | null }[];
  },
) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (!target) throw errors.notFound("Сотрудник не найден");
    const isTargetAdmin = target.roles.some((r) => r.role.key === ADMIN_ROLE_KEY);
    if (isTargetAdmin && !actor.permissions.includes("system.manage")) {
      throw errors.forbidden("Изменять администратора может только администратор");
    }
    const changes: Record<string, unknown> = {};

    if (input.nickname !== undefined || input.discordId !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
          ...(input.discordId !== undefined ? { discordId: input.discordId || null } : {}),
        },
      });
      changes.profile = { nickname: input.nickname, discordId: input.discordId };
    }
    if (input.mainRoleId !== undefined) {
      await setUserRoleTx(tx, userId, "MAIN", input.mainRoleId, actor);
      changes.mainRoleId = input.mainRoleId;
    }
    if (input.callerRoleId !== undefined) {
      await setUserRoleTx(tx, userId, "CALLER", input.callerRoleId, actor);
      changes.callerRoleId = input.callerRoleId;
    }
    if (input.status) {
      if (userId === actor.id && input.status === "BLOCKED") throw errors.badRequest("Нельзя заблокировать самого себя");
      if (target.status === "PENDING" || target.status === "REJECTED") {
        throw errors.badRequest("Сначала рассмотрите заявку на регистрацию");
      }
      if (input.status === "BLOCKED" && isTargetAdmin) await ensureNotLastAdmin(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: { status: input.status, blockedReason: input.status === "BLOCKED" ? (input.blockedReason ?? null) : null },
      });
      if (input.status === "BLOCKED") await tx.session.deleteMany({ where: { userId } });
      changes.status = input.status;
    }
    if (input.permissionOverrides) {
      if (!actor.permissions.includes("roles.manage")) throw errors.forbidden("Нужно право roles.manage");
      for (const o of input.permissionOverrides) {
        if (!actor.permissions.includes("system.manage") && (o.key === "system.manage" || o.key === "roles.manage")) {
          throw errors.forbidden("Это разрешение может выдавать только администратор");
        }
        const perm = await tx.permission.findUnique({ where: { key: o.key } });
        if (!perm) continue;
        if (o.granted === null) {
          await tx.userPermission.deleteMany({ where: { userId, permissionId: perm.id } });
        } else {
          await tx.userPermission.upsert({
            where: { userId_permissionId: { userId, permissionId: perm.id } },
            create: { userId, permissionId: perm.id, granted: o.granted },
            update: { granted: o.granted },
          });
        }
      }
      changes.permissionOverrides = input.permissionOverrides;
    }
    await audit(tx, {
      actor: actorOf(actor),
      action: input.status === "BLOCKED" ? "employee.blocked" : input.status === "ACTIVE" ? "employee.unblocked" : "employee.updated",
      entityType: "User",
      entityId: userId,
      details: changes as object,
    });
    await publish(tx, "employees");
  });
}

export function actorOf(u: Pick<AuthUser, "id" | "nickname">): Actor {
  return { type: "USER", id: u.id, label: u.nickname };
}
