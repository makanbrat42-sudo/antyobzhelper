"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useAction } from "@/hooks/use-action";
import { CopyButton, PageHeader, Table, TableSkeleton, Td, Th } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";

type Token = { id: string; name: string; tokenPrefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; createdBy: { nickname: string } | null };

const ENDPOINTS = [
  ["POST", "/api/service/discord/link", "discord.link", "{ code, discordId } — привязать Discord к подтверждённому VK (код со страницы /link)"],
  ["GET", "/api/service/discord/lookup?kind=candidate&discordId=…", "discord.read", "Кандидат и его активная заявка с обзвонщиком"],
  ["GET", "/api/service/discord/lookup?kind=staff&discordId=…", "discord.read", "Сотрудник и закреплённые за ним заявки"],
  ["POST", "/api/service/discord/voice", "discord.voice", "{ applicationId, type, channelId } — события временного голосового канала"],
];

export default function ApiPage() {
  const { data, isLoading } = useQuery({ queryKey: ["service-tokens"], queryFn: () => api<{ rows: Token[]; scopes: Record<string, string> }>("/api/integrations/service-tokens") });
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("Discord-бот");
  const [scopes, setScopes] = React.useState<string[]>(["discord.link", "discord.read", "discord.voice"]);
  const [issued, setIssued] = React.useState<string | null>(null);
  const create = useAction({
    url: "/api/integrations/service-tokens",
    success: "Токен создан",
    invalidate: [["service-tokens"]],
    onSuccess: (r) => {
      setIssued((r as { token: string }).token);
      setOpen(false);
    },
  });
  const revoke = useAction<{ id: string }>({ url: "/api/integrations/service-tokens", method: "DELETE", success: "Токен отозван", invalidate: [["service-tokens"]] });

  return (
    <RequirePerm perm="integrations.manage">
      <PageHeader
        title="API и Discord"
        description="Сервисные токены для будущего Discord-бота. Бот авторизуется собственным токеном с ограниченными правами, а не токеном администратора."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Новый токен
          </Button>
        }
      />
      <Card>
        <CardHeader title="Сервисные токены" />
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<KeyRound />} title="Токенов нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Название</Th>
                <Th>Токен</Th>
                <Th>Права</Th>
                <Th>Создан</Th>
                <Th>Использован</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id} className={t.revokedAt ? "opacity-50" : "hover:bg-surface/40"}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td className="font-mono text-xs">{t.tokenPrefix}…</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {t.scopes.map((s) => (
                        <Badge key={s} tone="violet">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">
                    {formatDateTime(t.createdAt)} {t.createdBy && `· ${t.createdBy.nickname}`}
                  </Td>
                  <Td className="text-xs text-muted">{formatDateTime(t.lastUsedAt)}</Td>
                  <Td className="text-right">
                    {t.revokedAt ? (
                      <Badge tone="gray">Отозван</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ id: t.id })}>
                        <Trash2 /> Отозвать
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Эндпоинты для Discord-бота" description="Заголовок: Authorization: Bearer aoh_svc_…" />
        <CardBody className="space-y-2">
          {ENDPOINTS.map(([m, path, scope, desc]) => (
            <div key={path} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-xs">
              <Badge tone={m === "GET" ? "blue" : "green"}>{m}</Badge>
              <code className="font-mono">{path}</code>
              <Badge tone="violet">{scope}</Badge>
              <span className="text-muted">{desc}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Новый сервисный токен"
        footer={
          <Button disabled={!name.trim() || !scopes.length} loading={create.isPending} onClick={() => create.mutate({ name, scopes })}>
            Создать
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="space-y-1.5">
            {Object.entries(data?.scopes ?? {}).map(([k, desc]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface/50 px-3 py-2">
                <input type="checkbox" className="mt-0.5 accent-[#8B5CF6]" checked={scopes.includes(k)} onChange={(e) => setScopes(e.target.checked ? [...scopes, k] : scopes.filter((x) => x !== k))} />
                <span>
                  <span className="block font-mono text-xs">{k}</span>
                  <span className="block text-xs text-muted">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)} title="Токен создан" description="Скопируйте токен сейчас — он больше не будет показан. Храните его в переменных окружения бота.">
        <div className="space-y-3">
          <code className="block break-all rounded-lg border border-primary/30 bg-primary/10 p-3 font-mono text-xs">{issued}</code>
          <CopyButton value={issued ?? ""} label="Скопировать токен" />
        </div>
      </Dialog>
    </RequirePerm>
  );
}
