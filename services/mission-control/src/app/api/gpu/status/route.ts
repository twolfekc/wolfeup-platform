import { NextResponse } from "next/server";

const RTX4090_URL = process.env.OLLAMA_RTX4090_URL || "http://localhost:11434";
const UNRAID_URL = process.env.OLLAMA_UNRAID_URL || "http://localhost:11434";
const ORCH_URL = process.env.REPLY_ORCHESTRATOR_URL || "http://localhost:7890";
const ORCH_TOKEN = process.env.REPLY_ORCHESTRATOR_TOKEN || "";

type OllamaPsModel = {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at: string;
  size_vram: number;
};

type OllamaPsResponse = {
  models: OllamaPsModel[];
};

type GpuLoadedModel = {
  name: string;
  sizeGb: number;
  vramGb: number;
  contextLength: number;
  quantization: string;
  family: string;
  expiresAt: string;
};

type GpuStatus = {
  name: string;
  host: string;
  totalVramGb: number;
  online: boolean;
  loadedModels: GpuLoadedModel[];
  error?: string;
};

async function fetchOllamaPs(url: string): Promise<{ models: OllamaPsModel[] } | null> {
  try {
    const res = await fetch(`${url}/api/ps`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OllamaPsResponse;
  } catch {
    return null;
  }
}

export async function GET() {
  const [rtx4090Result, unraidResult] = await Promise.all([
    fetchOllamaPs(RTX4090_URL),
    fetchOllamaPs(UNRAID_URL),
  ]);

  function mapModels(ps: OllamaPsResponse | null): GpuLoadedModel[] {
    if (!ps?.models) return [];
    return ps.models.map((m) => ({
      name: m.name || m.model,
      sizeGb: +(m.size / 1e9).toFixed(1),
      vramGb: +(m.size_vram / 1e9).toFixed(1),
      contextLength: 0,
      quantization: m.details?.quantization_level || "",
      family: m.details?.family || "",
      expiresAt: m.expires_at || "",
    }));
  }

  // If Unraid direct call failed, try orchestrator health as fallback
  let unraidOnline = unraidResult !== null;
  let unraidModels: GpuLoadedModel[] = mapModels(unraidResult);
  let unraidError: string | undefined = unraidResult === null ? "Unreachable" : undefined;

  if (unraidResult === null && ORCH_URL) {
    try {
      const healthRes = await fetch(`${ORCH_URL}/api/health`, {
        signal: AbortSignal.timeout(5000),
        headers: ORCH_TOKEN ? { Authorization: `Bearer ${ORCH_TOKEN}` } : {},
      });
      if (healthRes.ok) {
        const health = await healthRes.json();
        const unraidHealth = health.ollama?.unraid;
        if (unraidHealth?.online) {
          unraidOnline = true;
          unraidError = undefined;
          // Show available models from health data (no VRAM/loaded details)
          if (Array.isArray(unraidHealth.models) && unraidHealth.models.length > 0) {
            unraidModels = unraidHealth.models.map((name: string) => ({
              name,
              sizeGb: 0,
              vramGb: 0,
              contextLength: 0,
              quantization: "",
              family: "",
              expiresAt: "",
            }));
          }
        }
      }
    } catch {
      // Orchestrator also unreachable, keep original error
    }
  }

  const gpus: GpuStatus[] = [
    {
      name: "RTX 4090",
      host: process.env.GPU_PRIMARY_HOST || "gpu-primary",
      totalVramGb: 24,
      online: rtx4090Result !== null,
      loadedModels: mapModels(rtx4090Result),
      ...(rtx4090Result === null ? { error: "Unreachable" } : {}),
    },
    {
      name: "RTX 3070 Ti (Unraid)",
      host: process.env.GPU_FALLBACK_HOST || "gpu-fallback",
      totalVramGb: 8,
      online: unraidOnline,
      loadedModels: unraidModels,
      ...(unraidError ? { error: unraidError } : {}),
    },
  ];

  return NextResponse.json({ gpus, fetchedAt: new Date().toISOString() });
}
