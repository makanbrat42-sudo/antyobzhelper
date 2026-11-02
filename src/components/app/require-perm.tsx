"use client";

import { Lock } from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

/** Скрывает раздел без нужных прав. Реальная проверка выполняется на сервере. */
export function RequirePerm({ perm, children }: { perm: PermissionKey | PermissionKey[]; children: React.ReactNode }) {
  const { can } = useSession();
  if (!can(perm)) {
    return (
      <Card>
        <EmptyState icon={<Lock />} title="Нет доступа" description="У вас нет разрешения на этот раздел. Обратитесь к администратору." />
      </Card>
    );
  }
  return <>{children}</>;
}
