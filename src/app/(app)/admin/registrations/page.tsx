"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useAction } from "@/hooks/use-action";
import { PageHeader, StaffLink, Table, TableSkeleton, Td, Th, VkLink } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, Tabs } from "@/components/ui/misc";

type Req = {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  comment: string | null;
  user: { id: string; vkId: string; nickname: string; avatarUrl: string | null };
  reviewedBy: { id: string; nickname: string } | null;
};
type Role = { id: string; name: string; kind: string };

function ReviewDialog({ req, approve, onClose }: { req: Req; approve: boolean; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["roles"], queryFn: () => api<{ roles: Role[] }>("/api/roles") });
  const [mainRoleId, setMain] = React.useState("");
  const [callerRoleId, setCaller] = React.useState("");
  const [comment, setComment] = React.useState("");
  const act = useAction({
    url: `/api/registrations/${req.id}`,
    success: approve ? `${req.user.nickname} принят в систему` : "Регистрация отклонена",
    invalidate: [["registrations"], ["employees"]],
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={approve ? `Одобрить регистрацию: ${req.user.nickname}` : `Отклонить регистрацию: ${req.user.nickname}`}
      description={approve ? "Права определяются должностями. Должности можно изменить позже в профиле." : undefined}
      footer={
        <Button
          variant={approve ? "default" : "destructive"}
          loading={act.isPending}
          onClick={() => act.mutate({ approve, comment: comment || undefined, mainRoleId: mainRoleId || null, callerRoleId: callerRoleId || null })}
        >
          {approve ? "Одобрить" : "Отклонить"}
        </Button>
      }
    >
      <div className="space-y-3">
        {approve && (
          <>
            <Field label="Основная должность">
              <NativeSelect value={mainRoleId} onChange={(e) => setMain(e.target.value)}>
                <option value="">— Без должности —</option>
                {data?.roles.filter((r) => r.kind === "MAIN").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Должность обзвонщика (необязательно)">
              <NativeSelect value={callerRoleId} onChange={(e) => setCaller(e.target.value)}>
                <option value="">— Нет —</option>
                {data?.roles.filter((r) => r.kind === "CALLER").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </NativeSelect>
            </Field>
          </>
        )}
        <Field label="Комментарий">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export default function RegistrationsPage() {
  const [status, setStatus] = React.useState("PENDING");
  const [dlg, setDlg] = React.useState<{ req: Req; approve: boolean } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["registrations", status], queryFn: () => api<{ rows: Req[] }>(`/api/registrations?status=${status}`) });
  return (
    <RequirePerm perm="employees.manage">
      <PageHeader title="Заявки на регистрацию" description="Сотрудники, впервые вошедшие через VK ID. Права не выдаются автоматически." />
      <Card>
        <div className="border-b border-border/60 p-4">
          <Tabs
            value={status}
            onValueChange={setStatus}
            items={[
              { value: "PENDING", label: "Ожидают" },
              { value: "APPROVED", label: "Одобренные" },
              { value: "REJECTED", label: "Отклонённые" },
              { value: "all", label: "Все" },
            ]}
          />
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<UserPlus />} title="Заявок нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Сотрудник</Th>
                <Th>VK</Th>
                <Th>Подана</Th>
                <Th>Статус</Th>
                <Th>Рассмотрел</Th>
                <Th className="text-right">Действие</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={r.user.avatarUrl} name={r.user.nickname} />
                      <span className="font-medium">{r.user.nickname}</span>
                    </div>
                  </Td>
                  <Td>
                    <VkLink vkId={r.user.vkId} />
                  </Td>
                  <Td className="text-muted">{formatDateTime(r.createdAt)}</Td>
                  <Td>
                    <Badge tone={r.status === "PENDING" ? "amber" : r.status === "APPROVED" ? "green" : "red"}>
                      {r.status === "PENDING" ? "Ожидает" : r.status === "APPROVED" ? "Одобрена" : "Отклонена"}
                    </Badge>
                    {r.comment && <p className="mt-1 text-xs text-muted">{r.comment}</p>}
                  </Td>
                  <Td>
                    <StaffLink user={r.reviewedBy} />
                    {r.reviewedAt && <p className="text-[11px] text-muted">{formatDateTime(r.reviewedAt)}</p>}
                  </Td>
                  <Td className="text-right">
                    {r.status === "PENDING" && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="success" onClick={() => setDlg({ req: r, approve: true })}>
                          <Check /> Принять
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDlg({ req: r, approve: false })}>
                          <X /> Отклонить
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {dlg && <ReviewDialog req={dlg.req} approve={dlg.approve} onClose={() => setDlg(null)} />}
    </RequirePerm>
  );
}
