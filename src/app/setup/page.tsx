"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

export default function SetupPage() {
  const { user, me, isLoading } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/setup", { body: { token } });
      toast.success("Вы назначены администратором");
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace("/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Первоначальная настройка"
      subtitle="Назначение первого администратора. Работает, только пока в системе нет активного администратора."
    >
      {me && !me.setupAvailable ? (
        <div className="space-y-4 text-center text-sm text-muted">
          <p>Первоначальная настройка недоступна: администратор уже назначен или SETUP_TOKEN не задан.</p>
          <Button asChild variant="secondary">
            <Link href="/login">На страницу входа</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Токен настройки" hint="Значение переменной окружения SETUP_TOKEN на сервере. Не передавайте его другим людям.">
            <Input type="password" required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Стать администратором
          </Button>
          <p className="text-xs text-muted">
            Вход выполнен как <b className="text-foreground">{user?.nickname}</b> (VK ID {user?.vkId}). После настройки удалите SETUP_TOKEN из переменных окружения.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
