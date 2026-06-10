import { loadConfig } from "../../../utils/storage";
import { buildTransferPlan, executeTransferPlan, resolveRomSourceRoots } from "../../../utils/romTransfer";
import { refreshRomCache } from "../../../utils/romLibraryCache";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string; gameKeys?: string[] }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  const gameKeys = Array.isArray(body?.gameKeys) ? body!.gameKeys : [];
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });
  if (gameKeys.length === 0) throw createError({ statusCode: 400, statusMessage: "gameKeys required" });

  const cfg = await loadConfig();
  // Re-resolve the plan server-side rather than trusting client-supplied paths.
  const plan = await buildTransferPlan(cfg, destCacheKey, gameKeys);
  const results = await executeTransferPlan(plan);

  // Re-scan the destination so its installed-variant state reflects the copies.
  let rescanError: string | undefined;
  if (results.some((r) => r.ok && r.bytesCopied)) {
    const roots = await resolveRomSourceRoots(cfg);
    const dest = roots.get(destCacheKey);
    if (dest?.absRoot) {
      try {
        await refreshRomCache(destCacheKey, dest.absRoot);
      } catch (err) {
        rescanError = (err as Error).message;
      }
    }
  }

  return { results, rescanError };
});
