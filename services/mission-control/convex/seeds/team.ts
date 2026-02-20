export const teamRoles = [
  { key: "developers", label: "Developers", description: "Engineering specialists", sortOrder: 10 },
  { key: "writers", label: "Writers", description: "Narrative and documentation", sortOrder: 20 },
  { key: "designers", label: "Designers", description: "Experience and interface design", sortOrder: 30 },
  {
    key: "operators_research",
    label: "Operators & Research",
    description: "Operational command, analysis, and experimentation",
    sortOrder: 40,
  },
] as const;

export const defaultAgents = [
  {
    key: "primary-assistant",
    name: "Mission Control Assistant",
    type: "primary",
    roleKey: "operators_research",
    memoryScope: "Global workspace memory + current sprint context",
    status: "active",
    responsibilities: [
      "Coordinate all subagents and task routing",
      "Summarize progress for stakeholders",
      "Enforce safety and escalation policies",
    ],
    recentTasks: [
      "Prioritized incident queue for production deploy",
      "Merged sprint updates into operations brief",
      "Assigned research spikes across specialist agents",
    ],
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 8,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates blockers to human operator",
    },
  },
  {
    key: "frontend-dev-01",
    name: "UI Systems Engineer",
    type: "subagent",
    roleKey: "developers",
    memoryScope: "Frontend architecture notes + active branch diff",
    status: "active",
    responsibilities: [
      "Build React/Next.js screens",
      "Maintain component contracts",
      "Ship responsive UI fixes",
    ],
    recentTasks: [
      "Implemented Team Structure dashboard cards",
      "Refined table-to-card responsive layout",
    ],
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 2,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates API shape mismatches to Backend Engineer",
    },
  },
  {
    key: "backend-dev-01",
    name: "Convex Backend Engineer",
    type: "subagent",
    roleKey: "developers",
    memoryScope: "Database schema history + API model decisions",
    status: "idle",
    responsibilities: [
      "Define Convex schemas and indexes",
      "Implement mutations/queries",
      "Track assignment and status models",
    ],
    recentTasks: [
      "Drafted team-structure schema evolution",
      "Reviewed index strategy for role filtering",
    ],
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 1,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates migration risks to primary assistant",
    },
  },
  {
    key: "content-writer-01",
    name: "Product Narrative Writer",
    type: "subagent",
    roleKey: "writers",
    memoryScope: "Brand voice guide + release timeline",
    status: "spawning",
    responsibilities: [
      "Draft release notes and changelog entries",
      "Write in-product helper copy",
      "Convert technical details into user language",
    ],
    recentTasks: [
      "Prepared launch summary for team visibility tools",
      "Updated onboarding microcopy for agent controls",
    ],
    spawnControls: {
      canSpawn: false,
      maxParallelChildren: 0,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Requests spawn through primary assistant",
    },
  },
  {
    key: "designer-01",
    name: "Interaction Designer",
    type: "subagent",
    roleKey: "designers",
    memoryScope: "Design system tokens + UX review backlog",
    status: "active",
    responsibilities: [
      "Shape dashboard information hierarchy",
      "Define card/state visual tokens",
      "Validate usability across team workflows",
    ],
    recentTasks: [
      "Created role-grouping visual treatment",
      "Proposed status badge semantics",
    ],
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 1,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates accessibility regressions to UI Systems Engineer",
    },
  },
  {
    key: "operator-research-01",
    name: "Ops & Research Analyst",
    type: "subagent",
    roleKey: "operators_research",
    memoryScope: "Operational metrics + recent experiment notes",
    status: "idle",
    responsibilities: [
      "Monitor runtime health and queue pressure",
      "Run comparative tool research",
      "Flag risks and dependency blockers",
    ],
    recentTasks: [
      "Benchmarked role-based assignment throughput",
      "Logged overnight queue trends and anomalies",
    ],
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 3,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates production-risk findings immediately",
    },
  },
] as const;
