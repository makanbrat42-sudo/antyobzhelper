"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronDown, ExternalLink, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, vkProfileUrl } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { CopyButton, KV, OutcomeBadge, PageHeader, StaffLink, StatusBadge, VkLink } from "@/components/app/common";
import { CallButtons, CommentButton } from "@/components/app/application-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type MyApp = {
  id: number;
  nickname: string;
  vkId: string | null;
  vkProfileRaw: string | null;
  status: string;
  submittedAt: string;
  decidedAt: string | null;
  assignedAt: string | null;
  currentAssigneeId: string | null;
  decision: { user: { id: string; nickname: string } | null; userNickname: string | null } | null;
  answers: { id: string; question: string; answer: string }[];
  callSessions: { id: string; startedAt: string; endedAt: string | null; durationSec: number | null; status: string; result: { outcome: string; reason: string | null; comment: string | null } | null }[];
  comments: { id: string; text: string; createdAt: string; author: { id: string; nickname: string } }[];
};

function LiveTimer({ since }: { since: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono tabular-nums">{formatDuration(Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)))}</span>;
}

function AppCard({ a, userId, invite, cooldownHours }: { a: MyApp; userId: string; invite: string; cooldownHours: number }) {
  const [open, setOpen] = React.useState(false);
  const mine = a.currentAssigneeId === userId;
  const active = a.callSessions.find((s) => s.status === "IN_PROGRESS");
  const vkUrl = vkProfileUrl(a.vkId, a.vkProfileRaw) ?? "";
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(active && "border-cyan-500/40 shadow-lg shadow-cyan-500/5")}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted">#{a.id}</span>
              <span className="text-base font-semibold">{a.nickname}</span>
              <StatusBadge status={a.status} />
              {active && (
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-200">
                  Идёт: <LiveTimer since={active.startedAt} />
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <KV label="VK">
                <VkLink vkId={a.vkId} raw={a.vkProfileRaw} />
              </KV>
              <KV label="Подана">{formatDateTime(a.submittedAt)}</KV>
              <KV label="Принята">{formatDateTime(a.decidedAt)}</KV>
              <KV label="Кто принял">
                <StaffLink user={a.decision?.user ?? (a.decision?.userNickname ? { id: null, nickname: a.decision.userNickname } : null)} />
              </KV>
            </div>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/applications/${a.id}`}>
              Открыть заявку <ExternalLink />
            </Link>
          </Button>
        </div>
        {mine && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 px-5 py-3">
            <CopyButton value={vkUrl} label="Копировать VK" />
            <CopyButton value={invite} label={invite ? "Копировать Discord-приглашение" : "Discord-приглашение не настроено"} />
            <CallButtons
              id={a.id}
              cooldownHours={cooldownHours}
              can={{ start: a.status === "ASSIGNED", finish: a.status === "IN_PROGRESS", postpone: a.status === "ASSIGNED" || a.status === "IN_PROGRESS" }}
            />
            <CommentButton id={a.id} />
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-border/60 py-2 text-xs text-muted transition hover:text-foreground"
        >
          {open ? "Скрыть" : "Анкета, проверки и комментарии"}
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
        {open && (
          <div className="grid gap-5 border-t border-border/60 p-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Анкета</h4>
              <div className="space-y-3">
                {a.answers.map((q) => (
                  <div key={q.id}>
                    <p className="text-xs text-muted">{q.question}</p>
                    <p className="whitespace-pre-wrap text-sm">{q.answer || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">История проверок</h4>
                {a.callSessions.length === 0 && <p className="text-xs text-muted">Проверок ещё не было</p>}
                <div className="space-y-2">
                  {a.callSessions.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border bg-surface/50 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        {s.result ? <OutcomeBadge outcome={s.result.outcome} /> : <span className="text-cyan-300">Идёт</span>}
                        <span className="text-muted">{formatDuration(s.durationSec)}</span>
                      </div>
                      <p className="mt-1 text-muted">{formatDateTime(s.startedAt)}</p>
                      {s.result?.reason && <p className="mt-1">{s.result.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Комментарии</h4>
                {a.comments.length === 0 && <p className="text-xs text-muted">Комментариев нет</p>}
                {a.comments.map((c) => (
                  <div key={c.id} className="mb-2 text-xs">
                    <span className="font-medium">{c.author.nickname}</span> <span className="text-muted">· {formatDateTime(c.createdAt)}</span>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default function MyPage() {
  const { user, me } = useSession();
  const [tab, setTab] = React.useState("active");
  const { data, isLoading } = useQuery({
    queryKey: ["applications", tab === "active" ? "my" : "my_all"],
    queryFn: () => api<{ rows: MyApp[] }>(`/api/applications?view=${tab === "active" ? "my" : "my_all"}`),
  });
  return (
    <div>
      <PageHeader
        title="Мои заявки"
        description="Свяжитесь с кандидатом в VK самостоятельно, пригласите в Discord, проведите проверку и сохраните результат."
        actions={
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "active", label: "В работе" },
              { value: "all", label: "Все мои" },
            ]}
          />
        }
      />
      <div className="space-y-4">
        {isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        {!isLoading && !data?.rows.length && (
          <Card>
            <EmptyState
              icon={<ListChecks />}
              title={tab === "active" ? "У вас нет заявок в работе" : "Заявок пока нет"}
              description="Возьмите заявку в разделе «Ожидают обзвонщика»."
              action={
                <Button asChild size="sm">
                  <Link href="/queue">Перейти к очереди</Link>
                </Button>
              }
            />
          </Card>
        )}
        {data?.rows.map((a) => (
          <AppCard key={a.id} a={a} userId={user!.id} invite={me?.site.discordInviteUrl ?? ""} cooldownHours={me?.site.cooldownHours ?? 120} />
        ))}
      </div>
    </div>
  );
}
