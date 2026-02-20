"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useCallback, useEffect, useState } from "react";

type Trend = {
  title: string;
  summary?: string;
  why_trending?: string;
  category?: string;
  sentiment?: string;
  relevance?: number;
  sources?: string[];
};

type TrendsData = {
  trends?: Trend[];
  date?: string;
  status?: string;
  collected_at?: string;
  error?: string;
};

const CATEGORIES = ["all", "tech", "ai", "social", "business", "general"];

const sentimentColors: Record<string, string> = {
  bullish: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  bearish: "bg-red-500/20 text-red-300 border-red-500/30",
  neutral: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  mixed: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [collectedAt, setCollectedAt] = useState<string>("");
  const [filter, setFilter] = useState("all");
  const [collecting, setCollecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTrends = useCallback(async (date?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = date ? `/api/trends/${date}` : "/api/trends/trends";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch trends");
      const data: TrendsData = await res.json();
      setTrends(data.trends || []);
      if (data.date) setSelectedDate(data.date);
      if (data.status) setStatus(data.status);
      if (data.collected_at) setCollectedAt(data.collected_at);
    } catch (e: any) {
      setError(e.message);
      setTrends([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDates = useCallback(async () => {
    try {
      const res = await fetch("/api/trends/dates");
      if (res.ok) {
        const data = await res.json();
        setDates(Array.isArray(data) ? data : data.dates || []);
      }
    } catch {}
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/trends/status");
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadTrends();
    loadDates();
  }, [loadTrends, loadDates]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const res = await fetch("/api/trends/collect", { method: "POST" });
      if (!res.ok) throw new Error("Collection failed");
      const pollInterval = setInterval(async () => {
        await loadStatus();
        if (status === "done" || status === "error") {
          clearInterval(pollInterval);
          setCollecting(false);
          loadTrends();
          loadDates();
        }
      }, 5000);
      setTimeout(() => {
        clearInterval(pollInterval);
        setCollecting(false);
        loadTrends();
        loadDates();
      }, 120000);
    } catch {
      setCollecting(false);
    }
  };

  const filtered = filter === "all"
    ? trends
    : trends.filter((t) => t.category?.toLowerCase() === filter);

  const hotTrends = [...trends]
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, 5);

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Intelligence</p>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold">Trends</h2>
            <div className="flex items-center gap-3">
              {status && (
                <span className={`text-xs px-2 py-1 rounded-full border ${
                  status === "done" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                  status === "collecting" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                  "bg-red-500/20 text-red-300 border-red-500/30"
                }`}>
                  {status}
                </span>
              )}
              <button
                onClick={handleCollect}
                disabled={collecting}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {collecting ? "Collecting..." : "Collect Now"}
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            {collectedAt ? `Last collected: ${new Date(collectedAt).toLocaleString()}` : "Daily AI-powered trend analysis via Brave Search + qwen2.5:32b"}
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {dates.length > 0 && (
            <select
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); loadTrends(e.target.value); }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            >
              {dates.map((d) => (
                <option key={d} value={d} className="bg-slate-900">{d}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === cat
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading trends...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-red-300">{error}</p>
            <p className="text-sm text-slate-500 mt-2">The trends collector on .10:8765 may be offline. Try "Collect Now" to trigger a fresh collection.</p>
          </div>
        ) : trends.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <p className="text-slate-400">No trends data available yet.</p>
            <p className="text-sm text-slate-500 mt-2">Click "Collect Now" to gather today's trends.</p>
          </div>
        ) : (
          <>
            {hotTrends.length > 0 && filter === "all" && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Hot Right Now</h3>
                <div className="grid gap-3 md:grid-cols-5">
                  {hotTrends.map((t, i) => (
                    <div key={i} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-medium">{t.category || "general"}</span>
                        {t.relevance != null && (
                          <span className="text-[10px] text-slate-500">{Math.round(t.relevance * 100)}%</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-white leading-snug">{t.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">
                {filter === "all" ? "All Trends" : `${filter} Trends`}
                <span className="ml-2 text-sm text-slate-500">({filtered.length})</span>
              </h3>
              <div className="space-y-3">
                {filtered.map((t, i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-semibold text-white">{t.title}</h4>
                          {t.category && (
                            <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-medium text-indigo-300">{t.category}</span>
                          )}
                          {t.sentiment && (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${sentimentColors[t.sentiment] || sentimentColors.neutral}`}>
                              {t.sentiment}
                            </span>
                          )}
                        </div>
                        {t.summary && <p className="text-sm text-slate-300">{t.summary}</p>}
                        {t.why_trending && <p className="text-xs text-slate-400 italic">{t.why_trending}</p>}
                      </div>
                      {t.relevance != null && (
                        <div className="flex-shrink-0 w-16">
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.round(t.relevance * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 text-right mt-0.5">{Math.round(t.relevance * 100)}%</p>
                        </div>
                      )}
                    </div>
                    {t.sources && t.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {t.sources.map((src, j) => (
                          <a
                            key={j}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate max-w-[200px]"
                          >
                            {new URL(src).hostname}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
