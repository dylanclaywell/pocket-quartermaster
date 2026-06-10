import { resolve } from "node:path";
import { loadConfig } from "../../utils/storage";
import {
  listAllRomCaches,
  romDeviceCacheKey,
  romVirtualMountCacheKey,
} from "../../utils/romLibraryCache";
import type { RomFileRecord } from "../../utils/romScan";

type SourceKind = "device" | "virtualMount";

interface VariantSource {
  cacheKey: string;
  sourceKind: SourceKind;
  sourceLabel: string;
}

interface LibraryVariant {
  /** Stable within a game: `${systemKey}/${filename}`. */
  key: string;
  filename: string;
  relPath: string;
  systemKey: string;
  system: string;
  sizeBytes: number;
  regionTags: string[];
  languages: string[];
  revision?: string;
  flags: string[];
  extension: string;
  /** Every library source that holds this exact file. */
  sources: VariantSource[];
}

interface LibraryGame {
  gameKey: string;
  displayName: string;
  systemKey: string;
  system: string;
  variantCount: number;
  totalSizeBytes: number;
  variants: LibraryVariant[];
}

interface LibrarySummary {
  cacheKey: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  configured: boolean;
  cacheExists: boolean;
  lastScannedAt?: string;
  romsRootRelPath?: string;
  fileCount?: number;
}

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const caches = await listAllRomCaches();

  // cacheKey → friendly label + kind, for both real devices and virtual mounts.
  const sourceByCacheKey = new Map<
    string,
    { sourceLabel: string; sourceKind: SourceKind; romsRootRelPath?: string }
  >();
  for (const dev of cfg.devices) {
    sourceByCacheKey.set(romDeviceCacheKey(dev.id), {
      sourceLabel: dev.nickname,
      sourceKind: "device",
      romsRootRelPath: dev.romsRootRelPath,
    });
  }
  for (const vm of cfg.virtualMounts) {
    sourceByCacheKey.set(romVirtualMountCacheKey(resolve(vm.path)), {
      sourceLabel: vm.label || vm.path,
      sourceKind: "virtualMount",
      romsRootRelPath: vm.romsRootRelPath,
    });
  }

  const games = new Map<string, LibraryGame>();

  function fold(rec: RomFileRecord, source: VariantSource): void {
    let game = games.get(rec.gameKey);
    if (!game) {
      game = {
        gameKey: rec.gameKey,
        displayName: rec.displayName,
        systemKey: rec.systemKey,
        system: rec.system,
        variantCount: 0,
        totalSizeBytes: 0,
        variants: [],
      };
      games.set(rec.gameKey, game);
    }
    // Prefer the longest display name (usually the most complete title).
    if (rec.displayName.length > game.displayName.length) game.displayName = rec.displayName;

    const variantKey = `${rec.systemKey}/${rec.filename}`;
    let variant = game.variants.find((v) => v.key === variantKey);
    if (!variant) {
      variant = {
        key: variantKey,
        filename: rec.filename,
        relPath: rec.relPath,
        systemKey: rec.systemKey,
        system: rec.system,
        sizeBytes: rec.sizeBytes,
        regionTags: rec.regionTags,
        languages: rec.languages,
        revision: rec.revision,
        flags: rec.flags,
        extension: rec.extension,
        sources: [source],
      };
      game.variants.push(variant);
      game.variantCount++;
      game.totalSizeBytes += rec.sizeBytes;
    } else if (!variant.sources.some((s) => s.cacheKey === source.cacheKey)) {
      variant.sources.push(source);
    }
  }

  for (const cache of caches) {
    const src = sourceByCacheKey.get(cache.cacheKey);
    const source: VariantSource = {
      cacheKey: cache.cacheKey,
      sourceKind: src?.sourceKind ?? "device",
      sourceLabel: src?.sourceLabel ?? "(removed source)",
    };
    for (const rec of cache.files) fold(rec, source);
  }

  for (const game of games.values()) {
    game.variants.sort((a, b) =>
      a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" }),
    );
  }

  const sortedGames = [...games.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );

  // Per-library summary: every source configured for ROM scanning, plus any
  // cache whose source has since been removed (so stale data is visible).
  const cachesByKey = new Map(caches.map((c) => [c.cacheKey, c]));
  const summaries: LibrarySummary[] = [];
  const seenKeys = new Set<string>();

  for (const dev of cfg.devices) {
    const key = romDeviceCacheKey(dev.id);
    seenKeys.add(key);
    const cache = cachesByKey.get(key);
    summaries.push({
      cacheKey: key,
      sourceKind: "device",
      sourceLabel: dev.nickname,
      configured: Boolean(dev.romsRootRelPath),
      cacheExists: Boolean(cache),
      lastScannedAt: cache?.scannedAt,
      romsRootRelPath: dev.romsRootRelPath,
      fileCount: cache?.files.length,
    });
  }
  for (const vm of cfg.virtualMounts) {
    const key = romVirtualMountCacheKey(resolve(vm.path));
    seenKeys.add(key);
    const cache = cachesByKey.get(key);
    summaries.push({
      cacheKey: key,
      sourceKind: "virtualMount",
      sourceLabel: vm.label || vm.path,
      configured: Boolean(vm.romsRootRelPath),
      cacheExists: Boolean(cache),
      lastScannedAt: cache?.scannedAt,
      romsRootRelPath: vm.romsRootRelPath,
      fileCount: cache?.files.length,
    });
  }
  for (const cache of caches) {
    if (seenKeys.has(cache.cacheKey)) continue;
    summaries.push({
      cacheKey: cache.cacheKey,
      sourceKind: "device",
      sourceLabel: "(removed source)",
      configured: false,
      cacheExists: true,
      lastScannedAt: cache.scannedAt,
      fileCount: cache.files.length,
    });
  }

  return { games: sortedGames, libraries: summaries };
});
