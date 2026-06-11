import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ConfigFile } from "./types";
import { computeLibrary } from "./romLibrary";
import { resolveRomSourceRoots } from "./romTransfer";
import { launcherKindForCacheKey } from "./launcherMetadata";
import { getArtLayout } from "./launcherArt";
import { hasThumbnail, saveThumbnail, MAX_THUMBNAIL_BYTES } from "./thumbnails";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface ArtHarvestResult {
  /** Image files looked at. */
  scanned: number;
  /** New covers copied into the server cache. */
  imported: number;
  /** Games that already had cached art (left untouched — user art wins). */
  skippedExisting: number;
  /** Image files that matched no known game. */
  unmatched: number;
  /** Set when nothing could be scanned (path missing / launcher mismatch). */
  reason?: string;
}

/** Pull box art a destination's launcher already has on disk into the server
 *  thumbnail cache, so it shows across the app and can be pushed to other
 *  launchers. Only fills games with no cached art — never clobbers user-set or
 *  previously-imported art. Matches images to games by ROM filename stem, so it
 *  works regardless of the launcher's folder naming (ES-DE downloaded_media or
 *  muOS catalogue). */
export async function harvestLauncherArt(
  cfg: ConfigFile,
  destCacheKey: string,
): Promise<ArtHarvestResult> {
  const empty: ArtHarvestResult = { scanned: 0, imported: 0, skippedExisting: 0, unmatched: 0 };

  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (kind !== "es-de" && kind !== "muos") {
    return { ...empty, reason: "Art import needs an ES-DE or muOS destination" };
  }
  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  if (!dest?.mounted) return { ...empty, reason: "Destination is not mounted" };

  const { layout, reason } = await getArtLayout(kind, dest);
  if (!layout) return { ...empty, reason };

  // ROM filename stem (lower, no extension) → gameKey. gameKey is name-based, so
  // a stem maps to one game even across systems.
  const { games } = await computeLibrary(cfg);
  const byStem = new Map<string, string>();
  for (const game of games) {
    for (const v of game.variants) {
      byStem.set(basename(v.filename, extname(v.filename)).toLowerCase(), game.gameKey);
    }
  }

  const result: ArtHarvestResult = { ...empty };
  const done = new Set<string>(); // gameKeys handled this run (first art type wins)

  for (const dir of layout.harvestDirs) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) continue;
      result.scanned++;

      const gameKey = byStem.get(basename(file, extname(file)).toLowerCase());
      if (!gameKey) {
        result.unmatched++;
        continue;
      }
      if (done.has(gameKey)) continue;

      if (await hasThumbnail(gameKey)) {
        result.skippedExisting++;
        done.add(gameKey);
        continue;
      }

      const abs = join(dir, file);
      try {
        const s = await stat(abs);
        if (s.size > MAX_THUMBNAIL_BYTES) continue;
        const bytes = await readFile(abs);
        await saveThumbnail(gameKey, bytes, mime);
        result.imported++;
        done.add(gameKey);
      } catch {
        // best-effort; skip unreadable files
      }
    }
  }

  return result;
}
