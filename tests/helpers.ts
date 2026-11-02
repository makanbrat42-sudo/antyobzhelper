import { vi } from "vitest";
import { prisma } from "@/server/db";
import { bootstrapReferenceData } from "@/server/bootstrap";
import { loadAuthUser, type AuthUser } from "@/server/auth/rbac";
import { hmacSha256 } from "@/server/crypto";
import type { FormSubmission } from "@/server/services/applications";

export { prisma };

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await bootstrapReferenceData(prisma);
}

let vkSeq = 100000;
export function nextVkId() {
  return String(++vkSeq);
}

/** Создаёт активного сотрудника с должностями. */
export async function createStaff(opts: {
  nickname: string;
  main?: string | null;
  caller?: string | null;
  status?: "ACTIVE" | "PENDING" | "BLOCKED";
  leadership?: { receive?: boolean; approve?: boolean; reject?: boolean };
}): Promise<AuthUser> {
  const user = await prisma.user.create({
    data: { vkId: nextVkId(), nickname: opts.nickname, status: opts.status ?? "ACTIVE" },
  });
  for (const [kind, key] of [
    ["MAIN", opts.main],
    ["CALLER", opts.caller],
  ] as const) {
    if (!key) continue;
    const role = await prisma.role.findUniqueOrThrow({ where: { key } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, kind } });
  }
  if (opts.leadership) {
    await prisma.leadershipMember.create({
      data: {
        userId: user.id,
        receiveApplications: opts.leadership.receive ?? true,
        canApprove: opts.leadership.approve ?? false,
        canReject: opts.leadership.reject ?? false,
      },
    });
  }
  return (await loadAuthUser(user.id))!;
}

let respSeq = 0;
export function submission(p: { vk?: string; nickname?: string; at?: Date; responseId?: string; extra?: [string, string][] } = {}): FormSubmission {
  const answers: FormSubmission["answers"] = [
    { question: "Ник", answer: p.nickname ?? "Кандидат" },
    { question: "Ссылка на VK", answer: p.vk ?? "" },
    { question: "Почему хотите к нам?", answer: "Хочу помогать игрокам" },
    ...(p.extra ?? []).map(([question, answer]) => ({ question, answer })),
  ];
  return {
    responseId: p.responseId ?? `resp-${++respSeq}-${Date.now()}`,
    timestamp: (p.at ?? new Date()).toISOString(),
    answers,
  };
}

export function signedFormRequest(body: object, opts: { secret?: string; ts?: number } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(opts.ts ?? Date.now());
  return new Request("https://antyobzhelp.test/api/integrations/google-forms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aoh-timestamp": ts,
      "x-aoh-signature": hmacSha256(opts.secret ?? "test-gf-secret", `${ts}.${raw}`),
    },
    body: raw,
  });
}

export type VkCall = { method: string; params: Record<string, string> };

/** Подменяет fetch для VK API и записывает все вызовы. */
export function mockVkApi(handler?: (call: VkCall) => unknown) {
  const calls: VkCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("https://vk-api.test/method/")) throw new Error(`Неожиданный внешний запрос: ${url}`);
    const method = url.slice("https://vk-api.test/method/".length);
    const params = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")).entries());
    const call = { method, params };
    calls.push(call);
    const custom = handler?.(call);
    if (custom !== undefined) return new Response(JSON.stringify(custom), { status: 200 });
    let response: unknown = 1;
    if (method === "messages.send") {
      response = String(params.peer_ids ?? "")
        .split(",")
        .map((peer, i) => ({ peer_id: Number(peer), message_id: 1000 + calls.length + i, conversation_message_id: 10 + calls.length + i }));
    } else if (method === "utils.resolveScreenName") {
      response = [];
    } else if (method === "messages.isMessagesFromGroupAllowed") {
      response = { is_allowed: 1 };
    }
    return new Response(JSON.stringify({ response }), { status: 200 });
  });
  return { calls, restore: () => spy.mockRestore() };
}

/** Сдвигает время завершения неуспешного обзвона в прошлое (имитация прошедшего времени). */
export async function shiftCallEnd(callSessionId: string, endedAt: Date) {
  await prisma.callSession.update({ where: { id: callSessionId }, data: { endedAt } });
  await prisma.cooldownRestriction.updateMany({
    where: { callSessionId },
    data: { failedAt: endedAt, endsAt: new Date(endedAt.getTime() + 120 * 3600_000) },
  });
}
