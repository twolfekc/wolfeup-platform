import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function buildSearchableText(title: string, body: string, tags: string[]) {
  return `${title}\n${body}\n${tags.join(" ")}`.toLowerCase();
}

export const listMemories = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("memories")
      .withIndex("by_updatedAt")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getMemory = query({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const createMemory = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("memories", {
      ...args,
      searchableText: buildSearchableText(args.title, args.body, args.tags),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMemory = mutation({
  args: {
    id: v.id("memories"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Memory not found");

    const nextTitle = args.title ?? current.title;
    const nextBody = args.body ?? current.body;
    const nextTags = args.tags ?? current.tags;

    await ctx.db.patch(args.id, {
      ...args,
      searchableText: buildSearchableText(nextTitle, nextBody, nextTags),
      updatedAt: Date.now(),
    });
  },
});

export const searchMemories = query({
  args: {
    q: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!args.q.trim()) {
      return ctx.db
        .query("memories")
        .withIndex("by_updatedAt")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return ctx.db
      .query("memories")
      .withSearchIndex("search_memories", (qi) => qi.search("searchableText", args.q))
      .paginate(args.paginationOpts);
  },
});

export const searchConversationsMetadata = query({
  args: {
    q: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!args.q.trim()) {
      return ctx.db
        .query("conversations")
        .withIndex("by_lastMessageAt")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return ctx.db
      .query("conversations")
      .withSearchIndex("search_conversations", (qi) =>
        qi.search("searchableText", args.q)
      )
      .paginate(args.paginationOpts);
  },
});
