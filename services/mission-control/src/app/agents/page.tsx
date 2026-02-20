"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useCallback, useEffect, useState } from "react";

type Session = {
  id?: string;
  model?: string;
  tokens_used?: number;
  total_tokens?: number;
  age?: string;
  duration?: string;
  started_at?: string;
  status?: string;
  node?: string;
};

type Node = {
  id?: string;
  name?: string;
  hostname?: string;
  status?: string;
  last_seen?: string;
  ip?: string;
  sessions?: number;
};

type CronJob = {
  id?: string;
  name?: string;
  schedule?: string;
  last_run?: string;
  next_run?: string;
  status?: string;
  enabled?: boolean;
};

type AgentData = {
  sessions: Session[];
  nodes: Node[];
  crons: CronJob[];
  relayStatus: string;
  fetchedAt: string;
};

export default function AgentsPage() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/activity");
      if (!res.ok) throw new Error("Failed to fetch agent data");
      const d = await res.json();
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const sessions = data?.sessions || [];
  const nodes = data?.nodes || [];
  const crons = data?.crons || [];
  const relayStatus = data?.relayStatus || "unknown";

  const sessionList = Array.isArray(sessions) ? sessions : [];
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const cronList = Array.isArray(crons) ? crons : [];

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Operations</p>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold">Agent Activity</h2>
            <span className={`text-xs px-2 py-1 rounded-full border ${
              relayStatus === "connected"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                : "bg-red-500/20 text-red-300 border-red-500/30"
            }`}>
              relay: {relayStatus}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Live OpenClaw sessions, nodes, and scheduled jobs from the dashboard relay on .10:5051
          </p>
        </header>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading agent data...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-red-300">{error}</p>
            <p className="text-sm text-slate-500 mt-2">The dashboard relay on .10:5051 may be offline.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">
                Active Sessions
                <span className="ml-2 text-sm text-slate-500">({sessionList.length})</span>
              </h3>
              {sessionList.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-500">
                  No active sessions
                </div>
              ) : (
                <div className="space-y-2">
                  {sessionList.map((s, i) => (
                    <div key={s.id || i} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${s.status === "active" || !s.status ? "bg-emerald-400" : "bg-slate-500"}`} />
                        <div>
                          <p className="text-sm font-medium text-white">{s.model || "unknown model"}</p>
                          {s.node && <p className="text-[10px] text-slate-500">Node: {s.node}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        {(s.tokens_used || s.total_tokens) != null && (
                          <span>{(s.tokens_used || s.total_tokens || 0).toLocaleString()} tokens</span>
                        )}
                        {(s.age || s.duration) && <span>{s.age || s.duration}</span>}
                        {s.started_at && <span>{new Date(s.started_at).toLocaleTimeString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">
                Nodes
                <span className="ml-2 text-sm text-slate-500">({nodeList.length})</span>
              </h3>
              {nodeList.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-500">
                  No nodes reported
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {nodeList.map((n, i) => (
                    <div key={n.id || i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${n.status === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="text-sm font-medium text-white">{n.name || n.hostname || n.id || `Node ${i + 1}`}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 space-y-0.5">
                        {n.ip && <p>IP: {n.ip}</p>}
                        {n.last_seen && <p>Last seen: {new Date(n.last_seen).toLocaleString()}</p>}
                        {n.sessions != null && <p>Sessions: {n.sessions}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">
                Cron Jobs
                <span className="ml-2 text-sm text-slate-500">({cronList.length})</span>
              </h3>
              {cronList.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-500">
                  No cron jobs configured
                </div>
              ) : (
                <div className="space-y-2">
                  {cronList.map((c, i) => (
                    <div key={c.id || i} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${c.status === "ok" || c.enabled ? "bg-emerald-400" : "bg-slate-500"}`} />
                        <div>
                          <p className="text-sm font-medium text-white">{c.name || c.id || `Job ${i + 1}`}</p>
                          {c.schedule && <p className="text-[10px] text-slate-500 font-mono">{c.schedule}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        {c.last_run && <span>Last: {new Date(c.last_run).toLocaleString()}</span>}
                        {c.next_run && <span>Next: {new Date(c.next_run).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {data?.fetchedAt && (
          <p className="text-[10px] text-slate-600 text-right">
            Updated: {new Date(data.fetchedAt).toLocaleTimeString()} (auto-refresh every 15s)
          </p>
        )}
      </div>
    </AppShell>
  );
}
