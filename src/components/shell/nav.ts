import {
  LayoutDashboard,
  Inbox,
  PhoneCall,
  ListChecks,
  FileBarChart,
  History,
  Users,
  Trophy,
  UserPlus,
  Crown,
  Bot,
  FileSpreadsheet,
  Settings,
  ScrollText,
  BadgeCheck,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; perm?: PermissionKey[]; badgeKey?: "review" | "queue" | "my" | "registrations" };

export const NAV_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/review", label: "На рассмотрении", icon: Inbox, perm: ["applications.view", "applications.approve", "applications.reject"], badgeKey: "review" },
  { href: "/queue", label: "Ожидают обзвонщика", icon: PhoneCall, perm: ["applications.view", "applications.assign"], badgeKey: "queue" },
  { href: "/my", label: "Мои заявки", icon: ListChecks, perm: ["applications.assign", "calls.start"], badgeKey: "my" },
  { href: "/reports", label: "Отчёт заявок", icon: FileBarChart, perm: ["applications.reports.view"] },
  { href: "/candidates", label: "История кандидатов", icon: History, perm: ["applications.reports.view"] },
  { href: "/employees", label: "Сотрудники", icon: Users, perm: ["employees.view", "employees.manage"] },
  { href: "/rating", label: "Рейтинг обзвонщиков", icon: Trophy },
];

export const NAV_ADMIN: NavItem[] = [
  { href: "/admin/registrations", label: "Регистрации", icon: UserPlus, perm: ["employees.manage"], badgeKey: "registrations" },
  { href: "/admin/leadership", label: "Руководство КП", icon: Crown, perm: ["leadership.manage"] },
  { href: "/admin/roles", label: "Должности и права", icon: BadgeCheck, perm: ["roles.manage"] },
  { href: "/admin/vk-bot", label: "VK-бот", icon: Bot, perm: ["integrations.manage", "leadership.manage"] },
  { href: "/admin/google-forms", label: "Google Forms", icon: FileSpreadsheet, perm: ["integrations.manage"] },
  { href: "/admin/api", label: "API и Discord", icon: KeyRound, perm: ["integrations.manage"] },
  { href: "/admin/settings", label: "Настройки", icon: Settings, perm: ["system.manage"] },
  { href: "/admin/audit", label: "Журнал действий", icon: ScrollText, perm: ["audit.view"] },
];
