import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "./db";

export type Actor =
  | { type: "USER"; id: string; label?: string | null }
  | { type: "SYSTEM" }
  | { type: "BOT"; id?: string | null; label?: string | null }
  | { type: "SERVICE"; id?: string | null; label?: string | null };

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM" };

function actorFields(actor: Actor) {
  if (actor.type === "SYSTEM") return { actorType: "SYSTEM" as const, actorId: null, actorLabel: "Система" };
  if (actor.type === "USER") return { actorType: "USER" as const, actorId: actor.id, actorLabel: actor.label ?? null };
  // BOT/SERVICE: id — сотрудник, от чьего имени действует бот (если известен)
  return { actorType: actor.type, actorId: actor.id ?? null, actorLabel: actor.label ?? null };
}

export async function audit(
  db: Db,
  input: {
    actor: Actor;
    action: string;
    entityType?: string;
    entityId?: string | number;
    applicationId?: number | null;
    result?: "SUCCESS" | "DENIED" | "ERROR";
    details?: Prisma.InputJsonValue;
    ip?: string;
  },
) {
  const a = actorFields(input.actor);
  await db.auditLog.create({
    data: {
      ...a,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId != null ? String(input.entityId) : null,
      applicationId: input.applicationId ?? null,
      result: input.result ?? "SUCCESS",
      details: input.details,
      ip: input.ip,
    },
  });
}

/** Отказ в доступе пишем вне транзакции, чтобы запись не откатилась вместе с ней. */
export async function auditDenied(input: Omit<Parameters<typeof audit>[1], "result">) {
  try {
    await audit(prisma, { ...input, result: "DENIED" });
  } catch (e) {
    console.error("[audit] не удалось записать отказ", e);
  }
}

export async function appEvent(
  db: Db,
  input: {
    applicationId?: number | null;
    candidateId?: string | null;
    type: string;
    actor: Actor;
    comment?: string | null;
    meta?: Prisma.InputJsonValue;
  },
) {
  const a = actorFields(input.actor);
  await db.applicationEvent.create({
    data: {
      applicationId: input.applicationId ?? null,
      candidateId: input.candidateId ?? null,
      type: input.type,
      actorType: a.actorType,
      actorId: a.actorId,
      comment: input.comment ?? null,
      meta: input.meta,
    },
  });
}

/** Публикация события для SSE-клиентов (обновление интерфейса). */
export async function publish(db: Db, topic: string, payload?: Prisma.InputJsonValue) {
  await db.realtimeEvent.create({ data: { topic, payload } });
}
