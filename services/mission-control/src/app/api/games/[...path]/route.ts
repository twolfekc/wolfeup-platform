import { NextRequest, NextResponse } from "next/server";

const GAMES_API_URL = process.env.GAMES_API_URL || "http://games_api:4000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${GAMES_API_URL}/api/${path.join("/")}${req.nextUrl.search}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach games API", detail: e.message }, { status: 502 });
  }
}
