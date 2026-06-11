import { loadConfig } from "../../../utils/storage";
import { buildTransferPlan } from "../../../utils/romTransfer";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    sourceCacheKey?: string;
    destCacheKey?: string;
    gameKeys?: string[];
  }>(event);
  const sourceCacheKey = body?.sourceCacheKey?.trim();
  const destCacheKey = body?.destCacheKey?.trim();
  const gameKeys = Array.isArray(body?.gameKeys) ? body!.gameKeys : [];
  if (!sourceCacheKey) throw createError({ statusCode: 400, statusMessage: "sourceCacheKey required" });
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });
  if (sourceCacheKey === destCacheKey)
    throw createError({ statusCode: 400, statusMessage: "source and destination must differ" });
  if (gameKeys.length === 0) throw createError({ statusCode: 400, statusMessage: "gameKeys required" });

  const cfg = await loadConfig();
  const plan = await buildTransferPlan(cfg, sourceCacheKey, destCacheKey, gameKeys);
  return { plan };
});
