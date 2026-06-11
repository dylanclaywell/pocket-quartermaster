import { loadConfig } from "../../../utils/storage";
import { artPushPlan } from "../../../utils/launcherArtPush";

/** Reconcile which games installed on a destination still need art pushed
 *  (no cover on the device yet) vs. would duplicate one already there. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });

  const cfg = await loadConfig();
  return artPushPlan(cfg, destCacheKey);
});
