import { NextResponse } from "next/server";

const RELAY_URL = process.env.DASHBOARD_RELAY_URL || "http://localhost:5051";

async function fetchWithTimeout(url: string, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function GET() {
  try {
    const [sessions, nodes, crons] = await Promise.all([
      fetchWithTimeout(`${RELAY_URL}/sessions`),
      fetchWithTimeout(`${RELAY_URL}/nodes`),
      fetchWithTimeout(`${RELAY_URL}/crons`),
    ]);

    return NextResponse.json({
      sessions: sessions || [],
      nodes: nodes || [],
      crons: crons || [],
      fetchedAt: new Date().toISOString(),
      relayStatus: sessions !== null ? "connected" : "unreachable",
    });
  } catch (e: any) {
    return NextResponse.json({
      error: "Cannot reach dashboard relay",
      detail: e.message,
      sessions: [],
      nodes: [],
      crons: [],
      relayStatus: "unreachable",
    }, { status: 502 });
  }
}
