"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useCallback, useEffect, useState } from "react";

type Game = {
  id?: number;
  slug: string;
  name?: string;
  title?: string;
  status?: string;
  port?: number;
  created_at?: string;
  updated_at?: string;
};

type GamesData = {
  stats: { total: number; active: number; stopped: number; error: number };
  games: Game[];
};

const STATUS_FILTERS = ["all", "active", "stopped", "error"];

export default function GamesPage() {
  const [data, setData] = useState<GamesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const loadGames = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/games/stats");
      if (!res.ok) throw new Error("Failed to fetch games");
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  const games = data?.games || [];
  const stats = data?.stats || { total: 0, active: 0, stopped: 0, error: 0 };

  const filtered = games.filter((g) => {
    const name = (g.name || g.title || g.slug).toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase()) || g.slug.toLowerCase().includes(search.toLowerCase());
    const gameStatus = (g.status || "").toLowerCase();
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && (gameStatus === "active" || gameStatus === "running")) ||
      (statusFilter === "stopped" && (gameStatus === "stopped" || gameStatus === "exited")) ||
      (statusFilter === "error" && gameStatus === "error");
    return matchesSearch && matchesStatus;
  });

  const statusColor = (s?: string) => {
    const status = (s || "").toLowerCase();
    if (status === "active" || status === "running") return "bg-emerald-400";
    if (status === "stopped" || status === "exited") return "bg-slate-500";
    if (status === "error") return "bg-red-400";
    return "bg-slate-600";
  };

  const statusBadge = (s?: string) => {
    const status = (s || "").toLowerCase();
    if (status === "active" || status === "running") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    if (status === "stopped" || status === "exited") return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    if (status === "error") return "bg-red-500/20 text-red-300 border-red-500/30";
    return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Analytics</p>
          <h2 className="text-3xl font-semibold">Games Arcade</h2>
          <p className="text-sm text-slate-400">
            Game catalog and container health from games.wolfeup.com
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Games</p>
            <p className="mt-1 text-3xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Active</p>
            <p className="mt-1 text-3xl font-bold text-emerald-400">{stats.active}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Stopped</p>
            <p className="mt-1 text-3xl font-bold text-slate-400">{stats.stopped}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Errors</p>
            <p className="mt-1 text-3xl font-bold text-red-400">{stats.error}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 w-64"
          />
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === s
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} games shown</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading games...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-red-300">{error}</p>
            <p className="text-sm text-slate-500 mt-2">The Games API may be unreachable from the Mission Control container.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((g) => (
              <div key={g.slug} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 hover:bg-white/[0.07] transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusColor(g.status)}`} />
                    <span className="text-sm font-medium text-white truncate">{g.name || g.title || g.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-500 font-mono">{g.slug}</span>
                  {g.port && <span className="text-[10px] text-slate-500">:{g.port}</span>}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge(g.status)}`}>
                    {g.status || "unknown"}
                  </span>
                </div>
                {g.created_at && (
                  <p className="text-[10px] text-slate-600">
                    Created {new Date(g.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
