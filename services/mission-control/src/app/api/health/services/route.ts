import { NextResponse } from "next/server";

type ServiceCheck = {
  name: string;
  url: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  checkedAt: string;
};

async function checkService(name: string, url: string, timeout = 5000): Promise<ServiceCheck> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return {
      name,
      url,
      status: res.ok ? (latencyMs > 3000 ? "degraded" : "up") : "degraded",
      latencyMs,
      checkedAt,
    };
  } catch {
    return {
      name,
      url,
      status: "down",
      latencyMs: Date.now() - start,
      checkedAt,
    };
  }
}

const SERVICES = [
  { name: "Games Arcade", url: "http://localhost:80" },
  { name: "Auth Service", url: "http://auth_service:4000/" },
  { name: "Reply Orchestrator", url: (process.env.REPLY_ORCHESTRATOR_URL || "http://localhost:7890") + "/api/health" },
  { name: "Ollama RTX 4090", url: (process.env.OLLAMA_RTX4090_URL || "http://localhost:11434") + "/api/tags" },
  { name: "Ollama Unraid", url: (process.env.OLLAMA_UNRAID_URL || "http://localhost:11434") + "/api/tags" },
  { name: "Trends Collector", url: (process.env.TRENDS_API_URL || "http://localhost:8765") + "/api/status" },
  { name: "Dashboard Relay", url: (process.env.DASHBOARD_RELAY_URL || "http://localhost:5051") + "/health" },
  { name: "Loup Dashboard", url: "http://loup_dashboard:5050/" },
  { name: "Ping Platform", url: "http://ping-platform:5060/" },
  { name: "Games API", url: (process.env.GAMES_API_URL || "http://games_api:4000") + "/health" },
];

export async function GET() {
  try {
    const results = await Promise.all(
      SERVICES.map((s) => checkService(s.name, s.url))
    );
    const upCount = results.filter((r) => r.status === "up").length;
    return NextResponse.json({
      services: results,
      summary: {
        total: results.length,
        up: upCount,
        down: results.filter((r) => r.status === "down").length,
        degraded: results.filter((r) => r.status === "degraded").length,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Health check failed", detail: e.message }, { status: 500 });
  }
}
