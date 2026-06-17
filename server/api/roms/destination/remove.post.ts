import { unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { loadConfig } from "../../../utils/storage";
import { resolveRomSourceRoots } from "../../../utils/romTransfer";
import { loadRomCache, refreshRomCache } from "../../../utils/romLibraryCache";

/** Delete specific ROM files from one source — the only path in the app that
 *  removes ROMs. Strictly user-initiated: the storage endpoint only ever
 *  *suggests*; this acts solely on the exact filenames passed. Re-resolves every
 *  path server-side and refuses anything outside the source's mounted ROM root,
 *  so a crafted request can't reach arbitrary files. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    sourceCacheKey?: string;
    gameKey?: string;
    filenames?: string[];
  }>(event);
  const sourceCacheKey = body?.sourceCacheKey?.trim();
  const gameKey = body?.gameKey?.trim();
  const filenames = Array.isArray(body?.filenames) ? body!.filenames : [];
  if (!sourceCacheKey) throw createError({ statusCode: 400, statusMessage: "sourceCacheKey required" });
  if (!gameKey) throw createError({ statusCode: 400, statusMessage: "gameKey required" });
  if (filenames.length === 0) throw createError({ statusCode: 400, statusMessage: "filenames required" });

  const cfg = await loadConfig();
  const root = (await resolveRomSourceRoots(cfg)).get(sourceCacheKey);
  if (!root) throw createError({ statusCode: 404, statusMessage: "source not found" });
  if (!root.mounted || !root.absRoot) {
    throw createError({ statusCode: 409, statusMessage: "Source is not mounted." });
  }

  // Trust the cache for relPaths, not the client. Only files this source's cache
  // actually records for this game are eligible — by exact filename.
  const cache = await loadRomCache(sourceCacheKey);
  const recsByName = new Map(
    (cache?.files ?? [])
      .filter((f) => f.gameKey === gameKey)
      .map((f) => [f.filename, f]),
  );

  const rootAbs = resolve(root.absRoot);
  const rootPrefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;

  const removed: string[] = [];
  let freedBytes = 0;
  const errors: { filename: string; reason: string }[] = [];

  for (const filename of filenames) {
    const rec = recsByName.get(filename);
    if (!rec) {
      errors.push({ filename, reason: "not found in this source's library" });
      continue;
    }
    const abs = resolve(join(rootAbs, rec.relPath));
    // Containment guard: the resolved path must sit inside the ROM root.
    if (abs !== rootAbs && !abs.startsWith(rootPrefix)) {
      errors.push({ filename, reason: "path escapes the library root" });
      continue;
    }
    try {
      await unlink(abs);
      removed.push(filename);
      freedBytes += rec.sizeBytes;
    } catch (err) {
      errors.push({ filename, reason: (err as Error).message });
    }
  }

  // Re-scan so the library matrix reflects the deletions.
  let rescanError: string | undefined;
  if (removed.length > 0) {
    try {
      await refreshRomCache(sourceCacheKey, root.absRoot);
    } catch (err) {
      rescanError = (err as Error).message;
    }
  }

  return { removed, freedBytes, errors, rescanError };
});
