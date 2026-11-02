import { prisma, type Db } from "../db";
import { parseVkLink } from "./vk-link";
import { resolveScreenName, vkBotConfigured } from "./vk-api";

export type IdentityResult = {
  vkId: string | null;
  status: "VERIFIED" | "LINK_RESOLVED" | "UNRESOLVED" | "CONFLICT";
  note: string | null;
  screenName: string | null;
  linkCodeId: string | null;
};

export type ScreenResolver = (screenName: string) => Promise<string | null>;

const defaultResolver: ScreenResolver = async (name) => {
  if (!vkBotConfigured()) throw new Error("VK API недоступен: бот не настроен");
  return resolveScreenName(name);
};

/**
 * Определение VK ID кандидата.
 * 1) Код подтверждения (кандидат вошёл через VK ID на странице /link) — VERIFIED.
 * 2) Ссылка / ID из анкеты — LINK_RESOLVED (владение аккаунтом не подтверждено).
 * 3) Не удалось определить или данные противоречат — UNRESOLVED / CONFLICT → ручная проверка.
 */
export async function resolveIdentity(
  input: { vkProfile?: string | null; vkIdField?: string | null; linkCode?: string | null },
  opts: { resolver?: ScreenResolver; db?: Db } = {},
): Promise<IdentityResult> {
  const db = opts.db ?? prisma;
  const resolver = opts.resolver ?? defaultResolver;
  const notes: string[] = [];

  let verifiedVkId: string | null = null;
  let linkCodeId: string | null = null;
  const code = input.linkCode?.trim().toUpperCase().replace(/\s+/g, "");
  if (code) {
    const normalized = code.length === 8 && !code.includes("-") ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    const lc = await db.candidateLinkCode.findUnique({ where: { code: normalized }, include: { candidate: true } });
    if (lc && lc.expiresAt.getTime() > Date.now() && lc.candidate.vkVerifiedAt) {
      verifiedVkId = lc.candidate.vkId;
      linkCodeId = lc.id;
    } else {
      notes.push("Код подтверждения VK недействителен или истёк");
    }
  }

  // VK ID из ссылки и из отдельного поля
  const fromLink: string[] = [];
  let screenName: string | null = null;
  for (const raw of [input.vkProfile, input.vkIdField]) {
    const p = parseVkLink(raw);
    if (p.kind === "id") fromLink.push(p.vkId);
    else if (p.kind === "screen") {
      screenName = p.screenName;
      try {
        const id = await resolver(p.screenName);
        if (id) fromLink.push(id);
        else notes.push(`Короткое имя «${p.screenName}» не найдено в VK`);
      } catch (e) {
        notes.push(`Не удалось проверить короткое имя «${p.screenName}»: ${(e as Error).message}`);
      }
    } else if (p.kind === "invalid") notes.push(`Ссылка VK «${raw}»: ${p.reason}`);
  }
  const linkIds = [...new Set(fromLink)];

  if (verifiedVkId) {
    if (linkIds.length && !linkIds.includes(verifiedVkId)) {
      notes.push(`Ссылка в анкете (id${linkIds.join(", id")}) не совпадает с подтверждённым VK (id${verifiedVkId})`);
    }
    return { vkId: verifiedVkId, status: "VERIFIED", note: notes.join("; ") || null, screenName, linkCodeId };
  }
  if (linkIds.length > 1) {
    return {
      vkId: null,
      status: "CONFLICT",
      note: [`Анкета содержит разные VK ID: id${linkIds.join(", id")}`, ...notes].join("; "),
      screenName,
      linkCodeId: null,
    };
  }
  if (linkIds.length === 1) {
    return { vkId: linkIds[0]!, status: "LINK_RESOLVED", note: notes.join("; ") || null, screenName, linkCodeId: null };
  }
  return {
    vkId: null,
    status: "UNRESOLVED",
    note: notes.join("; ") || "VK-профиль не указан",
    screenName,
    linkCodeId: null,
  };
}
