import { loadConfig } from "../../../utils/storage";
import { buildTransferPlan, executeTransferPlan, resolveRomSourceRoots } from "../../../utils/romTransfer";
import { refreshRomCache } from "../../../utils/romLibraryCache";
import {
  launcherKindForCacheKey,
  metadataTargetRoot,
  writeLauncherMetadata,
  type MetadataEntry,
  type MetadataWriteResult,
} from "../../../utils/launcherMetadata";
import type { LauncherKind } from "../../../utils/types";

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
  // Re-resolve the plan server-side rather than trusting client-supplied paths.
  const plan = await buildTransferPlan(cfg, sourceCacheKey, destCacheKey, gameKeys);
  const results = await executeTransferPlan(plan);

  let rescanError: string | undefined;
  let metadata: { kind: LauncherKind; results: MetadataWriteResult[]; note?: string } | undefined;

  if (results.some((r) => r.ok && r.bytesCopied)) {
    const roots = await resolveRomSourceRoots(cfg);
    const dest = roots.get(destCacheKey);
    if (dest?.absRoot) {
      // Write clean display names into the destination's launcher metadata for
      // the games that actually copied, so they don't show canonical filenames.
      const kind = launcherKindForCacheKey(cfg, destCacheKey);
      if (kind) {
        const copied = new Set(
          results.filter((r) => r.ok && r.bytesCopied).map((r) => r.gameKey),
        );
        const entries: MetadataEntry[] = plan.items
          .filter((i) => copied.has(i.gameKey) && i.destRelPath.includes("/"))
          .map((i) => ({
            systemKey: i.destRelPath.split("/")[0],
            filename: i.filename,
            displayName: i.displayName,
          }));
        if (entries.length > 0) {
          const { root, reason } = metadataTargetRoot(kind, dest);
          metadata = root
            ? { kind, results: await writeLauncherMetadata(kind, root, entries) }
            : { kind, results: [], note: reason };
        }
      }

      // Re-scan the destination so its installed-variant state reflects the copies.
      try {
        await refreshRomCache(destCacheKey, dest.absRoot);
      } catch (err) {
        rescanError = (err as Error).message;
      }
    }
  }

  return { results, rescanError, metadata };
});
