"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Crown, Plus, Send, Trash2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DECISION_LABEL, formatDateTime } from "@/lib/labels";
import { useAction } from "@/hooks/use-action";
import { PageHeader, StaffLink, Table, TableSkeleton, Td, Th, VkLink } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, Switch, Tooltip } from "@/components/ui/misc";

type Member = {
  id: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  vkId: string;
  status: string;
  mainRole: { name: string; color: string } | null;
  receiveApplications: boolean;
  canApprove: boolean;
  canReject: boolean;
  hasApprovePerm: boolean;
  hasRejectPerm: boolean;
  vkMessagesAllowed: boolean | null;
  failedDeliveries: number;
  lastError: string | null;
};
type Decision = { id: string; decision: string; channel: string; reason: string | null; createdAt: string; userNickname: string | null; user: { id: string; nickname: string } | null; application: { id: number; nickname: string; vkId: string | null } };

export default function LeadershipPage() {
  const { data, isLoading } = useQuery({ queryKey: ["leadership"], queryFn: () => api<{ rows: Member[]; decisions: Decision[] }>("/api/leadership") });
  const [addOpen, setAddOpen] = React.useState(false);
  const [newUser, setNewUser] = React.useState("");
  const { data: emps } = useQuery({
    queryKey: ["employees", "ACTIVE"],
    queryFn: () => api<{ rows: { id: string; nickname: string; mainRole: { name: string } | null }[] }>("/api/employees?status=ACTIVE"),
    enabled: addOpen,
  });
  const upsert = useAction<{ userId: string; receiveApplications: boolean; canApprove: boolean; canReject: boolean }>({
    url: "/api/leadership",
    success: "Сохранено",
    invalidate: [["leadership"]],
    onSuccess: () => setAddOpen(false),
  });
  const remove = useAction<{ userId: string }>({ url: "/api/leadership", method: "DELETE", success: "Удалён из руководства КП", invalidate: [["leadership"]] });
  const check = async (userId: string) => {
    try {
      const r = await api<{ allowed: boolean | null; delivery: { status: string; error: string | null } | null }>("/api/leadership/check", { body: { userId, test: true } });
      if (r.delivery?.status === "SENT") toast.success("Тестовое сообщение доставлено");
      else toast.error(r.delivery?.error ?? "Не удалось отправить");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const update = (m: Member, patch: Partial<Pick<Member, "receiveApplications" | "canApprove" | "canReject">>) =>
    upsert.mutate({ userId: m.userId, receiveApplications: m.receiveApplications, canApprove: m.canApprove, canReject: m.canReject, ...patch });

  const existing = new Set(data?.rows.map((r) => r.userId));

  return (
    <RequirePerm perm="leadership.manage">
      <PageHeader
        title="Руководство КП"
        description="Кому VK-бот присылает новые заявки в личные сообщения и кто может нажимать «Принять» / «Отклонить». Полномочия проверяются заново при каждом нажатии."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Добавить сотрудника
          </Button>
        }
      />
      <div className="mb-4 flex gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
        <HelpCircle className="mt-0.5 size-4 shrink-0" />
        Сотрудник должен разрешить сообщения от сообщества VK (кнопка «Разрешить сообщения» в сообществе или написать боту). Кнопка работает, только если есть и флаг здесь, и разрешение RBAC (applications.approve / applications.reject).
      </div>
      <Card>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<Crown />} title="Руководство не назначено" description="Добавьте сотрудников, которым бот будет присылать заявки." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Сотрудник</Th>
                <Th>Должность</Th>
                <Th>Получать заявки</Th>
                <Th>Принимать</Th>
                <Th>Отклонять</Th>
                <Th>Доставка</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id} className="hover:bg-surface/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={m.avatarUrl} name={m.nickname} />
                      <div>
                        <StaffLink user={{ id: m.userId, nickname: m.nickname }} />
                        <div className="text-xs">
                          <VkLink vkId={m.vkId} />
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>{m.mainRole ? <RoleBadge role={m.mainRole} /> : "—"}</Td>
                  <Td>
                    <Switch checked={m.receiveApplications} onCheckedChange={(v) => update(m, { receiveApplications: v })} label="Получать" />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Switch checked={m.canApprove} onCheckedChange={(v) => update(m, { canApprove: v })} label="Принимать" disabled={!m.hasApprovePerm && !m.canApprove} />
                      <span className="text-xs">{m.canApprove ? "Да" : "Нет"}</span>
                      {!m.hasApprovePerm && (
                        <Tooltip content="Нет разрешения applications.approve">
                          <AlertTriangle className="size-3.5 text-amber-400" />
                        </Tooltip>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Switch checked={m.canReject} onCheckedChange={(v) => update(m, { canReject: v })} label="Отклонять" disabled={!m.hasRejectPerm && !m.canReject} />
                      <span className="text-xs">{m.canReject ? "Да" : "Нет"}</span>
                      {!m.hasRejectPerm && (
                        <Tooltip content="Нет разрешения applications.reject">
                          <AlertTriangle className="size-3.5 text-amber-400" />
                        </Tooltip>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {m.vkMessagesAllowed === false ? (
                      <Tooltip content={m.lastError ?? "Сообщения от сообщества запрещены"}>
                        <Badge tone="red">Запрещено</Badge>
                      </Tooltip>
                    ) : m.vkMessagesAllowed ? (
                      <Badge tone="green">
                        <CheckCircle2 className="size-3" /> Разрешено
                      </Badge>
                    ) : (
                      <Badge tone="gray">Не проверено</Badge>
                    )}
                    {m.failedDeliveries > 0 && <p className="mt-1 text-[11px] text-red-300">Ошибок доставки: {m.failedDeliveries}</p>}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip content="Проверить и отправить тестовое сообщение">
                        <Button size="icon-sm" variant="ghost" onClick={() => check(m.userId)}>
                          <Send />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Убрать из руководства">
                        <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate({ userId: m.userId })}>
                          <Trash2 />
                        </Button>
                      </Tooltip>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="История решений" description="Последние 50 решений руководства" />
        {!data?.decisions.length ? (
          <EmptyState title="Решений пока нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Заявка</Th>
                <Th>Кандидат</Th>
                <Th>Решение</Th>
                <Th>Сотрудник</Th>
                <Th>Канал</Th>
                <Th>Когда</Th>
              </tr>
            </thead>
            <tbody>
              {data.decisions.map((d) => (
                <tr key={d.id} className="hover:bg-surface/40">
                  <Td>
                    <Link href={`/applications/${d.application.id}`} className="font-mono text-violet-300 hover:underline">
                      #{d.application.id}
                    </Link>
                  </Td>
                  <Td>{d.application.nickname}</Td>
                  <Td>
                    <Badge tone={d.decision === "APPROVED" ? "green" : "red"}>{DECISION_LABEL[d.decision]}</Badge>
                    {d.reason && <p className="mt-1 max-w-56 truncate text-xs text-muted">{d.reason}</p>}
                  </Td>
                  <Td>
                    <StaffLink user={d.user ?? (d.userNickname ? { id: null, nickname: d.userNickname } : null)} />
                  </Td>
                  <Td className="text-xs text-muted">{d.channel === "VK_BOT" ? "VK-бот" : "Сайт"}</Td>
                  <Td className="text-xs text-muted">{formatDateTime(d.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Добавить в руководство КП"
        description="Флаги «Принимать» / «Отклонять» можно включить, только если у сотрудника есть соответствующее разрешение."
        footer={
          <Button disabled={!newUser} loading={upsert.isPending} onClick={() => upsert.mutate({ userId: newUser, receiveApplications: true, canApprove: false, canReject: false })}>
            Добавить
          </Button>
        }
      >
        <Field label="Сотрудник">
          <NativeSelect value={newUser} onChange={(e) => setNewUser(e.target.value)}>
            <option value="">— Выберите —</option>
            {emps?.rows
              .filter((u) => !existing.has(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname} {u.mainRole ? `· ${u.mainRole.name}` : ""}
                </option>
              ))}
          </NativeSelect>
        </Field>
      </Dialog>
    </RequirePerm>
  );
}
