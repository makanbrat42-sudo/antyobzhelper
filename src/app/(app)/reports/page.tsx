"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Download, Hourglass, Search, ShieldX, XCircle, RotateCcw, FileBarChart } from "lucide-react";
import { api, qs } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/labels";
import { PageHeader, Pagination, StaffLink, StatCard, StatusBadge, Table, TableSkeleton, Td, Th, Tr, VkLink } from "@/components/app/common";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, Tabs } from "@/components/ui/misc";

type Row = {
  id: number;
  nickname: string;
  fullName: string | null;
  vkId: string | null;
  vkProfileRaw: string | null;
  submittedAt: string;
  status: string;
  decision: string | null;
  decisionSource: string | null;
  decidedAt: string | null;
  decidedBy: { id: string | null; nickname: string } | null;
  reason: string | null;
};
type Report = { total: number; page: number; pageSize: number; stats: { total: number; approved: number; rejected: number; auto: number; pending: number }; rows: Row[] };
type Emp = { id: string; nickname: string };

const DECISIONS = [
  { value: "all", label: "Все заявки" },
  { value: "approved", label: "Принятые" },
  { value: "rejected", label: "Отклонённые" },
  { value: "auto", label: "Автоотказы" },
  { value: "pending", label: "Ожидающие" },
];

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function DecisionCell({ r }: { r: Row }) {
  if (r.status === "AUTO_REJECTED_COOLDOWN") return <Badge tone="orange">Автоотказ</Badge>;
  if (r.decision === "APPROVED") return <Badge tone="green">Принята</Badge>;
  if (r.decision === "REJECTED") return <Badge tone="red">Отклонена</Badge>;
  if (r.status === "CANCELLED") return <Badge tone="gray">Отменена</Badge>;
  return <Badge tone="blue">Ожидает</Badge>;
}

export default function ReportsPage() {
  const router = useRouter();
  const [f, setF] = React.useState({ decision: "all", q: "", vkId: "", staffId: "", from: "", to: "", sort: "submittedAt", dir: "desc" as "asc" | "desc", page: 1 });
  const q = useDebounced(f.q);
  const vkId = useDebounced(f.vkId);
  const params = { ...f, q, vkId, pageSize: 20 };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["report", params],
    queryFn: () => api<Report>(`/api/reports/applications${qs(params)}`),
    placeholderData: keepPreviousData,
  });
  const { data: emps } = useQuery({ queryKey: ["employees", "all"], queryFn: () => api<{ rows: Emp[] }>("/api/employees") });
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, page: 1, ...patch }));
  const sortBy = (key: string) => setF((s) => ({ ...s, sort: key, dir: s.sort === key && s.dir === "desc" ? "asc" : "desc" }));
  const st = data?.stats;

  return (
    <div>
      <PageHeader
        title="Отчёт заявок"
        description="Все заявления и ответственные сотрудники. Нажмите на ник сотрудника, чтобы открыть его профиль."
        actions={
          <Button variant="secondary" asChild>
            <a href={`/api/reports/applications/export${qs({ ...params, page: undefined, pageSize: undefined })}`}>
              <Download /> Экспорт CSV
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard index={0} label="Всего заявок" value={st?.total} loading={isLoading} icon={<ClipboardList />} tone="violet" onClick={() => set({ decision: "all" })} active={f.decision === "all"} />
        <StatCard index={1} label="Принято" value={st?.approved} loading={isLoading} icon={<CheckCircle2 />} tone="green" onClick={() => set({ decision: "approved" })} active={f.decision === "approved"} />
        <StatCard index={2} label="Отклонено" value={st?.rejected} loading={isLoading} icon={<XCircle />} tone="red" onClick={() => set({ decision: "rejected" })} active={f.decision === "rejected"} />
        <StatCard index={3} label="Автоотказов" value={st?.auto} loading={isLoading} icon={<ShieldX />} tone="orange" onClick={() => set({ decision: "auto" })} active={f.decision === "auto"} />
        <StatCard index={4} label="Ожидают рассмотрения" value={st?.pending} loading={isLoading} icon={<Hourglass />} tone="blue" onClick={() => set({ decision: "pending" })} active={f.decision === "pending"} />
      </div>

      <Card className="mt-5">
        <div className="flex flex-col gap-3 border-b border-border/60 p-4">
          <Tabs value={f.decision} onValueChange={(v) => set({ decision: v })} items={DECISIONS} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
              <Input className="pl-8" placeholder="Поиск: ник, ФИО, #ID" value={f.q} onChange={(e) => set({ q: e.target.value })} />
            </div>
            <Input placeholder="VK ID" value={f.vkId} onChange={(e) => set({ vkId: e.target.value })} />
            <NativeSelect value={f.staffId} onChange={(e) => set({ staffId: e.target.value })}>
              <option value="">Любой сотрудник</option>
              {emps?.rows.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname}
                </option>
              ))}
            </NativeSelect>
            <Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="С даты" />
            <Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="По дату" />
          </div>
          {(f.q || f.vkId || f.staffId || f.from || f.to) && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => set({ q: "", vkId: "", staffId: "", from: "", to: "" })}>
              <RotateCcw /> Сбросить фильтры
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !data?.rows.length ? (
          <EmptyState icon={<FileBarChart />} title="Заявок не найдено" description="Измените фильтры или дождитесь новых заявок." />
        ) : (
          <div className={isFetching ? "opacity-70 transition" : "transition"}>
            <Table>
              <thead>
                <tr>
                  <Th onClick={() => sortBy("id")} sorted={f.sort === "id" ? f.dir : null}>ID</Th>
                  <Th onClick={() => sortBy("nickname")} sorted={f.sort === "nickname" ? f.dir : null}>Ник кандидата</Th>
                  <Th>VK</Th>
                  <Th onClick={() => sortBy("submittedAt")} sorted={f.sort === "submittedAt" ? f.dir : null}>Дата</Th>
                  <Th>Статус</Th>
                  <Th>Решение</Th>
                  <Th onClick={() => sortBy("decidedAt")} sorted={f.sort === "decidedAt" ? f.dir : null} className="text-right">Кто принял / отказал</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <Tr key={r.id} onClick={() => router.push(`/applications/${r.id}`)}>
                    <Td className="font-mono text-muted">#{r.id}</Td>
                    <Td>
                      <div className="font-medium">{r.nickname}</div>
                      {r.reason && <div className="max-w-64 truncate text-xs text-muted" title={r.reason}>{r.reason}</div>}
                    </Td>
                    <Td>
                      <VkLink vkId={r.vkId} raw={r.vkProfileRaw} label="VK" />
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      <span title={formatDateTime(r.submittedAt)}>{formatDate(r.submittedAt)}</span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td>
                      <DecisionCell r={r} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-col items-end">
                        <StaffLink user={r.decidedBy} system={r.decisionSource === "SYSTEM"} />
                        {r.decidedAt && <span className="text-[11px] text-muted">{formatDateTime(r.decidedAt)}</span>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((s) => ({ ...s, page: p }))} />
          </div>
        )}
      </Card>
    </div>
  );
}
