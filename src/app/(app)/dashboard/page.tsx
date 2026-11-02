"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Ban, CheckCircle2, ClipboardList, Hourglass, Inbox, PhoneCall, ShieldX, Timer, Trophy, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { EVENT_TYPE_LABEL, formatDateTime } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { PageHeader, StatCard } from "@/components/app/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";

type Dashboard = {
  totals: { total: number; pendingReview: number; identityCheck: number; waitingCaller: number; inWork: number; completed: number; rejected: number; autoRejected: number };
  caller: { myActive: number; today: number; week: number; passed: number; failed: number };
  recent: { id: string; type: string; createdAt: string; actorType: string; actor: { id: string; nickname: string } | null; application: { id: number; nickname: string } | null; comment: string | null }[];
  daily: { label: string; submitted: number; approved: number; rejected: number; auto: number; passed: number; failed: number }[];
};

const tooltipStyle = { background: "#12121C", border: "1px solid #26263a", borderRadius: 10, fontSize: 12 };

export default function DashboardPage() {
  const { user, can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/dashboard") });
  const t = data?.totals;
  const isCaller = can(["applications.assign", "calls.start"]);

  const pie = t
    ? [
        { name: "Завершены", value: t.completed, color: "#22C55E" },
        { name: "Отклонены", value: t.rejected, color: "#EF4444" },
        { name: "Автоотказы", value: t.autoRejected, color: "#F97316" },
        { name: "В работе", value: t.inWork + t.waitingCaller, color: "#8B5CF6" },
        { name: "На рассмотрении", value: t.pendingReview, color: "#3B82F6" },
      ].filter((x) => x.value > 0)
    : [];

  return (
    <div>
      <PageHeader title={`Добро пожаловать, ${user?.nickname ?? ""}`} description="Сводка работы кадрового подразделения" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard index={0} label="Всего заявок" value={t?.total} loading={isLoading} icon={<ClipboardList />} tone="violet" />
        <StatCard index={1} label="Ожидают рассмотрения" value={t?.pendingReview} loading={isLoading} icon={<Inbox />} tone="blue" />
        <StatCard index={2} label="Ожидают обзвонщика" value={t?.waitingCaller} loading={isLoading} icon={<Hourglass />} tone="violet" />
        <StatCard index={3} label="В работе" value={t?.inWork} loading={isLoading} icon={<PhoneCall />} tone="cyan" />
        <StatCard index={4} label="Завершены" value={t?.completed} loading={isLoading} icon={<CheckCircle2 />} tone="green" />
        <StatCard index={5} label="Отклонены" value={t?.rejected} loading={isLoading} icon={<XCircle />} tone="red" />
        <StatCard index={6} label="Автоотказы" value={t?.autoRejected} loading={isLoading} icon={<ShieldX />} tone="orange" />
      </div>

      {isCaller && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Моя работа обзвонщика</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Link href="/my" className="block [&>button]:size-full [&>button]:cursor-pointer">
              <StatCard label="Мои заявки" value={data?.caller.myActive} loading={isLoading} icon={<ClipboardList />} tone="violet" />
            </Link>
            <StatCard label="Проверки сегодня" value={data?.caller.today} loading={isLoading} icon={<Timer />} tone="blue" />
            <StatCard label="Проверки за неделю" value={data?.caller.week} loading={isLoading} icon={<Activity />} tone="cyan" />
            <StatCard label="Успешные" value={data?.caller.passed} loading={isLoading} icon={<Trophy />} tone="green" />
            <StatCard label="Неуспешные" value={data?.caller.failed} loading={isLoading} icon={<Ban />} tone="red" />
          </div>
        </motion.div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Заявки за 14 дней" description="Поступление и решения по дням" />
          <CardBody className="h-72">
            {isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.daily} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gSub" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gApp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#26263a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#8e8ea8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8e8ea8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="submitted" name="Поступило" stroke="#8B5CF6" fill="url(#gSub)" strokeWidth={2} />
                  <Area type="monotone" dataKey="approved" name="Принято" stroke="#3B82F6" fill="url(#gApp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="rejected" name="Отклонено" stroke="#EF4444" fill="transparent" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="auto" name="Автоотказ" stroke="#F97316" fill="transparent" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Распределение статусов" />
          <CardBody className="h-72">
            {isLoading ? (
              <Skeleton className="size-full" />
            ) : pie.length === 0 ? (
              <EmptyState title="Заявок пока нет" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="none">
                    {pie.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Результаты обзвонов" description="Прошли / не прошли по дням" />
          <CardBody className="h-60">
            {isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.daily} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#26263a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#8e8ea8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8e8ea8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1A1A27" }} />
                  <Bar dataKey="passed" name="Прошли" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Не прошли" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Последние события" />
          <div className="max-h-60 divide-y divide-border/50 overflow-y-auto">
            {isLoading && <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div>}
            {data?.recent.length === 0 && <EmptyState title="Событий пока нет" />}
            {data?.recent.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {EVENT_TYPE_LABEL[e.type] ?? e.type}
                    {e.application && (
                      <Link href={`/applications/${e.application.id}`} className="ml-1 text-violet-300 hover:underline">
                        #{e.application.id}
                      </Link>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {e.actor ? e.actor.nickname : e.actorType === "SYSTEM" ? "Система" : "—"} · {formatDateTime(e.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
