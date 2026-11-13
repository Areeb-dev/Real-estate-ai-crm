"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, formatDuration, statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  SkeletonForm,
  Textarea,
  statusTone,
  useToast,
} from "@/components/ui";

type LeadDetail = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  propertyType?: string | null;
  preferredLocation?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  purchasePreference: string;
  source: string;
  status: string;
  notes?: string | null;
  calls: Array<{
    id: string;
    status: string;
    createdAt: string;
    durationSeconds?: number | null;
    interestScore?: number | null;
    summary?: string | null;
  }>;
};

function LeadDetailSkeleton() {
  return (
    <div>
      <div className="mb-6 flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SkeletonForm fields={6} />
        <Card className="p-5">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api<LeadDetail>(`/api/leads/${params.id}`);
      setLead(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!lead || saving) return;
    setSaving(true);
    try {
      const updated = await api<LeadDetail>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          propertyType: lead.propertyType || null,
          preferredLocation: lead.preferredLocation || null,
          budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
          budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
          purchasePreference: lead.purchasePreference,
          source: lead.source,
          status: lead.status,
          notes: lead.notes || null,
        }),
      });
      setLead({ ...lead, ...updated, calls: lead.calls });
      toast.success("Lead saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onCall() {
    if (!lead || calling) return;
    setCalling(true);
    setError("");
    try {
      await api("/api/outbound/calls", {
        method: "POST",
        body: JSON.stringify({ leadId: lead.id }),
      });
      toast.success("Outbound call started");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Outbound call failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setCalling(false);
    }
  }

  if (loading && !lead) return <LeadDetailSkeleton />;
  if (error && !lead) return <ErrorBlock message={error} />;
  if (!lead) return <EmptyState title="Lead not found" />;

  return (
    <div>
      <PageHeader
        title={lead.name}
        description="Lead profile and complete call history"
        actions={
          <>
            <Button onClick={onCall} loading={calling} loadingText="Calling...">
              <Phone className="h-4 w-4" />
              Call with AI
            </Button>
            <Link href="/leads">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-xl text-ink-800">Profile</h2>
          <form onSubmit={onSave} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={lead.phone}
                onChange={(e) => setLead({ ...lead, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={lead.email || ""}
                onChange={(e) => setLead({ ...lead, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={lead.preferredLocation || ""}
                onChange={(e) => setLead({ ...lead, preferredLocation: e.target.value })}
              />
            </div>
            <div>
              <Label>Property type</Label>
              <Select
                value={lead.propertyType || ""}
                onChange={(e) => setLead({ ...lead, propertyType: e.target.value })}
              >
                <option value="">Select</option>
                {["APARTMENT", "HOUSE", "VILLA", "PLOT", "COMMERCIAL", "OFFICE", "OTHER"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {statusLabel(v)}
                    </option>
                  )
                )}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={lead.status}
                onChange={(e) => setLead({ ...lead, status: e.target.value })}
              >
                {[
                  "NEW",
                  "PENDING",
                  "INTERESTED",
                  "NOT_INTERESTED",
                  "FOLLOW_UP",
                  "QUALIFIED",
                  "DISQUALIFIED",
                  "NO_RESPONSE",
                ].map((v) => (
                  <option key={v} value={v}>
                    {statusLabel(v)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Budget min</Label>
              <Input
                type="number"
                value={lead.budgetMin ?? ""}
                onChange={(e) =>
                  setLead({ ...lead, budgetMin: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
            <div>
              <Label>Budget max</Label>
              <Input
                type="number"
                value={lead.budgetMax ?? ""}
                onChange={(e) =>
                  setLead({ ...lead, budgetMax: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={4}
                value={lead.notes || ""}
                onChange={(e) => setLead({ ...lead, notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" loading={saving} loadingText="Saving...">
                Save changes
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Call history</h2>
          <div className="mt-4 space-y-3">
            {lead.calls.length === 0 ? (
              <EmptyState title="No calls linked yet" description="Start an AI call to begin." />
            ) : (
              lead.calls.map((call) => (
                <Link
                  key={call.id}
                  href={`/calls/${call.id}`}
                  className="block rounded-lg border border-ink-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={statusTone(call.status)}>{statusLabel(call.status)}</Badge>
                    <span className="text-xs text-ink-500">{formatDate(call.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">
                    Duration {formatDuration(call.durationSeconds)} · Score{" "}
                    {call.interestScore ?? "—"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                    {call.summary || "No summary"}
                  </p>
                </Link>
              ))
            )}
          </div>
          <div className="mt-6 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            Budget range: {formatCurrency(lead.budgetMin)} – {formatCurrency(lead.budgetMax)}
          </div>
        </Card>
      </div>
    </div>
  );
}
