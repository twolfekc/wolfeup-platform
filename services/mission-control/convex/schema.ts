import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done")
    ),
    assignee: v.union(v.literal("human"), v.literal("claw"), v.literal("unassigned")),
    createdBy: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_assignee", ["assignee"]),

  taskActivity: defineTable({
    taskId: v.id("tasks"),
    actor: v.string(),
    action: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_task", ["taskId", "createdAt"]),

  pipelineItems: defineTable({
    title: v.string(),
    stage: v.union(
      v.literal("idea"),
      v.literal("research"),
      v.literal("script"),
      v.literal("review"),
      v.literal("published")
    ),
    summary: v.optional(v.string()),
    script: v.optional(v.string()),
    imageUrls: v.array(v.string()),
    ownerHint: v.union(v.literal("human"), v.literal("claw"), v.literal("mixed")),
    updatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_stage", ["stage"]),

  calendarEntries: defineTable({
    title: v.string(),
    notes: v.optional(v.string()),
    scheduleType: v.union(v.literal("once"), v.literal("cron")),
    cronExpression: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    status: v.union(
      v.literal("scheduled"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("paused")
    ),
    syncStatus: v.union(v.literal("in_sync"), v.literal("pending"), v.literal("error")),
    syncSource: v.optional(v.string()),
    externalId: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_startsAt", ["startsAt"])
    .index("by_status", ["status"]),

  memories: defineTable({
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
    searchableText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .searchIndex("search_memories", {
      searchField: "searchableText",
      filterFields: ["createdAt", "updatedAt"],
    }),

  conversations: defineTable({
    title: v.string(),
    participants: v.array(v.string()),
    channel: v.string(),
    summary: v.optional(v.string()),
    lastMessageAt: v.number(),
    searchableText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_lastMessageAt", ["lastMessageAt"])
    .searchIndex("search_conversations", {
      searchField: "searchableText",
      filterFields: ["lastMessageAt"],
    }),

  teamMembers: defineTable({
    name: v.string(),
    role: v.string(),
    status: v.union(v.literal("active"), v.literal("invite_pending"), v.literal("inactive")),
    timezone: v.optional(v.string()),
  }).index("by_status", ["status"]),

  roles: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_sort_order", ["sortOrder"]),

  agents: defineTable({
    key: v.string(),
    name: v.string(),
    type: v.union(v.literal("primary"), v.literal("subagent")),
    roleKey: v.string(),
    memoryScope: v.string(),
    spawnControls: v.object({
      canSpawn: v.boolean(),
      maxParallelChildren: v.number(),
      defaultRuntime: v.string(),
      escalationRoute: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_role_key", ["roleKey"])
    .index("by_type", ["type"]),

  agentResponsibilities: defineTable({
    agentKey: v.string(),
    responsibility: v.string(),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentKey"])
    .index("by_agent_order", ["agentKey", "order"]),

  agentStatusHistory: defineTable({
    agentKey: v.string(),
    status: v.union(v.literal("active"), v.literal("idle"), v.literal("spawning"), v.literal("offline")),
    note: v.optional(v.string()),
    changedAt: v.number(),
  })
    .index("by_agent", ["agentKey"])
    .index("by_agent_time", ["agentKey", "changedAt"]),

  assignments: defineTable({
    agentKey: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    assignmentType: v.union(v.literal("recent_task"), v.literal("active_work"), v.literal("backlog")),
    status: v.union(v.literal("queued"), v.literal("in_progress"), v.literal("done"), v.literal("blocked")),
    assignedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentKey"])
    .index("by_agent_status", ["agentKey", "status"]),
});
