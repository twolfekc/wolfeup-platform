import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const stages = ["idea", "research", "script", "review", "published"] as const;

type Stage = (typeof stages)[number];

function ownerHintForStage(stage: Stage) {
  if (stage === "idea" || stage === "research") return "claw" as const;
  if (stage === "script") return "mixed" as const;
  return "human" as const;
}

export const listPipelineItems = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("pipelineItems").collect();
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const createPipelineItem = mutation({
  args: {
    title: v.string(),
    summary: v.optional(v.string()),
    script: v.optional(v.string()),
    imageUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pipelineItems", {
      title: args.title,
      summary: args.summary,
      script: args.script,
      imageUrls: args.imageUrls,
      stage: "idea",
      ownerHint: ownerHintForStage("idea"),
      updatedAt: now,
      createdAt: now,
    });
  },
});

export const movePipelineStage = mutation({
  args: {
    itemId: v.id("pipelineItems"),
    stage: v.union(
      v.literal("idea"),
      v.literal("research"),
      v.literal("script"),
      v.literal("review"),
      v.literal("published")
    ),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Pipeline item not found");

    await ctx.db.patch(args.itemId, {
      stage: args.stage,
      ownerHint: ownerHintForStage(args.stage),
      updatedAt: Date.now(),
    });
  },
});

export const updateScript = mutation({
  args: {
    itemId: v.id("pipelineItems"),
    script: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Pipeline item not found");
    await ctx.db.patch(args.itemId, {
      script: args.script,
      updatedAt: Date.now(),
    });
  },
});

export const addImageAttachment = mutation({
  args: {
    itemId: v.id("pipelineItems"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Pipeline item not found");

    await ctx.db.patch(args.itemId, {
      imageUrls: [...item.imageUrls, args.imageUrl],
      updatedAt: Date.now(),
    });
  },
});

export const getStageOptions = query({
  args: {},
  handler: async () => stages,
});
