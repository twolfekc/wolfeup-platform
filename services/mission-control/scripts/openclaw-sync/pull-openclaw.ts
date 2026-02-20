#!/usr/bin/env node
/**
 * Starter pull script for OpenClaw sync.
 *
 * Modes:
 * 1) File mode (default starter): set OPENCLAW_SOURCE_JSON=/path/to/source.json
 * 2) HTTP mode: set OPENCLAW_SOURCE_URL=https://...
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const OUT_PATH = resolve(process.cwd(), "tmp/openclaw-payload.json");

function pick<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

async function readFromFile(path: string) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function readFromHttp(url: string, token?: string) {
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`OpenClaw fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function redact(obj: unknown): unknown {
  const secretKeys = /(token|secret|password|cookie|authorization|apikey|privatekey)/i;

  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = secretKeys.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return obj;
}

async function main() {
  const sourceJson = process.env.OPENCLAW_SOURCE_JSON;
  const sourceUrl = process.env.OPENCLAW_SOURCE_URL;
  const sourceToken = process.env.OPENCLAW_SOURCE_TOKEN;

  if (!sourceJson && !sourceUrl) {
    throw new Error("Set OPENCLAW_SOURCE_JSON or OPENCLAW_SOURCE_URL");
  }

  const payload = sourceJson
    ? await readFromFile(sourceJson)
    : await readFromHttp(sourceUrl as string, sourceToken);

  const envelope = {
    source: "openclaw",
    pulledAt: new Date().toISOString(),
    schemaVersion: 1,
    data: redact(payload),
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(envelope, null, 2), "utf8");

  const data = envelope.data as {
    tasks?: unknown[];
    cronJobs?: unknown[];
    memoryEntries?: unknown[];
  };

  const taskCount = pick(data.tasks?.length, 0);
  const cronCount = pick(data.cronJobs?.length, 0);
  const memoryCount = pick(data.memoryEntries?.length, 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath: OUT_PATH,
        counts: { tasks: taskCount, cronJobs: cronCount, memoryEntries: memoryCount },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
