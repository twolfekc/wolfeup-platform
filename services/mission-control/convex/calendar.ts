import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listTimeline = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("running"),
        v.literal("success"),
        v.literal("failed"),
        v.literal("paused")
      )
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const from = args.from ?? Date.now() - 1000 * 60 * 60 * 24 * 7;
    const to = args.to ?? Date.now() + 1000 * 60 * 60 * 24 * 30;

    let q = ctx.db
      .query("calendarEntries")
      .withIndex("by_startsAt", (qi) => qi.gte("startsAt", from).lte("startsAt", to));

    if (args.status) {
      q = q.filter((f) => f.eq(f.field("status"), args.status));
    }

    return q.order("asc").paginate(args.paginationOpts);
  },
});

export const createEntry = mutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    scheduleType: v.union(v.literal("once"), v.literal("cron")),
    cronExpression: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("running"),
        v.literal("success"),
        v.literal("failed"),
        v.literal("paused")
      )
    ),
    syncStatus: v.optional(
      v.union(v.literal("in_sync"), v.literal("pending"), v.literal("error"))
    ),
    syncSource: v.optional(v.string()),
    externalId: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("calendarEntries", {
      ...args,
      status: args.status ?? "scheduled",
      syncStatus: args.syncStatus ?? "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEntry = mutation({
  args: {
    id: v.id("calendarEntries"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    scheduleType: v.optional(v.union(v.literal("once"), v.literal("cron"))),
    cronExpression: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("running"),
        v.literal("success"),
        v.literal("failed"),
        v.literal("paused")
      )
    ),
    syncStatus: v.optional(
      v.union(v.literal("in_sync"), v.literal("pending"), v.literal("error"))
    ),
    syncSource: v.optional(v.string()),
    externalId: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});
