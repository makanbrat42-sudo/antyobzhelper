"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bot, RefreshCw, RotateCw } from "lucide-react";
import { api, qs } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useAction } from "@/hooks/use-action";
import { useSession } from "@/hooks/use-session";
import { CopyButton, KV, PageHeader, Pagination, StaffLink, Table, TableSkeleton, Td, Th } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { StatusDot, useIntegrationStatus } from "@/components/app/integration-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Switch, Tabs } from "@/components/ui/misc";

type Delivery = {
  id: string;
  kind: string;
  applicationId: number | null;
  status: string;
  attempts: number;
  lastError: string | null;
  errorCode: number | null;
  messageText: string | null;
  createdAt: string;
  sentAt: string | null;
  recipient: { id: string; nickname: string; vkId: string } | null;
};
type EventRow = { id: string; eventType: string; status: string; error: string | null; createdAt: string };

const KIND: Record<string, string> = { APPLICATION_REVIEW: "Заявка", INFO: "Служебное", TEST: "Тест" };

export default function VkBotPage() {
  const { can } = useSession();
  const integrations = can("integrations.manage");
  const status = useIntegrationStatus(true, integrations);
  const [filter, setFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const deliveries = useQuery({
    queryKey: ["deliveries", filter, page],
    queryFn: () => api<{ rows: Delivery[]; total: number; page: number; pageSize: number }>(`/api/integrations/deliveries${qs({ status: filter === "all" ? undefined : filter, page })}`),
    placeholderData: keepPreviousData,
  });
  const events = useQuery({
    queryKey: ["integrations", "events", "VK_CALLBACK"],
    queryFn: () => api<{ rows: EventRow[] }>("/api/integrations/events?source=VK_CALLBACK"),
    enabled: integrations,
  });
  const retry = useAction<{ id: string }>({
    url: "/api/integrations/deliveries",
    success: (r) => ((r as { status: string }).status === "SENT" ? "Доставлено" : "Повторная попытка не удалась"),
    invalidate: [["deliveries"]],
  });
  const toggle = useAction<{ "vkBot.enabled": boolean }>({ url: "/api/settings", method: "PATCH", success: "Сохранено", invalidate: [["integrations"]] });
  const s = status.data?.vkBot;

  return (
    <RequirePerm perm={["integrations.manage", "leadership.manage"]}>
      <PageHeader
        title="VK-бот"
        description="Бот сообщества присылает заявки руководству в личные сообщения. Кандидатам бот не пишет."
        actions={
          <Button variant="secondary" onClick={() => { status.refetch(); deliveries.refetch(); }}>
            <RefreshCw /> Обновить
          </Button>
        }
      />
      {integrations && s && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Статус" />
            <CardBody className="space-y-3">
              <StatusDot ok={s.configured} label={s.configured ? "Ключ сообщества задан" : "VK_GROUP_TOKEN / VK_GROUP_ID не заданы"} />
              <StatusDot ok={s.callbackConfigured} label={s.callbackConfigured ? "Callback API настроен" : "VK_CALLBACK_SECRET / CONFIRMATION не заданы"} />
              {s.group && <StatusDot ok={s.group.ok} label={s.group.ok ? `Сообщество: ${s.group.name}` : `Ошибка VK API: ${s.group.error}`} />}
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-sm">Рассылка заявок включена</span>
                <Switch checked={s.enabled} disabled={!can("system.manage")} onCheckedChange={(v) => toggle.mutate({ "vkBot.enabled": v })} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Настройки Callback API" />
            <CardBody className="space-y-3">
              <KV label="Адрес сервера">
                <span className="break-all font-mono text-xs">{s.endpoint}</span>
              </KV>
              <CopyButton value={s.endpoint} label="Скопировать адрес" />
              <KV label="Group ID">{s.groupId ?? "—"}</KV>
              <p className="text-xs text-muted">Типы событий: message_new, message_event, message_allow, message_deny. Версия API 5.199.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="За 7 дней" />
            <CardBody className="grid grid-cols-2 gap-3">
              <KV label="Доставлено">{s.deliveries7d.SENT ?? 0}</KV>
              <KV label="Ошибок доставки">
                <span className={s.deliveries7d.FAILED ? "text-red-300" : ""}>{s.deliveries7d.FAILED ?? 0}</span>
              </KV>
              <KV label="Событий VK">{Object.values(s.last7d).reduce((a, b) => a + b, 0)}</KV>
              <KV label="Последнее событие">{formatDateTime(s.lastEventAt)}</KV>
            </CardBody>
          </Card>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader
          title="История сообщений и ошибки доставки"
          action={
            <Tabs
              value={filter}
              onValueChange={(v) => { setFilter(v); setPage(1); }}
              items={[
                { value: "all", label: "Все" },
                { value: "FAILED", label: "Ошибки" },
                { value: "SENT", label: "Доставлено" },
              ]}
            />
          }
        />
        {deliveries.isLoading ? (
          <TableSkeleton />
        ) : !deliveries.data?.rows.length ? (
          <EmptyState icon={<Bot />} title="Сообщений нет" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Когда</Th>
                  <Th>Получатель</Th>
                  <Th>Тип</Th>
                  <Th>Заявка</Th>
                  <Th>Статус</Th>
                  <Th>Ошибка</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {deliveries.data.rows.map((d) => (
                  <tr key={d.id} className="hover:bg-surface/40">
                    <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(d.createdAt)}</Td>
                    <Td>
                      <StaffLink user={d.recipient} />
                    </Td>
                    <Td className="text-xs">{KIND[d.kind] ?? d.kind}</Td>
                    <Td>
                      {d.applicationId ? (
                        <Link href={`/applications/${d.applicationId}`} className="font-mono text-violet-300 hover:underline">
                          #{d.applicationId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Badge tone={d.status === "SENT" ? "green" : d.status === "FAILED" ? "red" : "gray"}>
                        {d.status === "SENT" ? "Доставлено" : d.status === "FAILED" ? `Ошибка (${d.attempts})` : "Ожидает"}
                      </Badge>
                    </Td>
                    <Td className="max-w-80 text-xs text-red-300">{d.lastError ?? ""}</Td>
                    <Td className="text-right">
                      {d.status === "FAILED" && (
                        <Button size="sm" variant="ghost" loading={retry.isPending && retry.variables?.id === d.id} onClick={() => retry.mutate({ id: d.id })}>
                          <RotateCw /> Повторить
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={deliveries.data.page} pageSize={deliveries.data.pageSize} total={deliveries.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {integrations && (
        <Card className="mt-5">
          <CardHeader title="Входящие события Callback API" />
          {!events.data?.rows.length ? (
            <EmptyState title="Событий пока нет" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Когда</Th>
                  <Th>Тип</Th>
                  <Th>Статус</Th>
                  <Th>Ошибка</Th>
                </tr>
              </thead>
              <tbody>
                {events.data.rows.map((e) => (
                  <tr key={e.id}>
                    <Td className="text-xs text-muted">{formatDateTime(e.createdAt)}</Td>
                    <Td className="font-mono text-xs">{e.eventType}</Td>
                    <Td>
                      <Badge tone={e.status === "PROCESSED" ? "green" : e.status === "ERROR" ? "red" : "gray"}>{e.status}</Badge>
                    </Td>
                    <Td className="text-xs text-red-300">{e.error ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </RequirePerm>
  );
}
