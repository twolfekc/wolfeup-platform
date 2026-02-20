# EXECUTION-STEPS.md

## Mission Control + OpenClaw Integration Playbook

This playbook converts article-level prompts into concrete build tasks, implementation order, and agent prompts.

---

## 0) Outcomes

By the end of this sequence, Mission Control should have:
- OpenClaw ingestion for tasks, cron jobs, and memory files
- Convex collections + safe sync pipeline
- Office screen with avatar-at-desk live status
- Role presets and memory ownership model
- A repeatable prompt-to-build execution loop for future articles/features

---

## 1) Prompt-to-Build Mapping Framework

Use this structure for every article prompt.

### Mapping Template

For each article prompt:
1. **Intent**: what the feature should do for users
2. **Data**: what entities are needed
3. **Sync**: how data enters Convex
4. **UX**: user flows + edge cases
5. **Instrumentation**: success metrics and logging
6. **Prompt Pack**: targeted prompts for builder agents
7. **Done Criteria**: concrete acceptance checks

### Article Prompt Map (starter)

> Replace `AP-XX` with your real article prompt IDs/titles.

| Prompt ID | Build Target | Primary Files | Agent Prompt | Done Criteria |
|---|---|---|---|---|
| AP-01 | OpenClaw sync foundation | `convex/schema.ts`, `convex/openclaw/*.ts`, `scripts/openclaw-sync/*` | “Create Convex tables + ingestion mutation for OpenClaw tasks/cron/memory with idempotency and redaction hooks.” | Sync works end-to-end from sample payload |
| AP-02 | Task timeline + status UI | `src/app/tasks/*` | “Build task list grouped by source/status with live updates from Convex query subscriptions.” | Tasks render and update within realtime budget |
| AP-03 | Cron observability | `src/app/cron/*` | “Implement cron run history, next-run prediction, failure badge state.” | Failed jobs visible with last error snippet |
| AP-04 | Memory browser | `src/app/memory/*` | “Build memory file explorer with tag filters and sensitivity labels.” | Daily + long-term memory navigable |
| AP-05 | Office screen | `src/app/office/*` | “Implement avatar-at-desk state machine, transitions, and productivity summary cards.” | Presence transitions are stable and intuitive |
| AP-06 | Role framework | `src/app/settings/roles/*`, docs | “Add role presets + ownership boundaries + override controls.” | Roles can be assigned and audited |

---

## 2) Step-by-Step Implementation Sequence

## Step 1 — Establish Data Contracts

### Build
- Define a shared OpenClaw payload contract in `src/lib/openclaw/types.ts`:
  - `OpenClawTask`
  - `OpenClawCronJob`
  - `OpenClawMemoryEntry`
  - `SyncEnvelope` (source + cursor + pulledAt + records)
- Add normalization helpers:
  - source IDs
  - status mapping
  - time parsing and UTC coercion

### Agent Prompt
> “Generate strict TypeScript interfaces for OpenClaw task/cron/memory payloads and normalization functions with exhaustive status mapping and runtime validation stubs.”

### Done Criteria
- Type-check passes
- Unknown status values are safely mapped to `"unknown"`
- Timestamp parsing errors are captured, not thrown

---

## Step 2 — Convex Schema + Idempotent Ingestion

### Build
- Add collections:
  - `openclawTasks`
  - `openclawCronJobs`
  - `openclawMemoryEntries`
  - `openclawSyncRuns`
- Add unique source keys:
  - `sourceType + sourceId`
- Upsert on ingestion to avoid duplicates
- Store hash fingerprint to detect content changes

### Agent Prompt
> “Create Convex schema and mutations for idempotent upsert of task/cron/memory records. Include sync run log table and per-run counts (created/updated/skipped/errors).”

### Done Criteria
- Re-running same payload does not create duplicates
- Changed record content increments update count
- Sync run is logged with deterministic run ID

---

## Step 3 — Safe Sync Layer (Redaction + Ownership)

### Build
- Add pre-ingest safety pipeline:
  1. classify source (`task`, `cron`, `memory`)
  2. detect sensitive fields (`token`, `secret`, `auth`, `key`, `cookie`)
  3. redact payload fragments prior to persistence
  4. keep cryptographic hash for audit integrity
- Attach `visibility` field (`private`, `team`, `public`)
- Enforce least privilege for query endpoints

### Agent Prompt
> “Implement a redaction middleware that strips likely secrets before Convex writes, preserving field paths and hashes for audit. Add visibility-aware query guards.”

### Done Criteria
- Known secret patterns are never stored raw
- Redaction audit metadata exists
- Unauthorized role queries are denied

---

## Step 4 — Starter Sync Scripts

### Build
- Add scripts (created in this run):
  - `scripts/openclaw-sync/pull-openclaw.ts`
  - `scripts/openclaw-sync/push-convex.ts`
  - `scripts/openclaw-sync/run-sync.sh`
- Script behavior:
  - pull from OpenClaw endpoint/files
  - normalize + redact
  - post to Convex action/mutation endpoint
  - emit run summary JSON

### Agent Prompt
> “Create Node scripts to fetch OpenClaw data, normalize/redact payloads, and push to Convex with retries, exponential backoff, and a JSON run report.”

### Done Criteria
- `run-sync.sh` executes with env vars only
- failed requests retry with cap
- summary report saved to `tmp/sync-report.json`

---

## Step 5 — UI Surfaces (Tasks, Cron, Memory)

### Build
- Tasks page: status lanes + owner + freshness badge
- Cron page: next run, health, failure streak
- Memory page: timeline, tags, ownership, sensitivity markers
- Global sync banner with last run status

### Agent Prompt
> “Build three views (tasks/cron/memory) consuming Convex live queries. Add stale-data indicators and last-sync timestamp banner with warning state.”

### Done Criteria
- Live query refresh visible without page reload
- stale threshold warning appears > configured minutes
- each page handles empty/error/loading states

---

## Step 6 — Office Screen (Realtime Presence)

### Build
- Implement status state machine from `OFFICE-SCREEN-SPEC.md`
- Add avatar seats (one per agent/user)
- Realtime status transitions (working/blocked/idle/offline)
- Efficiency cards and intervention prompts

### Agent Prompt
> “Implement office view with avatar-at-desk presence model, deterministic status transitions, and efficiency metrics computed from task + activity signals.”

### Done Criteria
- status transitions follow guard rules
- presence updates in near realtime
- efficiency metrics are explainable from source signals

---

## Step 7 — Role Framework + Ownership Controls

### Build
- Implement role presets from `TEAM-ROLE-FRAMEWORK.md`
- Assign memory ownership boundaries:
  - personal memory vs team memory vs system logs
- Add override + audit trail

### Agent Prompt
> “Add role preset assignment and enforcement for read/write scopes across tasks, cron, memory, and office controls; include audited overrides.”

### Done Criteria
- role assignment immediately affects API access
- unauthorized writes blocked with explicit reason
- override events logged with actor + justification

---

## Step 8 — Test + Hardening

### Build
- Unit tests:
  - normalization
  - redaction
  - status mapping
- Integration tests:
  - full sync run
  - duplicate prevention
  - role enforcement
- Add operational docs + runbook

### Agent Prompt
> “Write tests for sync safety, idempotent upsert behavior, and role-based access. Include fixtures for malformed data and secret-containing payloads.”

### Done Criteria
- happy path + failure path coverage
- no secret leakage in fixtures or snapshots
- deterministic sync behavior under retries

---

## 3) Recommended Build Order (Fastest Value)

1. Schema + ingestion (Step 2)
2. Safe sync (Step 3)
3. Starter scripts (Step 4)
4. Task/Cron/Memory UI (Step 5)
5. Office screen (Step 6)
6. Roles framework (Step 7)
7. Hardening (Step 8)

---

## 4) Acceptance Checklist

- [ ] OpenClaw tasks sync into Convex idempotently
- [ ] OpenClaw cron jobs sync with run history
- [ ] OpenClaw memory files sync with ownership + visibility
- [ ] Sensitive values redacted before persistence
- [ ] Office screen reflects live status transitions
- [ ] Team role presets enforce access boundaries
- [ ] Sync run logs support audit + debugging
- [ ] Docs and scripts are runnable by another engineer without tribal context

---

## 5) Prompt Pack (Copy/Paste)

### Builder Agent Prompt
“Implement the next unchecked item in EXECUTION-STEPS.md. Keep changes minimal and production-safe. Add tests where possible. Summarize files changed and how to verify.”

### Reviewer Agent Prompt
“Review current implementation against EXECUTION-STEPS.md and OPENCLAW-SYNC.md. Report security, idempotency, and RBAC gaps. Provide concrete patch suggestions.”

### QA Agent Prompt
“Generate test cases for sync ingestion (happy, malformed, duplicate, secret-containing payloads) and validate office status transitions under rapid event changes.”
