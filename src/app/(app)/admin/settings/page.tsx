"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { PageHeader } from "@/components/app/common";
import { RequirePerm } from "@/components/app/require-perm";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";

type Settings = {
  "site.name": string;
  "site.logoUrl": string;
  "site.accentColor": string;
  "site.accentColor2": string;
  "discord.inviteUrl": string;
  "cooldown.hours": number;
  "identity.cooldownMode": "STRICT" | "LINK";
  timezone: string;
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-10 cursor-pointer rounded-md border border-border bg-surface" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Settings }>("/api/settings") });
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  return <SettingsForm initial={data.settings} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const qc = useQueryClient();
  const [s, setS] = React.useState<Settings>(initial);
  const save = useAction({
    url: "/api/settings",
    method: "PATCH",
    success: "Настройки сохранены",
    invalidate: [["settings"], ["me"]],
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const days = s["cooldown.hours"] / 24;

  return (
    <RequirePerm perm="system.manage">
      <PageHeader
        title="Настройки"
        actions={
          <Button loading={save.isPending} onClick={() => save.mutate(s)}>
            <Save /> Сохранить
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Сайт" />
          <CardBody className="space-y-4">
            <Field label="Название сайта">
              <Input value={s["site.name"]} onChange={(e) => set("site.name", e.target.value)} maxLength={60} />
            </Field>
            <Field label="Логотип (URL изображения)" hint="Оставьте пустым для стандартного логотипа">
              <Input value={s["site.logoUrl"]} onChange={(e) => set("site.logoUrl", e.target.value)} placeholder="https://…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Основной акцент" value={s["site.accentColor"]} onChange={(v) => set("site.accentColor", v)} />
              <ColorField label="Дополнительный акцент" value={s["site.accentColor2"]} onChange={(v) => set("site.accentColor2", v)} />
            </div>
            <Field label="Часовой пояс отображения">
              <NativeSelect value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {["Europe/Moscow", "Europe/Kaliningrad", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Europe/Kyiv", "Europe/Minsk", "UTC"].map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </NativeSelect>
            </Field>
            <p className="text-xs text-muted">
              Должности и цвета их бейджей настраиваются в разделе{" "}
              <Link href="/admin/roles" className="text-violet-300 hover:underline">
                «Должности и права»
              </Link>
              .
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Обзвоны" />
          <CardBody className="space-y-4">
            <Field label="Discord-приглашение" hint="Обзвонщики копируют его кнопкой «Копировать Discord-приглашение»">
              <Input value={s["discord.inviteUrl"]} onChange={(e) => set("discord.inviteUrl", e.target.value)} placeholder="https://discord.gg/…" />
            </Field>
            <Field
              label="Срок ограничения повторной подачи (часы)"
              hint={`После результата «Не прошёл». Сейчас: ${Number.isInteger(days) ? `${days} сут.` : `${s["cooldown.hours"]} ч`}. По умолчанию 120 ч (5 суток).`}
            >
              <Input type="number" min={1} max={8760} value={s["cooldown.hours"]} onChange={(e) => set("cooldown.hours", Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field
              label="Проверка личности для автоотказа"
              hint="Ссылка на VK в анкете не доказывает владение аккаунтом. В строгом режиме совпадение по неподтверждённой ссылке отправляет заявку на ручную проверку VK ID."
            >
              <NativeSelect value={s["identity.cooldownMode"]} onChange={(e) => set("identity.cooldownMode", e.target.value as Settings["identity.cooldownMode"])}>
                <option value="STRICT">Строгий: автоотказ только при подтверждённом VK (рекомендуется)</option>
                <option value="LINK">Упрощённый: ссылки из анкеты достаточно</option>
              </NativeSelect>
            </Field>
          </CardBody>
        </Card>
      </div>
    </RequirePerm>
  );
}
