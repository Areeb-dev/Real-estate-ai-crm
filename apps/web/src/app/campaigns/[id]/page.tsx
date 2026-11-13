"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Megaphone,
  Phone,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  PageHeader,
  Skeleton,
  SkeletonTable,
  Table,
  Td,
  Th,
  Tr,
  statusTone,
  useToast,
} from "@/components/ui";

type CampaignDetail = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  leads: Array<{
    id: string;
    status: string;
    attempts: number;
    lastError?: string | null;
    lead: { id: string; name: string; phone: string };
    lastCall?: { id: string; status: string; interestScore?: number | null } | null;
  }>;
};

function CampaignDetailSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-24" />
          </Card>
        ))}
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api<CampaignDetail>(`/api/outbound/campaigns/${params.id}`);
      setCampaign(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function start() {
    if (!campaign || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message?: string; leadCount?: number }>(
        `/api/outbound/campaigns/${campaign.id}/start`,
        { method: "POST" }
      );
      toast.success(
        result.message ||
          `Campaign queued for n8n (${result.leadCount ?? campaign.leads.length} leads).`
      );
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to queue campaign";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !campaign) return <CampaignDetailSkeleton />;
  if (error && !campaign) return <ErrorBlock message={error} />;
  if (!campaign) return <EmptyState title="Campaign not found" />;

  const statusCounts = campaign.leads.reduce(
    (acc, row) => {
      const key = row.status.toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const canQueue = !["COMPLETED", "CANCELLED"].includes(campaign.status.toUpperCase());

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={campaign.description || "Campaign lead dialing status and queue progress."}
        actions={
          <>
            <Link href="/campaigns">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <Button
              onClick={start}
              loading={busy}
              loadingText="Queuing..."
              disabled={!canQueue}
            >
              Queue for n8n
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(campaign.status)}>{statusLabel(campaign.status)}</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Leads</p>
          <div className="mt-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <p className="font-display text-2xl text-ink-800">{campaign.leads.length}</p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Progress</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(statusCounts).length === 0 ? (
              <span className="text-sm text-ink-500">No activity yet</span>
            ) : (
              Object.entries(statusCounts).map(([status, count]) => (
                <Badge key={status} tone={statusTone(status)}>
                  {statusLabel(status)} · {count}
                </Badge>
              ))
            )}
          </div>
        </Card>
      </div>

      {campaign.leads.length === 0 ? (
        <EmptyState
          title="No leads in this campaign"
          description="Add leads when creating a campaign, then queue them for n8n outbound dialing."
          icon={<Megaphone className="h-5 w-5" />}
          action={
            <Link href="/campaigns">
              <Button variant="secondary" size="sm">
                Back to campaigns
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-200 bg-ink-50/80 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-700">Campaign leads</h2>
          </div>
          <Table>
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <Th>Lead</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Last call</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {campaign.leads.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      href={`/leads/${row.lead.id}`}
                      className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
                    >
                      {row.lead.name}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                      <Phone className="h-3 w-3" />
                      {row.lead.phone}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                  </Td>
                  <Td>
                    <span className="tabular-nums font-medium text-ink-800">{row.attempts}</span>
                  </Td>
                  <Td>
                    {row.lastCall ? (
                      <Link
                        href={`/calls/${row.lastCall.id}`}
                        className="inline-flex flex-col gap-0.5 text-brand-700 hover:underline"
                      >
                        <Badge tone={statusTone(row.lastCall.status)}>
                          {statusLabel(row.lastCall.status)}
                        </Badge>
                        {row.lastCall.interestScore != null ? (
                          <span className="text-xs text-ink-500">
                            Score {row.lastCall.interestScore}
                          </span>
                        ) : null}
                      </Link>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </Td>
                  <Td>
                    {row.lastError ? (
                      <span
                        className="inline-flex max-w-[220px] items-start gap-1.5 text-xs text-red-600"
                        title={row.lastError}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2">{row.lastError}</span>
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
