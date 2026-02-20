# Mission Control

Mission Control is a Next.js + Convex app with two core surfaces:

- **Tasks Board**
  - task statuses (`backlog`, `todo`, `in_progress`, `blocked`, `done`)
  - assignment (`human`, `claw`, `unassigned`)
  - realtime task list updates via Convex queries
  - activity log (create/status/assignment events)

- **Content Pipeline**
  - kanban stages (`idea`, `research`, `script`, `review`, `published`)
  - script field for rich text/markdown content
  - image attachments (URL-based)
  - stage transition mutation
  - automated ownership hints by stage (`claw`, `mixed`, `human`)

## Setup

```bash
npm install
npx convex dev
npm run dev
```

Create `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=<your convex deployment url>
```

## Convex files

- `convex/schema.ts`
- `convex/tasks.ts`
- `convex/contentPipeline.ts`
