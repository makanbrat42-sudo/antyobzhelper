// Русские подписи статусов и форматирование, общие для сервера и клиента.

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  IDENTITY_CHECK: "Проверка VK ID",
  PENDING_REVIEW: "Ожидает рассмотрения",
  APPROVED_WAITING_CALLER: "Ожидает обзвонщика",
  ASSIGNED: "Закреплена",
  IN_PROGRESS: "Идёт обзвон",
  COMPLETED: "Завершена",
  REJECTED: "Отклонена",
  AUTO_REJECTED_COOLDOWN: "Автоотказ",
  CANCELLED: "Отменена",
};

export const APPLICATION_STATUS_TONE: Record<string, Tone> = {
  IDENTITY_CHECK: "amber",
  PENDING_REVIEW: "blue",
  APPROVED_WAITING_CALLER: "violet",
  ASSIGNED: "cyan",
  IN_PROGRESS: "cyan",
  COMPLETED: "green",
  REJECTED: "red",
  AUTO_REJECTED_COOLDOWN: "orange",
  CANCELLED: "gray",
};

export type Tone = "gray" | "violet" | "blue" | "cyan" | "green" | "amber" | "orange" | "red";

export const ACTIVE_APPLICATION_STATUSES = [
  "IDENTITY_CHECK",
  "PENDING_REVIEW",
  "APPROVED_WAITING_CALLER",
  "ASSIGNED",
  "IN_PROGRESS",
] as const;

export const CALL_OUTCOME_LABEL: Record<string, string> = {
  PASSED: "Прошёл",
  FAILED: "Не прошёл",
  REFUSED: "Отказался",
  POSTPONED: "Перенос",
};

export const CALL_OUTCOME_ICON: Record<string, string> = {
  PASSED: "✅",
  FAILED: "❌",
  REFUSED: "🚫",
  POSTPONED: "⏳",
};

export const CALL_OUTCOME_TONE: Record<string, Tone> = {
  PASSED: "green",
  FAILED: "red",
  REFUSED: "gray",
  POSTPONED: "amber",
};

export const IDENTITY_STATUS_LABEL: Record<string, string> = {
  VERIFIED: "VK подтверждён кандидатом",
  LINK_RESOLVED: "VK по ссылке (не подтверждён)",
  UNRESOLVED: "VK не определён",
  CONFLICT: "Противоречивые данные VK",
  MANUAL: "VK подтверждён вручную",
};

export const USER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Ожидает одобрения",
  ACTIVE: "Активен",
  REJECTED: "Регистрация отклонена",
  BLOCKED: "Заблокирован",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  SUBMITTED: "Заявка подана",
  AUTO_REJECTED: "Автоотказ (ограничение)",
  IDENTITY_CHECK_REQUIRED: "Требуется проверка VK ID",
  IDENTITY_RESOLVED: "VK ID подтверждён",
  SENT_TO_LEADERSHIP: "Отправлена руководству",
  APPROVED: "Принята руководством",
  REJECTED: "Отклонена руководством",
  REJECT_REASON_UPDATED: "Указана причина отказа",
  ASSIGNED: "Взята обзвонщиком",
  REASSIGNED: "Переназначена",
  CALL_STARTED: "Обзвон начат",
  CALL_FINISHED: "Обзвон завершён",
  COOLDOWN_STARTED: "Начато ограничение повторной подачи",
  COOLDOWN_LIFTED: "Ограничение снято",
  COMMENT: "Комментарий",
  CANDIDATE_NOTIFIED: "Отмечено: кандидат уведомлён",
  CANDIDATE_NOTIFIED_CLEARED: "Снята отметка «кандидат уведомлён»",
  DUPLICATE_SUBMISSION: "Повторная отправка (дубликат)",
  CANCELLED: "Заявка отменена",
  DISCORD_LINKED: "Привязан Discord",
  DISCORD_VOICE: "Событие Discord",
};

export const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Принята",
  REJECTED: "Отклонена",
  AUTO_REJECTED: "Автоотказ",
};

export function vkProfileUrl(vkId?: string | null, raw?: string | null): string | null {
  if (vkId) return `https://vk.com/id${vkId}`;
  if (raw) {
    const t = raw.trim();
    if (/^https?:\/\//i.test(t)) return t;
    if (/^(m\.)?vk\.(com|ru)\//i.test(t)) return `https://${t}`;
  }
  return null;
}

const TZ = "Europe/Moscow";

export function formatDate(d: string | Date | null | undefined, tz: string = TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(d),
  );
}

export function formatDateTime(d: string | Date | null | undefined, tz: string = TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${s} с`;
  return `${s} с`;
}
