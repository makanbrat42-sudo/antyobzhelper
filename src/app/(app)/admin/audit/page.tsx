"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api, qs } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { PageHeader, Pagination, StaffLink, Table, TableSkeleton, Td, Th } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";

type Row = {
  id: string;
  actorType: string;
  actorLabel: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  applicationId: number | null;
  result: string;
  details: unknown;
  createdAt: string;
  actor: { id: string; nickname: string } | null;
};

const ACTIONS: Record<string, string> = {
  "auth.login": "Вход в систему",
  "registration.requested": "Заявка на регистрацию",
  "registration.approved": "Регистрация одобрена",
  "registration.rejected": "Регистрация отклонена",
  "setup.claim_admin": "Первоначальная настройка администратора",
  "employee.updated": "Изменён сотрудник",
  "employee.blocked": "Сотрудник заблокирован",
  "employee.unblocked": "Сотрудник разблокирован",
  "role.created": "Создана должность",
  "role.updated": "Изменена должность",
  "role.deleted": "Удалена должность",
  "leadership.updated": "Изменено руководство КП",
  "leadership.removed": "Удалён из руководства КП",
  "application.received": "Получена заявка",
  "application.identity_check": "Заявка на проверку VK ID",
  "application.identity_confirmed": "Подтверждён VK ID",
  "application.duplicate_ignored": "Повторная заявка проигнорирована",
  "application.auto_rejected_cooldown": "Автоотказ (ограничение)",
  "application.approved": "Заявка принята",
  "application.rejected": "Заявка отклонена",
  "application.approve": "Попытка принять заявку",
  "application.reject": "Попытка отклонить заявку",
  "application.reject_reason": "Указана причина отказа",
  "application.claimed": "Заявка взята обзвонщиком",
  "application.reassigned": "Заявка переназначена",
  "application.returned_to_queue": "Заявка возвращена в очередь",
  "application.cancelled": "Заявка отменена",
  "application.comment": "Комментарий",
  "application.notified_set": "Отмечено «кандидат уведомлён»",
  "application.notified_cleared": "Снята отметка «кандидат уведомлён»",
  "call.started": "Обзвон начат",
  "call.finished": "Обзвон завершён",
  "call.postponed": "Обзвон перенесён",
  "cooldown.lifted": "Снято ограничение",
  "settings.updated": "Изменены настройки",
  "vkbot.resend": "Повторная рассылка заявки",
  "vkbot.retry_delivery": "Повтор доставки",
  "vkbot.test_message": "Тестовое сообщение",
  "service_token.created": "Создан сервисный токен",
  "service_token.revoked": "Отозван сервисный токен",
  "report.exported": "Экспорт отчёта",
  "discord.linked": "Привязан Discord",
};

export default function AuditPage() {
  const [f, setF] = React.useState({ action: "", result: "", applicationId: "", page: 1 });
  const { data, isLoading } = useQuery({
    queryKey: ["audit", f],
    queryFn: () => api<{ rows: Row[]; total: number; page: number; pageSize: number }>(`/api/audit${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <RequirePerm perm="audit.view">
      <PageHeader title="Журнал действий" description="Кто, что, когда и с каким результатом" />
      <Card>
        <div className="grid gap-2 border-b border-border/60 p-4 sm:grid-cols-3">
          <NativeSelect value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })}>
            <option value="">Все действия</option>
            {Object.entries(ACTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={f.result} onChange={(e) => setF({ ...f, result: e.target.value, page: 1 })}>
            <option value="">Любой результат</option>
            <option value="SUCCESS">Успешно</option>
            <option value="DENIED">Отказано</option>
            <option value="ERROR">Ошибка</option>
          </NativeSelect>
          <Input placeholder="Номер заявки" value={f.applicationId} onChange={(e) => setF({ ...f, applicationId: e.target.value.replace(/\D/g, ""), page: 1 })} />
        </div>
        {isLoading ? (
          <TableSkeleton rows={10} />
        ) : !data?.rows.length ? (
          <EmptyState icon={<ScrollText />} title="Записей нет" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Когда</Th>
                  <Th>Кто</Th>
                  <Th>Действие</Th>
                  <Th>Заявка</Th>
                  <Th>Результат</Th>
                  <Th>Детали</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface/40">
                    <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
                    <Td>
                      {r.actorType === "SYSTEM" ? (
                        <Badge tone="orange">Система</Badge>
                      ) : r.actor ? (
                        <span className="flex items-center gap-1.5">
                          <StaffLink user={r.actor} />
                          {r.actorType === "BOT" && <Badge tone="blue">VK-бот</Badge>}
                        </span>
                      ) : (
                        <span className="text-xs">{r.actorLabel ?? r.actorType}</span>
                      )}
                    </Td>
                    <Td>
                      <div>{ACTIONS[r.action] ?? r.action}</div>
                      <div className="font-mono text-[10px] text-muted">{r.action}</div>
                    </Td>
                    <Td>
                      {r.applicationId ? (
                        <Link href={`/applications/${r.applicationId}`} className="font-mono text-violet-300 hover:underline">
                          #{r.applicationId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Badge tone={r.result === "SUCCESS" ? "green" : r.result === "DENIED" ? "amber" : "red"}>
                        {r.result === "SUCCESS" ? "Успешно" : r.result === "DENIED" ? "Отказано" : "Ошибка"}
                      </Badge>
                    </Td>
                    <Td className="max-w-72">
                      {r.details ? <code className="block truncate font-mono text-[11px] text-muted" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</code> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ ...f, page: p })} />
          </>
        )}
      </Card>
    </RequirePerm>
  );
}
