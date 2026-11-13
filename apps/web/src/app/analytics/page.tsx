"use client";

import { useCallback, useEffect, useState } from "react";
import {
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
import { statusLabel } from "@/lib/utils";
import {
  Card,
  ErrorBlock,
  Input,
  Label,
  PageHeader,
  SkeletonCard,
  SkeletonChart,
} from "@/components/ui";

type Analytics = {
  totals: {
    calls: number;
    leads: number;
    completedCalls: number;
    missedCalls: number;
    interestedLeads: number;
    followUps: number;
    conversionRate: number;
    answerRate: number;
    avgInterestScore: number;
  };
  interestLevels: Array<{ name: string; value: number }>;
  leadStatuses: Array<{ name: string; value: number }>;
  propertyPreferences: Array<{ name: string; value: number }>;
};

const COLORS = ["#1E40AF", "#2563EB", "#3B82F6", "#60A5FA", "#64748B", "#94A3B8"];

function AnalyticsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonChart key={i} />
        ))}
      </div>
    </>
  );
}

export default function AnalyticsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const result = await api<Analytics>(`/api/dashboard/analytics?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Conversion, call quality, and property preference reporting."
      />

      <Card className="mb-6 grid gap-4 p-4 md:grid-cols-2">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      {initialLoad && loading ? (
        <AnalyticsSkeleton />
      ) : !data ? (
        <ErrorBlock message={error || "No analytics data"} />
      ) : (
        <div className={loading ? "opacity-70 transition-opacity" : ""}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Calls", data.totals.calls],
              ["Leads", data.totals.leads],
              ["Conversion %", data.totals.conversionRate],
              ["Answer rate %", data.totals.answerRate],
              ["Completed calls", data.totals.completedCalls],
              ["Missed calls", data.totals.missedCalls],
              ["Interested leads", data.totals.interestedLeads],
              ["Avg interest score", Math.round(data.totals.avgInterestScore)],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-5 transition hover:shadow-soft">
                <p className="text-sm text-ink-500">{label}</p>
                <p className="mt-2 font-display text-3xl text-ink-800">{value}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="p-5">
              <h2 className="mb-4 font-display text-xl text-ink-800">Interest levels</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.interestLevels} dataKey="value" nameKey="name" outerRadius={90}>
                    {data.interestLevels.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 font-display text-xl text-ink-800">Lead statuses</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.leadStatuses.map((d) => ({ ...d, name: statusLabel(d.name) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" hide />
                  <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 font-display text-xl text-ink-800">Property preferences</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.propertyPreferences.map((d) => ({
                    ...d,
                    name: statusLabel(d.name),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                  <YAxis allowDecimals={false} width={30} stroke="#94A3B8" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
