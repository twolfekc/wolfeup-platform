import { v } from "convex/values";
import { mutation } from "./_generated/server";

function buildSearchableText(title: string, participants: string[], summary?: string) {
  return `${title}\n${participants.join(" ")}\n${summary ?? ""}`.toLowerCase();
}

export const upsertConversationMetadata = mutation({
  args: {
    id: v.optional(v.id("conversations")),
    title: v.string(),
    participants: v.array(v.string()),
    channel: v.string(),
    summary: v.optional(v.string()),
    lastMessageAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.id) {
      await ctx.db.patch(args.id, {
        ...args,
        searchableText: buildSearchableText(args.title, args.participants, args.summary),
        updatedAt: now,
      });
      return args.id;
    }

    return ctx.db.insert("conversations", {
      ...args,
      searchableText: buildSearchableText(args.title, args.participants, args.summary),
      createdAt: now,
      updatedAt: now,
    });
  },
});
