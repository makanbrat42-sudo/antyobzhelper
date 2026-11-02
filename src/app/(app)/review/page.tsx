"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Inbox, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, IDENTITY_STATUS_LABEL } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { PageHeader, StatusBadge, Table, TableSkeleton, Td, Th, Tr, VkLink } from "@/components/app/common";
import { DecisionButtons } from "@/components/app/application-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";

type Row = {
  id: number;
  nickname: string;
  fullName: string | null;
  vkId: string | null;
  vkProfileRaw: string | null;
  submittedAt: string;
  status: string;
  identityStatus: string;
  identityNote: string | null;
};

export default function ReviewPage() {
  const router = useRouter();
  const { can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ["applications", "review"], queryFn: () => api<{ rows: Row[] }>("/api/applications?view=review") });
  const canDecide = { approve: can("applications.approve"), reject: can("applications.reject") };

  return (
    <div>
      <PageHeader
        title="На рассмотрении"
        description="Новые заявки из Google Forms. Те же заявки приходят руководству в личные сообщения VK-бота."
      />
      <Card>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<Inbox />} title="Нет заявок на рассмотрении" description="Новые заявки появятся здесь автоматически." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Кандидат</Th>
                <Th>VK</Th>
                <Th>Дата подачи</Th>
                <Th>Статус</Th>
                <Th className="text-right">Действие</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Tr key={r.id} onClick={() => router.push(`/applications/${r.id}`)}>
                  <Td className="font-mono text-muted">#{r.id}</Td>
                  <Td>
                    <div className="font-medium">{r.nickname}</div>
                    {r.fullName && <div className="text-xs text-muted">{r.fullName}</div>}
                  </Td>
                  <Td>
                    <VkLink vkId={r.vkId} raw={r.vkProfileRaw} />
                    <div className="mt-1">
                      {r.identityStatus === "VERIFIED" ? (
                        <Badge tone="green">Подтверждён</Badge>
                      ) : r.status === "IDENTITY_CHECK" ? (
                        <Badge tone="amber">
                          <ShieldAlert className="size-3" /> {IDENTITY_STATUS_LABEL[r.identityStatus]}
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.submittedAt)}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {r.status === "PENDING_REVIEW" ? (
                        <DecisionButtons id={r.id} can={canDecide} />
                      ) : (
                        <span className="text-xs text-muted">Откройте заявку для проверки VK ID</span>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
