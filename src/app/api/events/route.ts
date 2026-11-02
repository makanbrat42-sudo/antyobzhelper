import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

// Server-Sent Events: обновление интерфейса в реальном времени.
// Источник — таблица RealtimeEvent (работает и на serverless: несколько инстансов видят одну БД).
// Соединение живёт ~50 с, затем браузер переподключается сам, передавая Last-Event-ID.

const POLL_MS = 2000;
const LIFETIME_MS = 50_000;

// Лимит выполнения функции на Vercel (с запасом к LIFETIME_MS).
export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("unauthorized", { status: 401 });

  const lastHeader = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("since");
  let cursor: bigint;
  if (lastHeader && /^\d+$/.test(lastHeader)) cursor = BigInt(lastHeader);
  else {
    const last = await prisma.realtimeEvent.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
    cursor = last?.id ?? BigInt(0);
  }

  const encoder = new TextEncoder();
  const started = Date.now();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      send(`retry: 3000\n: connected\n\n`);
      req.signal.addEventListener("abort", () => {
        closed = true;
      });
      while (!closed && Date.now() - started < LIFETIME_MS) {
        try {
          const events = await prisma.realtimeEvent.findMany({ where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: 100 });
          for (const e of events) {
            cursor = e.id;
            send(`id: ${e.id}\nevent: update\ndata: ${JSON.stringify({ topic: e.topic, payload: e.payload })}\n\n`);
          }
          if (!events.length) send(`: ping\n\n`);
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      closed = true;
      try {
        controller.close();
      } catch {
        /* уже закрыт */
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
