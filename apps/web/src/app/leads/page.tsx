"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Trash2, Upload, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Input,
  Label,
  PageHeader,
  Select,
  SkeletonTable,
  Table,
  Td,
  Textarea,
  Th,
  Tooltip,
  Tr,
  statusTone,
  useToast,
} from "@/components/ui";

type Lead = {
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
  createdAt: string;
  _count?: { calls: number };
};

const STATUSES = [
  "NEW",
  "PENDING",
  "INTERESTED",
  "NOT_INTERESTED",
  "FOLLOW_UP",
  "QUALIFIED",
  "DISQUALIFIED",
  "NO_RESPONSE",
];

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  propertyType: "",
  preferredLocation: "",
  budgetMin: "",
  budgetMax: "",
  purchasePreference: "UNKNOWN",
  source: "manual",
  status: "NEW",
  notes: "",
};

export default function LeadsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const data = await api<{
        items: Lead[];
        pagination: { totalPages: number };
      }>(`/api/leads?${params}`);
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, 300);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          propertyType: form.propertyType || undefined,
          budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
          budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      toast.success("Lead created");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create lead";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onImport(file: File) {
    if (importing) return;
    setImporting(true);
    const body = new FormData();
    body.append("file", file);
    try {
      await api("/api/leads/import", { method: "POST", body });
      toast.success("Leads imported successfully");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  async function confirmDeleteLead() {
    if (!confirmDelete || deletingId) return;
    setDeletingId(confirmDelete);
    try {
      await api(`/api/leads/${confirmDelete}`, { method: "DELETE" });
      toast.success("Lead deleted");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  }

  async function onCall(id: string) {
    if (callingId) return;
    setCallingId(id);
    setError("");
    try {
      await api("/api/outbound/calls", {
        method: "POST",
        body: JSON.stringify({ leadId: id }),
      });
      toast.success("Outbound call started");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Outbound call failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setCallingId(null);
    }
  }

  const showSkeleton = initialLoad && loading;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Manage prospects, imports, and call-linked customers."
        actions={
          <>
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
              {importing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import CSV/Excel
                </>
              )}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImport(file);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              onClick={() => setShowForm((v) => !v)}
              variant={showForm ? "secondary" : "primary"}
            >
              {showForm ? "Close" : "Add lead"}
            </Button>
          </>
        }
      />

      {showForm ? (
        <Card className="mb-6 p-5">
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Preferred location</Label>
              <Input
                value={form.preferredLocation}
                onChange={(e) => setForm({ ...form, preferredLocation: e.target.value })}
              />
            </div>
            <div>
              <Label>Property type</Label>
              <Select
                value={form.propertyType}
                onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
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
              <Label>Purchase preference</Label>
              <Select
                value={form.purchasePreference}
                onChange={(e) => setForm({ ...form, purchasePreference: e.target.value })}
              >
                {["BUY", "SELL", "RENT", "UNKNOWN"].map((v) => (
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
                value={form.budgetMin}
                onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
              />
            </div>
            <div>
              <Label>Budget max</Label>
              <Input
                type="number"
                value={form.budgetMax}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
              />
            </div>
            <div>
              <Label>Source</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {statusLabel(v)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" loading={saving} loadingText="Creating...">
                Create lead
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Search name, phone, email..."
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <Select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((v) => (
              <option key={v} value={v}>
                {statusLabel(v)}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      {showSkeleton ? (
        <SkeletonTable rows={8} cols={7} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No leads found"
          description="Add a lead or import a CSV/Excel file."
          icon={<Users className="h-5 w-5" />}
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              Add lead
            </Button>
          }
        />
      ) : (
        <Card className={`overflow-hidden ${loading ? "opacity-70" : ""}`}>
          <Table>
            <thead className="bg-ink-50">
              <tr>
                <Th>Customer</Th>
                <Th>Property</Th>
                <Th>Budget</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <Tr key={lead.id}>
                  <Td>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="text-xs text-ink-500">{lead.phone}</p>
                  </Td>
                  <Td>
                    {lead.propertyType ? statusLabel(lead.propertyType) : "—"}
                    <p className="text-xs text-ink-500">{lead.preferredLocation || "—"}</p>
                  </Td>
                  <Td>
                    {formatCurrency(lead.budgetMin)} – {formatCurrency(lead.budgetMax)}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(lead.status)}>{statusLabel(lead.status)}</Badge>
                  </Td>
                  <Td>{lead.source}</Td>
                  <Td>{formatDate(lead.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip content="Start AI outbound call">
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={callingId === lead.id}
                          loadingText="Calling..."
                          disabled={callingId !== null && callingId !== lead.id}
                          onClick={() => onCall(lead.id)}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete lead">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(lead.id)}
                          aria-label="Delete lead"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </Tooltip>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3">
            <p className="text-sm text-ink-500">
              Page {page} of {totalPages || 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this lead?"
        description="This action cannot be undone. Call history linked to this lead will remain."
        confirmLabel="Delete"
        danger
        loading={deletingId !== null}
        onConfirm={confirmDeleteLead}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
