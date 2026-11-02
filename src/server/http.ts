import { connection, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, "UNAUTHORIZED", "Требуется вход в систему"),
  forbidden: (msg = "Недостаточно прав") => new ApiError(403, "FORBIDDEN", msg),
  notFound: (msg = "Не найдено") => new ApiError(404, "NOT_FOUND", msg),
  conflict: (msg: string, code = "CONFLICT") => new ApiError(409, code, msg),
  badRequest: (msg: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", msg, details),
};

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Некорректные данные", details: err.issues } },
      { status: 400 },
    );
  }
  console.error("[api] необработанная ошибка", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Внутренняя ошибка сервера" } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Обёртка обработчика: единый формат ошибок.
 * connection() — все API-ответы формируются только во время запроса (без пререндеринга при сборке).
 */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    await connection();
    try {
      return await fn(req, ctx);
    } catch (err) {
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errors.badRequest("Ожидается JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

export function clientIp(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
