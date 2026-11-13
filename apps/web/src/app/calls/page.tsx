"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { formatDate, formatDuration, statusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  PageHeader,
  Select,
  SkeletonTable,
  Table,
  Td,
  Th,
  Tr,
  statusTone,
} from "@/components/ui";

type CallItem = {
  id: string;
  customerName?: string | null;
  customerPhone: string;
  status: string;
  startedAt?: string | null;
  createdAt: string;
  durationSeconds?: number | null;
  interestLevel: string;
  interestScore?: number | null;
  summary?: string | null;
};

export default function CallsPage() {
  const [items, setItems] = useState<CallItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true);
        setError("");
        const params = new URLSearchParams({ page: String(page), limit: "12" });
        if (search) params.set("search", search);
        if (status) params.set("status", status);
        const data = await api<{ items: CallItem[]; pagination: { totalPages: number } }>(
          `/api/calls?${params}`
        );
        setItems(data.items);
        setTotalPages(data.pagination.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load calls");
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [page, search, status]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useSocket({
    onCallUpdate: () => load(true),
    onDashboardRefresh: () => load(true),
  });

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, 300);
  }

  const showSkeleton = initialLoad && loading;

  return (
    <div>
      <PageHeader
        title="Calls"
        description="Inbound AI call history, interest classification, and summaries."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Search customer or summary..."
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
            {["RINGING", "IN_PROGRESS", "COMPLETED", "MISSED", "FAILED", "VOICEMAIL"].map((v) => (
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
        <SkeletonTable rows={8} cols={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No calls yet"
          description="Configure Vapi webhooks to start receiving inbound calls."
          icon={<PhoneCall className="h-5 w-5" />}
        />
      ) : (
        <Card className={`overflow-hidden ${loading ? "opacity-70" : ""}`}>
          <Table>
            <thead className="bg-ink-50">
              <tr>
                <Th>Customer</Th>
                <Th>When</Th>
                <Th>Duration</Th>
                <Th>Status</Th>
                <Th>Interest</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((call) => (
                <Tr key={call.id}>
                  <Td>
                    <Link
                      href={`/calls/${call.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {call.customerName || "Unknown"}
                    </Link>
                    <p className="text-xs text-ink-500">{call.customerPhone}</p>
                  </Td>
                  <Td>{formatDate(call.startedAt || call.createdAt)}</Td>
                  <Td className="tabular-nums">{formatDuration(call.durationSeconds)}</Td>
                  <Td>
                    <Badge tone={statusTone(call.status)}>{statusLabel(call.status)}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(call.interestLevel)}>
                      {statusLabel(call.interestLevel)}
                      {call.interestScore != null ? ` · ${call.interestScore}` : ""}
                    </Badge>
                  </Td>
                  <Td className="max-w-xs truncate text-ink-600">{call.summary || "—"}</Td>
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
    </div>
  );
}
