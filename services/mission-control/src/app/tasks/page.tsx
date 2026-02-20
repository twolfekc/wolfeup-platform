"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";

const statusColumns = [
  { key: "backlog", label: "Backlog", color: "border-slate-500/40" },
  { key: "todo", label: "To Do", color: "border-blue-500/40" },
  { key: "in_progress", label: "In Progress", color: "border-amber-500/40" },
  { key: "blocked", label: "Blocked", color: "border-red-500/40" },
  { key: "done", label: "Done", color: "border-emerald-500/40" },
] as const;

const assigneeOptions = ["unassigned", "human", "claw"] as const;

type Status = (typeof statusColumns)[number]["key"];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    backlog: "bg-slate-700 text-slate-300",
    todo: "bg-blue-900/60 text-blue-300",
    in_progress: "bg-amber-900/60 text-amber-300",
    blocked: "bg-red-900/60 text-red-300",
    done: "bg-emerald-900/60 text-emerald-300",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colors[status] || "bg-slate-700 text-slate-300"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function AssigneeBadge({ assignee }: { assignee: string }) {
  const colors: Record<string, string> = {
    human: "bg-violet-900/60 text-violet-300",
    claw: "bg-cyan-900/60 text-cyan-300",
    unassigned: "bg-slate-800 text-slate-400",
  };
  const icons: Record<string, string> = { human: "👤", claw: "🤖", unassigned: "—" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[assignee] || "bg-slate-800 text-slate-400"}`}>
      {icons[assignee] || "—"} {assignee}
    </span>
  );
}

export default function TasksPage() {
  const tasks = useQuery(api.tasks.listTasks) ?? [];
  const activity = useQuery(api.tasks.listActivity) ?? [];
  const createTask = useMutation(api.tasks.createTask);
  const setStatus = useMutation(api.tasks.setTaskStatus);
  const assignTask = useMutation(api.tasks.assignTask);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createTask({ title, description: description || undefined, createdBy: "human" });
    setTitle("");
    setDescription("");
    setShowCreate(false);
  }

  function tasksByStatus(status: Status) {
    return tasks.filter((t) => t.status === status);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Tasks</p>
            <h2 className="text-3xl font-semibold">Tasks Board</h2>
            <p className="text-sm text-slate-300">{tasks.length} tasks total</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              <button onClick={() => setViewMode("board")} className={`px-3 py-1.5 text-xs font-medium ${viewMode === "board" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>Board</button>
              <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>List</button>
            </div>
            <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition">
              + New Task
            </button>
          </div>
        </header>

        {showCreate && (
          <form onSubmit={onCreate} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-3">
            <input className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="Task title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
            </div>
          </form>
        )}

        {viewMode === "board" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {statusColumns.map((col) => (
              <div key={col.key} className={`rounded-2xl border ${col.color} bg-white/[0.02] p-3`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">{col.label}</h3>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">{tasksByStatus(col.key).length}</span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus(col.key).map((task) => (
                    <div key={task._id} className="rounded-xl border border-white/10 bg-black/30 p-3 hover:border-white/20 transition group">
                      <p className="font-medium text-white text-sm">{task.title}</p>
                      {task.description && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{task.description}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <AssigneeBadge assignee={task.assignee} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition">
                        {statusColumns.filter((s) => s.key !== col.key).map((s) => (
                          <button key={s.key} onClick={() => setStatus({ taskId: task._id, status: s.key, actor: "human" })} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white transition">
                            → {s.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition">
                        {assigneeOptions.filter((a) => a !== task.assignee).map((a) => (
                          <button key={a} onClick={() => assignTask({ taskId: task._id, assignee: a, actor: "human" })} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white transition">
                            {a === "human" ? "👤" : a === "claw" ? "🤖" : "—"} {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="p-3">Title</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Assignee</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task._id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3">
                      <p className="font-medium text-white">{task.title}</p>
                      {task.description && <p className="text-xs text-slate-400">{task.description}</p>}
                    </td>
                    <td className="p-3"><StatusBadge status={task.status} /></td>
                    <td className="p-3"><AssigneeBadge assignee={task.assignee} /></td>
                    <td className="p-3 text-xs text-slate-400">{new Date(task.updatedAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <select className="rounded-md border border-white/10 bg-white/5 p-1 text-xs text-slate-300" value={task.status} onChange={(e) => setStatus({ taskId: task._id, status: e.target.value as Status, actor: "human" })}>
                        {statusColumns.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Recent Activity</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {activity.slice(0, 20).map((entry) => (
              <div key={entry._id} className="flex items-center gap-3 text-xs text-slate-400">
                <span className="shrink-0 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                <span className="font-medium text-slate-300">{entry.actor}</span>
                <span>{entry.action}: {entry.detail}</span>
              </div>
            ))}
            {activity.length === 0 && <p className="text-xs text-slate-500">No activity yet.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
