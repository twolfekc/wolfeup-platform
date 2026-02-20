import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const DATA_DIR = join(process.cwd(), ".data");
const PRESETS_FILE = join(DATA_DIR, "reply-presets.json");

type Preset = {
  id: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

async function loadPresets(): Promise<Preset[]> {
  try {
    const data = await readFile(PRESETS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function savePresets(presets: Preset[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

export async function GET() {
  return NextResponse.json(await loadPresets());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const presets = await loadPresets();
  const preset: Preset = {
    id: randomUUID(),
    name: body.name || "Untitled Preset",
    config: body.config || body,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  presets.unshift(preset);
  await savePresets(presets);
  return NextResponse.json(preset, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  let presets = await loadPresets();
  presets = presets.filter((p) => p.id !== id);
  await savePresets(presets);
  return NextResponse.json({ ok: true });
}
