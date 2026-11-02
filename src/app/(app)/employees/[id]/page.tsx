"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Ban, Pencil, ShieldCheck, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, USER_STATUS_LABEL } from "@/lib/labels";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { useSession } from "@/hooks/use-session";
import { useAction } from "@/hooks/use-action";
import { KV, OutcomeBadge, StatCard, VkLink } from "@/components/app/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/misc";

type Role = { id: string; name: string; kind: "MAIN" | "CALLER"; color: string };
type Profile = {
  user: {
    id: string;
    vkId: string;
    nickname: string;
    avatarUrl: string | null;
    discordId: string | null;
    status: string;
    blockedReason: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    vkMessagesAllowed: boolean | null;
    mainRole: Role | null;
    callerRole: Role | null;
    permissions: PermissionKey[];
    overrides: { key: PermissionKey; granted: boolean }[];
    leadership: { receiveApplications: boolean; canApprove: boolean; canReject: boolean } | null;
  };
  stats: { outcomes: Record<string, number>; decisions: Record<string, number>; activeAssigned: number };
  recentCalls: { id: string; endedAt: string; durationSec: number | null; result: { outcome: string } | null; application: { id: number; nickname: string } }[];
  canManage: boolean;
  canManageRoles: boolean;
};

function EditDialog({ p, open, onOpenChange }: { p: Profile; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api<{ roles: Role[] }>("/api/roles"), enabled: open });
  const [form, setForm] = React.useState({
    nickname: p.user.nickname,
    discordId: p.user.discordId ?? "",
    mainRoleId: p.user.mainRole?.id ?? "",
    callerRoleId: p.user.callerRole?.id ?? "",
  });
  const [overrides, setOverrides] = React.useState<Record<string, boolean | null>>(() => Object.fromEntries(p.user.overrides.map((o) => [o.key, o.granted])));
  const save = useAction({
    url: `/api/employees/${p.user.id}`,
    method: "PATCH",
    success: "Изменения сохранены",
    invalidate: [["employee", p.user.id], ["employees"], ["me"]],
    onSuccess: () => onOpenChange(false),
  });
  const submit = () => {
    const body: Record<string, unknown> = {
      nickname: form.nickname,
      discordId: form.discordId || null,
      mainRoleId: form.mainRoleId || null,
      callerRoleId: form.callerRoleId || null,
    };
    if (p.canManageRoles) {
      body.permissionOverrides = (Object.keys(PERMISSIONS) as PermissionKey[])
        .filter((k) => (overrides[k] ?? null) !== (p.user.overrides.find((o) => o.key === k)?.granted ?? null))
        .map((k) => ({ key: k, granted: overrides[k] ?? null }));
    }
    save.mutate(body);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Редактирование сотрудника"
      className="max-w-2xl"
      footer={
        <Button loading={save.isPending} onClick={submit}>
          Сохранить
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ник">
          <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </Field>
        <Field label="Discord ID" hint="Для будущего Discord-бота">
          <Input value={form.discordId} onChange={(e) => setForm({ ...form, discordId: e.target.value.trim() })} inputMode="numeric" />
        </Field>
        <Field label="Основная должность">
          <NativeSelect value={form.mainRoleId} onChange={(e) => setForm({ ...form, mainRoleId: e.target.value })}>
            <option value="">— Нет —</option>
            {roles?.roles.filter((r) => r.kind === "MAIN").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Должность обзвонщика">
          <NativeSelect value={form.callerRoleId} onChange={(e) => setForm({ ...form, callerRoleId: e.target.value })}>
            <option value="">— Нет —</option>
            {roles?.roles.filter((r) => r.kind === "CALLER").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {p.canManageRoles && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Индивидуальные разрешения</p>
          <p className="mb-3 text-xs text-muted">«По должности» — право определяется должностью. «Выдать» / «Запретить» — переопределяет должность.</p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {(Object.keys(PERMISSIONS) as PermissionKey[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-surface/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs">{k}</p>
                  <p className="truncate text-[11px] text-muted">{PERMISSIONS[k].description}</p>
                </div>
                <NativeSelect
                  className="h-8 w-36 text-xs"
                  value={overrides[k] === true ? "grant" : overrides[k] === false ? "deny" : ""}
                  onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value === "grant" ? true : e.target.value === "deny" ? false : null })}
                >
                  <option value="">По должности</option>
                  <option value="grant">Выдать</option>
                  <option value="deny">Запретить</option>
                </NativeSelect>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ["employee", id], queryFn: () => api<Profile>(`/api/employees/${id}`) });
  const [edit, setEdit] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState("");
  const status = useAction<{ status: "ACTIVE" | "BLOCKED"; blockedReason?: string }>({
    url: `/api/employees/${id}`,
    method: "PATCH",
    success: "Статус изменён",
    invalidate: [["employee", id], ["employees"]],
    onSuccess: () => setBlockOpen(false),
  });

  if (error) return <EmptyState icon={<AlertTriangle />} title="Профиль недоступен" description={(error as Error).message} />;
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  const u = data.user;
  const o = data.stats.outcomes;
  const completed = (o.PASSED ?? 0) + (o.FAILED ?? 0) + (o.REFUSED ?? 0);

  return (
    <div>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Сотрудники
      </Link>
      <Card className="mb-5 overflow-hidden">
        <div className="h-20 bg-brand opacity-40" />
        <div className="-mt-10 flex flex-wrap items-end justify-between gap-4 px-6 pb-5">
          <div className="flex items-end gap-4">
            <Avatar src={u.avatarUrl} name={u.nickname} size={80} className="ring-4 ring-card text-xl" />
            <div className="pb-1">
              <h1 className="text-xl font-semibold">{u.nickname}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <RoleBadge role={u.mainRole} />
                <RoleBadge role={u.callerRole} />
                <Badge tone={u.status === "ACTIVE" ? "green" : u.status === "BLOCKED" ? "red" : "amber"} dot>
                  {USER_STATUS_LABEL[u.status]}
                </Badge>
              </div>
            </div>
          </div>
          {data.canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
                <Pencil /> Изменить
              </Button>
              {u.status === "ACTIVE" && u.id !== me?.id && (
                <Button size="sm" variant="destructive" onClick={() => setBlockOpen(true)}>
                  <Ban /> Заблокировать
                </Button>
              )}
              {u.status === "BLOCKED" && (
                <Button size="sm" variant="success" loading={status.isPending} onClick={() => status.mutate({ status: "ACTIVE" })}>
                  <Unlock /> Разблокировать
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Завершено проверок" value={completed} tone="violet" />
        <StatCard label="Прошли" value={o.PASSED ?? 0} tone="green" />
        <StatCard label="Не прошли" value={o.FAILED ?? 0} tone="red" />
        <StatCard label="Принял заявок" value={data.stats.decisions.APPROVED ?? 0} tone="blue" />
        <StatCard label="В работе сейчас" value={data.stats.activeAssigned} tone="cyan" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Информация" />
          <CardBody className="grid grid-cols-2 gap-4">
            <KV label="VK">
              <VkLink vkId={u.vkId} />
            </KV>
            <KV label="Discord ID">{u.discordId ?? "—"}</KV>
            <KV label="Зарегистрирован">{formatDateTime(u.createdAt)}</KV>
            <KV label="Последний вход">{formatDateTime(u.lastLoginAt)}</KV>
            <KV label="Сообщения от бота">{u.vkMessagesAllowed == null ? "Не проверено" : u.vkMessagesAllowed ? "Разрешены" : "Запрещены"}</KV>
            <KV label="Руководство КП">{u.leadership ? [u.leadership.canApprove && "принимает", u.leadership.canReject && "отклоняет"].filter(Boolean).join(", ") || "получает" : "—"}</KV>
            {u.blockedReason && <KV label="Причина блокировки">{u.blockedReason}</KV>}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Последние проверки" />
          {data.recentCalls.length === 0 ? (
            <EmptyState title="Проверок пока нет" />
          ) : (
            <div className="divide-y divide-border/50">
              {data.recentCalls.map((c) => (
                <Link key={c.id} href={`/applications/${c.application.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-surface/40">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">#{c.application.id}</span>
                    {c.application.nickname}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {formatDuration(c.durationSec)} · {formatDateTime(c.endedAt)}
                    {c.result && <OutcomeBadge outcome={c.result.outcome} />}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {u.permissions.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader title="Итоговые разрешения" description="Права должностей с учётом индивидуальных выдач и запретов" />
            <CardBody className="flex flex-wrap gap-1.5">
              {u.permissions.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px]" title={PERMISSIONS[p]?.description}>
                  <ShieldCheck className="size-3 text-primary" /> {p}
                </span>
              ))}
            </CardBody>
          </Card>
        )}
      </div>

      {edit && <EditDialog p={data} open={edit} onOpenChange={setEdit} />}
      <Dialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Заблокировать ${u.nickname}?`}
        description="Все сессии сотрудника будут завершены, VK-бот перестанет принимать его решения."
        footer={
          <Button variant="destructive" loading={status.isPending} onClick={() => status.mutate({ status: "BLOCKED", blockedReason: blockReason || undefined })}>
            Заблокировать
          </Button>
        }
      >
        <Field label="Причина">
          <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}
