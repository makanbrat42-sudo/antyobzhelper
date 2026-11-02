"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Search, ShieldCheck } from "lucide-react";
import { api, qs } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { PageHeader, Pagination, StatusBadge, Table, TableSkeleton, Td, Th, Tr, VkLink } from "@/components/app/common";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";

type Row = {
  id: string;
  vkId: string;
  nickname: string | null;
  fullName: string | null;
  verified: boolean;
  applications: number;
  last: { id: number; status: string; submittedAt: string } | null;
  cooldownUntil: string | null;
};

export default function CandidatesPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ["candidates", dq, page],
    queryFn: () => api<{ rows: Row[]; total: number; page: number; pageSize: number }>(`/api/candidates${qs({ q: dq, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="История кандидатов"
        description="Поиск по VK ID. Кандидаты различаются только по VK ID — одинаковые ники не объединяются."
      />
      <Card>
        <div className="border-b border-border/60 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <Input
              className="pl-8"
              placeholder="VK ID, ссылка vk.com/id… или ник"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                const v = q.trim().replace(/^https?:\/\/(m\.)?vk\.(com|ru)\/id/i, "").replace(/^id/i, "");
                if (e.key === "Enter" && /^\d+$/.test(v)) router.push(`/candidates/${v}`);
              }}
            />
          </div>
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<History />} title="Кандидаты не найдены" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>VK ID</Th>
                  <Th>Ник</Th>
                  <Th>Заявок</Th>
                  <Th>Последняя заявка</Th>
                  <Th>Ограничение</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <Tr key={c.id} onClick={() => router.push(`/candidates/${c.vkId}`)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <VkLink vkId={c.vkId} />
                        {c.verified && <ShieldCheck className="size-3.5 text-emerald-400" aria-label="VK подтверждён" />}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{c.nickname ?? "—"}</div>
                      {c.fullName && <div className="text-xs text-muted">{c.fullName}</div>}
                    </Td>
                    <Td className="tabular-nums">{c.applications}</Td>
                    <Td>
                      {c.last ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted">#{c.last.id}</span>
                          <StatusBadge status={c.last.status} />
                        </div>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{c.cooldownUntil ? <Badge tone="orange">до {formatDateTime(c.cooldownUntil)}</Badge> : <span className="text-muted">—</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
