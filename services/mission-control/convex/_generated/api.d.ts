/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as calendar from "../calendar.js";
import type * as contentPipeline from "../contentPipeline.js";
import type * as conversations from "../conversations.js";
import type * as memory from "../memory.js";
import type * as seed from "../seed.js";
import type * as seeds_data from "../seeds/data.js";
import type * as seeds_team from "../seeds/team.js";
import type * as tasks from "../tasks.js";
import type * as teamStructure from "../teamStructure.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  calendar: typeof calendar;
  contentPipeline: typeof contentPipeline;
  conversations: typeof conversations;
  memory: typeof memory;
  seed: typeof seed;
  "seeds/data": typeof seeds_data;
  "seeds/team": typeof seeds_team;
  tasks: typeof tasks;
  teamStructure: typeof teamStructure;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
