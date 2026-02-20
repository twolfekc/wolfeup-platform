"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* -- Types ----------------------------------------------------------------- */

type SearchQuery = { query: string; target: string };
type HealthStatus = { orchestrator: boolean; cdp: boolean; rtx4090: { online: boolean; models: string[] }; unraid: { online: boolean; models: string[] } };
type ModelOption = { host: string; model: string; label: string };
type SSEEvent = { stage: string; status: string; message: string; progress?: { current: number; total: number }; tweets?: Tweet[]; scored?: ScoredTweet[]; selected?: ScoredTweet[]; replies?: ReplyCandidate[]; results?: PostResult[]; error?: string };
type Tweet = { text: string; author: string; tweetUrl: string; likes: number; retweets: number; replies: number; category?: string; searchQuery?: string };
type ScoredTweet = Tweet & { score: number; reason: string };
type ReplyCandidate = { tweet: ScoredTweet; reply: string; replyScore?: number };
type PostResult = { tweet: ScoredTweet; reply: string; posted: boolean; postUrl?: string; error?: string };
type Preset = { id: string; name: string; config: Record<string, unknown>; createdAt: number };

/* -- Constants ------------------------------------------------------------- */

const STAGES = ["INIT", "SEARCH", "FILTER", "SCORE", "SELECT", "GENERATE", "REFINE", "REVIEW", "POST", "DONE"];

const TONE_PRESETS = [
  { key: "savage", label: "Savage" },
  { key: "thought_leader", label: "Thought Leader" },
  { key: "dry_wit", label: "Dry Wit" },
  { key: "hype", label: "Hype Man" },
  { key: "contrarian", label: "Contrarian" },
  { key: "professional", label: "Professional" },
];

/* -- Helpers --------------------------------------------------------------- */

const STORAGE_KEY = "wolfeup_reply_job";
function saveActiveJob(id: string) { try { localStorage.setItem(STORAGE_KEY, id); } catch {} }
function getActiveJob(): string | null { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
function clearActiveJob() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function StatusDot({ online, active }: { online: boolean; active?: boolean }) {
  if (active) return <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />;
  return <span className={`h-2 w-2 rounded-full inline-block ${online ? "bg-emerald-400" : "bg-red-400"}`} />;
}

/* -- Main Component -------------------------------------------------------- */

export function ReplySection() {
  // Health & models
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);

  // Config - Essential
  const [queries, setQueries] = useState<SearchQuery[]>([{ query: "AI agents 2026", target: "" }]);
  const [tone, setTone] = useState("savage");
  const [genHost, setGenHost] = useState("rtx4090");
  const [genModel, setGenModel] = useState("qwen2.5:32b");
  const [autoPost, setAutoPost] = useState(true);
  const [replyCount, setReplyCount] = useState(1);

  // Config - Advanced (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minLikes, setMinLikes] = useState(5);
  const [minFollowers, setMinFollowers] = useState(100);
  const [maxTweetAge, setMaxTweetAge] = useState(24);
  const [excludeRetweets, setExcludeRetweets] = useState(true);
  const [searchDuration, setSearchDuration] = useState(60);
  const [maxTweets, setMaxTweets] = useState(30);
  const [topN, setTopN] = useState(10);
  const [scoringHost, setScoringHost] = useState("rtx4090");
  const [scoringModel, setScoringModel] = useState("qwen2.5:32b");
  const [useRefinement, setUseRefinement] = useState(false);
  const [refineHost, setRefineHost] = useState("rtx4090");
  const [refineModel, setRefineModel] = useState("llama3.1:8b");
  const [persona, setPersona] = useState("@WolfeUpHQ - Sharp AI/tech company voice. We build autonomous agents and prediction markets. Kansas City based. Direct, witty, never corporate-bland.");
  const [maxReplyLength, setMaxReplyLength] = useState(280);
  const [dryRun, setDryRun] = useState(false);

  // Presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");

  // Job state
  const [running, setRunning] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [currentStage, setCurrentStage] = useState("");
  const [stageStatuses, setStageStatuses] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState("");
  const [foundTweets, setFoundTweets] = useState<Tweet[]>([]);
  const [scoredTweets, setScoredTweets] = useState<ScoredTweet[]>([]);
  const [selectedTweets, setSelectedTweets] = useState<ScoredTweet[]>([]);
  const [replyCandidates, setReplyCandidates] = useState<ReplyCandidate[]>([]);
  const [postResults, setPostResults] = useState<PostResult[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [configCollapsed, setConfigCollapsed] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);

  /* -- SSE Processing ------------------------------------------------------ */

  const processEvent = useCallback((event: SSEEvent) => {
    try {
      setCurrentStage(event.stage || "");
      setStageStatuses((prev) => ({ ...prev, [event.stage]: event.status }));
      if (event.message) setLogs((prev) => [...prev, `[${event.stage}] ${event.message}`]);
      if (event.tweets && Array.isArray(event.tweets)) setFoundTweets(event.tweets);
      if (event.scored && Array.isArray(event.scored)) setScoredTweets(event.scored);
      if (event.selected && Array.isArray(event.selected)) setSelectedTweets(event.selected);
      if (event.replies && Array.isArray(event.replies)) setReplyCandidates(event.replies);
      if (event.results && Array.isArray(event.results)) setPostResults(event.results);

      if (event.stage === "REVIEW" && event.status === "running") setAwaitingApproval(true);
      if (event.stage === "DONE" || event.status === "failed") {
        setRunning(false);
        setAwaitingApproval(false);
        setConfigCollapsed(false);
        clearActiveJob();
      }
    } catch (err) {
      console.error("Error processing SSE event:", err, event);
    }
  }, []);

  const connectSSE = useCallback((id: string) => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    const es = new EventSource(`/api/reply-orchestrator/jobs/${id}/stream`);
    eventSourceRef.current = es;
    es.onopen = () => { setSseConnected(true); reconnectAttemptsRef.current = 0; };
    es.onmessage = (ev) => { try { processEvent(JSON.parse(ev.data)); } catch {} };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
      if (isUnmountedRef.current) return;
      fetch(`/api/reply-orchestrator/jobs/${id}`).then((r) => r.json()).then((job) => {
        if (isUnmountedRef.current) return;
        if (job.status === "running" || job.status === "awaiting_approval") {
          const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
          reconnectAttemptsRef.current++;
          setLogs((prev) => [...prev, `Reconnecting in ${Math.round(delay / 1000)}s...`]);
          reconnectTimerRef.current = setTimeout(() => { if (!isUnmountedRef.current) reconnectSSE(id); }, delay);
        } else {
          setRunning(false); setAwaitingApproval(false); setConfigCollapsed(false); clearActiveJob();
          if (job.events) rebuildStateFromEvents(job.events);
          if (job.status === "completed" || job.status === "failed") saveJobToHistory(id, job);
        }
      }).catch(() => {
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current), 20000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(() => { if (!isUnmountedRef.current) reconnectSSE(id); }, delay);
      });
    };
  }, [processEvent]);

  const reconnectSSE = useCallback((id: string) => {
    setLogs([]); setStageStatuses({}); setCurrentStage(""); setFoundTweets([]); setScoredTweets([]); setSelectedTweets([]); setReplyCandidates([]); setPostResults([]); setAwaitingApproval(false);
    connectSSE(id);
  }, [connectSSE]);

  const rebuildStateFromEvents = useCallback((events: SSEEvent[]) => {
    const newLogs: string[] = [];
    const newStatuses: Record<string, string> = {};
    let tweets: Tweet[] = [], scored: ScoredTweet[] = [], selected: ScoredTweet[] = [], replies: ReplyCandidate[] = [], results: PostResult[] = [], lastStage = "";
    for (const e of events) {
      lastStage = e.stage; newStatuses[e.stage] = e.status;
      if (e.message) newLogs.push(`[${e.stage}] ${e.message}`);
      if (e.tweets) tweets = e.tweets; if (e.scored) scored = e.scored; if (e.selected) selected = e.selected; if (e.replies) replies = e.replies; if (e.results) results = e.results;
    }
    setLogs(newLogs); setStageStatuses(newStatuses); setCurrentStage(lastStage); setFoundTweets(tweets); setScoredTweets(scored); setSelectedTweets(selected); setReplyCandidates(replies); setPostResults(results);
  }, []);

  const saveJobToHistory = useCallback((id: string, job: any) => {
    fetch("/api/reply/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: job.status, queries: job.config?.searchQueries || [], tweetsFound: 0, repliesSent: (job.results || []).filter((r: any) => r.posted).length, duration: 0, createdAt: Date.now(), results: job.results }) }).catch(() => {});
  }, []);

  /* -- Data Loading -------------------------------------------------------- */

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/reply-orchestrator/health");
      if (res.ok) {
        const data = await res.json();
        setHealth({ orchestrator: true, cdp: data.cdp === "connected" || data.cdp?.connected === true, rtx4090: data.ollama?.rtx4090 || { online: false, models: [] }, unraid: data.ollama?.unraid || { online: false, models: [] } });
      } else {
        setHealth({ orchestrator: false, cdp: false, rtx4090: { online: false, models: [] }, unraid: { online: false, models: [] } });
      }
    } catch { setHealth({ orchestrator: false, cdp: false, rtx4090: { online: false, models: [] }, unraid: { online: false, models: [] } }); }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/reply-orchestrator/models");
      if (res.ok) {
        const data = await res.json();
        // Response is grouped: { rtx4090: [...], unraid: [...], openai: [...] }
        let raw: any[] = [];
        if (Array.isArray(data)) {
          raw = data;
        } else if (data.models) {
          raw = data.models;
        } else {
          // Flatten grouped response
          for (const [host, models] of Object.entries(data)) {
            if (Array.isArray(models)) {
              for (const m of models) raw.push({ ...m, host: (m as any).host || host });
            }
          }
        }
        const opts: ModelOption[] = raw.map((m: any) => ({
          host: m.host || "",
          model: m.name || m.model || "",
          label: m.host === "openai" ? `${m.label || m.name}` : `${(m.host || "").replace("rtx4090", "4090").replace("unraid", "Unraid")}: ${m.name || m.model}`,
        }));
        setAllModels(opts);
      }
    } catch {}
  }, []);

  const loadPresets = useCallback(async () => {
    try { const res = await fetch("/api/reply/presets"); if (res.ok) setPresets(await res.json()); } catch {}
  }, []);

  /* -- Mount --------------------------------------------------------------- */

  useEffect(() => {
    isUnmountedRef.current = false;
    loadHealth(); loadModels(); loadPresets();
    const hi = setInterval(loadHealth, 30000);
    const saved = getActiveJob();
    if (saved) {
      fetch(`/api/reply-orchestrator/jobs/${saved}`).then((r) => r.json()).then((job) => {
        if (isUnmountedRef.current) return;
        if (job && (job.status === "running" || job.status === "awaiting_approval")) {
          setJobId(saved); setRunning(true); setConfigCollapsed(true);
          if (job.status === "awaiting_approval") setAwaitingApproval(true);
          connectSSE(saved);
        } else if (job && job.events) {
          setJobId(saved); rebuildStateFromEvents(job.events); clearActiveJob();
          if (job.status === "completed" || job.status === "failed") saveJobToHistory(saved, job);
        } else { clearActiveJob(); }
      }).catch(() => clearActiveJob());
    }
    return () => { isUnmountedRef.current = true; clearInterval(hi); if (eventSourceRef.current) { eventSourceRef.current.close(); } if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); };
  }, [loadHealth, loadModels, loadPresets, connectSSE, rebuildStateFromEvents, saveJobToHistory]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  useEffect(() => {
    function onVis() { if (document.visibilityState === "visible" && jobId && running && (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED)) reconnectSSE(jobId); }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [jobId, running, reconnectSSE]);

  /* -- Actions ------------------------------------------------------------- */

  function addQuery() { setQueries([...queries, { query: "", target: "" }]); }
  function removeQuery(i: number) { setQueries(queries.filter((_, idx) => idx !== i)); }
  function updateQuery(i: number, field: "query" | "target", val: string) { const q = [...queries]; q[i] = { ...q[i], [field]: val }; setQueries(q); }

  function buildJobConfig() {
    return {
      searchQueries: queries.filter((q) => q.query.trim()).map((q) => q.target.trim() ? { query: q.query, target: q.target } : q.query),
      tweetCriteria: { minLikes, minFollowers, excludeRetweets, maxTweetAgeHours: maxTweetAge },
      effort: { searchDurationSec: searchDuration, maxTweetsToCollect: maxTweets, topNToScore: topN },
      models: {
        scoring: { host: scoringHost, model: scoringModel },
        generation: { host: genHost, model: genModel },
        ...(useRefinement ? { refinement: { host: refineHost, model: refineModel } } : {}),
      },
      persona, tone, maxReplyLength, autoPost, dryRun, count: replyCount,
    };
  }

  async function launchJob() {
    setRunning(true); setAwaitingApproval(false); setConfigCollapsed(true); setLogs([]); setCurrentStage(""); setStageStatuses({}); setFoundTweets([]); setScoredTweets([]); setSelectedTweets([]); setReplyCandidates([]); setPostResults([]);
    try {
      const res = await fetch("/api/reply-orchestrator/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildJobConfig()) });
      const data = await res.json();
      if (!res.ok) { setLogs(["ERROR: " + (data.error || "Failed")]); setRunning(false); setConfigCollapsed(false); return; }
      setJobId(data.id); saveActiveJob(data.id); reconnectAttemptsRef.current = 0; connectSSE(data.id);
    } catch (e: any) { setLogs(["ERROR: " + e.message]); setRunning(false); setConfigCollapsed(false); }
  }

  function cancelJob() {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (jobId) fetch(`/api/reply-orchestrator/jobs/${jobId}`, { method: "DELETE" });
    setRunning(false); setAwaitingApproval(false); setConfigCollapsed(false); setSseConnected(false); clearActiveJob();
    setLogs((prev) => [...prev, "Cancelled by user"]);
  }

  async function approveReply() {
    if (!jobId) return;
    const res = await fetch(`/api/reply-orchestrator/jobs/${jobId}/approve`, { method: "POST" });
    if (res.ok) { setAwaitingApproval(false); setLogs((prev) => [...prev, "Approved -- posting now..."]); }
  }

  function denyReply() {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    if (jobId) fetch(`/api/reply-orchestrator/jobs/${jobId}`, { method: "DELETE" });
    setRunning(false); setAwaitingApproval(false); setConfigCollapsed(false); setSseConnected(false); clearActiveJob();
  }

  async function savePreset() {
    await fetch("/api/reply/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: presetName || "Untitled", config: buildJobConfig() }) });
    setPresetName(""); loadPresets();
  }

  function loadPreset(p: Preset) {
    const c = p.config as any;
    if (c.searchQueries) setQueries(c.searchQueries.map((q: any) => typeof q === "string" ? { query: q, target: "" } : { query: q.query || "", target: q.target || "" }));
    if (c.tweetCriteria) { setMinLikes(c.tweetCriteria.minLikes ?? 5); setMinFollowers(c.tweetCriteria.minFollowers ?? 100); setExcludeRetweets(c.tweetCriteria.excludeRetweets ?? true); if (c.tweetCriteria.maxTweetAgeHours) setMaxTweetAge(c.tweetCriteria.maxTweetAgeHours); }
    if (c.effort) { setSearchDuration(c.effort.searchDurationSec ?? 60); setMaxTweets(c.effort.maxTweetsToCollect ?? 30); setTopN(c.effort.topNToScore ?? 10); }
    if (c.models?.scoring) { setScoringHost(c.models.scoring.host || "rtx4090"); setScoringModel(c.models.scoring.model || "qwen2.5:32b"); }
    if (c.models?.generation) { setGenHost(c.models.generation.host || "rtx4090"); setGenModel(c.models.generation.model || "qwen2.5:32b"); }
    if (c.models?.refinement) { setUseRefinement(true); setRefineHost(c.models.refinement.host || "rtx4090"); setRefineModel(c.models.refinement.model || "llama3.1:8b"); }
    if (c.tone) setTone(c.tone); if (c.persona) setPersona(c.persona); if (c.maxReplyLength) setMaxReplyLength(c.maxReplyLength);
    if (c.autoPost !== undefined) setAutoPost(c.autoPost); if (c.dryRun !== undefined) setDryRun(c.dryRun); if (c.count !== undefined) setReplyCount(c.count);
  }

  /* -- Model options grouped ----------------------------------------------- */

  const modelGroups: Record<string, ModelOption[]> = {};
  for (const m of allModels) {
    const group = m.host === "openai" ? "OpenAI" : m.host === "rtx4090" ? "RTX 4090" : m.host === "unraid" ? "Unraid" : m.host;
    if (!modelGroups[group]) modelGroups[group] = [];
    modelGroups[group].push(m);
  }

  function ModelSelect({ value, onChange, id }: { value: string; onChange: (h: string, m: string) => void; id: string }) {
    return (
      <select className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" value={value} onChange={(e) => { const [h, ...m] = e.target.value.split(":"); onChange(h, m.join(":")); }}>
        {Object.entries(modelGroups).map(([group, models]) => (
          <optgroup key={`${id}-${group}`} label={group}>
            {models.map((m) => <option key={`${id}-${m.host}:${m.model}`} value={`${m.host}:${m.model}`}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }

  /* -- Render -------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-1.5"><StatusDot online={!!health?.orchestrator} /> <span className="text-slate-300">Orchestrator</span></div>
        <div className="flex items-center gap-1.5"><StatusDot online={!!health?.cdp} /> <span className="text-slate-300">Chrome CDP</span></div>
        <div className="flex items-center gap-1.5"><StatusDot online={!!health?.rtx4090?.online} /> <span className="text-slate-300">RTX 4090</span></div>
        <div className="flex items-center gap-1.5"><StatusDot online={!!health?.unraid?.online} /> <span className="text-slate-300">Unraid</span></div>
        <div className="flex items-center gap-1.5"><StatusDot online={true} /> <span className="text-slate-300">OpenAI</span></div>
      </div>

      <div className={`grid gap-6 ${configCollapsed ? "xl:grid-cols-[300px_1fr]" : "xl:grid-cols-[1fr_420px]"}`}>
        {/* Left: Config */}
        <div className="space-y-4">
          {configCollapsed ? (
            <button onClick={() => setConfigCollapsed(false)} className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10 transition">
              <span className="text-sm font-semibold text-white">Config</span>
              <p className="text-[10px] text-slate-500 mt-1">{queries.filter((q) => q.query.trim()).map((q) => q.query).join(", ")} &middot; {tone} &middot; {genModel}</p>
            </button>
          ) : (
            <>
              {/* Presets */}
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button key={p.id} onClick={() => loadPreset(p)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-indigo-500/20 transition">{p.name}</button>
                  ))}
                </div>
              )}

              {/* === ESSENTIAL CONFIG === */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-4">
                <h3 className="text-lg font-semibold text-white">Reply Configuration</h3>

                {/* Search Queries */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-slate-400">Search Queries</label>
                  {queries.map((q, i) => (
                    <div key={i} className="flex gap-2">
                      <input className="flex-1 rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" value={q.query} onChange={(e) => updateQuery(i, "query", e.target.value)} placeholder="e.g. AI startups 2026" />
                      {queries.length > 1 && <button onClick={() => removeQuery(i)} className="rounded-lg border border-red-500/20 px-2 text-red-400 hover:bg-red-900/20 text-sm">x</button>}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={addQuery} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">+ Add</button>
                    {["AI agents", "Startups", "NFL", "Coding"].map((label) => (
                      <button key={label} onClick={() => setQueries([...queries.filter((q) => q.query.trim()), { query: label, target: "" }])} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/5">{label}</button>
                    ))}
                  </div>
                </div>

                {/* Tone + Model in one row */}
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Tone</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TONE_PRESETS.map((t) => (
                        <button key={t.key} onClick={() => setTone(t.key)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${tone === t.key ? "border-indigo-500 bg-indigo-500/20 text-indigo-300" : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"}`}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Generation Model</label>
                    <ModelSelect value={`${genHost}:${genModel}`} onChange={(h, m) => { setGenHost(h); setGenModel(m); }} id="gen" />
                  </div>
                </div>

                {/* Reply count + auto-post */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Replies:</label>
                    <select className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white" value={replyCount} onChange={(e) => setReplyCount(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="accent-indigo-500" />
                    Auto-post
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-indigo-500" />
                    Dry run
                  </label>
                </div>

                {/* Launch */}
                <div className="flex gap-3">
                  <button onClick={launchJob} disabled={running || queries.every((q) => !q.query.trim())} className="rounded-lg bg-indigo-500 px-8 py-3 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
                    {running ? "Running..." : "Launch Reply Job"}
                  </button>
                  {running && <button onClick={cancelJob} className="rounded-lg border border-red-500/30 px-6 py-3 text-sm text-red-400 hover:bg-red-900/20">Cancel</button>}
                </div>
              </div>

              {/* === ADVANCED CONFIG (collapsible) === */}
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Advanced Settings</span>
                <span className="text-xs text-indigo-400">{showAdvanced ? "Hide" : "Show"}</span>
              </button>

              {showAdvanced && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur space-y-5">
                  {/* Tweet Filters */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-white">Tweet Filters</h4>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Min Likes: {minLikes}</label>
                        <input type="range" min={0} max={1000} step={5} value={minLikes} onChange={(e) => setMinLikes(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Min Followers: {minFollowers.toLocaleString()}</label>
                        <input type="range" min={0} max={100000} step={100} value={minFollowers} onChange={(e) => setMinFollowers(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max Age: {maxTweetAge}h</label>
                        <input type="range" min={1} max={168} step={1} value={maxTweetAge} onChange={(e) => setMaxTweetAge(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={excludeRetweets} onChange={(e) => setExcludeRetweets(e.target.checked)} className="accent-indigo-500" />
                      Exclude retweets
                    </label>
                  </div>

                  {/* Search Effort */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-white">Search Effort</h4>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Duration: {searchDuration}s</label>
                        <input type="range" min={30} max={300} step={15} value={searchDuration} onChange={(e) => setSearchDuration(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max Tweets: {maxTweets}</label>
                        <input type="range" min={10} max={100} step={5} value={maxTweets} onChange={(e) => setMaxTweets(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Top N: {topN}</label>
                        <input type="range" min={3} max={20} step={1} value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                    </div>
                  </div>

                  {/* Models */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-white">Model Selection</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Scoring Model</label>
                        <ModelSelect value={`${scoringHost}:${scoringModel}`} onChange={(h, m) => { setScoringHost(h); setScoringModel(m); }} id="score" />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-[11px] text-slate-400 mb-1 cursor-pointer">
                          <input type="checkbox" checked={useRefinement} onChange={(e) => setUseRefinement(e.target.checked)} className="accent-indigo-500" />
                          Refinement Model
                        </label>
                        {useRefinement && <ModelSelect value={`${refineHost}:${refineModel}`} onChange={(h, m) => { setRefineHost(h); setRefineModel(m); }} id="refine" />}
                      </div>
                    </div>
                  </div>

                  {/* Persona */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-white">Persona</h4>
                    <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" rows={2} value={persona} onChange={(e) => setPersona(e.target.value)} />
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Max Reply Length: {maxReplyLength}</label>
                      <input type="range" min={140} max={500} step={10} value={maxReplyLength} onChange={(e) => setMaxReplyLength(Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                  </div>

                  {/* Save Preset */}
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-lg border border-white/10 bg-slate-900 p-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" placeholder="Preset name..." value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                    <button onClick={savePreset} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Save</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Live Progress */}
        <div className="space-y-4">
          {/* Pipeline Progress */}
          {(running || currentStage) && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Pipeline</h3>
                {running && <span className={`text-[10px] px-2 py-0.5 rounded-full ${sseConnected ? "bg-emerald-900/40 text-emerald-400" : "bg-amber-900/40 text-amber-400 animate-pulse"}`}>{sseConnected ? "Live" : "Reconnecting..."}</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {STAGES.map((stage) => {
                  const status = stageStatuses[stage];
                  const isCurrent = stage === currentStage;
                  return (
                    <span key={stage} className={`px-2 py-0.5 rounded text-[10px] font-medium ${status === "completed" || status === "done" ? "bg-emerald-900/30 text-emerald-400" : status === "running" ? "bg-indigo-900/30 text-indigo-300 animate-pulse" : status === "failed" ? "bg-red-900/30 text-red-400" : isCurrent ? "bg-white/10 text-slate-300" : "bg-white/5 text-slate-600"}`}>
                      {stage}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approval */}
          {awaitingApproval && (
            <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-900/20 p-4 space-y-3">
              <h3 className="text-sm font-bold text-amber-300">Review Required</h3>
              <p className="text-xs text-slate-300">Approve before posting to X.</p>
              <div className="flex gap-3">
                <button onClick={approveReply} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500">Approve & Post</button>
                <button onClick={denyReply} className="rounded-lg border border-red-500/30 px-5 py-2 text-sm text-red-400 hover:bg-red-900/20">Deny</button>
              </div>
            </div>
          )}

          {/* Live Log */}
          {logs.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Log</h3>
                <span className="text-[10px] text-slate-500">{logs.length}</span>
              </div>
              <div ref={logRef} className="max-h-48 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-slate-300 space-y-0.5">
                {logs.map((line, i) => (
                  <div key={i} className={line.startsWith("ERROR") ? "text-red-400" : line.includes("onnect") ? "text-amber-400" : ""}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Scored Tweets */}
          {scoredTweets.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold text-white mb-2">Scored Tweets ({scoredTweets.length})</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...scoredTweets].sort((a, b) => (b?.score || 0) - (a?.score || 0)).map((t, i) => t ? (
                  <div key={i} className="rounded-lg border border-white/5 bg-black/30 p-2 space-y-1">
                    <div className="flex justify-between"><span className="text-xs text-indigo-300">{t.author || "?"}</span><span className="text-xs font-bold text-amber-400">{t.score || 0}/10</span></div>
                    <p className="text-xs text-slate-300 line-clamp-2">{t.text || ""}</p>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Reply Candidates */}
          {replyCandidates.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold text-white mb-2">Generated Replies</h3>
              <div className="space-y-3">
                {replyCandidates.map((rc, i) => rc?.tweet ? (
                  <div key={i} className="rounded-lg border border-indigo-500/20 bg-indigo-900/10 p-3 space-y-1">
                    <p className="text-xs text-slate-400">To {rc.tweet.author || "?"}:</p>
                    <p className="text-xs text-slate-500 italic line-clamp-1">{rc.tweet.text || ""}</p>
                    <div className="rounded bg-black/30 p-2"><p className="text-sm text-white">{rc.reply || ""}</p></div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Post Results */}
          {postResults.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold text-white mb-2">Results</h3>
              <div className="space-y-2">
                {postResults.map((r, i) => r ? (
                  <div key={i} className={`rounded-lg border p-3 space-y-1 ${r.posted ? "border-emerald-500/20 bg-emerald-900/10" : "border-red-500/20 bg-red-900/10"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${r.posted ? "text-emerald-400" : "text-red-400"}`}>{r.posted ? "POSTED" : "FAILED"}</span>
                      <span className="text-xs text-slate-400">to {r.tweet?.author || "?"}</span>
                    </div>
                    <p className="text-sm text-white">{r.reply || ""}</p>
                    {r.postUrl && r.postUrl.startsWith("http") && <a href={r.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline">View on X</a>}
                    {r.error && <p className="text-xs text-red-400">{r.error}</p>}
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {!running && postResults.length === 0 && logs.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-slate-500">View full job history in the <span className="text-indigo-400">Jobs & History</span> tab.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
