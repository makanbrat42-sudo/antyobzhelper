import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { hmacSha256, safeEqual } from "@/server/crypto";
import { prisma } from "@/server/db";
import { formSubmissionSchema, ingestSubmission } from "@/server/services/applications";

// Приём анкет из Google Apps Script.
// Подлинность: заголовки X-AOH-Timestamp (unix ms) и X-AOH-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
// Идемпотентность: повторная доставка того же responseId не создаёт вторую заявку.

const MAX_SKEW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const secret = env.googleFormsSecret;
  if (!secret) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await req.text();
  if (body.length > 1_000_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const ts = req.headers.get("x-aoh-timestamp") ?? "";
  const sig = (req.headers.get("x-aoh-signature") ?? "").toLowerCase();
  const tsNum = Number(ts);
  const validSig = !!ts && !!sig && safeEqual(sig, hmacSha256(secret, `${ts}.${body}`));
  const fresh = Number.isFinite(tsNum) && Math.abs(Date.now() - tsNum) < MAX_SKEW_MS;

  if (!validSig || !fresh) {
    await prisma.integrationEvent.create({
      data: {
        source: "GOOGLE_FORMS",
        eventType: "form_submit",
        status: "REJECTED",
        error: !validSig ? "Неверная подпись" : "Устаревшая метка времени",
      },
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = formSubmissionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    await prisma.integrationEvent.create({
      data: {
        source: "GOOGLE_FORMS",
        eventType: "form_submit",
        status: "REJECTED",
        error: "Некорректная структура анкеты",
        payload: { issues: parsed.error.issues.slice(0, 20) } as object,
      },
    });
    return NextResponse.json({ ok: false, error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });
  }
  const sub = parsed.data;

  // Каждая попытка доставки фиксируется в истории интеграций.
  const event = await prisma.integrationEvent.create({
    data: {
      source: "GOOGLE_FORMS",
      eventType: "form_submit",
      externalId: sub.responseId,
      payload: sub as unknown as object,
    },
  });

  try {
    const r = await ingestSubmission(sub, { integrationEventId: event.id });
    if (r.outcome === "already_processed") {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "DUPLICATE", applicationId: r.applicationId, processedAt: new Date(), error: "Ответ уже обработан (повторная доставка)" },
      });
      return NextResponse.json({ ok: true, duplicate: true, applicationId: r.applicationId });
    }
    if (r.outcome === "disabled") {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "REJECTED", processedAt: new Date(), error: "Приём анкет отключён в настройках" },
      });
      return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
    }
    if (r.outcome === "duplicate_active") {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "DUPLICATE", applicationId: r.activeApplicationId, processedAt: new Date(), error: "У кандидата уже есть активная заявка" },
      });
      return NextResponse.json({ ok: true, duplicateActive: true, applicationId: r.activeApplicationId });
    }
    return NextResponse.json({ ok: true, applicationId: r.applicationId, status: r.status });
  } catch (e) {
    console.error("[google-forms] ошибка обработки", e);
    await prisma.integrationEvent
      .update({ where: { id: event.id }, data: { status: "ERROR", error: (e as Error).message?.slice(0, 1000), processedAt: new Date() } })
      .catch(() => {});
    // 500 → Apps Script повторит доставку.
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
