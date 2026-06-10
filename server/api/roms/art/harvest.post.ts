import { loadConfig } from "../../../utils/storage";
import { harvestLauncherArt } from "../../../utils/launcherArtHarvest";

/** Pull box art a destination's launcher already has on disk into the server
 *  cache, where it's shared across activity, library, and other launchers.
 *  Only fills games with no cached art. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });

  const cfg = await loadConfig();
  const result = await harvestLauncherArt(cfg, destCacheKey);
  return result;
});
