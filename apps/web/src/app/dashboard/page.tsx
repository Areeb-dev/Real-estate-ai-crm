"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { formatDate, statusLabel } from "@/lib/utils";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  PageHeader,
  SkeletonCard,
  SkeletonChart,
  SkeletonList,
  statusTone,
} from "@/components/ui";

type Stats = {
  totalLeads: number;
  newLeads: number;
  totalCallsToday: number;
  answeredCalls: number;
  missedCalls: number;
  interestedLeads: number;
  notInterestedLeads: number;
  followUpsRequired: number;
};

type Charts = {
  callsOverTime: Array<{ date: string; count: number }>;
  leadsOverTime: Array<{ date: string; count: number }>;
  interestBreakdown: Array<{ name: string; value: number }>;
  callPerformance: Array<{ name: string; value: number }>;
  propertyDistribution: Array<{ name: string; value: number }>;
  budgetDistribution: Array<{ name: string; value: number }>;
  recentCalls: Array<{
    id: string;
    customerName?: string | null;
    customerPhone: string;
    status: string;
    createdAt: string;
    interestScore?: number | null;
  }>;
  recentLeads: Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    createdAt: string;
  }>;
};

const COLORS = ["#1E40AF", "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#64748B"];

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-md bg-ink-200/70" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-ink-200/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonChart key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="p-5">
            <div className="mb-4 h-6 w-32 animate-pulse rounded-md bg-ink-200/70" />
            <SkeletonList rows={4} />
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (isInitial = false) => {
    try {
      setError("");
      if (isInitial) setLoading(true);
      const [s, c] = await Promise.all([
        api<Stats>("/api/dashboard/stats"),
        api<Charts>("/api/dashboard/charts?days=30"),
      ]);
      setStats(s);
      setCharts(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useSocket({ onDashboardRefresh: () => load(false) });

  if (loading) return <DashboardSkeleton />;
  if (error && !stats) return <ErrorBlock message={error} />;
  if (!stats || !charts) return <EmptyState title="No dashboard data yet" />;

  const cards = [
    { label: "Total Leads", value: stats.totalLeads },
    { label: "New Leads", value: stats.newLeads },
    { label: "Calls Today", value: stats.totalCallsToday },
    { label: "Answered", value: stats.answeredCalls },
    { label: "Missed", value: stats.missedCalls },
    { label: "Interested", value: stats.interestedLeads },
    { label: "Not Interested", value: stats.notInterestedLeads },
    { label: "Follow-ups", value: stats.followUpsRequired },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live overview of inbound calls, leads, and conversion signals."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-5 transition hover:shadow-soft">
            <p className="text-sm text-ink-500">{card.label}</p>
            <p className="mt-2 font-display text-3xl text-ink-800">{card.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Incoming calls over time">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={charts.callsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" hide />
              <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#2563EB" fill="#DBEAFE" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead generation trends">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.leadsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" hide />
              <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Interested vs uninterested">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts.interestBreakdown} dataKey="value" nameKey="name" outerRadius={90}>
                {charts.interestBreakdown.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Call performance">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.callPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
              <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#1E40AF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Property type distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts.propertyDistribution} dataKey="value" nameKey="name" outerRadius={90}>
                {charts.propertyDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Customer budget distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.budgetDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
              <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl text-ink-800">Recent calls</h2>
            <Link href="/calls" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {charts.recentCalls.length === 0 ? (
              <EmptyState title="No calls yet" description="Inbound Vapi calls will appear here." />
            ) : (
              charts.recentCalls.map((call) => (
                <Link
                  key={call.id}
                  href={`/calls/${call.id}`}
                  className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div>
                    <p className="font-medium text-ink-800">
                      {call.customerName || call.customerPhone}
                    </p>
                    <p className="text-xs text-ink-500">{formatDate(call.createdAt)}</p>
                  </div>
                  <Badge tone={statusTone(call.status)}>{statusLabel(call.status)}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl text-ink-800">Recent leads</h2>
            <Link href="/leads" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {charts.recentLeads.length === 0 ? (
              <EmptyState title="No leads yet" />
            ) : (
              charts.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div>
                    <p className="font-medium text-ink-800">{lead.name}</p>
                    <p className="text-xs text-ink-500">{lead.phone}</p>
                  </div>
                  <Badge tone={statusTone(lead.status)}>{statusLabel(lead.status)}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-display text-xl text-ink-800">{title}</h2>
      {children}
    </Card>
  );
}
