# TEAM-ROLE-FRAMEWORK.md

## Mission Control Team Roles, Responsibilities, and Memory Ownership

This document defines role presets for execution teams and how ownership works across tasks, documents, and memory.

---

## 1) Design Goals

- Clear handoffs with minimal ambiguity
- Fast assignment using preset role bundles
- Explicit memory ownership to avoid leaks and confusion
- Auditable override process for exceptional access

---

## 2) Core Role Presets

## 2.1 Developer

**Mission:** Build and ship working product increments safely.

**Primary responsibilities**
- Implement features
- Write tests and migrations
- Resolve defects and tech debt
- Maintain integration reliability

**Default permissions**
- Read/write: code, task implementation notes
- Read: product specs, approved research
- Limited read: memory summaries relevant to assigned tasks

**Not default**
- Editing long-term narrative memory for non-technical domains
- Publishing external communication

---

## 2.2 Writer

**Mission:** Convert product and system context into clear user/team documentation.

**Primary responsibilities**
- Specs, guides, release notes
- User-facing copy
- Prompt packs and playbooks

**Default permissions**
- Read: task context, approved research, public/team memory
- Write: docs, copy, playbooks
- Suggest-only: technical implementation edits

**Not default**
- Direct schema/migration changes
- Security policy overrides

---

## 2.3 Designer

**Mission:** Define interaction, information architecture, and visual system.

**Primary responsibilities**
- User journeys and flows
- Wireframes and interaction specs
- UI consistency and accessibility criteria

**Default permissions**
- Read: product/task context, usage analytics, relevant memory snippets
- Write: design specs, component behavior docs
- Comment/suggest: implementation tickets

**Not default**
- Production DB changes
- Operational incident actions

---

## 2.4 Research

**Mission:** Produce decision-grade evidence and source-grounded recommendations.

**Primary responsibilities**
- Market/competitor scans
- Technical option analysis
- Risk/assumption validation

**Default permissions**
- Read: broad project context
- Write: findings, recommendations, evidence links
- Tag confidence levels and unknowns

**Not default**
- Direct production writes
- Policy changes without Ops approval

---

## 2.5 Ops

**Mission:** Keep systems healthy, secure, and observable.

**Primary responsibilities**
- Deploys, monitoring, incident response
- Access control and audit trails
- Sync/cron reliability and backups

**Default permissions**
- Read/write: infrastructure runbooks, cron jobs, operational configs
- Read: all operationally required data
- Elevated actions with audit logging

**Not default**
- Editing product narrative docs unless assigned

---

## 3) RACI-Like Responsibility Matrix

| Domain | Developer | Writer | Designer | Research | Ops |
|---|---|---|---|---|---|
| Feature implementation | **R** | C | C | C | C |
| API/schema changes | **R** | I | I | C | A |
| Product docs | C | **R/A** | C | C | I |
| Interaction specs | C | C | **R/A** | C | I |
| Discovery/analysis | C | C | C | **R/A** | I |
| Deploy + incident response | I | I | I | I | **R/A** |
| Sync safety/redaction policy | C | I | I | C | **R/A** |
| Memory governance | C | C | C | C | **A** |

Legend: **R** Responsible, **A** Accountable, C Consulted, I Informed

---

## 4) Memory Ownership Model

## 4.1 Memory Tiers

1. **Personal Memory**
   - Scope: individual notes/preferences
   - Visibility: private
   - Owner: specific user/agent role

2. **Team Memory**
   - Scope: project decisions, conventions, operating knowledge
   - Visibility: team
   - Owner: role group (e.g., Ops, Product)

3. **System Memory / Audit**
   - Scope: sync runs, access changes, overrides, incidents
   - Visibility: restricted
   - Owner: Ops/system

## 4.2 Ownership fields (required)
- `memoryTier`
- `ownerType`
- `ownerId`
- `visibility`
- `retentionPolicy`
- `lastReviewedAt`

## 4.3 Write authority
- Personal memory: owner + explicit delegates
- Team memory: role members with write scope
- System/audit memory: system and Ops only

## 4.4 Override process
Any elevated read/write must include:
- requester
- reason
- duration
- approvedBy
- auto-expiry timestamp

All overrides are immutable-log events.

---

## 5) Role Assignment Presets (Implementation)

## Preset A — Product Build Pod
- Developer (2)
- Designer (1)
- Writer (1)
- Research (1, part-time)
- Ops (shared)

## Preset B — Content + Documentation Sprint
- Writer (2)
- Research (1)
- Designer (1)
- Developer (1, support)
- Ops (on-call)

## Preset C — Reliability/Hardening Sprint
- Ops (2)
- Developer (2)
- Research (1)
- Writer (1 for runbooks)
- Designer (optional)

---

## 6) Convex Enforcement Recommendations

- Include role claims in auth context
- Gate mutations by role + ownership fields
- Enforce memory tier restrictions in query functions
- Add policy tests for each preset role

Example checks:
- Developer cannot write system audit memory
- Writer cannot run operational privileged actions
- Ops can perform emergency override with reason + expiry

---

## 7) KPIs by Role

- **Developer:** cycle time, defect escape rate, test coverage trend
- **Writer:** doc freshness, task-to-doc completeness, readability feedback
- **Designer:** usability issue density, flow completion rate, accessibility score
- **Research:** recommendation accuracy, decision lead-time impact
- **Ops:** MTTR, deployment success rate, sync/cron SLO adherence

---

## 8) Practical Rollout Steps

1. Add role presets in app config
2. Attach permissions matrix to backend guards
3. Add ownership metadata to memory/task records
4. Enable audited override flow
5. Run policy tests and dry-run with seeded users
6. Review first week of logs and tighten scopes
