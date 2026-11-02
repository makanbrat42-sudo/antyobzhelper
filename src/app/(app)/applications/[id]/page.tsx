"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BellRing, History, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import {
  DECISION_LABEL,
  EVENT_TYPE_LABEL,
  formatDateTime,
  formatDuration,
  IDENTITY_STATUS_LABEL,
  vkProfileUrl,
} from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { useAction } from "@/hooks/use-action";
import { CopyButton, KV, OutcomeBadge, PageHeader, StaffLink, StatusBadge, VkLink } from "@/components/app/common";
import {
  CallButtons,
  CancelButton,
  ClaimButton,
  CommentButton,
  DecisionButtons,
  IdentityButton,
  ReassignButton,
  ResendButton,
  type AppCan,
} from "@/components/app/application-actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Skeleton, Switch } from "@/components/ui/misc";

type Ref = { id: string; nickname: string; avatarUrl?: string | null } | null;

type Detail = {
  application: {
    id: number;
    nickname: string;
    fullName: string | null;
    vkId: string | null;
    vkProfileRaw: string | null;
    source: string;
    status: string;
    identityStatus: string;
    identityNote: string | null;
    submittedAt: string;
    receivedAt: string;
    decidedAt: string | null;
    decisionSource: string | null;
    rejectReason: string | null;
    cooldownLastFailedAt: string | null;
    cooldownUntil: string | null;
    assignedAt: string | null;
    completedAt: string | null;
    candidateNotified: boolean;
    candidateNotifiedAt: string | null;
    candidateNotifiedBy: Ref;
    currentAssignee: Ref;
    candidate: { id: string; vkId: string; vkVerifiedAt: string | null; discordId: string | null } | null;
    answers: { id: string; question: string; answer: string }[];
    decision: { decision: string; source: string; channel: string; reason: string | null; createdAt: string; userNickname: string | null; user: Ref } | null;
    assignments: { id: string; kind: string; assignedAt: string; releasedAt: string | null; user: Ref; assignedBy: Ref }[];
    callSessions: {
      id: string;
      status: string;
      startedAt: string;
      endedAt: string | null;
      durationSec: number | null;
      caller: Ref;
      result: { outcome: string; reason: string | null; comment: string | null } | null;
    }[];
    comments: { id: string; text: string; createdAt: string; author: Ref }[];
    events: { id: string; type: string; actorType: string; actor: Ref; comment: string | null; createdAt: string }[];
    deliveries: { id: string; status: string; lastError: string | null; sentAt: string | null; createdAt: string; recipient: Ref }[];
  };
  previous: { id: number; status: string; submittedAt: string; callSessions: { endedAt: string | null; result: { outcome: string } | null }[] }[];
  can: AppCan;
};

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can: canPerm } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ["application", id], queryFn: () => api<Detail>(`/api/applications/${id}`) });
  const notified = useAction<{ notified: boolean }>({
    url: `/api/applications/${id}/notified`,
    success: "Отметка сохранена",
    invalidate: [["application", id], ["report"]],
  });

  if (error) return <EmptyState icon={<AlertTriangle />} title="Заявка недоступна" description={(error as Error).message} />;
  if (isLoading || !data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const a = data.application;
  const c = data.can;
  const vkUrl = vkProfileUrl(a.vkId, a.vkProfileRaw) ?? "";
  const decidedBy = a.decision?.user ?? (a.decision?.userNickname ? { id: null, nickname: a.decision.userNickname } : null);

  return (
    <div>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>
        <ArrowLeft className="size-3.5" /> Назад
      </Link>
      <PageHeader
        title={`Заявка #${a.id}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {a.nickname} <StatusBadge status={a.status} />
          </span>
        }
        actions={
          <>
            {(c.approve || c.reject) && <DecisionButtons id={a.id} can={c} />}
            {c.claim && <ClaimButton id={a.id} />}
            <CallButtons id={a.id} can={c} cooldownHours={me?.site.cooldownHours} />
            {c.reassign && <ReassignButton id={a.id} currentAssigneeId={a.currentAssignee?.id} />}
            {c.comment && <CommentButton id={a.id} />}
            {c.confirmIdentity && <IdentityButton id={a.id} suggestedVkId={a.vkId} />}
            {a.status === "PENDING_REVIEW" && canPerm(["integrations.manage", "leadership.manage"]) && <ResendButton id={a.id} />}
            {c.cancel && <CancelButton id={a.id} />}
          </>
        }
      />

      {a.status === "IDENTITY_CHECK" && (
        <div className="mb-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <p className="font-medium">Требуется проверка VK ID</p>
            <p className="mt-1 text-amber-100/80">{a.identityNote ?? "Не удалось однозначно определить VK кандидата."}</p>
            <p className="mt-1 text-xs text-amber-100/60">Ссылка в анкете не доказывает владение аккаунтом. Заявка не отправлена руководству до подтверждения.</p>
          </div>
        </div>
      )}
      {a.status === "AUTO_REJECTED_COOLDOWN" && (
        <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-100">
          <p className="font-medium">Автоотказ системы: ограничение повторной подачи</p>
          <p className="mt-1 text-orange-100/80">{a.rejectReason}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-orange-100/70">
            <span>Последний неуспешный обзвон: {formatDateTime(a.cooldownLastFailedAt)}</span>
            <span>Ограничение до: {formatDateTime(a.cooldownUntil)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Кандидат"
              action={
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={vkUrl} label="Копировать VK" />
                  {me?.site.discordInviteUrl && <CopyButton value={me.site.discordInviteUrl} label="Discord-приглашение" />}
                </div>
              }
            />
            <CardBody className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <KV label="Ник">{a.nickname}</KV>
              <KV label="ФИО">{a.fullName ?? "—"}</KV>
              <KV label="VK-профиль">
                <VkLink vkId={a.vkId} raw={a.vkProfileRaw} />
              </KV>
              <KV label="VK ID">{a.vkId ?? "—"}</KV>
              <KV label="Идентификация">
                <Badge tone={a.identityStatus === "VERIFIED" || a.identityStatus === "MANUAL" ? "green" : a.identityStatus === "LINK_RESOLVED" ? "blue" : "amber"}>
                  {IDENTITY_STATUS_LABEL[a.identityStatus]}
                </Badge>
              </KV>
              <KV label="Источник">{a.source === "GOOGLE_FORMS" ? "Google Forms" : a.source}</KV>
              <KV label="Дата подачи">{formatDateTime(a.submittedAt)}</KV>
              <KV label="Discord">{a.candidate?.discordId ?? "—"}</KV>
              {a.candidate && canPerm("applications.reports.view") && (
                <KV label="История">
                  <Link href={`/candidates/${a.candidate.vkId}`} className="inline-flex items-center gap-1 text-violet-300 hover:underline">
                    <History className="size-3.5" /> Все заявки кандидата
                  </Link>
                </KV>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Анкета" description={`${a.answers.length} ответов`} />
            <CardBody className="space-y-4">
              {a.answers.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                  <p className="text-xs text-muted">
                    Вопрос {i + 1}: {q.question}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{q.answer || "—"}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Проверки" />
            {a.callSessions.length === 0 ? (
              <EmptyState title="Проверок пока не было" />
            ) : (
              <div className="divide-y divide-border/50">
                {a.callSessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        {s.result ? <OutcomeBadge outcome={s.result.outcome} /> : <Badge tone="cyan" dot>Идёт обзвон</Badge>}
                        <StaffLink user={s.caller} />
                      </div>
                      {s.result?.reason && <p className="mt-1">Причина: {s.result.reason}</p>}
                      {s.result?.comment && <p className="mt-0.5 text-muted">{s.result.comment}</p>}
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>Начало: {formatDateTime(s.startedAt)}</p>
                      <p>Конец: {formatDateTime(s.endedAt)}</p>
                      <p>Длительность: {formatDuration(s.durationSec)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Комментарии" />
            {a.comments.length === 0 ? (
              <EmptyState title="Комментариев нет" />
            ) : (
              <div className="divide-y divide-border/50">
                {a.comments.map((cm) => (
                  <div key={cm.id} className="flex gap-3 px-5 py-3">
                    <Avatar src={cm.author?.avatarUrl} name={cm.author?.nickname ?? "?"} size={28} />
                    <div>
                      <p className="text-xs">
                        <StaffLink user={cm.author} /> <span className="text-muted">· {formatDateTime(cm.createdAt)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{cm.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Решение руководства" />
            <CardBody className="space-y-3">
              <KV label="Решение">
                {a.decision ? (
                  <Badge tone={a.decision.decision === "APPROVED" ? "green" : a.decision.decision === "REJECTED" ? "red" : "orange"}>
                    {DECISION_LABEL[a.decision.decision]}
                  </Badge>
                ) : (
                  "—"
                )}
              </KV>
              <KV label="Кто принял / отказал">
                <StaffLink user={decidedBy} system={a.decision?.source === "SYSTEM"} />
              </KV>
              <KV label="Когда">{formatDateTime(a.decision?.createdAt)}</KV>
              <KV label="Канал">{a.decision ? { VK_BOT: "VK-бот", WEB: "Сайт", SYSTEM: "Система" }[a.decision.channel] : "—"}</KV>
              {a.decision?.reason && <KV label="Причина">{a.decision.reason}</KV>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Уведомление кандидата" description="Только отметка. Сообщения кандидату не отправляются." />
            <CardBody>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <BellRing className="size-4 text-muted" /> Кандидат уведомлён
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.candidateNotified ? "Да" : "Нет"}</span>
                  <Switch
                    checked={a.candidateNotified}
                    disabled={!c.review || notified.isPending}
                    onCheckedChange={(v) => notified.mutate({ notified: v })}
                    label="Кандидат уведомлён"
                  />
                </div>
              </div>
              {a.candidateNotifiedBy && (
                <p className="mt-2 text-xs text-muted">
                  Изменил: {a.candidateNotifiedBy.nickname} · {formatDateTime(a.candidateNotifiedAt)}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Обзвонщик" />
            <CardBody className="space-y-3">
              <KV label="Закреплена за">
                <StaffLink user={a.currentAssignee} />
              </KV>
              <KV label="Дата закрепления">{formatDateTime(a.assignedAt)}</KV>
              {a.assignments.length > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-3 text-xs text-muted">
                  {a.assignments.map((as) => (
                    <p key={as.id}>
                      {as.kind === "TAKEN" ? "Взял" : "Назначен"}: <span className="text-foreground">{as.user?.nickname}</span>
                      {as.assignedBy && ` (назначил ${as.assignedBy.nickname})`} · {formatDateTime(as.assignedAt)}
                      {as.releasedAt && ` — снято ${formatDateTime(as.releasedAt)}`}
                    </p>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {data.previous.length > 0 && (
            <Card>
              <CardHeader title="Предыдущие заявки кандидата" />
              <div className="divide-y divide-border/50">
                {data.previous.map((p) => (
                  <Link key={p.id} href={`/applications/${p.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-surface/40">
                    <span className="font-mono text-muted">#{p.id}</span>
                    <span className="text-xs text-muted">{formatDateTime(p.submittedAt)}</span>
                    {p.callSessions.find((s) => s.result)?.result ? <OutcomeBadge outcome={p.callSessions.find((s) => s.result)!.result!.outcome} /> : <StatusBadge status={p.status} />}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {a.deliveries.length > 0 && (
            <Card>
              <CardHeader title="Доставка руководству (VK)" />
              <div className="divide-y divide-border/50">
                {a.deliveries.map((d) => (
                  <div key={d.id} className="px-5 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{d.recipient?.nickname ?? "—"}</span>
                      <Badge tone={d.status === "SENT" ? "green" : d.status === "FAILED" ? "red" : "gray"}>
                        {d.status === "SENT" ? "Доставлено" : d.status === "FAILED" ? "Ошибка" : "Ожидает"}
                      </Badge>
                    </div>
                    {d.lastError && <p className="mt-1 text-red-300">{d.lastError}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {a.events.length > 0 && (
            <Card>
              <CardHeader title="Хронология" />
              <div className="max-h-96 space-y-3 overflow-y-auto p-5">
                {a.events.map((e) => (
                  <div key={e.id} className="relative border-l border-border pl-4 text-xs">
                    <span className="absolute -left-[4.5px] top-1 size-2 rounded-full bg-primary" />
                    <p className="text-sm">{EVENT_TYPE_LABEL[e.type] ?? e.type}</p>
                    <p className="text-muted">
                      {e.actor?.nickname ?? (e.actorType === "SYSTEM" ? "Система" : e.actorType === "SERVICE" ? "Сервис" : "—")} · {formatDateTime(e.createdAt)}
                    </p>
                    {e.comment && <p className="mt-0.5 text-muted/90">{e.comment}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
