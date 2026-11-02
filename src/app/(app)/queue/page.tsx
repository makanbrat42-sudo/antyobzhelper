"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { PageHeader, StaffLink, Table, TableSkeleton, Td, Th, VkLink } from "@/components/app/common";
import { ClaimButton } from "@/components/app/application-actions";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

type Row = {
  id: number;
  nickname: string;
  vkId: string | null;
  vkProfileRaw: string | null;
  submittedAt: string;
  decidedAt: string | null;
  decision: { user: { id: string; nickname: string } | null; userNickname: string | null } | null;
};

export default function QueuePage() {
  const router = useRouter();
  const { can } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["applications", "queue"],
    queryFn: () => api<{ rows: Row[] }>("/api/applications?view=queue"),
    refetchInterval: 30_000,
  });
  const canClaim = can("applications.assign");

  return (
    <div>
      <PageHeader
        title="Ожидают обзвонщика"
        description="Принятые руководством заявки. Нажмите «Взять на себя», чтобы закрепить заявку — после этого она исчезнет из общей очереди."
      />
      <Card>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<Hourglass />} title="Очередь пуста" description="Как только руководство примет заявку, она появится здесь в реальном времени." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Кандидат</Th>
                <Th>VK</Th>
                <Th>Дата</Th>
                <Th>Принял</Th>
                <Th className="text-right">Действие</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.rows.map((r) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className="cursor-pointer transition hover:bg-surface/40"
                    onClick={() => router.push(`/applications/${r.id}`)}
                  >
                    <Td className="font-mono text-muted">#{r.id}</Td>
                    <Td className="font-medium">{r.nickname}</Td>
                    <Td>
                      <VkLink vkId={r.vkId} raw={r.vkProfileRaw} label="Открыть VK" />
                    </Td>
                    <Td className="whitespace-nowrap text-muted" >
                      <span title={`Подана ${formatDateTime(r.submittedAt)}`}>{formatDate(r.submittedAt)}</span>
                    </Td>
                    <Td>
                      <StaffLink user={r.decision?.user ?? (r.decision?.userNickname ? { id: null, nickname: r.decision.userNickname } : null)} />
                    </Td>
                    <Td className="text-right">{canClaim ? <ClaimButton id={r.id} /> : <span className="text-xs text-muted">Нет прав обзвонщика</span>}</Td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
