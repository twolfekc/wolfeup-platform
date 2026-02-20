# OFFICE-SCREEN-SPEC.md

## Mission Control Office Screen — Product Spec + Implementation Guide

Defines the avatar-at-desk office experience, realtime status transitions, efficiency metrics, and key UI interactions.

---

## 1) Product Objective

Create a shared “office” view where each teammate/agent appears at a desk with live status, workload health, and actionable signals.

The office should answer in <5 seconds:
- Who is working right now?
- Who is blocked or overloaded?
- What needs intervention next?

---

## 2) Avatar-at-Desk Status Model

## 2.1 Canonical statuses

- `offline` — no heartbeat/activity beyond timeout
- `idle` — connected but no active work signal
- `working` — active tasks/events in progress
- `blocked` — explicit blocker or repeated failure state
- `reviewing` — evaluating PR/docs/outputs
- `handoff` — waiting for or preparing transfer
- `break` — intentional away status

## 2.2 Input signals

- Task transitions (`todo -> doing -> done`)
- Recent activity events (edits, comments, sync updates)
- Cron/automation health events
- Explicit user-set status overrides
- Last-seen heartbeat timestamp

## 2.3 Priority order (when signals conflict)

`blocked` > `handoff` > `reviewing` > `working` > `idle` > `offline`

Explicit user override wins for configured duration unless hard-failure blocker is triggered.

---

## 3) Realtime Status Transition Rules

## 3.1 State machine rules (baseline)

- `offline -> idle` when heartbeat reconnects
- `idle -> working` when active task begins or activity burst detected
- `working -> reviewing` when review-tagged task becomes active
- `working -> blocked` on blocker flag or consecutive failures threshold
- `blocked -> working` when blocker cleared and new progress signal appears
- `working|reviewing -> handoff` when owner changes or handoff flag set
- `any -> break` on explicit break status
- `break -> idle` when break timer expires or manual return
- `any -> offline` when heartbeat timeout exceeded

## 3.2 Suggested timing thresholds

- Heartbeat offline timeout: 5–10 minutes (configurable)
- Idle threshold: 3–5 minutes without activity
- Failure threshold for blocked: 2 consecutive failures in 15 minutes
- Override duration default: 30 minutes

## 3.3 Anti-flapping protections

- Minimum status hold time: 30–60 seconds
- Debounce rapid event bursts (2–5 seconds)
- Transition lock during in-flight writes

---

## 4) Data Model (Suggested)

```ts
OfficePresence {
  memberId: string
  deskId: string
  status: 'offline'|'idle'|'working'|'blocked'|'reviewing'|'handoff'|'break'
  statusReason?: string
  source: 'derived'|'manual'
  overrideUntil?: number
  lastHeartbeatAt?: number
  lastActivityAt?: number
  activeTaskIds: string[]
  blockerCount24h: number
  updatedAt: number
}

OfficeEvent {
  id: string
  memberId: string
  type: 'task'|'sync'|'cron'|'manual'|'system'
  subtype: string
  payloadSummary: string
  createdAt: number
}
```

---

## 5) Efficiency Metrics

## 5.1 Per-member metrics

- **Focus Ratio** = working_minutes / online_minutes
- **Blocker Rate** = blockers / active_day
- **Handoff Latency** = avg time from handoff->accepted
- **Recovery Time** = avg blocked->working duration
- **Task Throughput** = completed tasks / day

## 5.2 Team metrics

- Office Utilization (active desks / available desks)
- Blocked Desk Count (live)
- Flow Efficiency (% active time not blocked/handoff)
- SLA Risk Index (weighted by overdue + blocked critical work)

## 5.3 Metric guardrails

- Show confidence indicators (low/med/high)
- Avoid punitive framing; present as operational signals
- Use rolling windows (daily, 7-day) to reduce noise

---

## 6) UI Interaction Spec

## 6.1 Core interactions

- Click avatar -> open detail drawer
  - current status + reason
  - active tasks
  - recent transitions
  - quick actions (assign task, clear blocker, request handoff)

- Hover desk -> compact tooltip
  - name, role, status, last active

- Filter bar
  - by role, status, team pod, priority risk

- Office modes
  - `Live` (auto updates)
  - `Snapshot` (frozen for review)

## 6.2 Quick actions

- “Mark Blocker Resolved”
- “Request Review”
- “Initiate Handoff”
- “Set Break (15/30/60)”

All actions create audit events.

## 6.3 Visual language

- Status ring color on avatar
- Desk pulse only for critical blocked state
- Motion reduced mode for accessibility
- Keyboard navigation for all action surfaces

---

## 7) Backend Implementation Guide

## 7.1 Convex functions

- `presence.ingestEvent(memberId, event)`
- `presence.computeStatus(memberId)`
- `presence.setManualOverride(memberId, status, until)`
- `presence.clearOverride(memberId)`
- `presence.getOfficeSnapshot(filters)`
- `presence.subscribeOfficeStream()`

## 7.2 Processing strategy

1. Ingest event
2. Append to `OfficeEvent`
3. Recompute member state via deterministic rules
4. Persist `OfficePresence`
5. Fan out realtime update to subscribers

## 7.3 Reliability requirements

- Idempotent event ingest by eventId
- Ordering tolerance with event timestamps
- Retry-safe recomputation
- Backfill job for missed updates

---

## 8) Frontend Implementation Guide (Next.js)

### Suggested structure
- `src/app/office/page.tsx`
- `src/components/office/OfficeGrid.tsx`
- `src/components/office/DeskAvatar.tsx`
- `src/components/office/PresenceDrawer.tsx`
- `src/components/office/OfficeFilters.tsx`
- `src/components/office/EfficiencyCards.tsx`

### Rendering flow
1. Subscribe to office snapshot query
2. Render desks grouped by pod/role
3. Animate status changes (respect reduced motion)
4. Open drawer for details + actions
5. Send mutations for quick actions

---

## 9) Acceptance Criteria

- [ ] Presence updates propagate in near realtime
- [ ] Status transitions follow priority + anti-flap rules
- [ ] Manual overrides expire automatically
- [ ] Blocked desks are prominent but not noisy
- [ ] Efficiency metrics explain source and calculation window
- [ ] All interactions are keyboard accessible
- [ ] All quick actions are auditable

---

## 10) Agent Prompts for Implementation

### Builder prompt
“Implement the office screen from OFFICE-SCREEN-SPEC.md with a deterministic status state machine and realtime Convex subscription updates. Include anti-flapping and manual override expiry.”

### Data prompt
“Create Convex data model and functions for OfficePresence and OfficeEvent with idempotent ingest and computed status transitions.”

### QA prompt
“Produce transition test cases including rapid signal bursts, conflicting signals, heartbeat loss, and override expiry. Verify anti-flap behavior.”
