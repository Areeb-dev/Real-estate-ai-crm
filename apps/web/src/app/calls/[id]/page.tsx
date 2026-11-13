"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, formatDuration, statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  ErrorBlock,
  PageHeader,
  Skeleton,
  SkeletonCard,
  statusTone,
} from "@/components/ui";

type CallDetail = {
  id: string;
  customerName?: string | null;
  customerPhone: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  interestLevel: string;
  interestScore?: number | null;
  summary?: string | null;
  lead?: { id: string; name: string } | null;
  transcript?: { content: string } | null;
  analysis?: {
    summary?: string | null;
    propertyType?: string | null;
    location?: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    purchaseTimeline?: string | null;
    customerIntent?: string | null;
    interestScore?: number | null;
    interestLevel?: string | null;
    recommendedAction?: string | null;
    extractedRequirements?: Record<string, unknown> | null;
  } | null;
};

function CallDetailSkeleton() {
  return (
    <div>
      <div className="mb-6 flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="mb-4 h-6 w-32" />
          <Skeleton className="h-24 w-full" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="mb-4 h-6 w-28" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="mt-8 mb-3 h-5 w-40" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </Card>
      </div>
      <Card className="mt-6 p-5">
        <Skeleton className="mb-4 h-6 w-28" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </Card>
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<CallDetail>(`/api/calls/${params.id}`)
      .then(setCall)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load call"))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <CallDetailSkeleton />;
  if (error) return <ErrorBlock message={error} />;
  if (!call) return <ErrorBlock message="Call not found" />;

  const analysis = call.analysis;

  return (
    <div>
      <PageHeader
        title={call.customerName || call.customerPhone}
        description="Transcript, recording, and AI analysis"
        actions={
          <Link href="/calls">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to calls
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Status"
          value={<Badge tone={statusTone(call.status)}>{statusLabel(call.status)}</Badge>}
        />
        <Stat label="Duration" value={formatDuration(call.durationSeconds)} />
        <Stat
          label="Interest score"
          value={String(call.interestScore ?? analysis?.interestScore ?? "—")}
        />
        <Stat
          label="Lead"
          value={
            call.lead ? (
              <Link href={`/leads/${call.lead.id}`} className="text-brand-700 hover:underline">
                {call.lead.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">AI summary</h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">
            {analysis?.summary || call.summary || "No summary available."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Intent" value={statusLabel(analysis?.customerIntent || "UNKNOWN")} />
            <Info
              label="Interest"
              value={statusLabel(analysis?.interestLevel || call.interestLevel)}
            />
            <Info
              label="Property"
              value={analysis?.propertyType ? statusLabel(analysis.propertyType) : "—"}
            />
            <Info label="Location" value={analysis?.location || "—"} />
            <Info
              label="Budget"
              value={`${formatCurrency(analysis?.budgetMin)} – ${formatCurrency(analysis?.budgetMax)}`}
            />
            <Info label="Timeline" value={analysis?.purchaseTimeline || "—"} />
          </div>
          <div className="mt-5 rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
            <p className="font-medium">Recommended next action</p>
            <p className="mt-1">{analysis?.recommendedAction || "Review manually."}</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Recording</h2>
          {call.recordingUrl ? (
            <audio className="mt-4 w-full" controls src={call.recordingUrl}>
              Your browser does not support audio playback.
            </audio>
          ) : (
            <p className="mt-4 text-sm text-ink-500">No recording URL available for this call.</p>
          )}
          <p className="mt-4 text-xs text-ink-500">
            {formatDate(call.startedAt)} → {formatDate(call.endedAt)}
          </p>
          <h3 className="mt-8 font-display text-lg text-ink-800">Extracted requirements</h3>
          <pre className="mt-3 overflow-auto rounded-lg bg-ink-900 p-4 text-xs text-ink-100">
            {JSON.stringify(analysis?.extractedRequirements || {}, null, 2)}
          </pre>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl text-ink-800">Transcript</h2>
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-ink-50 p-4 text-sm leading-7 text-ink-700">
          {call.transcript?.content || "Transcript not available yet."}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mt-2 text-sm font-medium text-ink-800">{value}</div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 px-3 py-2">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink-800">{value}</p>
    </div>
  );
}
