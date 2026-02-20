import { mutation } from "./_generated/server";
import { defaultAgents, teamRoles } from "./seeds/team";
import { seedData } from "./seeds/data";

/**
 * Idempotent development seeding.
 */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    if ((await ctx.db.query("tasks").take(1)).length === 0) {
      for (const task of seedData.tasks) {
        await ctx.db.insert("tasks", { ...task, createdAt: now, updatedAt: now } as any);
      }
    }

    if ((await ctx.db.query("pipelineItems").take(1)).length === 0) {
      for (const item of seedData.pipelineItems) {
        await ctx.db.insert("pipelineItems", { ...item, createdAt: now, updatedAt: now } as any);
      }
    }

    if ((await ctx.db.query("calendarEntries").take(1)).length === 0) {
      for (const entry of seedData.calendarEntries) {
        await ctx.db.insert("calendarEntries", { ...entry, createdAt: now, updatedAt: now } as any);
      }
    }

    if ((await ctx.db.query("memories").take(1)).length === 0) {
      for (const note of seedData.memories) {
        await ctx.db.insert("memories", {
          ...note,
          sourceConversationId: undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if ((await ctx.db.query("conversations").take(1)).length === 0) {
      for (const convo of seedData.conversations) {
        await ctx.db.insert("conversations", {
          ...convo,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if ((await ctx.db.query("teamMembers").take(1)).length === 0) {
      for (const member of seedData.teamMembers) {
        await ctx.db.insert("teamMembers", member as any);
      }
    }

    if ((await ctx.db.query("roles").take(1)).length === 0) {
      for (const role of teamRoles) {
        await ctx.db.insert("roles", { ...role, createdAt: now, updatedAt: now });
      }
    }

    if ((await ctx.db.query("agents").take(1)).length === 0) {
      for (const agent of defaultAgents) {
        await ctx.db.insert("agents", {
          key: agent.key,
          name: agent.name,
          type: agent.type,
          roleKey: agent.roleKey,
          memoryScope: agent.memoryScope,
          spawnControls: agent.spawnControls,
          createdAt: now,
          updatedAt: now,
        });

        for (const [index, responsibility] of agent.responsibilities.entries()) {
          await ctx.db.insert("agentResponsibilities", {
            agentKey: agent.key,
            responsibility,
            order: index,
            createdAt: now,
          });
        }

        await ctx.db.insert("agentStatusHistory", {
          agentKey: agent.key,
          status: agent.status,
          note: "Seeded default status",
          changedAt: now,
        });

        for (const task of agent.recentTasks) {
          await ctx.db.insert("assignments", {
            agentKey: agent.key,
            title: task,
            summary: "Seeded recent task",
            assignmentType: "recent_task",
            status: "done",
            assignedAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return { ok: true };
  },
});
