"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { PermissionKey } from "@/lib/permissions";
import { useAction } from "@/hooks/use-action";
import { useSession } from "@/hooks/use-session";
import { PageHeader } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card, CardHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Role = { id: string; key: string; name: string; kind: "MAIN" | "CALLER"; color: string; sortOrder: number; isSystem: boolean; users: number; permissions: PermissionKey[] };
type Resp = { roles: Role[]; permissions: Record<PermissionKey, { group: string; description: string }> };

function RoleDialog({ role, kind, catalog, onClose }: { role: Role | null; kind: "MAIN" | "CALLER"; catalog: Resp["permissions"]; onClose: () => void }) {
  const { user } = useSession();
  const [name, setName] = React.useState(role?.name ?? "");
  const [color, setColor] = React.useState(role?.color ?? "#8B5CF6");
  const [sortOrder, setSort] = React.useState(role?.sortOrder ?? 100);
  const [perms, setPerms] = React.useState<Set<PermissionKey>>(new Set(role?.permissions ?? []));
  const isAdmin = role?.key === "admin";
  const save = useAction({
    url: role ? `/api/roles/${role.id}` : "/api/roles",
    method: role ? "PATCH" : "POST",
    success: "Должность сохранена",
    invalidate: [["roles"], ["me"]],
    onSuccess: onClose,
  });
  const groups = Object.entries(catalog).reduce<Record<string, PermissionKey[]>>((acc, [k, v]) => {
    (acc[v.group] ??= []).push(k as PermissionKey);
    return acc;
  }, {});
  const toggle = (k: PermissionKey) => {
    const n = new Set(perms);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPerms(n);
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={role ? `Должность: ${role.name}` : kind === "MAIN" ? "Новая основная должность" : "Новая должность обзвонщика"}
      className="max-w-2xl"
      footer={
        <Button
          disabled={!name.trim()}
          loading={save.isPending}
          onClick={() => save.mutate({ name, color, sortOrder, ...(isAdmin ? {} : { permissions: [...perms] }), ...(role ? {} : { kind }) })}
        >
          Сохранить
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_100px]">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Цвет бейджа">
          <div className="flex gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-9 w-10 cursor-pointer rounded-md border border-border bg-surface" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
          </div>
        </Field>
        <Field label="Порядок">
          <Input type="number" value={sortOrder} onChange={(e) => setSort(Number(e.target.value))} />
        </Field>
      </div>
      <div className="mt-3">
        Предпросмотр: <RoleBadge role={{ name: name || "Должность", color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#8B5CF6" }} />
      </div>
      <div className="mt-5 space-y-4">
        {isAdmin && <p className="text-xs text-muted">Должность администратора всегда имеет все разрешения.</p>}
        {Object.entries(groups).map(([g, keys]) => (
          <div key={g}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {keys.map((k) => {
                const mine = user?.permissions.includes(k);
                const on = isAdmin || perms.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={isAdmin || (!mine && !perms.has(k))}
                    onClick={() => toggle(k)}
                    title={!mine ? "Нельзя выдать разрешение, которого нет у вас" : undefined}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                      on ? "border-primary/50 bg-primary/10" : "border-border bg-surface/50 hover:border-primary/30",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]", on ? "border-primary bg-primary text-white" : "border-border")}>{on ? "✓" : ""}</span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px]">{k}</span>
                      <span className="block text-[11px] text-muted">{catalog[k].description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export default function RolesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["roles"], queryFn: () => api<Resp>("/api/roles") });
  const [dlg, setDlg] = React.useState<{ role: Role | null; kind: "MAIN" | "CALLER" } | null>(null);
  const del = useAction<{ id: string }>({ url: (b) => `/api/roles/${b.id}`, method: "DELETE", success: "Должность удалена", invalidate: [["roles"]] });

  const section = (kind: "MAIN" | "CALLER", title: string) => (
    <Card>
      <CardHeader
        title={title}
        action={
          <Button size="sm" variant="secondary" onClick={() => setDlg({ role: null, kind })}>
            <Plus /> Добавить
          </Button>
        }
      />
      <div className="divide-y divide-border/50">
        {isLoading && <Skeleton className="m-4 h-32" />}
        {data?.roles
          .filter((r) => r.kind === kind)
          .map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <RoleBadge role={r} />
                {r.isSystem && <Lock className="size-3.5 text-muted" />}
                <span className="text-xs text-muted">
                  {r.users} сотр. · {r.key === "admin" ? "все права" : `${r.permissions.length} прав`}
                </span>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setDlg({ role: r, kind })} aria-label="Изменить">
                  <Pencil />
                </Button>
                {!r.isSystem && (
                  <Button size="icon-sm" variant="ghost" disabled={r.users > 0} onClick={() => del.mutate({ id: r.id })} aria-label="Удалить">
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>
    </Card>
  );

  return (
    <RequirePerm perm="roles.manage">
      <PageHeader title="Должности и права" description="RBAC: права задаются разрешениями должности, а не её названием. Индивидуальные права — в профиле сотрудника." />
      <div className="grid gap-4 lg:grid-cols-2">
        {section("MAIN", "Основные должности")}
        {section("CALLER", "Должности обзвонщиков")}
      </div>
      {dlg && data && <RoleDialog role={dlg.role} kind={dlg.kind} catalog={data.permissions} onClose={() => setDlg(null)} />}
    </RequirePerm>
  );
}
