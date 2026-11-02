"use client";

import * as React from "react";
import { Switch as S, Tabs as T, DropdownMenu as DM, Tooltip as TT } from "radix-ui";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-surface", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-2 transition data-[state=checked]:border-primary/50 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Tabs({ value, onValueChange, items, className }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: React.ReactNode }[]; className?: string }) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className={cn("inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface/60 p-1", className)}>
        {items.map((i) => (
          <T.Trigger
            key={i.value}
            value={i.value}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow"
          >
            {i.label}
          </T.Trigger>
        ))}
      </T.List>
    </T.Root>
  );
}

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;
export function DropdownContent({ children, align = "end" }: { children: React.ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-lg border border-border bg-card p-1 shadow-xl shadow-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function DropdownItem({ children, onSelect, danger }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean }) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition data-[highlighted]:bg-surface [&_svg]:size-4",
        danger ? "text-danger" : "text-foreground",
      )}
    >
      {children}
    </DM.Item>
  );
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TT.Provider delayDuration={200}>
      <TT.Root>
        <TT.Trigger asChild>{children}</TT.Trigger>
        <TT.Portal>
          <TT.Content sideOffset={6} className="z-50 max-w-xs rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground shadow-lg">
            {content}
          </TT.Content>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}

export function Avatar({ src, name, size = 32, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-[11px] font-semibold text-white ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-2 rounded-xl border border-border bg-surface p-3 text-muted [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
