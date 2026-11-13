"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
  statusTone,
  useToast,
} from "@/components/ui";

type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  scheduledAt?: string | null;
  createdAt: string;
  _count?: { leads: number; calls: number };
};

type LeadOption = { id: string; name: string; phone: string; status: string };

function CampaignsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function CampaignsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    scheduledAt: "",
    leadIds: [] as string[],
  });

  const load = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError("");
      const [campaigns, leadPage] = await Promise.all([
        api<Campaign[]>("/api/outbound/campaigns"),
        api<{ items: LeadOption[] }>("/api/leads?limit=100"),
      ]);
      setItems(campaigns);
      setLeads(leadPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/outbound/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          scheduledAt: form.scheduledAt || undefined,
          leadIds: form.leadIds,
        }),
      });
      setForm({ name: "", description: "", scheduledAt: "", leadIds: [] });
      setShowForm(false);
      toast.success("Campaign created");
      await load(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create campaign";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function startCampaign(id: string) {
    if (startingId) return;
    setStartingId(id);
    setError("");
    try {
      const result = await api<{ queued?: boolean; leadCount?: number; message?: string }>(
        `/api/outbound/campaigns/${id}/start`,
        { method: "POST" }
      );
      toast.success(
        result.message ||
          `Campaign queued for n8n (${result.leadCount ?? 0} leads). n8n will dial and save results.`
      );
      await load(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start campaign";
      setError(msg);
      toast.error(msg);
    } finally {
      setStartingId(null);
    }
  }

  function toggleLead(id: string) {
    setForm((prev) => ({
      ...prev,
      leadIds: prev.leadIds.includes(id)
        ? prev.leadIds.filter((x) => x !== id)
        : [...prev.leadIds, id],
    }));
  }

  return (
    <div>
      <PageHeader
        title="Outbound campaigns"
        description="Queue leads here — n8n fetches the queue, places Vapi outbound calls, and writes results back to the DB."
        actions={
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? "Close" : "New campaign"}
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      {showForm ? (
        <Card className="mb-6 p-5">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Schedule (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Select leads</Label>
              <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-lg border border-ink-200 p-3">
                {leads.length === 0 ? (
                  <p className="text-sm text-ink-500">No leads available. Create leads first.</p>
                ) : (
                  leads.map((lead) => (
                    <label
                      key={lead.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        checked={form.leadIds.includes(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                      />
                      <span className="font-medium text-ink-800">{lead.name}</span>
                      <span className="text-ink-500">{lead.phone}</span>
                      <Badge tone={statusTone(lead.status)}>{statusLabel(lead.status)}</Badge>
                    </label>
                  ))
                )}
              </div>
            </div>
            <Button
              type="submit"
              loading={saving}
              loadingText="Creating..."
              disabled={form.leadIds.length === 0}
            >
              Create campaign
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <CampaignsSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign to start outbound dialing."
          icon={<Megaphone className="h-5 w-5" />}
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              New campaign
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((campaign) => (
            <Card key={campaign.id} className="p-5 transition hover:shadow-soft">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="font-display text-xl text-ink-800 hover:text-brand-700"
                    >
                      {campaign.name}
                    </Link>
                    <Badge tone={statusTone(campaign.status)}>
                      {statusLabel(campaign.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {campaign._count?.leads ?? 0} leads · {campaign._count?.calls ?? 0} calls ·{" "}
                    {formatDate(campaign.createdAt)}
                  </p>
                  {campaign.description ? (
                    <p className="mt-2 text-sm text-ink-600">{campaign.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link href={`/campaigns/${campaign.id}`}>
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    loading={startingId === campaign.id}
                    loadingText="Queuing..."
                    disabled={
                      startingId !== null ||
                      ["COMPLETED", "CANCELLED"].includes(campaign.status.toUpperCase())
                    }
                    onClick={() => startCampaign(campaign.id)}
                  >
                    Queue for n8n
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
