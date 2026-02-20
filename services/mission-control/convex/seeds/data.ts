export const seedData = {
  tasks: [
    {
      title: "Finalize Mission Control IA",
      description: "Lock route map + core table ownership",
      status: "in_progress",
      assignee: "human",
      createdBy: "system",
    },
    {
      title: "Wire Convex auth provider",
      description: "Add authentication and protected shell",
      status: "todo",
      assignee: "claw",
      createdBy: "system",
    },
  ],
  pipelineItems: [
    {
      title: "Mission Control launch post",
      stage: "idea",
      summary: "Announce workspace and module strategy",
      script: "",
      imageUrls: [],
      ownerHint: "mixed",
    },
  ],
  calendarEntries: [
    {
      title: "Weekly planning",
      startsAt: Date.now() + 1000 * 60 * 60 * 24,
      endsAt: undefined,
      scheduleType: "once",
      cronExpression: undefined,
      status: "scheduled",
      syncStatus: "pending",
      notes: "Review top 3 priorities",
      syncSource: "manual",
      externalId: undefined,
      lastSyncedAt: undefined,
    },
  ],
  memories: [
    {
      title: "Why this app exists",
      body: "Single pane for tasks, content operations, and team alignment.",
      tags: ["strategy", "product"],
      searchableText: "why this app exists single pane for tasks content operations and team alignment strategy product",
    },
  ],
  conversations: [
    {
      title: "Ops Standup",
      participants: ["Tyler", "OpenClaw"],
      channel: "telegram",
      summary: "Daily coordination and blockers",
      lastMessageAt: Date.now(),
      searchableText: "ops standup tyler openclaw daily coordination blockers",
    },
  ],
  teamMembers: [
    {
      name: "Tyler",
      role: "Operator",
      status: "active",
      timezone: "UTC",
    },
    {
      name: "OpenClaw",
      role: "AI Copilot",
      status: "active",
      timezone: "UTC",
    },
  ],
};
