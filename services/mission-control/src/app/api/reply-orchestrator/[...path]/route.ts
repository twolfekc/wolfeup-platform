import { NextRequest, NextResponse } from "next/server";

const ORCH_URL = process.env.REPLY_ORCHESTRATOR_URL || "http://localhost:7890";
const ORCH_TOKEN = process.env.REPLY_ORCHESTRATOR_TOKEN || "";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${ORCH_URL}/api/${path.join("/")}${req.nextUrl.search}`;

  // SSE streaming for job progress
  if (path.length >= 3 && path[2] === "stream") {
    try {
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${ORCH_TOKEN}` },
      });
      if (!res.ok) return NextResponse.json({ error: "Orchestrator error" }, { status: res.status });
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e: any) {
      return NextResponse.json({ error: "Cannot reach orchestrator", detail: e.message }, { status: 502 });
    }
  }

  try {
    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${ORCH_TOKEN}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach orchestrator", detail: e.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${ORCH_URL}/api/${path.join("/")}`;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ORCH_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach orchestrator", detail: e.message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${ORCH_URL}/api/${path.join("/")}`;
  try {
    const res = await fetch(target, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ORCH_TOKEN}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach orchestrator", detail: e.message }, { status: 502 });
  }
}
