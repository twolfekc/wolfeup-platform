"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ModelInfo = { key: string; label: string; provider?: string; model?: string; url?: string };
type ToneInfo = { key: string; label: string; description: string };
type Post = {
  id: string;
  content: string;
  platform: string;
  model: string;
  modelEndpoint: string;
  prompt: string;
  tone: string;
  status: string;
  generatedAt: number;
  createdAt: number;
  updatedAt: number;
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-700 text-slate-300",
    generated: "bg-blue-900/60 text-blue-300",
    approved: "bg-emerald-900/60 text-emerald-300",
    posting: "bg-amber-900/60 text-amber-300 animate-pulse",
    posted: "bg-green-900/60 text-green-300",
    failed: "bg-red-900/60 text-red-300",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colors[status] || "bg-slate-700 text-slate-300"}`}>
      {status}
    </span>
  );
}

function groupModels(models: ModelInfo[]) {
  const groups: Record<string, ModelInfo[]> = {};
  for (const m of models) {
    const provider = m.provider || "ollama";
    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(m);
  }
  return groups;
}

export function NewPostSection() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [tones, setTones] = useState<ToneInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedTone, setSelectedTone] = useState("professional");
  const [platform, setPlatform] = useState("twitter");
  const [topic, setTopic] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStats, setGenStats] = useState<{ tokensUsed: number; durationMs: number; modelLabel: string } | null>(null);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/social/posts");
      if (res.ok) setPosts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/social/generate")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        setTones(data.tones || []);
        if (data.models?.length) setSelectedModel(data.models[0].key);
      })
      .catch(() => {});
    loadPosts();
  }, [loadPosts]);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setGeneratedContent("");
    setGenStats(null);
    try {
      const res = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelKey: selectedModel, topic, tone: selectedTone, platform, customInstructions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error + (data.detail ? ": " + data.detail : ""));
        return;
      }
      setGeneratedContent(data.content);
      setGenStats({ tokensUsed: data.tokensUsed, durationMs: data.durationMs, modelLabel: data.modelLabel });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function onSaveDraft() {
    if (!generatedContent) return;
    const model = models.find((m) => m.key === selectedModel);
    await fetch("/api/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: generatedContent,
        platform,
        model: model?.model || selectedModel,
        modelEndpoint: model?.url || "",
        prompt: topic,
        tone: selectedTone,
        status: "generated",
        generatedAt: Date.now(),
      }),
    });
    setGeneratedContent("");
    setGenStats(null);
    setTopic("");
    loadPosts();
  }

  async function onApprove(id: string) {
    await fetch("/api/social/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    loadPosts();
  }

  async function onDelete(id: string) {
    await fetch("/api/social/posts?id=" + id, { method: "DELETE" });
    loadPosts();
  }

  const charCount = generatedContent.length;
  const charLimit = platform === "twitter" ? 280 : 500;
  const isOverLimit = charCount > charLimit;
  const grouped = groupModels(models);

  return (
    <div className="space-y-4">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <form onSubmit={onGenerate} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-4">
            <h3 className="text-lg font-semibold text-white">Generate a New Post</h3>

            {/* Topic - the most important field, first */}
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Topic / Prompt</label>
              <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" rows={3} placeholder="What should the post be about?" required value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>

            {/* Main controls row */}
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Model</label>
                <select className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  {Object.entries(grouped).map(([provider, providerModels]) => (
                    <optgroup key={provider} label={provider === "openai" ? "OpenAI (via OpenClaw)" : provider === "ollama" ? "Local (Ollama)" : provider}>
                      {providerModels.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Tone</label>
                <select className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" value={selectedTone} onChange={(e) => setSelectedTone(e.target.value)}>
                  {tones.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Platform</label>
                <div className="flex gap-1.5">
                  {[
                    { key: "twitter", label: "X" },
                    { key: "linkedin", label: "LinkedIn" },
                    { key: "general", label: "General" },
                  ].map((p) => (
                    <button key={p.key} type="button" onClick={() => setPlatform(p.key)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${platform === p.key ? "border-indigo-500 bg-indigo-500/20 text-indigo-300" : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced toggle */}
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-slate-500 hover:text-slate-300 transition">
              {showAdvanced ? "Hide" : "Show"} advanced options
            </button>

            {showAdvanced && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Custom Instructions (optional)</label>
                <input className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="e.g. Include a call to action, reference our latest product..." value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} />
              </div>
            )}

            <button type="submit" disabled={generating} className="rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2">
              {generating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating...
                </>
              ) : (
                "Generate Post"
              )}
            </button>
          </form>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">{error}</div>
          )}

          {generatedContent && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Preview</h3>
                <span className={`text-xs font-mono ${isOverLimit ? "text-red-400" : "text-slate-400"}`}>
                  {charCount}/{charLimit}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{generatedContent}</p>
              </div>
              {genStats && (
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Model: {genStats.modelLabel}</span>
                  <span>Tokens: {genStats.tokensUsed}</span>
                  <span>Time: {(genStats.durationMs / 1000).toFixed(1)}s</span>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={onSaveDraft} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition">Save to Queue</button>
                <button onClick={onGenerate as any} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition">Regenerate</button>
                <button onClick={() => navigator.clipboard.writeText(generatedContent)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition">Copy</button>
              </div>
            </div>
          )}
        </div>

        {/* Post Queue */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <h3 className="mb-4 text-lg font-semibold text-white">Post Queue</h3>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {posts.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No posts yet. Generate your first one!</p>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={post.status} />
                    <span className="text-[10px] text-slate-500">{new Date(post.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-200 line-clamp-3">{post.content}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{post.platform}</span>
                    <span>&middot;</span>
                    <span>{post.model}</span>
                    <span>&middot;</span>
                    <span>{post.tone}</span>
                  </div>
                  <div className="flex gap-1">
                    {post.status === "generated" && (
                      <button onClick={() => onApprove(post.id)} className="rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-500">Approve</button>
                    )}
                    <button onClick={() => navigator.clipboard.writeText(post.content)} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10">Copy</button>
                    <button onClick={() => onDelete(post.id)} className="rounded-md border border-red-500/20 bg-red-900/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-900/40">Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
