import { NextResponse } from "next/server";

const TRENDS_URL = process.env.TRENDS_API_URL || "http://localhost:8765";

export async function POST() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${TRENDS_URL}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot trigger collection", detail: e.message }, { status: 502 });
  }
}
