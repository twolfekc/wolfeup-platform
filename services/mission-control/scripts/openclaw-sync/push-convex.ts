#!/usr/bin/env node
/**
 * Starter push script for Convex ingestion endpoint.
 *
 * Required:
 * - CONVEX_INGEST_URL
 * Optional:
 * - CONVEX_INGEST_TOKEN
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const PAYLOAD_PATH = resolve(process.cwd(), "tmp/openclaw-payload.json");
const REPORT_PATH = resolve(process.cwd(), "tmp/sync-report.json");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postWithRetry(url: string, body: unknown, token?: string, maxAttempts = 5) {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, body: json };
      }

      lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      lastErr = err;
    }

    const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
    await sleep(backoffMs);
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function main() {
  const ingestUrl = process.env.CONVEX_INGEST_URL;
  const ingestToken = process.env.CONVEX_INGEST_TOKEN;

  if (!ingestUrl) throw new Error("Set CONVEX_INGEST_URL");

  const raw = await readFile(PAYLOAD_PATH, "utf8");
  const payload = JSON.parse(raw);

  const startedAt = new Date().toISOString();
  const res = await postWithRetry(ingestUrl, payload, ingestToken, 5);
  const finishedAt = new Date().toISOString();

  const report = {
    ok: true,
    startedAt,
    finishedAt,
    ingestUrl,
    responseStatus: res.status,
    responseBody: res.body,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (err) => {
  const report = {
    ok: false,
    finishedAt: new Date().toISOString(),
    error: err instanceof Error ? err.message : String(err),
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
});
