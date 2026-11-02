import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted/70 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 [color-scheme:dark]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function NativeSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
