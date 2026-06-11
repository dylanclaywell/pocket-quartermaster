import { loadConfig } from "../../../utils/storage";
import { pushLauncherArt } from "../../../utils/launcherArtPush";

/** Push cached box art to a destination's launcher, optionally downscaled. Pass
 *  gameKeys to limit which games; omit to push every installed-with-art game.
 *  maxEdgePx overrides the destination's configured art size for this run. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    destCacheKey?: string;
    gameKeys?: string[];
    maxEdgePx?: number;
  }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });
  const gameKeys = Array.isArray(body?.gameKeys) ? body!.gameKeys : undefined;
  const maxEdgePx =
    typeof body?.maxEdgePx === "number" && body.maxEdgePx > 0 ? body.maxEdgePx : undefined;

  const cfg = await loadConfig();
  return pushLauncherArt(cfg, destCacheKey, gameKeys, maxEdgePx);
});
