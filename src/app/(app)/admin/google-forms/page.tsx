"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Save } from "lucide-react";
import { api, qs } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useAction } from "@/hooks/use-action";
import { useSession } from "@/hooks/use-session";
import { CopyButton, KV, PageHeader, Pagination, Table, TableSkeleton, Td, Th } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { StatusDot, useIntegrationStatus } from "@/components/app/integration-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Switch, Tabs } from "@/components/ui/misc";

type EventRow = { id: string; externalId: string | null; status: string; error: string | null; applicationId: number | null; createdAt: string };

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "nickname", label: "Ник кандидата", hint: "Названия вопросов через запятую" },
  { key: "fullName", label: "ФИО", hint: "Необязательное поле анкеты" },
  { key: "vkProfile", label: "Ссылка на VK", hint: "vk.com/id… или короткое имя" },
  { key: "vkId", label: "VK ID (отдельный вопрос)", hint: "Если в форме есть отдельный вопрос с числовым ID" },
  { key: "linkCode", label: "Код подтверждения VK", hint: "Код со страницы /link — подтверждает владение VK" },
];

const STATUS_TONE = { PROCESSED: "green", DUPLICATE: "amber", REJECTED: "red", ERROR: "red", RECEIVED: "gray" } as const;
const STATUS_LABEL: Record<string, string> = { PROCESSED: "Обработано", DUPLICATE: "Дубликат", REJECTED: "Отклонено", ERROR: "Ошибка", RECEIVED: "Получено" };

export default function GoogleFormsPage() {
  const { can } = useSession();
  const status = useIntegrationStatus();
  const s = status.data?.googleForms;
  const [filter, setFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const events = useQuery({
    queryKey: ["integrations", "events", "GOOGLE_FORMS", filter, page],
    queryFn: () => api<{ rows: EventRow[]; total: number; page: number; pageSize: number }>(`/api/integrations/events${qs({ source: "GOOGLE_FORMS", status: filter === "all" ? undefined : filter, page })}`),
    placeholderData: keepPreviousData,
  });
  const toggle = useAction<{ "googleForms.enabled": boolean }>({ url: "/api/settings", method: "PATCH", success: "Сохранено", invalidate: [["integrations"]] });
  const linkUrl = `${status.data?.appUrl ?? ""}/link`;

  return (
    <RequirePerm perm="integrations.manage">
      <PageHeader title="Google Forms" description="Приём анкет через Google Apps Script. Инструкция по подключению — docs/GOOGLE_FORMS.md." />
      {s && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Статус интеграции" />
            <CardBody className="space-y-3">
              <StatusDot ok={s.configured} label={s.configured ? "GOOGLE_FORMS_SECRET задан" : "GOOGLE_FORMS_SECRET не задан"} />
              <StatusDot ok={!!s.lastEventAt} label={s.lastEventAt ? `Последняя анкета: ${formatDateTime(s.lastEventAt)}` : "Анкеты ещё не поступали"} />
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-sm">Приём анкет включён</span>
                <Switch checked={s.enabled} disabled={!can("system.manage")} onCheckedChange={(v) => toggle.mutate({ "googleForms.enabled": v })} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Адреса" />
            <CardBody className="space-y-3">
              <KV label="Endpoint для Apps Script">
                <span className="break-all font-mono text-xs">{s.endpoint}</span>
              </KV>
              <CopyButton value={s.endpoint} label="Скопировать" />
              <KV label="Страница подтверждения VK для кандидатов">
                <span className="break-all font-mono text-xs">{linkUrl}</span>
              </KV>
              <CopyButton value={linkUrl} label="Скопировать ссылку" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="За 7 дней" />
            <CardBody className="grid grid-cols-2 gap-3">
              {(["PROCESSED", "DUPLICATE", "REJECTED", "ERROR"] as const).map((k) => (
                <KV key={k} label={STATUS_LABEL[k]}>
                  {s.last7d[k] ?? 0}
                </KV>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {s && <FieldMapEditor initial={s.fieldMap} canEdit={can("system.manage")} />}

      <Card className="mt-5">
        <CardHeader
          title="История поступления заявок"
          action={
            <Tabs
              value={filter}
              onValueChange={(v) => { setFilter(v); setPage(1); }}
              items={[
                { value: "all", label: "Все" },
                { value: "PROCESSED", label: "Обработано" },
                { value: "DUPLICATE", label: "Дубликаты" },
                { value: "ERROR", label: "Ошибки" },
                { value: "REJECTED", label: "Отклонено" },
              ]}
            />
          }
        />
        {events.isLoading ? (
          <TableSkeleton />
        ) : !events.data?.rows.length ? (
          <EmptyState icon={<FileSpreadsheet />} title="Событий нет" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Когда</Th>
                  <Th>ID ответа</Th>
                  <Th>Статус</Th>
                  <Th>Заявка</Th>
                  <Th>Комментарий</Th>
                </tr>
              </thead>
              <tbody>
                {events.data.rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface/40">
                    <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.createdAt)}</Td>
                    <Td className="max-w-48 truncate font-mono text-xs">{e.externalId ?? "—"}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[e.status as keyof typeof STATUS_TONE] ?? "gray"}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                    </Td>
                    <Td>
                      {e.applicationId ? (
                        <Link href={`/applications/${e.applicationId}`} className="font-mono text-violet-300 hover:underline">
                          #{e.applicationId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-xs text-muted">{e.error ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </RequirePerm>
  );
}

function FieldMapEditor({ initial, canEdit }: { initial: Record<string, string[]>; canEdit: boolean }) {
  const [map, setMap] = React.useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.join(", ")])));
  const save = useAction({ url: "/api/settings", method: "PATCH", success: "Настройки полей сохранены", invalidate: [["integrations"]] });
  return (
    <Card className="mt-5">
      <CardHeader
        title="Настройка полей"
        description="Система находит нужные ответы по названию вопроса (без учёта регистра и знаков в конце). Остальные вопросы попадают в анкету как есть."
        action={
          canEdit && (
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  "googleForms.fieldMap": Object.fromEntries(FIELDS.map((f) => [f.key, (map[f.key] ?? "").split(",").map((x) => x.trim()).filter(Boolean)])),
                })
              }
            >
              <Save /> Сохранить
            </Button>
          )
        }
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })} disabled={!canEdit} />
          </Field>
        ))}
      </CardBody>
    </Card>
  );
}
