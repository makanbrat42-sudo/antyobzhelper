"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { api, qs } from "@/lib/api";
import { USER_STATUS_LABEL } from "@/lib/labels";
import { PageHeader, Table, TableSkeleton, Td, Th, Tr } from "@/components/app/common";
import { Card } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, EmptyState, Tabs } from "@/components/ui/misc";

export type EmployeeRow = {
  id: string;
  vkId: string;
  nickname: string;
  avatarUrl: string | null;
  status: string;
  mainRole: { id: string; name: string; color: string } | null;
  callerRole: { id: string; name: string; color: string } | null;
  calls: number;
  passed: number;
};

const STATUS_TONE = { ACTIVE: "green", PENDING: "amber", BLOCKED: "red", REJECTED: "gray" } as const;

export default function EmployeesPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState("ACTIVE");
  const [q, setQ] = React.useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["employees", status, q],
    queryFn: () => api<{ rows: EmployeeRow[] }>(`/api/employees${qs({ status, q })}`),
  });
  return (
    <div>
      <PageHeader title="Сотрудники" description="Состав кадрового подразделения" />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
          <Tabs
            value={status}
            onValueChange={setStatus}
            items={[
              { value: "ACTIVE", label: "Активные" },
              { value: "BLOCKED", label: "Заблокированные" },
              { value: "PENDING", label: "Ожидают" },
              { value: "all", label: "Все" },
            ]}
          />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <Input className="pl-8" placeholder="Ник или VK ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState icon={<Users />} title="Сотрудники не найдены" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Сотрудник</Th>
                <Th>VK ID</Th>
                <Th>Основная должность</Th>
                <Th>Должность обзвонщика</Th>
                <Th>Статус</Th>
                <Th className="text-right">Проверок</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <Tr key={u.id} onClick={() => router.push(`/employees/${u.id}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatarUrl} name={u.nickname} size={32} />
                      <span className="font-medium">{u.nickname}</span>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-muted">{u.vkId}</Td>
                  <Td>{u.mainRole ? <RoleBadge role={u.mainRole} /> : <span className="text-muted">—</span>}</Td>
                  <Td>{u.callerRole ? <RoleBadge role={u.callerRole} /> : <span className="text-muted">—</span>}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[u.status as keyof typeof STATUS_TONE] ?? "gray"} dot>
                      {USER_STATUS_LABEL[u.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {u.calls} <span className="text-xs text-emerald-400">({u.passed} ✓)</span>
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
