require("dotenv").config();
process.on("uncaughtException", (e) => console.error("Uncaught:", e.message));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { checkHealth: ollamaHealth, getAllModels, OPENAI_MODELS_LIST } = require("./lib/ollama");
const { connectBrowser, disconnectBrowser } = require("./lib/browser");
const { runPipeline } = require("./lib/pipeline");
const log = require("./lib/logger");

const app = express();
const PORT = process.env.PORT || 7890;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// Data directories
const DATA_DIR = path.join(__dirname, "data");
const JOBS_DIR = path.join(DATA_DIR, "jobs");
const PRESETS_DIR = path.join(DATA_DIR, "presets");
[JOBS_DIR, PRESETS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// In-memory stores
const jobs = new Map();
const sseClients = new Map(); // jobId -> Set of response objects
const approvalResolvers = new Map(); // jobId -> resolve function

// Job queue: only one pipeline runs at a time to prevent GPU contention and CDP race conditions
const jobQueue = []; // Array of jobId strings waiting to run
let pipelineRunning = false;

function startNextQueuedJob() {
  if (pipelineRunning || jobQueue.length === 0) return;
  const nextId = jobQueue.shift();
  const job = jobs.get(nextId);
  if (!job) {
    startNextQueuedJob(); // skip if job was deleted
    return;
  }
  pipelineRunning = true;
  log.info("jobs", "Starting queued job", { id: nextId, queueRemaining: jobQueue.length });
  emitEvent(nextId, { stage: "INIT", status: "running", message: "Pipeline starting..." });

  runPipeline(job.config, nextId, (data) => emitEvent(nextId, data), approvalResolvers)
    .then((results) => {
      const j = jobs.get(nextId);
      if (j && j.status !== "failed") {
        j.status = "completed";
        j.results = results || [];
        j.completedAt = new Date().toISOString();
      }
      persistJob(nextId);
      log.info("jobs", "Job completed", { id: nextId, resultCount: (results || []).length });
      emitEvent(nextId, { stage: "DONE", status: "completed", results });
      const clients = sseClients.get(nextId);
      if (clients) { for (const c of clients) c.end(); sseClients.delete(nextId); }
    })
    .catch((err) => {
      const j = jobs.get(nextId);
      if (j) { j.status = "failed"; j.error = err.message; }
      persistJob(nextId);
      log.error("jobs", "Job failed", { id: nextId, error: err.message });
      emitEvent(nextId, { stage: "ERROR", status: "failed", error: err.message });
      const clients = sseClients.get(nextId);
      if (clients) { for (const c of clients) c.end(); sseClients.delete(nextId); }
    })
    .finally(() => {
      pipelineRunning = false;
      startNextQueuedJob();
    });
}

// -- Middleware --
app.use(cors());
app.use(express.json());

function authMiddleware(req, res, next) {
  if (req.path === "/api/health") return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
app.use(authMiddleware);

// -- SSE helpers --
function emitEvent(jobId, data) {
  const job = jobs.get(jobId);
  if (job) {
    job.events.push(data);
    if (data.stage) job.currentStage = data.stage;
    if (data.status === "failed") job.status = "failed";
  }
  const clients = sseClients.get(jobId);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  }
}

// -- Load persisted jobs on startup --
function loadPersistedJobs() {
  try {
    const files = fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, file), "utf8"));
      jobs.set(data.id, data);
    }
    console.log(`Loaded ${files.length} persisted jobs`);
  } catch (e) {
    console.error("Error loading persisted jobs:", e.message);
  }
}
loadPersistedJobs();

// -- Persist job to disk --
function persistJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  const safe = { ...job };
  delete safe._approvalPromise;
  fs.writeFileSync(
    path.join(JOBS_DIR, `${jobId}.json`),
    JSON.stringify(safe, null, 2)
  );
}

// -- Routes: Jobs --

// Create a new job
app.post("/api/jobs", (req, res) => {
  const id = uuidv4();
  const config = req.body;

  // Normalize config: Mission Control sends models.scoring/generation and tweetCriteria,
  // but pipeline.js expects scoringModel/generationModel and filters at the top level.
  if (config.models) {
    if (config.models.scoring && !config.scoringModel) config.scoringModel = config.models.scoring;
    if (config.models.generation && !config.generationModel) config.generationModel = config.models.generation;
    if (config.models.refinement && !config.refinementModel) config.refinementModel = config.models.refinement;
  }
  if (config.tweetCriteria && !config.filters) {
    config.filters = config.tweetCriteria;
  }
  if (config.count !== undefined && config.effort && config.effort.count === undefined) {
    config.effort.count = config.count;
  }

  const job = {
    id,
    status: "running",
    currentStage: "INIT",
    config,
    events: [],
    results: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  jobs.set(id, job);
  sseClients.set(id, new Set());
  log.info("jobs", "Job created", { id, config: { searchQueries: config.searchQueries, scoringModel: config.scoringModel, generationModel: config.generationModel, autoPost: config.autoPost, dryRun: config.dryRun } });

  // Add to queue and start if nothing is running
  jobQueue.push(id);
  const queuePosition = jobQueue.length;
  if (pipelineRunning) {
    job.status = "queued";
    log.info("jobs", "Job queued (pipeline busy)", { id, position: queuePosition });
    emitEvent(id, { stage: "QUEUED", status: "queued", message: `Job queued (position ${queuePosition} - waiting for current job to finish)` });
  }
  startNextQueuedJob();

  res.status(201).json({ id, status: pipelineRunning ? "queued" : "running" });
});

// List all jobs
app.get("/api/jobs", (req, res) => {
  const list = Array.from(jobs.values()).map((j) => ({
    id: j.id,
    status: j.status,
    currentStage: j.currentStage,
    createdAt: j.createdAt,
    completedAt: j.completedAt,
    config: j.config,
  }));
  res.json(list);
});

// Get single job
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const safe = { ...job };
  delete safe._approvalPromise;
  res.json(safe);
});

// SSE stream for a job
app.get("/api/jobs/:id/stream", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send past events
  for (const evt of job.events) {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }

  // Register for future events
  let clients = sseClients.get(req.params.id);
  if (!clients) {
    clients = new Set();
    sseClients.set(req.params.id, clients);
  }
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
});

// Delete a job
app.delete("/api/jobs/:id", (req, res) => {
  const id = req.params.id;
  if (!jobs.has(id)) return res.status(404).json({ error: "Job not found" });
  jobs.delete(id);
  sseClients.delete(id);
  const file = path.join(JOBS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ deleted: true });
});

// Approve a job (resume from REVIEW stage)
app.post("/api/jobs/:id/approve", (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "awaiting_approval") {
    return res.status(400).json({ error: "Job is not awaiting approval" });
  }
  const resolver = approvalResolvers.get(id);
  if (resolver) {
    job.status = "running";
    log.info("jobs", "Job approved", { id });
    resolver(req.body || {});
    approvalResolvers.delete(id);
  }
  res.json({ approved: true });
});

// -- Routes: Presets --

app.get("/api/presets", (req, res) => {
  try {
    const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json"));
    const presets = files.map((f) =>
      JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, f), "utf8"))
    );
    res.json(presets);
  } catch (e) {
    res.json([]);
  }
});

app.post("/api/presets", (req, res) => {
  const preset = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
  fs.writeFileSync(
    path.join(PRESETS_DIR, `${preset.id}.json`),
    JSON.stringify(preset, null, 2)
  );
  res.status(201).json(preset);
});

app.get("/api/presets/:id", (req, res) => {
  const file = path.join(PRESETS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Preset not found" });
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});

app.delete("/api/presets/:id", (req, res) => {
  const file = path.join(PRESETS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Preset not found" });
  fs.unlinkSync(file);
  res.json({ deleted: true });
});

// -- Routes: Health & Models --

app.get("/api/health", async (req, res) => {
  const rtx = await ollamaHealth("rtx4090");
  const unraid = await ollamaHealth("unraid");

  let cdpStatus = "unknown";
  try {
    const { browser, source } = await connectBrowser();
    cdpStatus = source === "cdp" ? "connected" : "local_fallback";
    await disconnectBrowser(browser, source);
  } catch (e) {
    cdpStatus = "unavailable";
  }

  res.json({
    status: "ok",
    uptime: process.uptime(),
    ollama: { rtx4090: rtx, unraid },
    cdp: cdpStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/models", async (req, res) => {
  const ollamaModels = await getAllModels();
  // Group Ollama models by host
  const grouped = {};
  for (const m of ollamaModels) {
    if (!grouped[m.host]) grouped[m.host] = [];
    grouped[m.host].push(m);
  }
  // Add OpenAI models
  grouped.openai = OPENAI_MODELS_LIST;
  res.json(grouped);
});

// -- OpenAI Proxy via OpenClaw CLI --
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/home/tyler/.npm-global/bin/openclaw";

const OPENAI_MODELS = {
  "gpt-5.3-codex": { agent: "codex", label: "GPT-5.3 Codex" },
  "gpt-5.3-codex-spark": { agent: "brave", label: "GPT-5.3 Codex Spark" },
  "gpt-5.2-codex": { agent: "codex", label: "GPT-5.2 Codex" },
  "gpt-5-codex-mini": { agent: "codex", label: "GPT-5 Codex Mini" },
};

function runOpenClaw(agentId, message, timeoutSec) {
  timeoutSec = timeoutSec || 90;
  return new Promise(function (resolve, reject) {
    var args = ["agent", "--agent", agentId, "--message", message, "--json", "--no-color"];
    execFile(OPENCLAW_BIN, args, { env: Object.assign({}, process.env), timeout: timeoutSec * 1000 }, function (err, stdout) {
      if (err) return reject(new Error("openclaw agent failed: " + err.message));
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error("Failed to parse openclaw output: " + e.message)); }
    });
  });
}

app.post("/api/openai/generate", async (req, res) => {
  try {
    var body = req.body;
    var model = body.model;
    var prompt = body.prompt;
    var system = body.system;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    log.info("openai", "Generate request", { model, promptLen: (prompt || "").length });

    var modelInfo = OPENAI_MODELS[model] || OPENAI_MODELS["gpt-5.3-codex"];
    var fullMessage = "";
    if (system) fullMessage += "SYSTEM INSTRUCTIONS:\n" + system + "\n\n";
    fullMessage += prompt;

    var startTime = Date.now();
    var result = await runOpenClaw(modelInfo.agent, fullMessage, 90);
    var durationMs = Date.now() - startTime;

    var text = "";
    if (result && result.result && result.result.payloads && result.result.payloads[0]) {
      text = result.result.payloads[0].text || "";
    }
    var usage = {};
    if (result && result.result && result.result.meta && result.result.meta.agentMeta) {
      usage = result.result.meta.agentMeta.usage || {};
    }
    var actualModel = model;
    if (result && result.result && result.result.meta && result.result.meta.agentMeta) {
      actualModel = result.result.meta.agentMeta.model || model;
    }

    log.info("openai", "Generate success", { model: actualModel, durationMs: durationMs, tokensUsed: usage.output || 0 });
    res.json({
      content: text.trim(),
      model: actualModel,
      modelLabel: modelInfo.label,
      provider: "openai-codex",
      generatedAt: Date.now(),
      tokensUsed: usage.output || 0,
      totalTokens: usage.total || 0,
      durationMs: durationMs,
    });
  } catch (err) {
    log.error("openai", "Generate failed", { error: err.message });
    res.status(502).json({ error: "OpenAI generation failed", detail: err.message });
  }
});

app.get("/api/openai/models", function (req, res) {
  var models = Object.keys(OPENAI_MODELS).map(function (key) {
    return { key: key, label: OPENAI_MODELS[key].label, agent: OPENAI_MODELS[key].agent };
  });
  res.json({ models: models, provider: "openai-codex" });
});

// -- Start --
app.listen(PORT, () => {
  console.log(`Reply Orchestrator running on port ${PORT}`);
});
