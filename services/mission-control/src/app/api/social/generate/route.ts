import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// ── Logging ─────────────────────────────────────────────────────────────────
const LOG_DIR = "/app/.data/logs";
const PRUNE_DAYS = 3;

function getLogFile() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return path.join(LOG_DIR, `social-${ymd}.log`);
}

function writeLog(level: string, message: string, data?: Record<string, unknown>) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const entry = { ts: new Date().toISOString(), level, message, ...(data || {}) };
    fs.appendFileSync(getLogFile(), JSON.stringify(entry) + "\n");
  } catch {
    // never crash on logging
  }
}

function pruneOldLogs() {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    let pruned = 0;
    for (const file of files) {
      if (!file.startsWith("social-") || !file.endsWith(".log")) continue;
      const fp = path.join(LOG_DIR, file);
      if (fs.statSync(fp).mtimeMs < cutoff) {
        fs.unlinkSync(fp);
        pruned++;
      }
    }
    if (pruned > 0) writeLog("info", `Pruned ${pruned} old log files`);
  } catch {}
}

// Prune on first module load
pruneOldLogs();

// ── Models ───────────────────────────────────────────────────────────────────
const OLLAMA_PRIMARY_URL = process.env.OLLAMA_PRIMARY_URL || "http://localhost:11434";
const OLLAMA_FALLBACK_URL = process.env.OLLAMA_FALLBACK_URL || "http://localhost:11434";

const OLLAMA_MODELS: Record<string, { url: string; model: string; label: string; provider: string }> = {
  "rtx4090-qwen32b": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "qwen3:32b",
    label: "RTX 4090 - Qwen3 32B",
    provider: "ollama",
  },
  "rtx4090-qwen": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "qwen2.5:32b",
    label: "RTX 4090 - Qwen 2.5 32B",
    provider: "ollama",
  },
  "rtx4090-gemma": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "gemma3:27b",
    label: "RTX 4090 - Gemma3 27B",
    provider: "ollama",
  },
  "rtx4090-glm": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "glm-4.7-flash:latest",
    label: "RTX 4090 - GLM 4.7 Flash",
    provider: "ollama",
  },
  "rtx4090-nemotron": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "nemotron-3-nano:latest",
    label: "RTX 4090 - Nemotron 3 Nano",
    provider: "ollama",
  },
  "rtx4090-llama": {
    url: `${OLLAMA_PRIMARY_URL}/api/generate`,
    model: "llama3.1:8b",
    label: "RTX 4090 - Llama 3.1 8B",
    provider: "ollama",
  },
  "unraid-qwen14b": {
    url: `${OLLAMA_FALLBACK_URL}/api/generate`,
    model: "qwen2.5:14b-instruct-q5_K_M",
    label: "Unraid 3070Ti - Qwen 2.5 14B",
    provider: "ollama",
  },
  "unraid-deepseek": {
    url: `${OLLAMA_FALLBACK_URL}/api/generate`,
    model: "deepseek-r1:8b",
    label: "Unraid 3070Ti - DeepSeek R1 8B",
    provider: "ollama",
  },
  "unraid-gemma": {
    url: `${OLLAMA_FALLBACK_URL}/api/generate`,
    model: "gemma3:4b",
    label: "Unraid 3070Ti - Gemma 3 4B",
    provider: "ollama",
  },
};

const OPENAI_MODELS: Record<string, { model: string; label: string; provider: string }> = {
  "openai-gpt53-codex": { model: "gpt-5.3-codex",       label: "OpenAI GPT-5.3 Codex",       provider: "openai" },
  "openai-gpt53-spark": { model: "gpt-5.3-codex-spark", label: "OpenAI GPT-5.3 Codex Spark",  provider: "openai" },
  "openai-gpt52-codex": { model: "gpt-5.2-codex",       label: "OpenAI GPT-5.2 Codex",        provider: "openai" },
  "openai-gpt5-mini":   { model: "gpt-5-codex-mini",    label: "OpenAI GPT-5 Codex Mini",     provider: "openai" },
};

const ALL_MODELS = { ...OLLAMA_MODELS, ...OPENAI_MODELS };

const OPENAI_PROXY_URL = process.env.REPLY_ORCHESTRATOR_URL
  ? `${process.env.REPLY_ORCHESTRATOR_URL}/api/openai/generate`
  : "http://localhost:7890/api/openai/generate";
const OPENAI_PROXY_TOKEN = process.env.REPLY_ORCHESTRATOR_TOKEN || "";

const TONE_PROMPTS: Record<string, string> = {
  professional: "Write in a polished, corporate professional tone. Think Fortune 500 press release meets startup manifesto. Confident, authoritative, forward-looking.",
  savage: "Write with savage, deadpan wit. You are a wolf in a suit who has completely run out of patience for mediocrity. Sharp, cutting, darkly funny. No emojis.",
  casual: "Write in a relaxed, conversational tone. Like texting a smart friend. Short sentences, natural flow, occasionally witty.",
  hype: "Write with infectious energy and enthusiasm. Use strategic emojis. Build excitement. Make people feel like they are missing out if they do not engage.",
  thought_leader: "Write as a seasoned industry insider sharing hard-won wisdom. Contrarian but backed by evidence. The kind of post that makes people stop scrolling.",
  technical: "Write with precise technical depth. Include specific details, numbers, and implementation insights. For developers and engineers who appreciate rigor.",
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let modelKey = "";
  let topic = "";
  try {
    const body = await request.json();
    modelKey = body.modelKey || "";
    topic = body.topic || "";
    const { tone, platform, customInstructions } = body;

    writeLog("info", "generate.request", { modelKey, tone, platform, topicLen: topic.length, hasCustom: !!customInstructions });

    const endpoint = ALL_MODELS[modelKey];
    if (!endpoint) {
      writeLog("error", "generate.error", { modelKey, error: "Unknown model" });
      return NextResponse.json({ error: "Unknown model: " + modelKey }, { status: 400 });
    }

    const tonePrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.professional;
    const platformLimit = platform === "twitter" ? "Keep it under 280 characters." : "Keep it under 500 characters.";

    const systemPrompt =
      "You are the social media voice for @WolfeUpHQ, a sharp AI/tech company based in Kansas City. " +
      tonePrompt + "\n\n" + platformLimit + "\n\n" +
      (customInstructions ? "Additional instructions: " + customInstructions : "") +
      "\n\nWrite ONLY the post content. No quotes, no meta commentary, no preamble. Just the raw post text ready to publish.";

    const prompt = "Write a " + platform + " post about: " + topic;

    if (endpoint.provider === "openai") {
      const openaiModel = (endpoint as any).model;
      writeLog("info", "generate.openai.start", { model: openaiModel, proxyUrl: OPENAI_PROXY_URL });

      const proxyResponse = await fetch(OPENAI_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_PROXY_TOKEN },
        body: JSON.stringify({ model: openaiModel, prompt, system: systemPrompt }),
      });

      if (!proxyResponse.ok) {
        const errText = await proxyResponse.text();
        writeLog("error", "generate.openai.error", { model: openaiModel, status: proxyResponse.status, body: errText.slice(0, 500) });
        return NextResponse.json({ error: "OpenAI proxy error: " + proxyResponse.status, detail: errText }, { status: 502 });
      }

      const data = await proxyResponse.json();
      const durationMs = Date.now() - startTime;
      writeLog("info", "generate.openai.success", { model: data.model || openaiModel, durationMs, tokensUsed: data.tokensUsed || 0, contentLen: (data.content || "").length });

      return NextResponse.json({
        content: data.content || "",
        model: data.model || openaiModel,
        modelLabel: endpoint.label,
        modelEndpoint: "OpenAI via OpenClaw",
        provider: "openai",
        generatedAt: Date.now(),
        tokensUsed: data.tokensUsed || 0,
        durationMs,
      });
    } else {
      const ollamaEndpoint = endpoint as any;
      writeLog("info", "generate.ollama.start", { model: ollamaEndpoint.model, url: ollamaEndpoint.url });

      // Disable thinking for qwen3 models using think:false parameter
      const isQwen3 = ollamaEndpoint.model.startsWith('qwen3');
      const ollamaResponse = await fetch(ollamaEndpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaEndpoint.model,
          prompt,
          system: systemPrompt,
          stream: false,
          ...(isQwen3 ? { think: false } : {}),
          options: { temperature: 0.8, top_p: 0.9, num_predict: platform === "twitter" ? 100 : 250 },
        }),
      });

      if (!ollamaResponse.ok) {
        const errText = await ollamaResponse.text();
        writeLog("error", "generate.ollama.error", { model: ollamaEndpoint.model, status: ollamaResponse.status, body: errText.slice(0, 500) });
        return NextResponse.json({ error: "Ollama error: " + ollamaResponse.status, detail: errText }, { status: 502 });
      }

      const data = await ollamaResponse.json();
      // Qwen3 models use a 'thinking' field; response may be empty
      let content = (data.response || "").trim();
      if (!content && data.thinking) {
        // Extract actual reply after </think> if embedded, else skip thinking
        const thinkEnd = (data.thinking as string).lastIndexOf('</think>');
        content = thinkEnd >= 0 ? (data.thinking as string).slice(thinkEnd + 8).trim() : "";
      }
      // Strip any embedded <think>...</think> blocks from response
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const durationMs = Date.now() - startTime;
      writeLog("info", "generate.ollama.success", { model: ollamaEndpoint.model, durationMs, tokensUsed: data.eval_count || 0, contentLen: content.length });

      return NextResponse.json({
        content,
        model: ollamaEndpoint.model,
        modelLabel: endpoint.label,
        modelEndpoint: ollamaEndpoint.url,
        provider: "ollama",
        generatedAt: Date.now(),
        tokensUsed: data.eval_count || 0,
        durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : durationMs,
      });
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    writeLog("error", "generate.exception", { modelKey, topic: topic.slice(0, 100), error: err.message, durationMs });
    return NextResponse.json({ error: "Generation failed", detail: err.message }, { status: 500 });
  }
}

export async function GET() {
  const models = Object.entries(ALL_MODELS).map(([key, val]) => ({
    key,
    label: val.label,
    provider: val.provider,
    model: (val as any).model || "",
    url: (val as any).url || "openai-proxy",
  }));
  const tones = Object.entries(TONE_PROMPTS).map(([key, prompt]) => ({
    key,
    label: key.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: prompt.slice(0, 80) + "...",
  }));
  return NextResponse.json({ models, tones });
}
