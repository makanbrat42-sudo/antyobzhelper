import { prisma, type Db } from "../db";

export const HOUR_MS = 3_600_000;
export const DEFAULT_COOLDOWN_HOURS = 120; // 5 полных суток

export function cooldownEndsAt(failedAt: Date, hours: number = DEFAULT_COOLDOWN_HOURS): Date {
  return new Date(failedAt.getTime() + hours * HOUR_MS);
}

/**
 * Ограничение действует, если заявка подана СТРОГО раньше, чем failedAt + hours.
 * Ровно через 120 часов подача уже разрешена.
 */
export function isWithinCooldown(failedAt: Date, submittedAt: Date, hours: number = DEFAULT_COOLDOWN_HOURS): boolean {
  return submittedAt.getTime() < cooldownEndsAt(failedAt, hours).getTime();
}

export type CooldownCheck =
  | { restricted: false; lastFailedAt: Date | null }
  | { restricted: true; lastFailedAt: Date; endsAt: Date; callSessionId: string; applicationId: number };

/**
 * Находит последний обзвон с результатом FAILED по кандидату и проверяет срок.
 * Учитываются только результаты FAILED; отказ руководства, перенос, отказ кандидата не создают ограничений.
 * Если ограничение по последнему провалу снято администратором — подача разрешена.
 */
export async function checkCooldown(
  candidateId: string,
  submittedAt: Date,
  hours: number,
  db: Db = prisma,
): Promise<CooldownCheck> {
  const lastFailed = await db.callSession.findFirst({
    where: {
      status: "FINISHED",
      endedAt: { not: null },
      result: { outcome: "FAILED" },
      application: { candidateId },
    },
    orderBy: { endedAt: "desc" },
    include: { cooldown: true },
  });
  if (!lastFailed || !lastFailed.endedAt) return { restricted: false, lastFailedAt: null };
  if (lastFailed.cooldown?.liftedAt) return { restricted: false, lastFailedAt: lastFailed.endedAt };
  if (!isWithinCooldown(lastFailed.endedAt, submittedAt, hours)) {
    return { restricted: false, lastFailedAt: lastFailed.endedAt };
  }
  return {
    restricted: true,
    lastFailedAt: lastFailed.endedAt,
    endsAt: cooldownEndsAt(lastFailed.endedAt, hours),
    callSessionId: lastFailed.id,
    applicationId: lastFailed.applicationId,
  };
}
