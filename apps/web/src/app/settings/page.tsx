"use client";

import { FormEvent, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusLabel } from "@/lib/utils";
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
  SkeletonForm,
  Textarea,
  useToast,
} from "@/components/ui";

type SettingsPayload = {
  settings: {
    companyProfile?: Record<string, string>;
    vapi?: Record<string, string | boolean>;
    callingPreferences?: Record<string, string | boolean>;
    notifications?: Record<string, boolean>;
  };
  agent?: {
    id?: string;
    name: string;
    voice: string;
    language: string;
    greeting: string;
    systemPrompt: string;
    vapiAssistantId?: string | null;
  } | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SkeletonForm fields={5} />
      <SkeletonForm fields={3} />
      <div className="xl:col-span-2">
        <SkeletonForm fields={4} />
      </div>
      <SkeletonForm fields={3} />
      <SkeletonForm fields={3} />
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  async function load() {
    try {
      setLoading(true);
      const settings = await api<SettingsPayload>("/api/settings");
      setData(settings);
      if (user?.role === "ADMIN") {
        const list = await api<UserRow[]>("/api/settings/users");
        setUsers(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!data?.settings.companyProfile || saving) return;
    setSaving("company");
    setError("");
    try {
      await api("/api/settings/company", {
        method: "PUT",
        body: JSON.stringify(data.settings.companyProfile),
      });
      toast.success("Company profile saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving("");
    }
  }

  async function saveVapi(e: FormEvent) {
    e.preventDefault();
    if (!data?.settings.vapi || saving) return;
    setSaving("vapi");
    setError("");
    try {
      await api("/api/settings/vapi", {
        method: "PUT",
        body: JSON.stringify({
          assistantId: data.settings.vapi.assistantId,
          phoneNumberId: data.settings.vapi.phoneNumberId,
        }),
      });
      toast.success("Vapi configuration saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving("");
    }
  }

  async function saveAgent(e: FormEvent) {
    e.preventDefault();
    if (!data?.agent || saving) return;
    setSaving("agent");
    setError("");
    try {
      const result = await api<{ agent: SettingsPayload["agent"] }>("/api/settings/agent", {
        method: "PUT",
        body: JSON.stringify({ ...data.agent, syncToVapi: true }),
      });
      setData({ ...data, agent: result.agent });
      toast.success("AI agent updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving("");
    }
  }

  async function saveCalling(e: FormEvent) {
    e.preventDefault();
    if (!data?.settings.callingPreferences || saving) return;
    setSaving("calling");
    setError("");
    try {
      await api("/api/settings/calling-preferences", {
        method: "PUT",
        body: JSON.stringify(data.settings.callingPreferences),
      });
      toast.success("Calling preferences saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving("");
    }
  }

  async function saveNotifications(e: FormEvent) {
    e.preventDefault();
    if (!data?.settings.notifications || saving) return;
    setSaving("notifications");
    setError("");
    try {
      await api("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(data.settings.notifications),
      });
      toast.success("Notification settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving("");
    }
  }

  async function updateRole(id: string, role: string) {
    try {
      await api(`/api/settings/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      toast.success("Role updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Settings"
          description="Company profile, Vapi inbound agent, notifications, and users."
        />
        <SettingsSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorBlock message={error || "Settings unavailable"} />
      </div>
    );
  }

  const company = data.settings.companyProfile || {};
  const vapi = data.settings.vapi || {};
  const calling = data.settings.callingPreferences || {};
  const notifications = data.settings.notifications || {};
  const agent = data.agent || {
    name: "",
    voice: "jennifer",
    language: "en-ur",
    greeting: "",
    systemPrompt: "",
    vapiAssistantId: "",
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company profile, Vapi inbound agent, notifications, and users."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Company profile</h2>
          <form onSubmit={saveCompany} className="mt-4 space-y-3">
            {["name", "email", "phone", "address", "website"].map((key) => (
              <div key={key}>
                <Label>{statusLabel(key)}</Label>
                <Input
                  value={company[key] || ""}
                  onChange={(e) =>
                    setData({
                      ...data,
                      settings: {
                        ...data.settings,
                        companyProfile: { ...company, [key]: e.target.value },
                      },
                    })
                  }
                />
              </div>
            ))}
            <Button
              type="submit"
              loading={saving === "company"}
              loadingText="Saving..."
              disabled={saving !== "" && saving !== "company"}
            >
              Save company
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Vapi configuration</h2>
          <p className="mt-1 text-sm text-ink-500">
            Keep `VAPI_API_KEY` and `VAPI_WEBHOOK_SECRET` in server environment variables only.
          </p>
          <form onSubmit={saveVapi} className="mt-4 space-y-3">
            <div>
              <Label>Assistant ID</Label>
              <Input
                value={String(vapi.assistantId || "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      vapi: { ...vapi, assistantId: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Phone number ID</Label>
              <Input
                value={String(vapi.phoneNumberId || "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      vapi: { ...vapi, phoneNumberId: e.target.value },
                    },
                  })
                }
              />
            </div>
            <p className="text-xs text-ink-500">
              Webhook URL: <code className="rounded bg-ink-100 px-1.5 py-0.5">POST /api/webhooks/vapi</code>
            </p>
            <Button
              type="submit"
              loading={saving === "vapi"}
              loadingText="Saving..."
              disabled={saving !== "" && saving !== "vapi"}
            >
              Save Vapi IDs
            </Button>
          </form>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <h2 className="font-display text-xl text-ink-800">AI calling agent</h2>
          <form onSubmit={saveAgent} className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label>Agent name</Label>
              <Input
                value={agent.name}
                onChange={(e) => setData({ ...data, agent: { ...agent, name: e.target.value } })}
              />
            </div>
            <div>
              <Label>Voice</Label>
              <Input
                value={agent.voice}
                onChange={(e) => setData({ ...data, agent: { ...agent, voice: e.target.value } })}
              />
            </div>
            <div>
              <Label>Language</Label>
              <Input
                value={agent.language}
                onChange={(e) =>
                  setData({ ...data, agent: { ...agent, language: e.target.value } })
                }
              />
            </div>
            <div>
              <Label>Vapi assistant ID</Label>
              <Input
                value={agent.vapiAssistantId || ""}
                onChange={(e) =>
                  setData({
                    ...data,
                    agent: { ...agent, vapiAssistantId: e.target.value },
                  })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label>Greeting</Label>
              <Textarea
                rows={3}
                value={agent.greeting}
                onChange={(e) =>
                  setData({ ...data, agent: { ...agent, greeting: e.target.value } })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label>System prompt</Label>
              <Textarea
                rows={8}
                value={agent.systemPrompt}
                onChange={(e) =>
                  setData({ ...data, agent: { ...agent, systemPrompt: e.target.value } })
                }
              />
            </div>
            <div>
              <Button
                type="submit"
                loading={saving === "agent"}
                loadingText="Saving..."
                disabled={saving !== "" && saving !== "agent"}
              >
                Save agent & sync Vapi
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Calling preferences</h2>
          <form onSubmit={saveCalling} className="mt-4 space-y-3">
            <div>
              <Label>Business hours start</Label>
              <Input
                value={String(calling.businessHoursStart || "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      callingPreferences: { ...calling, businessHoursStart: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Business hours end</Label>
              <Input
                value={String(calling.businessHoursEnd || "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      callingPreferences: { ...calling, businessHoursEnd: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input
                value={String(calling.timezone || "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      callingPreferences: { ...calling, timezone: e.target.value },
                    },
                  })
                }
              />
            </div>
            <Button
              type="submit"
              loading={saving === "calling"}
              loadingText="Saving..."
              disabled={saving !== "" && saving !== "calling"}
            >
              Save preferences
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl text-ink-800">Notifications</h2>
          <form onSubmit={saveNotifications} className="mt-4 space-y-3">
            {Object.keys(notifications).length === 0 ? (
              <EmptyState
                title="No notification settings"
                description="Notification preferences will appear here once configured."
                icon={<Settings className="h-5 w-5" />}
              />
            ) : (
              Object.keys(notifications).map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <input
                    type="checkbox"
                    className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    checked={Boolean(notifications[key])}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          notifications: { ...notifications, [key]: e.target.checked },
                        },
                      })
                    }
                  />
                  {statusLabel(key)}
                </label>
              ))
            )}
            <Button
              type="submit"
              loading={saving === "notifications"}
              loadingText="Saving..."
              disabled={
                Object.keys(notifications).length === 0 ||
                (saving !== "" && saving !== "notifications")
              }
            >
              Save notifications
            </Button>
          </form>
        </Card>

        {user?.role === "ADMIN" ? (
          <Card className="p-5 xl:col-span-2">
            <h2 className="font-display text-xl text-ink-800">Users & roles</h2>
            <div className="mt-4 space-y-3">
              {users.length === 0 ? (
                <EmptyState title="No users found" />
              ) : (
                users.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-lg border border-ink-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium text-ink-800">{row.name}</p>
                      <p className="text-sm text-ink-500">{row.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Select
                        value={row.role}
                        onChange={(e) => updateRole(row.id, e.target.value)}
                        className="w-40"
                      >
                        {["ADMIN", "MANAGER", "AGENT", "VIEWER"].map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
