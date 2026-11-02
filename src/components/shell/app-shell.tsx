"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, X, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { useRealtime } from "@/hooks/use-realtime";
import { Avatar, Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/misc";
import { RoleBadge } from "@/components/ui/badge";
import { NAV_ADMIN, NAV_MAIN, type NavItem } from "./nav";

type Counters = { review: number; queue: number; my: number; registrations: number; unread: number };

function Logo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-8 rounded-lg object-cover" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand shadow-lg shadow-primary/30">
          <ShieldCheck className="size-4.5 text-white" />
        </span>
      )}
      <span className="text-[15px] font-semibold tracking-tight">{name}</span>
    </Link>
  );
}

function NavLink({ item, active, count, onClick }: { item: NavItem; active: boolean; count?: number; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
        active ? "text-foreground" : "text-muted hover:bg-surface/70 hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/20 to-secondary/5"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className={cn("relative size-4 shrink-0", active ? "text-primary" : "")} />
      <span className="relative flex-1 truncate">{item.label}</span>
      {!!count && (
        <span className="relative min-w-5 rounded-full bg-primary/20 px-1.5 text-center text-[11px] font-semibold text-violet-200">{count}</span>
      )}
    </Link>
  );
}

function Sidebar({ counters, onNavigate }: { counters?: Counters; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, me } = useSession();
  const visible = (items: NavItem[]) => items.filter((i) => !i.perm || can(i.perm));
  const admin = visible(NAV_ADMIN);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <Logo name={me?.site.name ?? "AntyObzhelp"} logoUrl={me?.site.logoUrl} />
      <nav className="flex flex-col gap-0.5">
        {visible(NAV_MAIN).map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} count={i.badgeKey ? counters?.[i.badgeKey] : undefined} onClick={onNavigate} />
        ))}
      </nav>
      {admin.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">Администрирование</p>
          <nav className="flex flex-col gap-0.5">
            {admin.map((i) => (
              <NavLink key={i.href} item={i} active={isActive(i.href)} count={i.badgeKey ? counters?.[i.badgeKey] : undefined} onClick={onNavigate} />
            ))}
          </nav>
        </div>
      )}
      <div className="mt-auto rounded-xl border border-border bg-surface/50 p-3 text-xs text-muted">
        Кандидатам не отправляется никаких автоматических сообщений. Решения сообщает руководство лично.
      </div>
    </div>
  );
}

function Notifications({ unread }: { unread: number }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ rows: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }[] }>("/api/notifications"),
    enabled: open,
  });
  const markAll = async () => {
    await api("/api/notifications", { body: {} });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["counters"] });
  };
  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        <button className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/60 text-muted transition hover:text-foreground" aria-label="Уведомления">
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4.5 rounded-full bg-primary px-1 text-[10px] font-bold leading-4.5 text-white">{unread}</span>}
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <div className="w-80">
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && (
              <button onClick={markAll} className="cursor-pointer text-xs text-primary hover:underline">
                Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data && <div className="flex justify-center p-4"><Loader2 className="size-4 animate-spin text-muted" /></div>}
            {data?.rows.length === 0 && <p className="px-2.5 py-6 text-center text-xs text-muted">Уведомлений нет</p>}
            {data?.rows.map((n) => (
              <DropdownItem key={n.id} onSelect={() => n.link && router.push(n.link)}>
                <div className="flex w-full flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {!n.readAt && <span className="size-1.5 rounded-full bg-primary" />}
                    <span className="text-sm">{n.title}</span>
                  </div>
                  {n.body && <span className="text-xs text-muted">{n.body}</span>}
                  <span className="text-[11px] text-muted/70">{formatDateTime(n.createdAt)}</span>
                </div>
              </DropdownItem>
            ))}
          </div>
        </div>
      </DropdownContent>
    </Dropdown>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, me, isLoading, error } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const active = user?.status === "ACTIVE";
  useRealtime(active);

  const counters = useQuery({
    queryKey: ["counters", pathname],
    queryFn: () => api<Counters>("/api/counters"),
    enabled: active,
    refetchInterval: 60_000,
  });
  React.useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (user.status !== "ACTIVE") router.replace("/pending");
  }, [isLoading, user, router]);

  React.useEffect(() => {
    if (me?.site.accentColor) document.documentElement.style.setProperty("--primary", me.site.accentColor);
    if (me?.site.accentColor2) document.documentElement.style.setProperty("--secondary", me.site.accentColor2);
  }, [me?.site.accentColor, me?.site.accentColor2]);

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Не удалось загрузить данные: {(error as Error).message}</div>;
  }
  if (isLoading || !active) {
    return (
      <div className="app-glow flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    qc.clear();
    toast.success("Вы вышли из системы");
    router.replace("/login");
  };

  return (
    <div className="app-glow min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border/70 bg-[#0c0c14]/90 backdrop-blur lg:block">
        <Sidebar counters={counters.data} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-[#0c0c14] lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <button className="absolute right-3 top-4 cursor-pointer p-1 text-muted" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню">
                <X className="size-5" />
              </button>
              <Sidebar counters={counters.data} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <button className="cursor-pointer rounded-lg p-2 text-muted hover:bg-surface lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Меню">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Notifications unread={counters.data?.unread ?? 0} />
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface/60 py-1 pl-1 pr-3 transition hover:bg-surface">
                <Avatar src={user.avatarUrl} name={user.nickname} size={28} />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-36 truncate text-sm leading-tight">{user.nickname}</span>
                  <span className="block text-[11px] leading-tight text-muted">{user.mainRole?.name ?? "Без должности"}</span>
                </span>
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <div className="px-2.5 py-2">
                <p className="text-sm font-medium">{user.nickname}</p>
                <p className="text-xs text-muted">VK ID: {user.vkId}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <RoleBadge role={user.mainRole} />
                  <RoleBadge role={user.callerRole} />
                </div>
              </div>
              <DropdownItem onSelect={() => router.push(`/employees/${user.id}`)}>Мой профиль</DropdownItem>
              <DropdownItem onSelect={logout} danger>
                <LogOut /> Выйти
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <React.Suspense fallback={<Loader2 className="mx-auto mt-20 size-6 animate-spin text-primary" />}>{children}</React.Suspense>
        </main>
      </div>
    </div>
  );
}
