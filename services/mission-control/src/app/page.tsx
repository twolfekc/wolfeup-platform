"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { useCallback, useEffect, useState } from "react";

type Post = { id: string; content: string; platform: string; model: string; status: string; tone: string; createdAt: number };
type ServiceStatus = { name: string; status: "up" | "down" | "degraded"; latencyMs: number };

export default function Home() {
  const tasks = useQuery(api.tasks.listTasks) ?? [];
  const pipelineItems = useQuery(api.contentPipeline.listPipelineItems) ?? [];
  const ensureSeeded = useMutation(api.seed.run);
  const [posts, setPosts] = useState<Post[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);

  useEffect(() => {
    ensureSeeded().catch(() => {});
  }, [ensureSeeded]);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/social/posts");
      if (res.ok) setPosts(await res.json());
    } catch {}
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health/services");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadPosts(); loadHealth(); }, [loadPosts, loadHealth]);

  const taskStats = {
    total: tasks.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const pipelineStats = {
    total: pipelineItems.length,
    ideas: pipelineItems.filter((i) => i.stage === "idea").length,
    inReview: pipelineItems.filter((i) => i.stage === "review").length,
    published: pipelineItems.filter((i) => i.stage === "published").length,
  };

  const socialStats = {
    total: posts.length,
    generated: posts.filter((p) => p.status === "generated").length,
    posted: posts.filter((p) => p.status === "posted").length,
    approved: posts.filter((p) => p.status === "approved").length,
  };

  const upCount = services.filter((s) => s.status === "up").length;
  const totalCount = services.length;

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
          <h2 className="text-3xl font-semibold">Mission Control</h2>
          <p className="max-w-2xl text-slate-300">
            Central command for WolfeUp operations. Tasks, content pipeline, social media, team coordination, and AI agent management.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Active Tasks</p>
            <p className="mt-1 text-3xl font-bold text-white">{taskStats.inProgress}</p>
            <p className="text-xs text-slate-500">{taskStats.total} total · {taskStats.blocked} blocked · {taskStats.done} done</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Pipeline Items</p>
            <p className="mt-1 text-3xl font-bold text-white">{pipelineStats.total}</p>
            <p className="text-xs text-slate-500">{pipelineStats.ideas} ideas · {pipelineStats.inReview} review · {pipelineStats.published} published</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Social Posts</p>
            <p className="mt-1 text-3xl font-bold text-white">{socialStats.total}</p>
            <p className="text-xs text-slate-500">{socialStats.generated} queued · {socialStats.approved} approved · {socialStats.posted} posted</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-wider text-slate-400">Infrastructure</p>
            <p className={`mt-1 text-3xl font-bold ${totalCount > 0 ? (upCount === totalCount ? "text-emerald-400" : upCount > totalCount / 2 ? "text-amber-400" : "text-red-400") : "text-emerald-400"}`}>
              {totalCount > 0 ? `${upCount}/${totalCount}` : "Online"}
            </p>
            <p className="text-xs text-slate-500">
              {totalCount > 0
                ? `${upCount} up · ${totalCount - upCount} down · 4 servers`
                : "4 servers · 8+ LLMs · 75+ games"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/tasks" className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:border-indigo-500/30 hover:bg-white/[0.07] transition">
            <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition">Tasks Board</h3>
            <p className="mt-1 text-sm text-slate-400">Kanban board with status tracking, assignees, and activity feed.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["backlog", "todo", "in_progress", "blocked", "done"].map((s) => {
                const count = tasks.filter((t) => t.status === s).length;
                return count > 0 ? (
                  <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">{s.replace("_", " ")}: {count}</span>
                ) : null;
              })}
            </div>
          </Link>
          <Link href="/social" className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:border-indigo-500/30 hover:bg-white/[0.07] transition">
            <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition">Social Media</h3>
            <p className="mt-1 text-sm text-slate-400">Generate posts with RTX 4090, Unraid, or Claude. Manage the @WolfeUpHQ queue.</p>
            <div className="mt-3 text-xs text-slate-500">{posts.length > 0 ? posts.length + " posts in queue" : "Ready to generate"}</div>
          </Link>
          <Link href="/pipeline" className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:border-indigo-500/30 hover:bg-white/[0.07] transition">
            <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition">Content Pipeline</h3>
            <p className="mt-1 text-sm text-slate-400">From idea to published. Track content across 5 stages with ownership hints.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["idea", "research", "script", "review", "published"].map((s) => {
                const count = pipelineItems.filter((i) => i.stage === s).length;
                return count > 0 ? (
                  <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">{s}: {count}</span>
                ) : null;
              })}
            </div>
          </Link>
        </div>

        {services.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h3 className="mb-3 text-lg font-semibold text-white">Service Health</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {services.map((s) => (
                <div key={s.name} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${s.status === "up" ? "bg-emerald-400" : s.status === "degraded" ? "bg-amber-400" : "bg-red-400"}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-white truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-500">{s.status === "up" ? `${s.latencyMs}ms` : s.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <h3 className="mb-3 text-lg font-semibold text-white">Recent Tasks</h3>
          <div className="space-y-2">
            {tasks.slice(0, 8).map((task) => (
              <div key={task._id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${task.status === "done" ? "bg-emerald-400" : task.status === "in_progress" ? "bg-amber-400" : task.status === "blocked" ? "bg-red-400" : "bg-slate-500"}`} />
                  <span className="text-sm text-white">{task.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{task.assignee}</span>
                  <span className="text-[10px] text-slate-500">{task.status.replace("_", " ")}</span>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-sm text-slate-500 italic">No tasks yet. Head to the Tasks Board to create some.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
