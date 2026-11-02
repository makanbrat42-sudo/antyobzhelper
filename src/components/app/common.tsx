"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  CALL_OUTCOME_ICON,
  CALL_OUTCOME_LABEL,
  CALL_OUTCOME_TONE,
  vkProfileUrl,
  type Tone,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

const STAT_TONE: Record<Tone, string> = {
  violet: "from-violet-500/25 text-violet-300",
  blue: "from-blue-500/25 text-blue-300",
  cyan: "from-cyan-500/25 text-cyan-300",
  green: "from-emerald-500/25 text-emerald-300",
  amber: "from-amber-500/25 text-amber-300",
  orange: "from-orange-500/25 text-orange-300",
  red: "from-red-500/25 text-red-300",
  gray: "from-zinc-500/25 text-zinc-300",
};

export function StatCard({
  label,
  value,
  icon,
  tone = "violet",
  loading,
  index = 0,
  onClick,
  active,
}: {
  label: string;
  value: number | string | undefined;
  icon?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  index?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 text-left transition",
        onClick ? "cursor-pointer hover:border-primary/40" : "cursor-default",
        active ? "border-primary/60 ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className={cn("pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-xl", STAT_TONE[tone])} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className={cn("[&_svg]:size-4", STAT_TONE[tone].split(" ")[1])}>{icon}</span>}
      </div>
      <div className="relative mt-3 text-2xl font-semibold tabular-nums">{loading ? <Skeleton className="h-8 w-16" /> : (value ?? 0)}</div>
    </motion.button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={APPLICATION_STATUS_TONE[status] ?? "gray"} dot>
      {APPLICATION_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge tone={CALL_OUTCOME_TONE[outcome] ?? "gray"}>
      {CALL_OUTCOME_ICON[outcome]} {CALL_OUTCOME_LABEL[outcome] ?? outcome}
    </Badge>
  );
}

export function VkLink({ vkId, raw, label, className }: { vkId?: string | null; raw?: string | null; label?: string; className?: string }) {
  const url = vkProfileUrl(vkId, raw);
  if (!url) return <span className="text-muted">{raw || "—"}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 text-secondary hover:underline", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {label ?? (vkId ? `id${vkId}` : raw)}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function StaffLink({ user, system }: { user?: { id: string | null; nickname: string } | null; system?: boolean }) {
  if (system) return <Badge tone="orange">Система</Badge>;
  if (!user) return <span className="text-muted">—</span>;
  if (!user.id) return <span>{user.nickname}</span>;
  return (
    <Link href={`/employees/${user.id}`} className="font-medium text-violet-300 hover:underline" onClick={(e) => e.stopPropagation()}>
      {user.nickname}
    </Link>
  );
}

export function CopyButton({ value, label, size = "sm", variant = "secondary" }: { value: string; label: string; size?: "sm" | "default"; variant?: "secondary" | "ghost" }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      disabled={!value}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Скопировано");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Не удалось скопировать");
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted">
      <span>
        Показано {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Назад">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums text-foreground">
          {page} / {pages}
        </span>
        <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Вперёд">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Таблица: на телефоне прокручивается горизонтально. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, onClick, sorted }: { children?: React.ReactNode; className?: string; onClick?: () => void; sorted?: "asc" | "desc" | null }) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "whitespace-nowrap border-b border-border/70 bg-surface/40 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted",
        onClick && "cursor-pointer select-none hover:text-foreground",
        className,
      )}
    >
      {children}
      {sorted && <span className="ml-1 text-primary">{sorted === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-border/40 px-4 py-3 align-middle", className)}>
      {children}
    </td>
  );
}
export function Tr({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cn("transition hover:bg-surface/40", onClick && "cursor-pointer", className)}>
      {children}
    </tr>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
