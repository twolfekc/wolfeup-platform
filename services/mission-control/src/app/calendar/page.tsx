"use client";

import { FormEvent, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

const paginationOptions = { initialNumItems: 12 };
const statuses = ["scheduled", "running", "success", "failed", "paused"] as const;
const syncStates = ["pending", "in_sync", "error"] as const;

export default function CalendarPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return (
      <AppShell>
        <Card title="Calendar" subtitle="Realtime schedule feed">
          <p className="text-sm text-slate-300">
            Convex is not configured yet. Set <code>NEXT_PUBLIC_CONVEX_URL</code> to enable calendar realtime sync.
          </p>
        </Card>
      </AppShell>
    );
  }

  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number] | "">("");
  const [editingId, setEditingId] = useState<any>(null);
  const [form, setForm] = useState({
    title: "",
    notes: "",
    scheduleType: "once",
    cronExpression: "",
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: "",
    status: "scheduled",
    syncStatus: "pending",
    syncSource: "openclaw",
    externalId: "",
  });

  const timeline = usePaginatedQuery(
    api.calendar.listTimeline,
    { status: statusFilter || undefined },
    paginationOptions,
  );

  const createEntry = useMutation(api.calendar.createEntry);
  const updateEntry = useMutation(api.calendar.updateEntry);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      notes: form.notes || undefined,
      scheduleType: form.scheduleType as "once" | "cron",
      cronExpression: form.cronExpression || undefined,
      startsAt: new Date(form.startsAt).getTime(),
      endsAt: form.endsAt ? new Date(form.endsAt).getTime() : undefined,
      status: form.status,
      syncStatus: form.syncStatus,
      syncSource: form.syncSource || undefined,
      externalId: form.externalId || undefined,
      lastSyncedAt: Date.now(),
    };

    if (editingId) await updateEntry({ id: editingId, ...payload } as any);
    else await createEntry(payload as any);

    setEditingId(null);
    setForm({
      title: "",
      notes: "",
      scheduleType: "once",
      cronExpression: "",
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: "",
      status: "scheduled",
      syncStatus: "pending",
      syncSource: "openclaw",
      externalId: "",
    });
  }

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card title={editingId ? "Edit schedule" : "Create schedule"} subtitle="Tasks and cron jobs with sync status">
          <form className="space-y-3" onSubmit={onSubmit}>
            <input className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <button className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">{editingId ? "Save changes" : "Create entry"}</button>
          </form>
        </Card>

        <Card title="Calendar timeline" subtitle="Realtime schedule feed for tasks + cron jobs">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-slate-300">Filter:</span>
            <select className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="">All</option>
              {statuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {timeline.results?.map((entry) => (
              <button key={entry._id} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-indigo-300/40" onClick={() => setEditingId(entry._id)}>
                <p className="font-medium text-white">{entry.title}</p>
                <p className="mt-1 text-xs text-slate-200">status: {entry.status} · sync: {entry.syncStatus}</p>
              </button>
            ))}
            {timeline.status === "CanLoadMore" ? (
              <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => timeline.loadMore(12)}>Load more</button>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
