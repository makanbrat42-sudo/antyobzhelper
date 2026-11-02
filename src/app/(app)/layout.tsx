import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

// Разделы панели загружают данные на клиенте после проверки сессии — мгновенная навигация не ожидается.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="app-glow flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
