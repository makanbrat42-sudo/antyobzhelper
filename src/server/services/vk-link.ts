// Разбор ссылки на VK из анкеты. Ссылка — только указание на аккаунт, а не доказательство владения.

export type VkLinkParse =
  | { kind: "id"; vkId: string }
  | { kind: "screen"; screenName: string }
  | { kind: "invalid"; reason: string }
  | { kind: "empty" };

const RESERVED = new Set([
  "feed", "im", "friends", "groups", "audio", "video", "music", "settings", "search", "login",
  "about", "support", "apps", "games", "market", "services", "docs", "away.php", "share.php",
]);

export function parseVkLink(input: string | null | undefined): VkLinkParse {
  if (!input) return { kind: "empty" };
  let s = input.trim();
  if (!s) return { kind: "empty" };

  // Чистый числовой ID
  if (/^\d{1,12}$/.test(s)) return s === "0" ? { kind: "invalid", reason: "Нулевой ID" } : { kind: "id", vkId: String(BigInt(s)) };
  // @screen_name или *screen_name
  if (/^[@*]/.test(s)) s = s.slice(1);

  let path = s;
  const urlMatch = s.match(/^(?:https?:\/\/)?(?:www\.|m\.|new\.)?(?:vk\.com|vk\.ru|vkontakte\.ru|vk\.me)\/(.*)$/i);
  if (urlMatch) {
    path = urlMatch[1] ?? "";
  } else if (/[/:]/.test(s) || /\s/.test(s)) {
    return { kind: "invalid", reason: "Это не ссылка на VK" };
  }
  path = path.split(/[?#]/)[0]!.replace(/\/+$/, "");
  if (path.includes("/")) path = path.split("/")[0]!;
  if (!path) return { kind: "invalid", reason: "Пустая ссылка на профиль" };

  const idMatch = path.match(/^id(\d{1,12})$/i);
  if (idMatch) {
    const id = String(BigInt(idMatch[1]!));
    return id === "0" ? { kind: "invalid", reason: "Нулевой ID" } : { kind: "id", vkId: id };
  }
  if (/^(club|public|event)\d+$/i.test(path)) return { kind: "invalid", reason: "Ссылка ведёт на сообщество, а не на профиль" };
  if (!/^[a-zA-Z0-9_.]{2,32}$/.test(path)) return { kind: "invalid", reason: "Некорректное короткое имя VK" };
  if (RESERVED.has(path.toLowerCase())) return { kind: "invalid", reason: "Это не ссылка на профиль" };
  return { kind: "screen", screenName: path.toLowerCase() };
}
