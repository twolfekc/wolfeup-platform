import { query, mutation } from "./_generated/server";
import { defaultAgents, teamRoles } from "./seeds/team";

export const ensureSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const existingRoles = await ctx.db.query("roles").collect();
    if (existingRoles.length === 0) {
      for (const role of teamRoles) {
        await ctx.db.insert("roles", { ...role, createdAt: now, updatedAt: now });
      }
    }

    const existingAgents = await ctx.db.query("agents").collect();
    if (existingAgents.length === 0) {
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

export const listTeamStructure = query({
  args: {},
  handler: async (ctx) => {
    const [roles, agents, responsibilities, statuses, assignments] = await Promise.all([
      ctx.db.query("roles").withIndex("by_sort_order").collect(),
      ctx.db.query("agents").collect(),
      ctx.db.query("agentResponsibilities").collect(),
      ctx.db.query("agentStatusHistory").collect(),
      ctx.db.query("assignments").collect(),
    ]);

    return roles.map((role) => {
      const roleAgents = agents.filter((agent) => agent.roleKey === role.key);

      return {
        role,
        agents: roleAgents.map((agent) => {
          const latestStatus = statuses
            .filter((status) => status.agentKey === agent.key)
            .sort((a, b) => b.changedAt - a.changedAt)[0];

          const recentTasks = assignments
            .filter((assignment) => assignment.agentKey === agent.key)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 3);

          return {
            ...agent,
            responsibilities: responsibilities
              .filter((item) => item.agentKey === agent.key)
              .sort((a, b) => a.order - b.order),
            currentStatus: latestStatus ?? null,
            recentTasks,
          };
        }),
      };
    });
  },
});
