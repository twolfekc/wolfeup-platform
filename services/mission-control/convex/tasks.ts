import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const statuses = ["backlog", "todo", "in_progress", "blocked", "done"] as const;

type TaskStatus = (typeof statuses)[number];

export const listTasks = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: "backlog",
      assignee: "unassigned",
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("taskActivity", {
      taskId,
      actor: args.createdBy,
      action: "created",
      detail: "Task created",
      createdAt: now,
    });

    return taskId;
  },
});

export const setTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done")
    ),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (task.status === args.status) return;

    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("taskActivity", {
      taskId: args.taskId,
      actor: args.actor,
      action: "status_changed",
      detail: `${task.status} → ${args.status}`,
      createdAt: Date.now(),
    });
  },
});

export const assignTask = mutation({
  args: {
    taskId: v.id("tasks"),
    assignee: v.union(v.literal("human"), v.literal("claw"), v.literal("unassigned")),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.assignee === args.assignee) return;

    await ctx.db.patch(args.taskId, {
      assignee: args.assignee,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("taskActivity", {
      taskId: args.taskId,
      actor: args.actor,
      action: "reassigned",
      detail: `${task.assignee} → ${args.assignee}`,
      createdAt: Date.now(),
    });
  },
});

export const listActivity = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("taskActivity").collect();
    return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  },
});

export const getTaskStatusOptions = query({
  args: {},
  handler: async () => [...statuses] as TaskStatus[],
});
