import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { ConfigFile } from "./types";
import { computeLibrary } from "./romLibrary";
import { resolveRomSourceRoots } from "./romTransfer";
import { esDeSubdir, launcherKindForCacheKey } from "./launcherMetadata";
import { hasThumbnail, saveThumbnail, MAX_THUMBNAIL_BYTES } from "./thumbnails";

/** ES-DE downloaded_media subfolders to pull box art from, best first. The
 *  first match for a game wins, so covers (2D box) beats screenshots. */
const ART_TYPES_BY_PREFERENCE = ["covers", "miximages", "screenshots"] as const;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface ArtHarvestResult {
  /** Absolute downloaded_media dir scanned, for messaging. */
  mediaDir?: string;
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

/** Pull box art that a destination's launcher already has on disk into the
 *  server thumbnail cache, so it shows across the app and can be pushed to other
 *  launchers. Only fills games with no cached art — never clobbers user-set or
 *  previously-imported art. ES-DE only for now. */
export async function harvestLauncherArt(
  cfg: ConfigFile,
  destCacheKey: string,
): Promise<ArtHarvestResult> {
  const empty: ArtHarvestResult = { scanned: 0, imported: 0, skippedExisting: 0, unmatched: 0 };

  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (kind !== "es-de") {
    return { ...empty, reason: "Art import is only supported for ES-DE destinations" };
  }

  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  if (!dest?.mounted) return { ...empty, reason: "Destination is not mounted" };
  const mediaDir = esDeSubdir(dest, "downloaded_media");
  if (!mediaDir) return { ...empty, reason: "ES-DE folder is not set on this destination" };
  if (!existsSync(mediaDir)) {
    return { ...empty, reason: `No downloaded_media folder found at ${mediaDir}` };
  }

  // Map (system, rom-filename-without-extension) → gameKey from the catalog.
  // Transfers copy canonical filenames, so ES-DE's media (named after the ROM
  // file) lines up with our variant filenames.
  const { games } = await computeLibrary(cfg);
  const byNameKey = new Map<string, string>();
  for (const game of games) {
    for (const v of game.variants) {
      byNameKey.set(nameKey(v.systemKey, v.filename), game.gameKey);
    }
  }

  const result: ArtHarvestResult = { ...empty, mediaDir };
  const done = new Set<string>(); // gameKeys handled this run (priority dedupe)

  let systemDirs: string[];
  try {
    systemDirs = (await readdir(mediaDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return { ...result, reason: `Could not read ${mediaDir}` };
  }

  for (const systemKey of systemDirs) {
    for (const artType of ART_TYPES_BY_PREFERENCE) {
      const dir = join(mediaDir, systemKey, artType);
      if (!existsSync(dir)) continue;
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

        const gameKey = byNameKey.get(nameKey(systemKey, file));
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
  }

  return result;
}

/** Identity for art matching: system folder + filename minus its extension,
 *  lower-cased. ES-DE names media after the ROM file sans extension. */
function nameKey(systemKey: string, filename: string): string {
  const stem = basename(filename, extname(filename)).toLowerCase();
  return `${systemKey.toLowerCase()}/${stem}`;
}
