import { loadConfig, saveConfig } from "../../utils/storage";

/** Toggle whether a ROM source is excluded from the storage page's
 *  reclaim-space suggestions. Body `{ cacheKey, excluded }`. An excluded source
 *  still shows its budget and still counts as a backup location for other
 *  sources' games — it just never produces prune candidates of its own. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ cacheKey?: string; excluded?: boolean }>(event);

  const cacheKey = body?.cacheKey?.trim();
  if (!cacheKey) {
    throw createError({ statusCode: 400, statusMessage: "cacheKey required" });
  }

  const cfg = await loadConfig();
  const set = new Set(cfg.reclaimExcludedSources);
  if (body?.excluded) set.add(cacheKey);
  else set.delete(cacheKey);
  cfg.reclaimExcludedSources = [...set];

  await saveConfig(cfg);
  return { ok: true, excluded: set.has(cacheKey) };
});
