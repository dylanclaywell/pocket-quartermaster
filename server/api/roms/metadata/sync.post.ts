import { loadConfig } from "../../../utils/storage";
import { computeLibrary } from "../../../utils/romLibrary";
import { resolveRomSourceRoots } from "../../../utils/romTransfer";
import {
  launcherKindForCacheKey,
  metadataTargetRoot,
  writeLauncherMetadata,
  type MetadataEntry,
} from "../../../utils/launcherMetadata";

/** Write clean display names into a destination's launcher metadata for every
 *  game already installed on it — no file copying. Used to push name edits to a
 *  device without re-transferring multi-GB ROMs. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string; gameKeys?: string[] }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  if (!destCacheKey) throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });
  // Optional subset — when omitted, every installed game is (re)named.
  const wanted = Array.isArray(body?.gameKeys) ? new Set(body.gameKeys) : null;

  const cfg = await loadConfig();
  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (!kind) {
    throw createError({
      statusCode: 400,
      statusMessage: "This destination has no launcher set; choose one on its device page.",
    });
  }

  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  if (!dest?.mounted) {
    throw createError({
      statusCode: 409,
      statusMessage: `Destination "${dest?.label ?? destCacheKey}" is not mounted`,
    });
  }
  const { root, reason } = metadataTargetRoot(kind, dest);
  if (!root) {
    throw createError({ statusCode: 400, statusMessage: reason ?? "Cannot write metadata" });
  }

  // Name every file this game owns on the destination — known variants and any
  // unknown ones — since they're all the same game under one display name.
  const { games } = await computeLibrary(cfg);
  const entries: MetadataEntry[] = [];
  for (const g of games) {
    if (wanted && !wanted.has(g.gameKey)) continue;
    const d = g.destinations.find((x) => x.cacheKey === destCacheKey);
    if (!d || d.installedFilenames.length === 0) continue;
    for (const filename of d.installedFilenames) {
      entries.push({ systemKey: g.systemKey, filename, displayName: g.displayName });
    }
  }

  const results = entries.length > 0 ? await writeLauncherMetadata(kind, root, entries) : [];
  return { kind, destLabel: dest.label, entryCount: entries.length, results };
});
