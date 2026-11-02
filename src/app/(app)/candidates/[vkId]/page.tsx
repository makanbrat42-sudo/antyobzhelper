"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarClock, ShieldCheck, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import { DECISION_LABEL, EVENT_TYPE_LABEL, formatDateTime, formatDuration } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { useAction } from "@/hooks/use-action";
import { KV, OutcomeBadge, PageHeader, StaffLink, StatusBadge, Table, Td, Th, Tr, VkLink } from "@/components/app/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";

type Ref = { id: string; nickname: string } | null;
type History = {
  candidate: { id: string; vkId: string; vkScreenName: string | null; nickname: string | null; fullName: string | null; discordId: string | null; vkVerifiedAt: string | null; createdAt: string };
  restriction: { active: boolean; lastFailedAt: string | null; allowedFrom: string | null };
  applications: {
    id: number;
    status: string;
    submittedAt: string;
    nickname: string;
    decision: { decision: string; source: string; userNickname: string | null; user: Ref; reason: string | null; createdAt: string } | null;
    callSessions: { id: string; startedAt: string; endedAt: string | null; durationSec: number | null; caller: Ref; result: { outcome: string; reason: string | null } | null }[];
  }[];
  cooldowns: { id: string; failedAt: string; endsAt: string; liftedAt: string | null; liftReason: string | null; liftedBy: Ref }[];
  events: { id: string; type: string; createdAt: string; actorType: string; actor: Ref; comment: string | null; applicationId: number | null }[];
};

export default function CandidatePage() {
  const { vkId } = useParams<{ vkId: string }>();
  const { can } = useSession();
  const router = useRouter();
  const [now] = React.useState(() => Date.now());
  const { data, isLoading, error } = useQuery({ queryKey: ["candidate", vkId], queryFn: () => api<History>(`/api/candidates/${vkId}`) });
  const [lift, setLift] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const liftAct = useAction<{ reason: string }>({
    url: () => `/api/cooldowns/${lift}/lift`,
    success: "Ограничение снято",
    invalidate: [["candidate", vkId]],
    onSuccess: () => {
      setLift(null);
      setReason("");
    },
  });

  if (error) return <EmptyState icon={<AlertTriangle />} title="Кандидат не найден" description={`VK ID ${vkId}: ${(error as Error).message}`} />;
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  const c = data.candidate;
  const calls = data.applications.flatMap((a) => a.callSessions.map((s) => ({ ...s, applicationId: a.id })));

  return (
    <div>
      <Link href="/candidates" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Все кандидаты
      </Link>
      <PageHeader title={c.nickname ?? `id${c.vkId}`} description={<VkLink vkId={c.vkId} label={`vk.com/id${c.vkId}`} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Кандидат" />
          <CardBody className="grid grid-cols-2 gap-4">
            <KV label="VK ID">{c.vkId}</KV>
            <KV label="Короткое имя">{c.vkScreenName ?? "—"}</KV>
            <KV label="ФИО">{c.fullName ?? "—"}</KV>
            <KV label="Discord">{c.discordId ?? "—"}</KV>
            <KV label="VK подтверждён">
              {c.vkVerifiedAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <ShieldCheck className="size-3.5" /> {formatDateTime(c.vkVerifiedAt)}
                </span>
              ) : (
                "Нет"
              )}
            </KV>
            <KV label="Первая заявка">{formatDateTime(c.createdAt)}</KV>
          </CardBody>
        </Card>

        <Card className={data.restriction.active ? "border-orange-500/40" : ""}>
          <CardHeader title="Ограничение повторной подачи" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className={data.restriction.active ? "size-5 text-orange-300" : "size-5 text-emerald-300"} />
              {data.restriction.active ? <Badge tone="orange">Действует</Badge> : <Badge tone="green">Нет ограничений</Badge>}
            </div>
            <KV label="Последний неуспешный обзвон">{formatDateTime(data.restriction.lastFailedAt)}</KV>
            <KV label="Повторная подача разрешена с">{data.restriction.allowedFrom ? formatDateTime(data.restriction.allowedFrom) : "Сейчас"}</KV>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ограничения (все)" />
          {data.cooldowns.length === 0 ? (
            <EmptyState title="Ограничений не было" />
          ) : (
            <div className="divide-y divide-border/50">
              {data.cooldowns.map((cd) => {
                const active = !cd.liftedAt && new Date(cd.endsAt).getTime() > now;
                return (
                  <div key={cd.id} className="px-5 py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {formatDateTime(cd.failedAt)} → {formatDateTime(cd.endsAt)}
                      </span>
                      {cd.liftedAt ? <Badge tone="gray">Снято</Badge> : active ? <Badge tone="orange">Активно</Badge> : <Badge tone="green">Истекло</Badge>}
                    </div>
                    {cd.liftedAt && (
                      <p className="mt-1 text-muted">
                        Снял {cd.liftedBy?.nickname}: {cd.liftReason}
                      </p>
                    )}
                    {active && can("candidates.cooldown.manage") && (
                      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => setLift(cd.id)}>
                        <Unlock /> Снять ограничение
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Все заявки и решения руководства" />
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Дата</Th>
              <Th>Статус</Th>
              <Th>Решение</Th>
              <Th>Кто принял / отказал</Th>
              <Th>Причина</Th>
            </tr>
          </thead>
          <tbody>
            {data.applications.map((a) => (
              <Tr key={a.id} onClick={() => router.push(`/applications/${a.id}`)}>
                <Td className="font-mono text-muted">#{a.id}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(a.submittedAt)}</Td>
                <Td>
                  <StatusBadge status={a.status} />
                </Td>
                <Td>{a.decision ? DECISION_LABEL[a.decision.decision] : "—"}</Td>
                <Td>
                  <StaffLink user={a.decision?.user ?? (a.decision?.userNickname ? { id: null, nickname: a.decision.userNickname } : null)} system={a.decision?.source === "SYSTEM"} />
                </Td>
                <Td className="max-w-72 truncate text-xs text-muted">{a.decision?.reason ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Все обзвоны и результаты" />
          {calls.length === 0 ? (
            <EmptyState title="Обзвонов не было" />
          ) : (
            <div className="divide-y divide-border/50">
              {calls.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    {s.result ? <OutcomeBadge outcome={s.result.outcome} /> : <Badge tone="cyan">Идёт</Badge>}
                    <span className="font-mono text-xs text-muted">#{s.applicationId}</span>
                    <StaffLink user={s.caller} />
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{formatDateTime(s.endedAt ?? s.startedAt)}</p>
                    <p>{formatDuration(s.durationSec)}</p>
                  </div>
                  {s.result?.reason && <p className="w-full text-xs text-muted">{s.result.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Хронология событий" />
          <div className="max-h-[480px] space-y-3 overflow-y-auto p-5">
            {data.events.map((e) => (
              <div key={e.id} className="relative border-l border-border pl-4 text-xs">
                <span className="absolute -left-[4.5px] top-1 size-2 rounded-full bg-primary" />
                <p className="text-sm">
                  {EVENT_TYPE_LABEL[e.type] ?? e.type}
                  {e.applicationId && <span className="ml-1 font-mono text-muted">#{e.applicationId}</span>}
                </p>
                <p className="text-muted">
                  {formatDateTime(e.createdAt)} · {e.actor?.nickname ?? (e.actorType === "SYSTEM" ? "Система" : e.actorType === "SERVICE" ? "Сервис" : "—")}
                </p>
                {e.comment && <p className="mt-0.5 text-muted/90">{e.comment}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog
        open={!!lift}
        onOpenChange={(v) => !v && setLift(null)}
        title="Снять ограничение"
        description="Кандидат сможет подать заявку сразу. Действие записывается в журнал."
        footer={
          <Button disabled={!reason.trim()} loading={liftAct.isPending} onClick={() => liftAct.mutate({ reason })}>
            Снять
          </Button>
        }
      >
        <Field label="Причина">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}
