import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { prisma } from "@/server/db";
import { attemptDelivery } from "@/server/services/vk-bot";

// Обслуживание: очистка устаревших данных и повтор неудачных доставок VK-бота.
// Vercel Cron передаёт заголовок Authorization: Bearer ${CRON_SECRET}.
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("unauthorized", { status: 401 });

  const now = new Date();
  const [sessions, realtime, states, codes] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } } }),
    prisma.botConversationState.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.candidateLinkCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } }),
  ]);

  // Повтор: не более 3 попыток, только для заявок, всё ещё ожидающих рассмотрения.
  const failed = await prisma.integrationDelivery.findMany({
    where: { status: "FAILED", attempts: { lt: 3 }, kind: "APPLICATION_REVIEW", application: { status: "PENDING_REVIEW" } },
    take: 50,
  });
  let retried = 0;
  for (const d of failed) {
    const r = await attemptDelivery(d.id);
    if (r.status === "SENT") retried++;
  }
  return NextResponse.json({
    ok: true,
    removed: { sessions: sessions.count, realtime: realtime.count, botStates: states.count, linkCodes: codes.count },
    deliveries: { attempted: failed.length, sent: retried },
  });
}
