# OPENCLAW-SYNC.md

## OpenClaw → Mission Control (Convex) Safe Sync Guide

This document defines how to synchronize OpenClaw tasks, cron jobs, and memory files into Convex safely and repeatably.

---

## 1) Scope

### Sources
- **Tasks**: active/completed items from OpenClaw workflows
- **Cron Jobs**: schedules, last run status, next run, error summaries
- **Memory Files**:
  - `memory/YYYY-MM-DD.md` (daily notes)
  - `MEMORY.md` (curated long-term memory)

### Targets (Convex Collections)
- `openclawTasks`
- `openclawCronJobs`
- `openclawMemoryEntries`
- `openclawSyncRuns`

---

## 2) Safety Model

## 2.1 Data Minimization
Store only required fields for product behavior:
- identifiers
- status
- ownership
- timestamps
- summarized content snippet (not full raw blobs unless required)

## 2.2 Secret Redaction
Before any write, redact likely secrets using pattern + key-name rules.

### Field-name triggers
- `token`, `secret`, `password`, `cookie`, `authorization`, `apiKey`, `privateKey`

### Content triggers (examples)
- Bearer tokens
- JWT-like strings
- SSH private key headers
- Cloud API tokens

Replace with:
- `"[REDACTED]"`
- plus metadata: `redactionReason`, `redactedPaths[]`, `contentHash`

## 2.3 Visibility + Ownership
Each stored record must include:
- `visibility`: `private | team | public`
- `ownerType`: `user | role | system`
- `ownerId`

Query resolvers must filter by visibility and current role.

---

## 3) Idempotent Sync Contract

Use deterministic source keys per record.

```ts
sourceKey = `${sourceType}:${sourceId}`
fingerprint = sha256(normalizedContent)
```

### Upsert rules
1. If `sourceKey` not present → insert
2. If present and `fingerprint` unchanged → skip
3. If present and `fingerprint` changed → update + `updatedAt`

### Sync run log
Write one `openclawSyncRuns` row per run:
- `runId`
- `startedAt`, `finishedAt`
- `cursorFrom`, `cursorTo`
- `created`, `updated`, `skipped`, `errors`
- `errorSamples[]`

---

## 4) Incremental Sync Strategy

## 4.1 Cursoring
Use per-source cursors:
- `tasksCursor`
- `cronCursor`
- `memoryCursor`

Persist cursor after successful target write batch.

## 4.2 Replay Safety
Always allow replay of last N minutes to handle clock skew.
- e.g. pull with `since = lastCursor - 5min`
- rely on idempotent upsert to avoid duplication

## 4.3 Retry + Backoff
On transient failure:
- retry up to 5 attempts
- exponential backoff + jitter
- do not advance cursor on failed commit

---

## 5) Memory File Sync Design

## 5.1 Parsing Strategy
- For `memory/YYYY-MM-DD.md`:
  - split entries by heading/time markers
  - store `entryDate`, `entryTitle`, `entryBodySnippet`
- For `MEMORY.md`:
  - treat as curated long-term memory
  - store section-level chunks with stable section IDs

## 5.2 Ownership defaults
- Daily memory files: `ownerType=user`, `visibility=private`
- Curated memory sections: configurable (`private` default)

## 5.3 Confidentiality guardrails
Never store:
- raw credentials
- full private key material
- full auth cookies/session tokens

If detected, keep only:
- redacted marker
- hash
- file path + line range metadata

---

## 6) Convex Collection Blueprint (Suggested)

```ts
// Pseudocode only
openclawTasks: {
  sourceKey, sourceId, title, status, priority,
  assigneeId, visibility, ownerType, ownerId,
  createdAt, updatedAt, fingerprint
}

openclawCronJobs: {
  sourceKey, sourceId, name, schedule,
  lastRunAt, nextRunAt, lastStatus, failureStreak,
  visibility, ownerType, ownerId,
  updatedAt, fingerprint
}

openclawMemoryEntries: {
  sourceKey, sourceId, filePath, entryType, // daily|longterm
  sectionId, entryDate, title, snippet,
  tags, visibility, ownerType, ownerId,
  updatedAt, fingerprint, redactedPaths
}

openclawSyncRuns: {
  runId, startedAt, finishedAt,
  cursorFrom, cursorTo,
  created, updated, skipped, errors,
  errorSamples
}
```

---

## 7) Starter Scripts (included)

- `scripts/openclaw-sync/pull-openclaw.ts`
- `scripts/openclaw-sync/push-convex.ts`
- `scripts/openclaw-sync/run-sync.sh`

These scripts are intentionally minimal starters:
- fetch or file-read source payloads
- normalize/redact
- post to Convex ingestion endpoint
- write a JSON run report

Set env vars:
- `OPENCLAW_SOURCE_JSON` (file path for starter mode)
- `CONVEX_INGEST_URL`
- `CONVEX_INGEST_TOKEN` (if required)

---

## 8) Operational Runbook

## Run manually
```bash
cd mission-control
bash scripts/openclaw-sync/run-sync.sh
```

## Verify
- Check script output counts
- Inspect latest `openclawSyncRuns`
- Confirm no raw secrets stored

## If sync fails
1. Inspect `tmp/sync-report.json`
2. Retry with same cursor window
3. Validate Convex endpoint auth and schema compatibility
4. Re-run with debug logging (non-secret-safe logs only)

---

## 9) Security Checklist

- [ ] Redaction occurs **before** persistence
- [ ] Role/visibility checks enforced on all read queries
- [ ] Upsert keyed on deterministic source key
- [ ] Cursor only advances on successful commit
- [ ] Sync reports never include sensitive payload content
- [ ] Memory data scoped by ownership defaults

---

## 10) Next Enhancements

- Add signature validation for OpenClaw webhooks
- Add dead-letter queue for malformed records
- Add schema versioning per source payload
- Add PII classifier for memory snippets
- Add dashboard widget for sync health SLOs
