"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, VkIcon } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

const ERRORS: Record<string, string> = {
  vk_not_configured: "Вход через VK ID ещё не настроен: администратор должен указать VK_ID_CLIENT_ID.",
  state: "Сессия входа устарела или повреждена. Попробуйте ещё раз.",
  expired: "Время на вход истекло. Попробуйте ещё раз.",
  denied: "Вход отменён в VK ID.",
  params: "VK ID вернул неполный ответ. Попробуйте ещё раз.",
  exchange: "Не удалось подтвердить вход через VK ID. Попробуйте позже.",
  blocked: "Ваша учётная запись заблокирована администрацией.",
};

export function LoginView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, me, isLoading } = useSession();
  const error = params.get("error");

  React.useEffect(() => {
    if (!isLoading && user) router.replace(user.status === "ACTIVE" ? "/dashboard" : "/pending");
  }, [isLoading, user, router]);

  const [dev, setDev] = React.useState({ vkId: "", firstName: "", lastName: "" });
  const [loading, setLoading] = React.useState(false);
  const devLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/dev-login", { body: dev });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={me?.site.name ?? "AntyObzhelp"} subtitle="Система кадрового подразделения. Вход только для сотрудников.">
      {error && ERRORS[error] && (
        <div className="mb-4 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {ERRORS[error]}
        </div>
      )}
      <Button asChild size="lg" className="w-full bg-[#0077FF] bg-none shadow-[#0077FF]/30 hover:bg-[#0069e0]">
        <a href="/api/auth/vk/start">
          <VkIcon className="size-5" />
          Войти через VK ID
        </a>
      </Button>
      {me && !me.vkConfigured && (
        <p className="mt-3 text-center text-xs text-amber-300/90">VK ID не настроен на сервере (VK_ID_CLIENT_ID).</p>
      )}
      <p className="mt-5 text-center text-xs text-muted">
        При первом входе создаётся заявка на регистрацию. Доступ откроется после одобрения администрацией.
      </p>

      {me?.devLogin && (
        <form onSubmit={devLogin} className="mt-6 space-y-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-amber-300">
            <FlaskConical className="size-4" /> Тестовый вход (только локальная разработка)
          </p>
          <Field label="VK ID">
            <Input required inputMode="numeric" pattern="\d{1,12}" value={dev.vkId} onChange={(e) => setDev({ ...dev, vkId: e.target.value })} placeholder="123456" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Имя">
              <Input required value={dev.firstName} onChange={(e) => setDev({ ...dev, firstName: e.target.value })} />
            </Field>
            <Field label="Фамилия">
              <Input value={dev.lastName} onChange={(e) => setDev({ ...dev, lastName: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" className="w-full" loading={loading}>
            Войти как тестовый пользователь
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
