import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { Jimp } from "jimp";
import type { ConfigFile } from "./types";
import { computeLibrary } from "./romLibrary";
import { resolveRomSourceRoots } from "./romTransfer";
import { esDeSubdir, launcherKindForCacheKey } from "./launcherMetadata";
import { findThumbnailPath } from "./thumbnails";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

export interface ArtPushResult {
  /** Absolute downloaded_media dir written under, for messaging. */
  mediaDir?: string;
  /** Cover files written. */
  pushed: number;
  /** Games skipped because the server has no cached art for them. */
  skippedNoArt: number;
  /** Requested games skipped because they aren't installed on the destination. */
  skippedNotInstalled: number;
  /** Max edge (px) art was downscaled to, if any. */
  resizedTo?: number;
  /** Set when nothing could be written (launcher mismatch / not mounted / no folder). */
  reason?: string;
}

/** Push cached box art to a destination's launcher, naming each cover after the
 *  ROM file installed there so the launcher matches it. Optionally downscales to
 *  a max edge (per-device setting or override) for small screens — re-encoded as
 *  PNG. ES-DE only for now. */
export async function pushLauncherArt(
  cfg: ConfigFile,
  destCacheKey: string,
  gameKeys: string[] | undefined,
  maxEdgeOverride?: number,
): Promise<ArtPushResult> {
  const empty: ArtPushResult = { pushed: 0, skippedNoArt: 0, skippedNotInstalled: 0 };

  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (kind !== "es-de") {
    return { ...empty, reason: "Art push is only supported for ES-DE destinations" };
  }
  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  if (!dest?.mounted) return { ...empty, reason: "Destination is not mounted" };
  const mediaDir = esDeSubdir(dest, "downloaded_media");
  if (!mediaDir) return { ...empty, reason: "ES-DE folder is not set on this destination" };

  const maxEdge = Math.max(0, Math.floor(maxEdgeOverride ?? dest.artMaxEdgePx ?? 0));

  const { games } = await computeLibrary(cfg);
  const wanted = gameKeys ? new Set(gameKeys) : null;
  const result: ArtPushResult = { ...empty, mediaDir, resizedTo: maxEdge || undefined };

  for (const game of games) {
    if (wanted && !wanted.has(game.gameKey)) continue;
    const d = game.destinations.find((x) => x.cacheKey === destCacheKey);
    const installed = d?.installedFilenames ?? [];
    if (installed.length === 0) {
      if (wanted) result.skippedNotInstalled++;
      continue;
    }
    const thumb = await findThumbnailPath(game.gameKey);
    if (!thumb) {
      result.skippedNoArt++;
      continue;
    }

    const srcBytes = await readFile(thumb.absPath);

    // Downscale only when a cap is set and the art is larger than it; otherwise
    // ship the original bytes untouched.
    let resized: Buffer | null = null;
    if (maxEdge > 0) {
      try {
        const img = await Jimp.read(srcBytes);
        if (Math.max(img.width, img.height) > maxEdge) {
          img.scaleToFit({ w: maxEdge, h: maxEdge });
          resized = await img.getBuffer("image/png");
        }
      } catch {
        // Unreadable image — fall back to copying the original bytes.
      }
    }

    const coversDir = join(mediaDir, game.systemKey, "covers");
    await mkdir(coversDir, { recursive: true });
    for (const filename of installed) {
      const stem = basename(filename, extname(filename));
      if (resized) await writeCover(coversDir, stem, ".png", resized);
      else await writeCover(coversDir, stem, thumb.ext, srcBytes);
      result.pushed++;
    }
  }

  return result;
}

/** Write `<stem><ext>` atomically, first removing any same-stem cover under a
 *  different image extension so the launcher doesn't keep a stale duplicate. */
async function writeCover(dir: string, stem: string, ext: string, bytes: Buffer): Promise<void> {
  for (const e of IMAGE_EXTS) {
    if (e === ext) continue;
    const other = join(dir, `${stem}${e}`);
    if (existsSync(other)) {
      try {
        await unlink(other);
      } catch {
        // best-effort
      }
    }
  }
  const target = join(dir, `${stem}${ext}`);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}
