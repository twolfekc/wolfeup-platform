"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";

const stageColumns = [
  { key: "idea", label: "💡 Ideas", color: "border-violet-500/40", bg: "bg-violet-500/5" },
  { key: "research", label: "🔬 Research", color: "border-blue-500/40", bg: "bg-blue-500/5" },
  { key: "script", label: "✍️ Script", color: "border-amber-500/40", bg: "bg-amber-500/5" },
  { key: "review", label: "👁️ Review", color: "border-orange-500/40", bg: "bg-orange-500/5" },
  { key: "published", label: "🚀 Published", color: "border-emerald-500/40", bg: "bg-emerald-500/5" },
] as const;

type Stage = (typeof stageColumns)[number]["key"];

function OwnerBadge({ ownerHint }: { ownerHint: string }) {
  const styles: Record<string, string> = {
    human: "bg-violet-900/60 text-violet-300",
    claw: "bg-cyan-900/60 text-cyan-300",
    mixed: "bg-amber-900/60 text-amber-300",
  };
  const icons: Record<string, string> = { human: "👤", claw: "🤖", mixed: "🤝" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[ownerHint] || "bg-slate-800 text-slate-400"}`}>
      {icons[ownerHint] || "—"} {ownerHint}
    </span>
  );
}

export default function PipelinePage() {
  const items = useQuery(api.contentPipeline.listPipelineItems) ?? [];
  const createItem = useMutation(api.contentPipeline.createPipelineItem);
  const moveStage = useMutation(api.contentPipeline.movePipelineStage);
  const updateScript = useMutation(api.contentPipeline.updateScript);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editScript, setEditScript] = useState("");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createItem({ title, summary: summary || undefined, imageUrls: [] });
    setTitle("");
    setSummary("");
    setShowCreate(false);
  }

  function itemsByStage(stage: Stage) {
    return items.filter((i) => i.stage === stage);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Pipeline</p>
            <h2 className="text-3xl font-semibold">Content Pipeline</h2>
            <p className="text-sm text-slate-300">{items.length} items across {stageColumns.length} stages</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition">
            + New Idea
          </button>
        </header>

        {showCreate && (
          <form onSubmit={onCreate} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-3">
            <input className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="Content title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="Summary (optional)" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {stageColumns.map((col) => (
            <div key={col.key} className={`rounded-2xl border ${col.color} ${col.bg} p-3 min-h-[200px]`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">{col.label}</h3>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">{itemsByStage(col.key).length}</span>
              </div>
              <div className="space-y-2">
                {itemsByStage(col.key).map((item) => (
                  <div key={item._id} className="rounded-xl border border-white/10 bg-black/30 p-3 hover:border-white/20 transition">
                    <p className="font-medium text-white text-sm">{item.title}</p>
                    {item.summary && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.summary}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <OwnerBadge ownerHint={item.ownerHint} />
                      {item.imageUrls.length > 0 && (
                        <span className="text-[10px] text-slate-500">📎 {item.imageUrls.length}</span>
                      )}
                    </div>

                    <div className="mt-2">
                      <button onClick={() => { setExpandedId(expandedId === item._id ? null : item._id); setEditScript(item.script || ""); }} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                        {expandedId === item._id ? "▼ Close" : "▶ Script / Move"}
                      </button>
                    </div>

                    {expandedId === item._id && (
                      <div className="mt-2 space-y-2">
                        <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none" rows={3} placeholder="Script content..." value={editScript} onChange={(e) => setEditScript(e.target.value)} />
                        <button onClick={() => updateScript({ itemId: item._id as any, script: editScript })} className="rounded-md bg-indigo-500/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-400">
                          Save Script
                        </button>
                        <div className="flex flex-wrap gap-1">
                          {stageColumns.filter((s) => s.key !== col.key).map((s) => (
                            <button key={s.key} onClick={() => moveStage({ itemId: item._id as any, stage: s.key })} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white transition">
                              → {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
