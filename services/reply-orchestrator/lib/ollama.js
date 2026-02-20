const { execFile } = require("child_process");

const HOSTS = {
  rtx4090: process.env.OLLAMA_RTX4090 || "http://localhost:11434",
  unraid: process.env.OLLAMA_UNRAID || "http://localhost:11434",
};

function getUrl(host) {
  return HOSTS[host] || host;
}

async function listModels(host) {
  const url = `${getUrl(host)}/api/tags`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama ${host} returned ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

async function generate(host, model, prompt, options = {}) {
  const url = `${getUrl(host)}/api/generate`;
  const body = {
    model,
    prompt,
    stream: false,
    ...options,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`);
  const data = await res.json();
  return data.response || "";
}

async function checkHealth(host) {
  // OpenAI models are always "online" (we cannot cheaply health-check them)
  if (host === "openai") {
    return { online: true, models: OPENAI_MODELS_LIST.map((m) => m.name) };
  }
  try {
    const models = await listModels(host);
    return {
      online: true,
      models: models.map((m) => m.name || m.model),
    };
  } catch (e) {
    return { online: false, models: [], error: e.message };
  }
}

async function getAllModels() {
  const results = [];
  for (const [hostName, hostUrl] of Object.entries(HOSTS)) {
    try {
      const models = await listModels(hostName);
      for (const m of models) {
        results.push({
          name: m.name || m.model,
          host: hostName,
          size: m.size,
          modified: m.modified_at,
        });
      }
    } catch (e) {
      // host offline, skip
    }
  }
  return results;
}

// -- OpenAI via OpenClaw CLI --
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/home/tyler/.npm-global/bin/openclaw";

const OPENAI_AGENT_MAP = {
  "gpt-5.3-codex": "codex",
  "gpt-5.3-codex-spark": "brave",
  "gpt-5.2-codex": "codex",
  "gpt-5-codex-mini": "codex",
};

const OPENAI_MODELS_LIST = [
  { name: "gpt-5.3-codex", size: 0, host: "openai", label: "GPT-5.3 Codex" },
  { name: "gpt-5.3-codex-spark", size: 0, host: "openai", label: "GPT-5.3 Codex Spark" },
  { name: "gpt-5.2-codex", size: 0, host: "openai", label: "GPT-5.2 Codex" },
  { name: "gpt-5-codex-mini", size: 0, host: "openai", label: "GPT-5 Codex Mini" },
];

async function generateOpenAI(model, prompt) {
  const agentId = OPENAI_AGENT_MAP[model] || "codex";
  return new Promise((resolve, reject) => {
    const args = ["agent", "--agent", agentId, "--message", prompt, "--json", "--no-color"];
    execFile(OPENCLAW_BIN, args, { env: { ...process.env }, timeout: 90000 }, (err, stdout) => {
      if (err) return reject(new Error("openclaw agent failed: " + err.message));
      try {
        const result = JSON.parse(stdout);
        const text = result?.result?.payloads?.[0]?.text || "";
        resolve(text.trim());
      } catch (e) {
        reject(new Error("Failed to parse openclaw output: " + e.message));
      }
    });
  });
}

module.exports = {
  listModels,
  generate,
  generateOpenAI,
  checkHealth,
  getAllModels,
  HOSTS,
  OPENAI_MODELS_LIST,
};
