"use client";

import { useCallback, useEffect, useState } from "react";

/* -- Types ----------------------------------------------------------------- */

type PostResult = {
  tweet: {
    text: string;
    author: string;
    tweetUrl: string;
    likes: number;
    retweets: number;
    replies: number;
  };
  reply: string;
  posted: boolean;
  postUrl?: string;
  error?: string;
};

type BackendJob = {
  id: string;
  status: string;
  config?: {
    searchQueries?: (string | { query: string; target?: string })[];
    tone?: string;
    persona?: string;
    autoPost?: boolean;
    dryRun?: boolean;
    count?: number;
    generationModel?: { host: string; model: string };
    scoringModel?: { host: string; model: string };
    refinementModel?: { host: string; model: string };
    models?: {
      scoring?: { host: string; model: string };
      generation?: { host: string; model: string };
    };
  };
  events?: { stage: string; status: string; message: string; results?: PostResult[] }[];
  results?: PostResult[];
  createdAt?: number;
  startedAt?: number;
  completedAt?: number;
};

type LocalJob = {
  id: string;
  status: string;
  queries: (string | { query: string })[];
  tweetsFound: number;
  repliesSent: number;
  duration: number;
  createdAt: number;
  results?: PostResult[];
};

type MergedJob = {
  id: string;
  status: string;
  queries: string[];
  tone?: string;
  models?: string;
  tweetsFound: number;
  repliesSent: number;
  totalReplies: number;
  createdAt: number;
  duration: number;
  results: PostResult[];
  isLive: boolean;
  autoPost?: boolean;
  dryRun?: boolean;
};

/* -- Helpers --------------------------------------------------------------- */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function extractQueries(config?: BackendJob["config"]): string[] {
  if (!config?.searchQueries) return [];
  return config.searchQueries.map((q) => (typeof q === "string" ? q : q.query));
}

/* -- Component ------------------------------------------------------------- */

export function JobsSection() {
  const [jobs, setJobs] = useState<MergedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "completed" | "failed" | "running">("all");

  const loadJobs = useCallback(async () => {
    try {
      // Fetch from both backend orchestrator and local storage in parallel
      const [backendRes, localRes] = await Promise.allSettled([
        fetch("/api/reply-orchestrator/jobs").then((r) => r.ok ? r.json() : []),
        fetch("/api/reply/jobs").then((r) => r.ok ? r.json() : []),
      ]);

      const backendJobs: BackendJob[] = backendRes.status === "fulfilled" ? (Array.isArray(backendRes.value) ? backendRes.value : backendRes.value?.jobs || []) : [];
      const localJobs: LocalJob[] = localRes.status === "fulfilled" ? (Array.isArray(localRes.value) ? localRes.value : []) : [];

      // Merge: backend jobs are authoritative, local jobs fill gaps
      const merged = new Map<string, MergedJob>();

      for (const bj of backendJobs) {
        const results = bj.results || [];
        const posted = results.filter((r) => r?.posted);
        merged.set(bj.id, {
          id: bj.id,
          status: bj.status,
          queries: extractQueries(bj.config),
          tone: bj.config?.tone,
          models: (() => {
            const m = bj.config?.generationModel ?? bj.config?.models?.generation;
            return m ? `${m.host}:${m.model}` : undefined;
          })(),
          tweetsFound: 0,
          repliesSent: posted.length,
          totalReplies: results.length,
          createdAt: bj.createdAt ? new Date(bj.createdAt).getTime()
                 : bj.startedAt ? new Date(bj.startedAt).getTime()
                 : Date.now(),
          duration: (bj.completedAt && bj.createdAt)
                 ? new Date(bj.completedAt).getTime() - new Date(bj.createdAt).getTime()
                 : 0,
          results,
          isLive: bj.status === "running" || bj.status === "awaiting_approval",
          autoPost: bj.config?.autoPost,
          dryRun: bj.config?.dryRun,
        });
      }

      // Add local jobs that aren't in backend
      for (const lj of localJobs) {
        if (!merged.has(lj.id)) {
          merged.set(lj.id, {
            id: lj.id,
            status: lj.status,
            queries: lj.queries.map((q) => typeof q === "string" ? q : (q as any)?.query || ""),
            tweetsFound: lj.tweetsFound,
            repliesSent: lj.repliesSent,
            totalReplies: lj.repliesSent,
            createdAt: lj.createdAt,
            duration: lj.duration,
            results: lj.results || [],
            isLive: false,
          });
        }
      }

      // Sort by createdAt desc
      const sorted = Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
      setJobs(sorted);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 15000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  // Stats
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const runningJobs = jobs.filter((j) => j.isLive);
  const totalRepliesPosted = jobs.reduce((s, j) => s + j.repliesSent, 0);
  const successRate = totalJobs > 0 ? Math.round((completedJobs.length / totalJobs) * 100) : 0;
  const avgDuration = completedJobs.length > 0 ? completedJobs.reduce((s, j) => s + j.duration, 0) / completedJobs.length : 0;

  const filteredJobs = filter === "all" ? jobs : jobs.filter((j) => {
    if (filter === "running") return j.isLive;
    return j.status === filter;
  });

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Jobs</p>
          <p className="text-2xl font-bold text-white mt-1">{totalJobs}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Replies Posted</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{totalRepliesPosted}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Success Rate</p>
          <p className="text-2xl font-bold text-white mt-1">
            {successRate}%
            <span className="text-xs text-slate-500 font-normal ml-1">({completedJobs.length}/{totalJobs})</span>
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Avg Duration</p>
          <p className="text-2xl font-bold text-white mt-1">{avgDuration > 0 ? formatDuration(avgDuration) : "--"}</p>
        </div>
      </div>

      {/* Running Jobs Banner */}
      {runningJobs.length > 0 && (
        <div className="rounded-2xl border-2 border-indigo-500/30 bg-indigo-900/10 p-4 backdrop-blur space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            <h3 className="text-sm font-bold text-indigo-300">{runningJobs.length} Job{runningJobs.length > 1 ? "s" : ""} Running</h3>
          </div>
          {runningJobs.map((j) => (
            <div key={j.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
              <div>
                <span className="text-xs text-white font-medium">{j.queries.join(", ") || "No queries"}</span>
                <span className="text-[10px] text-slate-500 ml-2">{j.id.substring(0, 8)}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 animate-pulse">
                {j.status === "awaiting_approval" ? "Awaiting Approval" : "Running"}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-slate-500">Switch to "Reply to People" tab to see live progress and approve replies.</p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {(["all", "running", "completed", "failed"] as const).map((f) => {
          const count = f === "all" ? jobs.length : f === "running" ? runningJobs.length : f === "completed" ? completedJobs.length : failedJobs.length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Job List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-indigo-500" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
          <p className="text-sm text-slate-500">No {filter === "all" ? "" : filter + " "}jobs found</p>
          <p className="text-xs text-slate-600 mt-1">Launch a reply job from the "Reply to People" tab to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
              {/* Job Header */}
              <button
                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                className="w-full p-4 text-left hover:bg-white/5 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      job.isLive
                        ? "bg-indigo-500/20 text-indigo-300 animate-pulse"
                        : job.status === "completed"
                        ? "bg-emerald-900/40 text-emerald-400"
                        : "bg-red-900/40 text-red-400"
                    }`}>
                      {job.status === "awaiting_approval" ? "Review" : job.status}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {job.queries.length > 0 ? job.queries.join(", ") : "Unknown queries"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    {job.repliesSent > 0 && (
                      <span className="text-emerald-400 font-medium">{job.repliesSent} posted</span>
                    )}
                    {job.duration > 0 && <span>{formatDuration(job.duration)}</span>}
                    <span>{timeAgo(job.createdAt)}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition ${expandedJob === job.id ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
                  {job.tone && <span>Tone: {job.tone}</span>}
                  {job.models && <span>Model: {job.models}</span>}
                  {job.dryRun && <span className="text-amber-400">Dry Run</span>}
                  {job.autoPost === false && <span className="text-blue-400">Manual Approval</span>}
                  <span className="font-mono text-slate-600">{job.id.substring(0, 8)}</span>
                </div>
              </button>

              {/* Expanded Job Details */}
              {expandedJob === job.id && (
                <div className="border-t border-white/10 p-4 space-y-3">
                  {/* Results */}
                  {job.results.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-300">
                        Replies ({job.results.filter((r) => r?.posted).length} posted, {job.results.filter((r) => r && !r.posted).length} failed)
                      </h4>
                      {job.results.map((r, i) => {
                        if (!r) return null;
                        const tweetAuthor = r.tweet?.author || "unknown";
                        const tweetText = r.tweet?.text || "";
                        const tweetUrl = r.tweet?.tweetUrl || "";
                        return (
                          <div key={i} className={`rounded-lg border p-3 space-y-2 ${r.posted ? "border-emerald-500/20 bg-emerald-900/10" : "border-red-500/20 bg-red-900/10"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold ${r.posted ? "text-emerald-400" : "text-red-400"}`}>
                                  {r.posted ? "POSTED" : "FAILED"}
                                </span>
                                <span className="text-xs text-slate-400">to {tweetAuthor}</span>
                              </div>
                              <div className="flex gap-2">
                                {tweetUrl && (
                                  <a href={tweetUrl.startsWith("http") ? tweetUrl : `https://x.com${tweetUrl}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-400 hover:underline">
                                    Original Tweet
                                  </a>
                                )}
                                {r.postUrl && (
                                  <a href={r.postUrl.startsWith("http") ? r.postUrl : `https://x.com${r.postUrl}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-400 hover:underline">
                                    View Reply
                                  </a>
                                )}
                              </div>
                            </div>
                            {tweetText && (
                              <p className="text-xs text-slate-500 italic line-clamp-2">{tweetText}</p>
                            )}
                            <div className="rounded-lg bg-black/30 p-2.5">
                              <p className="text-sm text-white">{r.reply || "No reply content"}</p>
                            </div>
                            {r.error && <p className="text-xs text-red-400">{r.error}</p>}
                            {r.tweet && (
                              <div className="flex gap-3 text-[10px] text-slate-600">
                                {r.tweet.likes != null && <span>{r.tweet.likes} likes</span>}
                                {r.tweet.retweets != null && <span>{r.tweet.retweets} RTs</span>}
                                {r.tweet.replies != null && <span>{r.tweet.replies} replies</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      {job.isLive ? "Job in progress -- no results yet" : "No result data available"}
                    </p>
                  )}

                  {/* Job Info */}
                  <div className="rounded-lg bg-black/20 p-3 space-y-1">
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">Job Details</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <span className="text-slate-500">Job ID</span>
                      <span className="text-slate-300 font-mono">{job.id}</span>
                      <span className="text-slate-500">Status</span>
                      <span className="text-slate-300">{job.status}</span>
                      <span className="text-slate-500">Started</span>
                      <span className="text-slate-300">{new Date(job.createdAt).toLocaleString()}</span>
                      {job.duration > 0 && (
                        <>
                          <span className="text-slate-500">Duration</span>
                          <span className="text-slate-300">{formatDuration(job.duration)}</span>
                        </>
                      )}
                      <span className="text-slate-500">Queries</span>
                      <span className="text-slate-300">{job.queries.join(", ") || "N/A"}</span>
                      {job.tone && (
                        <>
                          <span className="text-slate-500">Tone</span>
                          <span className="text-slate-300">{job.tone}</span>
                        </>
                      )}
                      {job.models && (
                        <>
                          <span className="text-slate-500">Model</span>
                          <span className="text-slate-300">{job.models}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
