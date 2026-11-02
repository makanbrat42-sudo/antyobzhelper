"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Medal, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/labels";
import { PageHeader, Table, TableSkeleton, Td, Th } from "@/components/app/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Avatar, EmptyState, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Row = {
  user: { id: string; nickname: string; avatarUrl: string | null; vkId: string };
  callerRole: { name: string; color: string } | null;
  completed: number;
  passed: number;
  failed: number;
  refused: number;
  postponed: number;
  avgDurationSec: number | null;
};

const MEDAL = ["text-yellow-300", "text-zinc-300", "text-amber-600"];

export default function RatingPage() {
  const [period, setPeriod] = React.useState("week");
  const { data, isLoading } = useQuery({ queryKey: ["rating", period], queryFn: () => api<{ rows: Row[] }>(`/api/rating?period=${period}`) });
  const rows = data?.rows ?? [];
  const top = rows.filter((r) => r.completed > 0).slice(0, 3);

  return (
    <div>
      <PageHeader
        title="Рейтинг обзвонщиков"
        description="Завершённые (прошёл / не прошёл / отказался) и успешные проверки"
        actions={
          <Tabs
            value={period}
            onValueChange={setPeriod}
            items={[
              { value: "today", label: "Сегодня" },
              { value: "week", label: "Неделя" },
              { value: "month", label: "Месяц" },
              { value: "all", label: "Всё время" },
            ]}
          />
        }
      />

      {top.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {top.map((r, i) => (
            <motion.div key={r.user.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className={cn("relative overflow-hidden p-5", i === 0 && "border-yellow-400/30")}>
                <Medal className={cn("absolute right-4 top-4 size-6", MEDAL[i])} />
                <div className="flex items-center gap-3">
                  <Avatar src={r.user.avatarUrl} name={r.user.nickname} size={44} />
                  <div>
                    <Link href={`/employees/${r.user.id}`} className="font-semibold hover:underline">
                      {r.user.nickname}
                    </Link>
                    <div className="mt-0.5">
                      <RoleBadge role={r.callerRole} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-6 text-sm">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{r.completed}</p>
                    <p className="text-xs text-muted">завершено</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-emerald-300">{r.passed}</p>
                    <p className="text-xs text-muted">успешных</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          {isLoading ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Trophy />} title="Нет данных за период" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Обзвонщик</Th>
                  <Th className="text-right">Завершено</Th>
                  <Th className="text-right">Прошли</Th>
                  <Th className="text-right">Не прошли</Th>
                  <Th className="text-right">Отказ / перенос</Th>
                  <Th className="text-right">Ср. время</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user.id} className="transition hover:bg-surface/40">
                    <Td className="font-mono text-muted">{i + 1}</Td>
                    <Td>
                      <Link href={`/employees/${r.user.id}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar src={r.user.avatarUrl} name={r.user.nickname} size={28} />
                        <span className="font-medium">{r.user.nickname}</span>
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{r.completed}</Td>
                    <Td className="text-right tabular-nums text-emerald-300">{r.passed}</Td>
                    <Td className="text-right tabular-nums text-red-300">{r.failed}</Td>
                    <Td className="text-right tabular-nums text-muted">
                      {r.refused} / {r.postponed}
                    </Td>
                    <Td className="text-right text-muted">{formatDuration(r.avgDurationSec)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Сравнение" />
          <CardBody className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.slice(0, 10).map((r) => ({ name: r.user.nickname, passed: r.passed, failed: r.failed + r.refused }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#26263a" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="#8e8ea8" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#8e8ea8" fontSize={11} width={90} />
                <Tooltip contentStyle={{ background: "#12121C", border: "1px solid #26263a", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#1A1A27" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="passed" name="Прошли" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" name="Не прошли / отказ" stackId="a" fill="#EF4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
