import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { ConfigFile } from "./types";
import { listAllMounts } from "./devices";
import { readMarker } from "./deviceId";
import { romDeviceCacheKey, romVirtualMountCacheKey } from "./romLibraryCache";
import { computeLibrary, type ComputedGame } from "./romLibrary";

/** A resolved ROM library root on disk, keyed by its rom cache key. */
export interface SourceRoot {
  cacheKey: string;
  label: string;
  /** Absolute path of the library root, or undefined when not mounted. */
  absRoot?: string;
  mounted: boolean;
  /** Absolute path of the bare mount/volume this source lives on, when mounted.
      Launcher metadata (e.g. ES-DE gamelists) lives off this, not off absRoot. */
  mountPath?: string;
  /** Forward-slash ES-DE root path (the `ES-DE/` folder) relative to mountPath,
      if configured. Gamelists and downloaded_media live under it. */
  esDeRootRelPath?: string;
  /** Optional max edge (px) to downscale pushed box art to. Unset/0 = full. */
  artMaxEdgePx?: number;
  /** Forward-slash path of the `MUOS` folder relative to mountPath, if set. */
  muosRootRelPath?: string;
}

/** Resolve every configured ROM source to its current absolute root path.
 *  Devices resolve via their marker on a live mount; virtual mounts resolve to
 *  their configured path when it exists. */
export async function resolveRomSourceRoots(cfg: ConfigFile): Promise<Map<string, SourceRoot>> {
  const mounts = await listAllMounts(cfg.virtualMounts);
  const deviceMountPaths = new Map<string, string>();
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker?.id) deviceMountPaths.set(marker.id, m.mountPath);
  }

  const roots = new Map<string, SourceRoot>();
  for (const dev of cfg.devices) {
    if (!dev.romsRootRelPath) continue;
    const cacheKey = romDeviceCacheKey(dev.id);
    const mountPath = deviceMountPaths.get(dev.id);
    roots.set(cacheKey, {
      cacheKey,
      label: dev.nickname,
      absRoot: mountPath ? join(mountPath, dev.romsRootRelPath) : undefined,
      mounted: Boolean(mountPath),
      mountPath,
      esDeRootRelPath: dev.esDeRootRelPath,
      artMaxEdgePx: dev.artMaxEdgePx,
      muosRootRelPath: dev.muosRootRelPath,
    });
  }
  for (const vm of cfg.virtualMounts) {
    if (!vm.romsRootRelPath) continue;
    const absVm = resolve(vm.path);
    const cacheKey = romVirtualMountCacheKey(absVm);
    const exists = existsSync(absVm);
    roots.set(cacheKey, {
      cacheKey,
      label: vm.label || vm.path,
      absRoot: exists ? join(absVm, vm.romsRootRelPath) : undefined,
      mounted: exists,
      mountPath: exists ? absVm : undefined,
      esDeRootRelPath: vm.esDeRootRelPath,
      artMaxEdgePx: vm.artMaxEdgePx,
      muosRootRelPath: vm.muosRootRelPath,
    });
  }
  return roots;
}

export interface TransferPlanItem {
  gameKey: string;
  displayName: string;
  system: string;
  variantKey: string;
  filename: string;
  sizeBytes: number;
  sourceLabel: string;
  sourceAbsPath: string;
  destLabel: string;
  destAbsPath: string;
  /** Forward-slash path of the file relative to the destination's library root. */
  destRelPath: string;
  /** True when the chosen variant is already installed on the destination. */
  alreadyInstalled: boolean;
  /** Set when the item can't be transferred; transfer is skipped. */
  blocker?: string;
}

export interface TransferPlan {
  sourceCacheKey: string;
  sourceLabel: string;
  destCacheKey: string;
  destLabel: string;
  items: TransferPlanItem[];
}

/** Pick which variant to copy from the source to the destination. Only variants
 *  the source actually holds are candidates; among those, prefer the
 *  destination's preferred variant, then the game default, then the first. */
function chosenVariant(
  game: ComputedGame,
  sourceCacheKey: string,
  destCacheKey: string,
) {
  const candidates = game.variants.filter((v) =>
    v.librarySources.some((s) => s.cacheKey === sourceCacheKey),
  );
  if (candidates.length === 0) return null;
  const destPref = game.destinations.find(
    (d) => d.cacheKey === destCacheKey,
  )?.preferredVariantKey;
  return (
    candidates.find((v) => v.key === destPref) ??
    candidates.find((v) => v.key === game.defaultVariantKey) ??
    candidates[0]
  );
}

/** Build a transfer plan for copying each game from one source to one
 *  destination. Any source → any destination — there is no master. Pure
 *  resolution; copies nothing. Each item is annotated with any blocker (source
 *  lacks the game, source/destination not mounted, source file missing) so the
 *  UI can show why something won't move. */
export async function buildTransferPlan(
  cfg: ConfigFile,
  sourceCacheKey: string,
  destCacheKey: string,
  gameKeys: string[],
): Promise<TransferPlan> {
  const { games } = await computeLibrary(cfg);
  const roots = await resolveRomSourceRoots(cfg);
  const source = roots.get(sourceCacheKey);
  const dest = roots.get(destCacheKey);
  const sourceLabel = source?.label ?? sourceCacheKey;
  const destLabel = dest?.label ?? destCacheKey;
  const wanted = new Set(gameKeys);

  const items: TransferPlanItem[] = [];
  for (const game of games) {
    if (!wanted.has(game.gameKey)) continue;
    const variant = chosenVariant(game, sourceCacheKey, destCacheKey);

    const base: TransferPlanItem = {
      gameKey: game.gameKey,
      displayName: game.displayName,
      system: game.system,
      variantKey: variant?.key ?? "",
      filename: variant?.filename ?? "",
      sizeBytes: variant?.sizeBytes ?? 0,
      sourceLabel,
      sourceAbsPath: "",
      destLabel,
      destAbsPath: "",
      destRelPath: variant?.relPath ?? "",
      alreadyInstalled: false,
    };

    if (!variant) {
      items.push({ ...base, blocker: `Not on ${sourceLabel}` });
      continue;
    }

    // Already installed on the destination?
    const destState = game.destinations.find((d) => d.cacheKey === destCacheKey);
    if (destState?.installedVariantKey === variant.key) base.alreadyInstalled = true;

    if (!dest?.mounted || !dest.absRoot) {
      items.push({ ...base, blocker: `Destination "${destLabel}" is not mounted` });
      continue;
    }
    base.destAbsPath = join(dest.absRoot, variant.relPath.split("/").join(sep));

    if (!source?.mounted || !source.absRoot) {
      items.push({ ...base, blocker: `Source "${sourceLabel}" is not mounted` });
      continue;
    }
    base.sourceAbsPath = join(source.absRoot, variant.relPath.split("/").join(sep));

    if (!existsSync(base.sourceAbsPath)) {
      items.push({ ...base, blocker: `Source file missing: ${base.sourceAbsPath}` });
      continue;
    }

    items.push(base);
  }

  return { sourceCacheKey, sourceLabel, destCacheKey, destLabel, items };
}

export interface TransferItemResult {
  gameKey: string;
  filename: string;
  ok: boolean;
  bytesCopied?: number;
  skipped?: string;
  error?: string;
}

/** Execute a transfer plan: copy each non-blocked item's source to its
 *  destination, overwriting in place (the library is the source of truth and
 *  ROMs are large, so no destination backup is kept). Re-resolution
 *  happens in buildTransferPlan; callers pass that plan straight through. */
export async function executeTransferPlan(plan: TransferPlan): Promise<TransferItemResult[]> {
  const results: TransferItemResult[] = [];
  for (const item of plan.items) {
    if (item.blocker) {
      results.push({ gameKey: item.gameKey, filename: item.filename, ok: false, skipped: item.blocker });
      continue;
    }
    if (item.alreadyInstalled) {
      results.push({ gameKey: item.gameKey, filename: item.filename, ok: true, skipped: "already installed" });
      continue;
    }
    if (item.sourceAbsPath === item.destAbsPath) {
      results.push({
        gameKey: item.gameKey,
        filename: item.filename,
        ok: false,
        error: "source and destination resolve to the same path",
      });
      continue;
    }
    try {
      await mkdir(dirname(item.destAbsPath), { recursive: true });
      await copyFile(item.sourceAbsPath, item.destAbsPath);
      const s = await stat(item.destAbsPath);
      results.push({ gameKey: item.gameKey, filename: item.filename, ok: true, bytesCopied: s.size });
    } catch (err) {
      results.push({
        gameKey: item.gameKey,
        filename: item.filename,
        ok: false,
        error: (err as Error).message,
      });
    }
  }
  return results;
}
