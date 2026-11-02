import { handleVkCallback } from "@/server/services/vk-callback";

// VK Callback API. Адрес указывается в настройках сообщества → Работа с API → Callback API.
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const r = await handleVkCallback(raw);
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
