import { env } from "../env";

// Минимальный клиент VK API от имени сообщества (ключ доступа сообщества).

export class VkApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export function vkBotConfigured(): boolean {
  return !!(env.vkGroupToken && env.vkGroupId);
}

export async function vkCall<T = unknown>(method: string, params: Record<string, string | number | undefined>): Promise<T> {
  const token = env.vkGroupToken;
  if (!token) throw new VkApiError(-1, "VK-бот не настроен: VK_GROUP_TOKEN не задан");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  body.set("access_token", token);
  body.set("v", env.vkApiVersion);
  let res: Response;
  try {
    res = await fetch(`${env.vkApiBaseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new VkApiError(-2, `Сеть: ${(e as Error).message}`);
  }
  const data = (await res.json().catch(() => null)) as
    | { response?: T; error?: { error_code: number; error_msg: string } }
    | null;
  if (!data) throw new VkApiError(-3, `VK API: некорректный ответ (HTTP ${res.status})`);
  if (data.error) throw new VkApiError(data.error.error_code, data.error.error_msg);
  return data.response as T;
}

export const VK_ERROR_HINTS: Record<number, string> = {
  5: "Неверный ключ доступа сообщества",
  7: "Недостаточно прав у ключа сообщества (нужны «сообщения сообщества»)",
  9: "Слишком частые однотипные запросы (flood control)",
  15: "Доступ запрещён",
  27: "Метод недоступен для ключа сообщества",
  900: "Сотрудник добавил сообщество в чёрный список",
  901: "Сотрудник не разрешил сообщения от сообщества",
  902: "Отправка запрещена настройками приватности сотрудника",
  912: "Включите возможности ботов в настройках сообщества",
};

export function describeVkError(e: unknown): { code: number | null; message: string } {
  if (e instanceof VkApiError) {
    const hint = VK_ERROR_HINTS[e.code];
    return { code: e.code, message: hint ? `${hint} (${e.code}: ${e.message})` : `${e.code}: ${e.message}` };
  }
  return { code: null, message: (e as Error)?.message ?? String(e) };
}

/** Преобразует короткое имя в числовой VK ID пользователя. null — не найдено или не пользователь. */
export async function resolveScreenName(screenName: string): Promise<string | null> {
  const r = await vkCall<{ type?: string; object_id?: number } | []>("utils.resolveScreenName", { screen_name: screenName });
  if (!r || Array.isArray(r) || r.type !== "user" || !r.object_id) return null;
  return String(r.object_id);
}
