"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Hand, MessageSquarePlus, PhoneCall, PhoneOff, Clock, UserCog, XCircle, ShieldQuestion, Ban, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api";
import { CALL_OUTCOME_ICON, CALL_OUTCOME_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const INVALIDATE = [["applications"], ["application"], ["dashboard"], ["report"]];

export type AppCan = {
  approve?: boolean;
  reject?: boolean;
  review?: boolean;
  claim?: boolean;
  reassign?: boolean;
  start?: boolean;
  finish?: boolean;
  postpone?: boolean;
  comment?: boolean;
  confirmIdentity?: boolean;
  cancel?: boolean;
};

export function DecisionButtons({ id, can, size = "sm" }: { id: number; can: AppCan; size?: "sm" | "default" }) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const decide = useAction<{ decision: "APPROVED" | "REJECTED"; reason?: string }>({
    url: `/api/applications/${id}/decision`,
    success: (r) => ((r as { status: string }).status === "REJECTED" ? `Заявка #${id} отклонена` : `Заявка #${id} принята и добавлена в очередь`),
    invalidate: INVALIDATE,
    onSuccess: () => setRejectOpen(false),
  });
  return (
    <>
      {can.approve && (
        <Button size={size} variant="success" loading={decide.isPending && decide.variables?.decision === "APPROVED"} onClick={() => decide.mutate({ decision: "APPROVED" })}>
          <CheckCircle2 /> Принять
        </Button>
      )}
      {can.reject && (
        <Button size={size} variant="destructive" onClick={() => setRejectOpen(true)}>
          <XCircle /> Отклонить
        </Button>
      )}
      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Отклонить заявку #${id}`}
        description="Кандидат не получит автоматического сообщения. При необходимости сообщите ему лично."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" loading={decide.isPending} onClick={() => decide.mutate({ decision: "REJECTED", reason })}>
              Отклонить
            </Button>
          </>
        }
      >
        <Field label="Причина отказа (необязательно)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Например: анкета заполнена не полностью" />
        </Field>
      </Dialog>
    </>
  );
}

export function ClaimButton({ id, size = "sm" }: { id: number; size?: "sm" | "default" }) {
  const claim = useAction({ url: `/api/applications/${id}/claim`, success: `Заявка #${id} закреплена за вами`, invalidate: INVALIDATE });
  return (
    <Button size={size} loading={claim.isPending} onClick={(e) => { e.stopPropagation(); claim.mutate(undefined); }}>
      <Hand /> Взять на себя
    </Button>
  );
}

const OUTCOMES = ["PASSED", "FAILED", "REFUSED", "POSTPONED"] as const;

export function CallButtons({ id, can, cooldownHours = 120, size = "sm" }: { id: number; can: AppCan; cooldownHours?: number; size?: "sm" | "default" }) {
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [postponeOpen, setPostponeOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<(typeof OUTCOMES)[number] | null>(null);
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");
  const reset = () => {
    setOutcome(null);
    setReason("");
    setComment("");
  };
  const call = useAction<{ action: "start" | "finish" | "postpone"; outcome?: string; reason?: string; comment?: string }>({
    url: `/api/applications/${id}/call`,
    success: (r) => {
      const res = r as { durationSec?: number; sessionId?: string; startedAt?: string };
      return res.startedAt ? "Обзвон начат. Время фиксируется на сервере." : "Результат сохранён";
    },
    invalidate: INVALIDATE,
    onSuccess: () => {
      setFinishOpen(false);
      setPostponeOpen(false);
      reset();
    },
  });
  return (
    <>
      {can.start && (
        <Button size={size} loading={call.isPending && call.variables?.action === "start"} onClick={() => call.mutate({ action: "start" })}>
          <PhoneCall /> Начать обзвон
        </Button>
      )}
      {can.finish && (
        <Button size={size} variant="success" onClick={() => setFinishOpen(true)}>
          <PhoneOff /> Завершить обзвон
        </Button>
      )}
      {can.postpone && (
        <Button size={size} variant="secondary" onClick={() => setPostponeOpen(true)}>
          <Clock /> Перенести
        </Button>
      )}

      <Dialog
        open={finishOpen}
        onOpenChange={(v) => {
          setFinishOpen(v);
          if (!v) reset();
        }}
        title={`Результат обзвона #${id}`}
        description="Время завершения и продолжительность фиксируются на сервере."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinishOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!outcome || (outcome === "FAILED" && !reason.trim())}
              loading={call.isPending}
              onClick={() => outcome && call.mutate({ action: "finish", outcome, reason, comment })}
            >
              Сохранить результат
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm transition",
                outcome === o ? "border-primary bg-primary/15" : "border-border bg-surface hover:border-primary/40",
              )}
            >
              <span className="text-lg">{CALL_OUTCOME_ICON[o]}</span>
              {CALL_OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        {outcome === "FAILED" && (
          <p className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
            Кандидат сможет подать заявку повторно только через {cooldownHours / 24 === Math.floor(cooldownHours / 24) ? `${cooldownHours / 24} сут.` : `${cooldownHours} ч`} ({cooldownHours} ч). Более ранние заявки будут отклонены автоматически.
          </p>
        )}
        <div className="mt-4 space-y-3">
          <Field label={outcome === "FAILED" ? "Причина (обязательно)" : "Причина"}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
          <Field label="Комментарий">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={postponeOpen}
        onOpenChange={setPostponeOpen}
        title={`Перенести обзвон #${id}`}
        description="Заявка останется в «Мои заявки». Ограничение повторной подачи не применяется."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPostponeOpen(false)}>
              Отмена
            </Button>
            <Button loading={call.isPending} onClick={() => call.mutate({ action: "postpone", reason, comment })}>
              Перенести
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Причина переноса">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: кандидат попросил перенести на завтра" />
          </Field>
          <Field label="Комментарий">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function CommentButton({ id, size = "sm" }: { id: number; size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const add = useAction<{ text: string }>({
    url: `/api/applications/${id}/comments`,
    success: "Комментарий добавлен",
    invalidate: INVALIDATE,
    onSuccess: () => {
      setOpen(false);
      setText("");
    },
  });
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquarePlus /> Комментарий
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Комментарий к заявке #${id}`}
        footer={
          <Button disabled={!text.trim()} loading={add.isPending} onClick={() => add.mutate({ text })}>
            Добавить
          </Button>
        }
      >
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} className="min-h-28" />
      </Dialog>
    </>
  );
}

type Emp = { id: string; nickname: string; callerRole: { name: string } | null };

export function ReassignButton({ id, currentAssigneeId, size = "sm" }: { id: number; currentAssigneeId?: string | null; size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState<string>("");
  const [comment, setComment] = React.useState("");
  const { data } = useQuery({
    queryKey: ["employees", "callers"],
    queryFn: () => api<{ rows: Emp[] }>("/api/employees?callers=1"),
    enabled: open,
  });
  const act = useAction<{ userId: string | null; comment?: string }>({
    url: `/api/applications/${id}/reassign`,
    success: () => (userId ? "Заявка переназначена" : "Заявка возвращена в очередь"),
    invalidate: INVALIDATE,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <UserCog /> Переназначить
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Переназначить заявку #${id}`}
        footer={
          <Button loading={act.isPending} onClick={() => act.mutate({ userId: userId || null, comment: comment || undefined })}>
            {userId ? "Назначить" : "Вернуть в очередь"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Обзвонщик">
            <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— Вернуть в общую очередь —</option>
              {data?.rows
                .filter((u) => u.id !== currentAssigneeId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname} {u.callerRole ? `· ${u.callerRole.name}` : ""}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Комментарий">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function IdentityButton({ id, suggestedVkId }: { id: number; suggestedVkId?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [vkId, setVkId] = React.useState(suggestedVkId ?? "");
  const [comment, setComment] = React.useState("");
  const act = useAction<{ vkId: string; comment?: string }>({
    url: `/api/applications/${id}/identity`,
    success: (r) =>
      (r as { status: string }).status === "AUTO_REJECTED_COOLDOWN"
        ? "VK подтверждён. У кандидата действует ограничение — заявка автоматически отклонена"
        : "VK подтверждён, заявка передана руководству",
    invalidate: INVALIDATE,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ShieldQuestion /> Подтвердить VK ID
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Подтверждение VK ID кандидата"
        description="Убедитесь, что аккаунт действительно принадлежит кандидату (например, кандидат написал вам с этого аккаунта). После подтверждения применяются проверка дубликатов и ограничения повторной подачи."
        footer={
          <Button disabled={!/^\d{1,12}$/.test(vkId.replace(/^id/i, ""))} loading={act.isPending} onClick={() => act.mutate({ vkId, comment: comment || undefined })}>
            Подтвердить
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Числовой VK ID" hint="Например 123456 (из ссылки vk.com/id123456)">
            <Input value={vkId} onChange={(e) => setVkId(e.target.value.trim())} inputMode="numeric" />
          </Field>
          <Field label="Как подтверждено">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Кандидат написал из этого аккаунта" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function CancelButton({ id }: { id: number }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const act = useAction<{ reason: string }>({ url: `/api/applications/${id}/cancel`, success: "Заявка отменена", invalidate: INVALIDATE, onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Ban /> Отменить заявку
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Отменить заявку #${id}`}
        description="Отмена не создаёт ограничений повторной подачи."
        footer={
          <Button variant="destructive" disabled={!reason.trim()} loading={act.isPending} onClick={() => act.mutate({ reason })}>
            Отменить заявку
          </Button>
        }
      >
        <Field label="Причина">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: дубль, ошибочная заявка" />
        </Field>
      </Dialog>
    </>
  );
}

export function ResendButton({ id }: { id: number }) {
  const act = useAction({
    url: `/api/applications/${id}/resend`,
    success: (r) => {
      const x = r as { sent: number; failed: number };
      return `Отправлено: ${x.sent}, ошибок: ${x.failed}`;
    },
    invalidate: INVALIDATE,
  });
  return (
    <Button size="sm" variant="secondary" loading={act.isPending} onClick={() => act.mutate(undefined)}>
      <Send /> Разослать руководству
    </Button>
  );
}
