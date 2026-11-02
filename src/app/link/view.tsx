"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AuthLayout, VkIcon } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/app/common";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";

// Страница для КАНДИДАТОВ: подтверждение владения VK через VK ID.
// Кандидат получает код и вставляет его в анкету Google Forms (и позже — Discord-боту).
export function LinkView() {
  const params = useSearchParams();
  const error = params.get("error");
  const { data, isLoading } = useQuery({
    queryKey: ["candidate-link"],
    queryFn: () => api<{ link: { code: string; nickname: string | null; vkId: string } | null; vkConfigured: boolean }>("/api/candidate-link/current"),
  });

  return (
    <AuthLayout
      title="Подтверждение VK"
      subtitle="Войдите через VK ID, чтобы подтвердить, что указанный в анкете аккаунт VK принадлежит вам."
    >
      {error && (
        <div className="mb-4 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error === "vk_not_configured" ? "Вход через VK ID пока не настроен." : "Не удалось подтвердить VK. Попробуйте ещё раз."}
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : data?.link ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="size-4" /> VK подтверждён: {data.link.nickname ?? `id${data.link.vkId}`}
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 text-center">
            <p className="text-xs text-muted">Ваш код подтверждения</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em]">{data.link.code}</p>
          </div>
          <CopyButton value={data.link.code} label="Скопировать код" size="default" />
          <p className="text-xs text-muted">
            Вставьте код в поле «Код подтверждения VK» в анкете. Код действует 7 дней. Не передавайте его другим людям.
          </p>
        </div>
      ) : (
        <Button asChild size="lg" className="w-full bg-[#0077FF] bg-none hover:bg-[#0069e0]">
          <a href="/api/auth/vk/start?purpose=candidate">
            <VkIcon className="size-5" /> Подтвердить через VK ID
          </a>
        </Button>
      )}
      <p className="mt-5 text-center text-[11px] text-muted/80">
        Мы получаем только ваш VK ID, имя и аватар. Сообщения от системы вам приходить не будут.
      </p>
    </AuthLayout>
  );
}
