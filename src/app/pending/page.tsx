"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, KeyRound, LogOut, XCircle, Ban } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";

export default function PendingPage() {
  const { user, me, isLoading, refetch } = useSession();
  const router = useRouter();
  const qc = useQueryClient();

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (user.status === "ACTIVE") router.replace("/dashboard");
  }, [isLoading, user, router]);

  // Пока ждём одобрения — периодически проверяем статус.
  React.useEffect(() => {
    const t = setInterval(() => refetch(), 15_000);
    return () => clearInterval(t);
  }, [refetch]);

  if (!user) return null;
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    qc.clear();
    router.replace("/login");
  };
  const reapply = async () => {
    try {
      await api("/api/auth/reapply", { method: "POST" });
      toast.success("Заявка отправлена повторно");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const state =
    user.status === "BLOCKED"
      ? { icon: <Ban className="size-5 text-danger" />, title: "Доступ заблокирован", text: "Обратитесь к администрации кадрового подразделения." }
      : user.status === "REJECTED"
        ? { icon: <XCircle className="size-5 text-danger" />, title: "Регистрация отклонена", text: me?.registration?.comment ?? "Вы можете подать заявку повторно." }
        : { icon: <Clock className="size-5 text-amber-300" />, title: "Ожидает одобрения", text: "Ваша заявка на регистрацию отправлена администрации. Страница обновится автоматически." };

  return (
    <AuthLayout title="Заявка на регистрацию" subtitle={`Здравствуйте, ${user.nickname}!`}>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-4">
        <Avatar src={user.avatarUrl} name={user.nickname} size={44} />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.nickname}</p>
          <p className="text-xs text-muted">VK ID: {user.vkId}</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 font-medium">
          {state.icon}
          {state.title}
        </div>
        <p className="mt-1.5 text-sm text-muted">{state.text}</p>
        {me?.registration && <p className="mt-2 text-xs text-muted/80">Подана: {formatDateTime(me.registration.createdAt)}</p>}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {user.status === "REJECTED" && <Button onClick={reapply}>Подать повторно</Button>}
        {me?.setupAvailable && user.status !== "BLOCKED" && (
          <Button asChild variant="secondary">
            <Link href="/setup">
              <KeyRound /> Первоначальная настройка администратора
            </Link>
          </Button>
        )}
        <Button variant="ghost" onClick={logout}>
          <LogOut /> Выйти
        </Button>
      </div>
    </AuthLayout>
  );
}
