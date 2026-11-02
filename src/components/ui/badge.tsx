import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const TONES: Record<Tone, string> = {
  gray: "bg-zinc-500/12 text-zinc-300 border-zinc-500/25",
  violet: "bg-violet-500/12 text-violet-300 border-violet-500/30",
  blue: "bg-blue-500/12 text-blue-300 border-blue-500/30",
  cyan: "bg-cyan-500/12 text-cyan-300 border-cyan-500/30",
  green: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/12 text-amber-300 border-amber-500/30",
  orange: "bg-orange-500/12 text-orange-300 border-orange-500/30",
  red: "bg-red-500/12 text-red-300 border-red-500/30",
};

export function Badge({ tone = "gray", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Бейдж должности с настраиваемым цветом. */
export function RoleBadge({ role, className }: { role: { name: string; color: string } | null | undefined; className?: string }) {
  if (!role) return null;
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ color: role.color, borderColor: `${role.color}55`, background: `${role.color}1f` }}
    >
      {role.name}
    </span>
  );
}
