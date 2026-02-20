export type TeamRole = "developers" | "writers" | "designers" | "operators_research";

export type AgentStatus = "active" | "idle" | "spawning" | "offline";

export type TeamAgent = {
  key: string;
  name: string;
  type: "primary" | "subagent";
  role: TeamRole;
  responsibilities: string[];
  currentStatus: AgentStatus;
  recentTasks: string[];
  memoryScope: string;
  spawnControls: {
    canSpawn: boolean;
    maxParallelChildren: number;
    defaultRuntime: string;
    escalationRoute: string;
  };
};

export const roleLabels: Record<TeamRole, string> = {
  developers: "Developers",
  writers: "Writers",
  designers: "Designers",
  operators_research: "Operators & Research",
};

export const defaultTeamAgents: TeamAgent[] = [
  {
    key: "primary-assistant",
    name: "Mission Control Assistant",
    type: "primary",
    role: "operators_research",
    responsibilities: [
      "Coordinate all subagents and task routing",
      "Summarize progress for stakeholders",
      "Enforce safety and escalation policies",
    ],
    currentStatus: "active",
    recentTasks: [
      "Prioritized incident queue for production deploy",
      "Merged sprint updates into operations brief",
      "Assigned research spikes across specialist agents",
    ],
    memoryScope: "Global workspace memory + current sprint context",
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
    role: "developers",
    responsibilities: [
      "Build React/Next.js screens",
      "Maintain component contracts",
      "Ship responsive UI fixes",
    ],
    currentStatus: "active",
    recentTasks: [
      "Implemented Team Structure dashboard cards",
      "Refined table-to-card responsive layout",
    ],
    memoryScope: "Frontend architecture notes + active branch diff",
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
    role: "developers",
    responsibilities: [
      "Define Convex schemas and indexes",
      "Implement mutations/queries",
      "Track assignment and status models",
    ],
    currentStatus: "idle",
    recentTasks: [
      "Drafted team-structure schema evolution",
      "Reviewed index strategy for role filtering",
    ],
    memoryScope: "Database schema history + API model decisions",
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
    role: "writers",
    responsibilities: [
      "Draft release notes and changelog entries",
      "Write in-product helper copy",
      "Convert technical details into user language",
    ],
    currentStatus: "spawning",
    recentTasks: [
      "Prepared launch summary for team visibility tools",
      "Updated onboarding microcopy for agent controls",
    ],
    memoryScope: "Brand voice guide + release timeline",
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
    role: "designers",
    responsibilities: [
      "Shape dashboard information hierarchy",
      "Define card/state visual tokens",
      "Validate usability across team workflows",
    ],
    currentStatus: "active",
    recentTasks: [
      "Created role-grouping visual treatment",
      "Proposed status badge semantics",
    ],
    memoryScope: "Design system tokens + UX review backlog",
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
    role: "operators_research",
    responsibilities: [
      "Monitor runtime health and queue pressure",
      "Run comparative tool research",
      "Flag risks and dependency blockers",
    ],
    currentStatus: "idle",
    recentTasks: [
      "Benchmarked role-based assignment throughput",
      "Logged overnight queue trends and anomalies",
    ],
    memoryScope: "Operational metrics + recent experiment notes",
    spawnControls: {
      canSpawn: true,
      maxParallelChildren: 3,
      defaultRuntime: "codex/gpt-5.3-codex",
      escalationRoute: "Escalates production-risk findings immediately",
    },
  },
];

export const seededTeamAgents = (agents?: TeamAgent[]) => {
  if (!agents || agents.length === 0) {
    return defaultTeamAgents;
  }

  return agents;
};
