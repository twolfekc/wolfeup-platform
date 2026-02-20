import { NextRequest, NextResponse } from "next/server";

const TRENDS_URL = process.env.TRENDS_API_URL || "http://localhost:8765";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${TRENDS_URL}/api/${path.join("/")}${req.nextUrl.search}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach trends collector", detail: e.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${TRENDS_URL}/api/${path.join("/")}`;

  try {
    const body = await req.json().catch(() => ({}));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach trends collector", detail: e.message }, { status: 502 });
  }
}
