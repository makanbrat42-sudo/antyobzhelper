// Каталог разрешений RBAC. Используется и сервером (проверка), и клиентом (отображение).

export const PERMISSIONS = {
  "applications.view": { group: "Заявки", description: "Просмотр заявок и очереди" },
  "applications.review": { group: "Заявки", description: "Рассмотрение заявок, отметка «Кандидат уведомлён», проверка VK ID" },
  "applications.approve": { group: "Заявки", description: "Принятие заявок" },
  "applications.reject": { group: "Заявки", description: "Отклонение заявок" },
  "applications.assign": { group: "Заявки", description: "Взять заявку на себя" },
  "applications.reassign": { group: "Заявки", description: "Переназначение заявок другим обзвонщикам" },
  "applications.reports.view": { group: "Заявки", description: "Отчёт заявок и история кандидатов" },
  "calls.start": { group: "Обзвоны", description: "Начинать обзвон" },
  "calls.finish": { group: "Обзвоны", description: "Завершать обзвон и сохранять результат" },
  "calls.view_all": { group: "Обзвоны", description: "Просмотр всех обзвонов и заявок любых обзвонщиков" },
  "candidates.cooldown.manage": { group: "Обзвоны", description: "Снятие ограничения повторной подачи" },
  "employees.view": { group: "Сотрудники", description: "Просмотр списка сотрудников" },
  "employees.manage": { group: "Сотрудники", description: "Регистрации, должности, блокировка сотрудников" },
  "roles.manage": { group: "Сотрудники", description: "Управление должностями и разрешениями" },
  "leadership.manage": { group: "Администрирование", description: "Руководство КП: получатели и права VK-бота" },
  "audit.view": { group: "Администрирование", description: "Журнал действий" },
  "integrations.manage": { group: "Администрирование", description: "VK-бот, Google Forms, сервисные токены" },
  "system.manage": { group: "Администрирование", description: "Системные настройки" },
} as const satisfies Record<string, { group: string; description: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(v: string): v is PermissionKey {
  return v in PERMISSIONS;
}

// Должности по умолчанию (создаются при первоначальной настройке, затем редактируются в админ-панели).
export const DEFAULT_ROLES: {
  key: string;
  name: string;
  kind: "MAIN" | "CALLER";
  color: string;
  sortOrder: number;
  permissions: PermissionKey[];
}[] = [
  { key: "trainee", name: "Стажёр", kind: "MAIN", color: "#64748B", sortOrder: 10, permissions: [] },
  { key: "helper", name: "Хелпер", kind: "MAIN", color: "#22C55E", sortOrder: 20, permissions: ["employees.view"] },
  { key: "senior_helper", name: "Старший хелпер", kind: "MAIN", color: "#16A34A", sortOrder: 30, permissions: ["employees.view"] },
  { key: "moderator", name: "Модератор", kind: "MAIN", color: "#0EA5E9", sortOrder: 40, permissions: ["employees.view", "applications.view"] },
  { key: "senior_moderator", name: "Старший модератор", kind: "MAIN", color: "#3B82F6", sortOrder: 50, permissions: ["employees.view", "applications.view"] },
  {
    key: "chief_moderator",
    name: "Главный модератор",
    kind: "MAIN",
    color: "#6366F1",
    sortOrder: 60,
    permissions: ["employees.view", "applications.view", "applications.reports.view"],
  },
  {
    key: "deputy_curator",
    name: "Заместитель куратора",
    kind: "MAIN",
    color: "#A855F7",
    sortOrder: 70,
    permissions: [
      "employees.view",
      "applications.view",
      "applications.review",
      "applications.approve",
      "applications.reject",
      "applications.reassign",
      "applications.reports.view",
      "calls.view_all",
      "audit.view",
    ],
  },
  {
    key: "curator",
    name: "Куратор",
    kind: "MAIN",
    color: "#8B5CF6",
    sortOrder: 80,
    permissions: [
      "employees.view",
      "employees.manage",
      "applications.view",
      "applications.review",
      "applications.approve",
      "applications.reject",
      "applications.reassign",
      "applications.reports.view",
      "calls.view_all",
      "candidates.cooldown.manage",
      "leadership.manage",
      "audit.view",
    ],
  },
  { key: "admin", name: "Администратор", kind: "MAIN", color: "#EF4444", sortOrder: 90, permissions: [...ALL_PERMISSIONS] },
  {
    key: "junior_caller",
    name: "Младший обзвонщик",
    kind: "CALLER",
    color: "#F59E0B",
    sortOrder: 10,
    permissions: ["applications.view", "applications.assign", "calls.start", "calls.finish"],
  },
  {
    key: "senior_caller",
    name: "Старший обзвонщик",
    kind: "CALLER",
    color: "#F97316",
    sortOrder: 20,
    permissions: ["applications.view", "applications.assign", "calls.start", "calls.finish", "applications.reports.view"],
  },
  {
    key: "chief_caller",
    name: "Главный обзвонщик",
    kind: "CALLER",
    color: "#EC4899",
    sortOrder: 30,
    permissions: [
      "applications.view",
      "applications.assign",
      "applications.reassign",
      "calls.start",
      "calls.finish",
      "calls.view_all",
      "applications.reports.view",
    ],
  },
];

export const ADMIN_ROLE_KEY = "admin";
