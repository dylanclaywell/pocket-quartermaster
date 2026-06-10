import { loadConfig } from "../../../utils/storage";
import { buildTransferPlan } from "../../../utils/romTransfer";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string; gameKeys?: string[] }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  const gameKeys = Array.isArray(body?.gameKeys) ? body!.gameKeys : [];
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });
  if (gameKeys.length === 0) throw createError({ statusCode: 400, statusMessage: "gameKeys required" });

  const cfg = await loadConfig();
  const plan = await buildTransferPlan(cfg, destCacheKey, gameKeys);
  return { plan };
});
