import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { Jimp } from "jimp";
import type { ConfigFile } from "./types";
import { computeLibrary } from "./romLibrary";
import { resolveRomSourceRoots } from "./romTransfer";
import { launcherKindForCacheKey } from "./launcherMetadata";
import { getArtLayout } from "./launcherArt";
import { findThumbnailPath, safeBaseName, thumbnailBaseSet } from "./thumbnails";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

function isArtLauncher(kind: string | undefined): boolean {
  return kind === "es-de" || kind === "muos";
}

/** One installed-on-destination game in a push plan. `coverExists` means the
 *  device already has a cover for it (matched by the installed ROM filename, not
 *  by image content — no CRC yet), so pushing would duplicate. */
export interface ArtPlanGame {
  gameKey: string;
  displayName: string;
  system: string;
  hasThumbnail: boolean;
  coverExists: boolean;
}

export interface ArtPlan {
  /** True when art locations could be resolved on the device, so coverExists is
      meaningful. When false, everything reads as "needed". */
  reconciled: boolean;
  reason?: string;
  games: ArtPlanGame[];
}

/** Reconcile what art a destination still needs: every game installed there,
 *  flagged with whether the server has cached art and whether the device already
 *  has a cover. Cover presence is matched on the installed ROM filename stem. */
export async function artPushPlan(cfg: ConfigFile, destCacheKey: string): Promise<ArtPlan> {
  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (!isArtLauncher(kind)) {
    return { reconciled: false, reason: "Art needs an ES-DE or muOS destination", games: [] };
  }
  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  const { layout, reason } = dest?.mounted
    ? await getArtLayout(kind!, dest)
    : { layout: undefined, reason: "Destination not mounted" };

  const { games } = await computeLibrary(cfg);
  const thumbs = await thumbnailBaseSet();

  const out: ArtPlanGame[] = [];
  for (const game of games) {
    const d = game.destinations.find((x) => x.cacheKey === destCacheKey);
    const installed = d?.installedFilenames ?? [];
    if (installed.length === 0) continue;
    const hasThumbnail = thumbs.has(safeBaseName(game.gameKey));

    let coverExists = false;
    if (layout && hasThumbnail) {
      const boxDir = layout.boxDir(game.systemKey);
      if (boxDir) {
        coverExists = installed.some((fn) => {
          const stem = basename(fn, extname(fn));
          return IMAGE_EXTS.some((e) => existsSync(join(boxDir, `${stem}${e}`)));
        });
      }
    }
    out.push({
      gameKey: game.gameKey,
      displayName: game.displayName,
      system: game.system,
      hasThumbnail,
      coverExists,
    });
  }
  return {
    reconciled: Boolean(layout),
    reason: layout ? undefined : reason,
    games: out,
  };
}

export interface ArtPushResult {
  /** Cover files written. */
  pushed: number;
  /** Games skipped because the server has no cached art for them. */
  skippedNoArt: number;
  /** Requested games skipped because they aren't installed on the destination. */
  skippedNotInstalled: number;
  /** Games skipped because the destination has no launcher folder for that
      system (e.g. muOS catalogue folder doesn't exist). */
  skippedNoFolder: number;
  /** Max edge (px) art was downscaled to, if any. */
  resizedTo?: number;
  /** Set when nothing could be written (launcher mismatch / not mounted / no folder). */
  reason?: string;
}

/** Push cached box art to a destination's launcher, naming each cover after the
 *  ROM file installed there so the launcher matches it. Optionally downscales to
 *  a max edge (per-device setting or override) for small screens — re-encoded as
 *  PNG. Works for ES-DE (downloaded_media) and muOS (catalogue box). */
export async function pushLauncherArt(
  cfg: ConfigFile,
  destCacheKey: string,
  gameKeys: string[] | undefined,
  maxEdgeOverride?: number,
): Promise<ArtPushResult> {
  const empty: ArtPushResult = {
    pushed: 0,
    skippedNoArt: 0,
    skippedNotInstalled: 0,
    skippedNoFolder: 0,
  };

  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (!isArtLauncher(kind)) {
    return { ...empty, reason: "Art push needs an ES-DE or muOS destination" };
  }
  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  if (!dest?.mounted) return { ...empty, reason: "Destination is not mounted" };
  const { layout, reason } = await getArtLayout(kind!, dest);
  if (!layout) return { ...empty, reason };

  const maxEdge = Math.max(0, Math.floor(maxEdgeOverride ?? dest.artMaxEdgePx ?? 0));

  const { games } = await computeLibrary(cfg);
  const wanted = gameKeys ? new Set(gameKeys) : null;
  const result: ArtPushResult = { ...empty, resizedTo: maxEdge || undefined };

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
    const boxDir = layout.boxDir(game.systemKey);
    if (!boxDir) {
      result.skippedNoFolder++;
      continue;
    }

    const srcBytes = await readFile(thumb.absPath);

    // Downscale only when a cap is set and the art is larger than it.
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

    await mkdir(boxDir, { recursive: true });
    for (const filename of installed) {
      const stem = basename(filename, extname(filename));
      if (resized) await writeCover(boxDir, stem, ".png", resized);
      else await writeCover(boxDir, stem, thumb.ext, srcBytes);
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
