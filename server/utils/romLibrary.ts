import { resolve } from "node:path";
import type { ConfigFile, RomLibraryRole } from "./types";
import type { RomFileRecord } from "./romScan";
import {
  listAllRomCaches,
  romDeviceCacheKey,
  romVirtualMountCacheKey,
  type RomLibraryCache,
} from "./romLibraryCache";

type SourceKind = "device" | "virtualMount";

/** What kind of thing each rom cache belongs to, resolved from config. */
interface SourceMeta {
  cacheKey: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  role: RomLibraryRole;
  configured: boolean;
  romsRootRelPath?: string;
}

export interface LibrarySource extends SourceMeta {
  cacheExists: boolean;
  lastScannedAt?: string;
  fileCount?: number;
}

export interface ComputedVariant {
  /** `${systemKey}/${filename}` — stable within a game. */
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
  /** True when this is the game's default variant. */
  isDefault: boolean;
  /** Library source(s) that hold this exact file. */
  librarySources: { cacheKey: string; sourceLabel: string }[];
}

export type DestinationStatus = "not-installed" | "match" | "mismatch" | "unknown";

export interface DestinationState {
  cacheKey: string;
  sourceLabel: string;
  sourceKind: SourceKind;
  /** Known master variant currently installed on this destination, if any. */
  installedVariantKey?: string;
  /** Every filename of this game found on the destination. */
  installedFilenames: string[];
  /** Installed filenames that match no known master variant (adoptable). */
  unknownInstalled: string[];
  /** Variant the destination should hold (explicit preference or game default). */
  preferredVariantKey?: string;
  /** True when preferredVariantKey came from the game default, not an explicit pick. */
  preferredInherited: boolean;
  status: DestinationStatus;
}

export interface ComputedGame {
  gameKey: string;
  displayName: string;
  displayNameOverride?: string;
  systemKey: string;
  system: string;
  variantCount: number;
  totalSizeBytes: number;
  defaultVariantKey?: string;
  saveProfileName?: string;
  notes?: string;
  variants: ComputedVariant[];
  destinations: DestinationState[];
}

export interface ComputedLibrary {
  games: ComputedGame[];
  sources: LibrarySource[];
}

function variantKey(rec: RomFileRecord): string {
  return `${rec.systemKey}/${rec.filename}`;
}

/** Rom cache keys of every ROM-configured source, in config order. */
function romConfiguredCacheKeys(cfg: ConfigFile): string[] {
  const keys: string[] = [];
  for (const dev of cfg.devices) {
    if (dev.romsRootRelPath) keys.push(romDeviceCacheKey(dev.id));
  }
  for (const vm of cfg.virtualMounts) {
    if (vm.romsRootRelPath) keys.push(romVirtualMountCacheKey(resolve(vm.path)));
  }
  return keys;
}

/** The cache key of the active library source: the configured pointer when it
 *  still names a ROM-configured source, otherwise the sole configured source
 *  (so single-library setups need no explicit pick), otherwise none. */
export function effectiveLibraryKey(cfg: ConfigFile): string | undefined {
  const keys = romConfiguredCacheKeys(cfg);
  if (cfg.romLibrarySourceKey && keys.includes(cfg.romLibrarySourceKey)) {
    return cfg.romLibrarySourceKey;
  }
  return keys.length === 1 ? keys[0] : undefined;
}

/** Resolve every rom cache key the config knows about to its label, kind, and
 *  role. The source matching `libraryKey` is the library; all others are
 *  destinations. */
function buildSourceMeta(cfg: ConfigFile, libraryKey?: string): Map<string, SourceMeta> {
  const map = new Map<string, SourceMeta>();
  const role = (cacheKey: string): RomLibraryRole =>
    cacheKey === libraryKey ? "library" : "destination";
  for (const dev of cfg.devices) {
    const key = romDeviceCacheKey(dev.id);
    map.set(key, {
      cacheKey: key,
      sourceKind: "device",
      sourceLabel: dev.nickname,
      role: role(key),
      configured: Boolean(dev.romsRootRelPath),
      romsRootRelPath: dev.romsRootRelPath,
    });
  }
  for (const vm of cfg.virtualMounts) {
    const key = romVirtualMountCacheKey(resolve(vm.path));
    map.set(key, {
      cacheKey: key,
      sourceKind: "virtualMount",
      sourceLabel: vm.label || vm.path,
      role: role(key),
      configured: Boolean(vm.romsRootRelPath),
      romsRootRelPath: vm.romsRootRelPath,
    });
  }
  return map;
}

/** Build the full ROM-management read model: canonical games + variants from
 *  master libraries, enriched with persisted game meta and a per-destination
 *  install/preferred matrix. */
export async function computeLibrary(
  cfg: ConfigFile,
  injectedCaches?: RomLibraryCache[],
): Promise<ComputedLibrary> {
  const caches = injectedCaches ?? (await listAllRomCaches());
  const cacheByKey = new Map(caches.map((c) => [c.cacheKey, c]));
  const libraryKey = effectiveLibraryKey(cfg);
  const sourceMeta = buildSourceMeta(cfg, libraryKey);

  // A cache whose source was removed from config is no longer a real source.
  function metaFor(cacheKey: string): SourceMeta {
    return (
      sourceMeta.get(cacheKey) ?? {
        cacheKey,
        sourceKind: "device",
        sourceLabel: "(removed source)",
        role: "destination",
        configured: false,
      }
    );
  }

  // Every configured ROM source contributes to the catalog — there is no single
  // master library. A game's variants are the union across all sources, and
  // every source appears in the per-source presence matrix below. Removed or
  // unknown caches (whose source is gone from config) are ignored.
  const configuredCacheKeys = new Set(
    [...sourceMeta.values()].filter((m) => m.configured).map((m) => m.cacheKey),
  );
  const activeCaches = caches.filter((c) => configuredCacheKeys.has(c.cacheKey));

  const metaByGameKey = new Map(cfg.gameMeta.map((m) => [m.gameKey, m]));
  const prefByGameAndDest = new Map<string, string | undefined>();
  for (const p of cfg.deviceGamePreferences) {
    prefByGameAndDest.set(`${p.gameKey}::${p.sourceCacheKey}`, p.preferredVariantKey);
  }

  // Fold library records into games → variants.
  interface Building {
    game: ComputedGame;
    variantByKey: Map<string, ComputedVariant>;
  }
  const building = new Map<string, Building>();

  for (const cache of activeCaches) {
    const label = metaFor(cache.cacheKey).sourceLabel;
    for (const rec of cache.files) {
      let b = building.get(rec.gameKey);
      if (!b) {
        b = {
          game: {
            gameKey: rec.gameKey,
            displayName: rec.displayName,
            systemKey: rec.systemKey,
            system: rec.system,
            variantCount: 0,
            totalSizeBytes: 0,
            variants: [],
            destinations: [],
          },
          variantByKey: new Map(),
        };
        building.set(rec.gameKey, b);
      }
      if (rec.displayName.length > b.game.displayName.length) {
        b.game.displayName = rec.displayName;
      }
      const key = variantKey(rec);
      let variant = b.variantByKey.get(key);
      if (!variant) {
        variant = {
          key,
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
          isDefault: false,
          librarySources: [{ cacheKey: cache.cacheKey, sourceLabel: label }],
        };
        b.variantByKey.set(key, variant);
        b.game.variants.push(variant);
        b.game.variantCount++;
        b.game.totalSizeBytes += rec.sizeBytes;
      } else if (!variant.librarySources.some((s) => s.cacheKey === cache.cacheKey)) {
        variant.librarySources.push({ cacheKey: cache.cacheKey, sourceLabel: label });
      }
    }
  }

  // Pre-group every source's files by gameKey for cheap per-game lookup.
  const destFilesByGame = new Map<string, Map<string, RomFileRecord[]>>(); // gameKey → cacheKey → recs
  for (const cache of activeCaches) {
    for (const rec of cache.files) {
      let byCache = destFilesByGame.get(rec.gameKey);
      if (!byCache) {
        byCache = new Map();
        destFilesByGame.set(rec.gameKey, byCache);
      }
      const arr = byCache.get(cache.cacheKey) ?? [];
      arr.push(rec);
      byCache.set(cache.cacheKey, arr);
    }
  }

  const games: ComputedGame[] = [];
  for (const { game, variantByKey } of building.values()) {
    const meta = metaByGameKey.get(game.gameKey);
    if (meta?.displayNameOverride) {
      game.displayNameOverride = meta.displayNameOverride;
      game.displayName = meta.displayNameOverride;
    }
    game.saveProfileName = meta?.saveProfileName;
    game.notes = meta?.notes;

    // Resolve the default variant: explicit meta if still valid, else the sole
    // variant when there's exactly one, else none.
    let defaultKey = meta?.defaultVariantKey;
    if (defaultKey && !variantByKey.has(defaultKey)) defaultKey = undefined;
    if (!defaultKey && game.variants.length === 1) defaultKey = game.variants[0].key;
    game.defaultVariantKey = defaultKey;
    for (const v of game.variants) v.isDefault = v.key === defaultKey;

    game.variants.sort((a, b) =>
      a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" }),
    );

    // Per-source presence/preferred matrix: one row per configured source so
    // the UI can show which devices hold this game and which variant.
    const byCache = destFilesByGame.get(game.gameKey);
    for (const cache of activeCaches) {
      const m = metaFor(cache.cacheKey);
      const recs = byCache?.get(cache.cacheKey) ?? [];
      const installedFilenames = recs.map((r) => r.filename);
      const installedKeys = recs.map(variantKey);
      const knownInstalled = installedKeys.filter((k) => variantByKey.has(k));
      const unknownInstalled = recs
        .filter((r) => !variantByKey.has(variantKey(r)))
        .map((r) => r.filename);

      const explicitPref = prefByGameAndDest.get(`${game.gameKey}::${cache.cacheKey}`);
      const preferredVariantKey = explicitPref ?? defaultKey;
      const preferredInherited = explicitPref === undefined;

      let status: DestinationStatus;
      if (recs.length === 0) status = "not-installed";
      else if (knownInstalled.length === 0) status = "unknown";
      else if (preferredVariantKey && !knownInstalled.includes(preferredVariantKey))
        status = "mismatch";
      else status = "match";

      game.destinations.push({
        cacheKey: cache.cacheKey,
        sourceLabel: m.sourceLabel,
        sourceKind: m.sourceKind,
        installedVariantKey: knownInstalled[0],
        installedFilenames,
        unknownInstalled,
        preferredVariantKey,
        preferredInherited,
        status,
      });
    }

    games.push(game);
  }

  games.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );

  // Source summaries: every configured rom source, plus any cache whose source
  // was removed from config.
  const sources: LibrarySource[] = [];
  const seen = new Set<string>();
  for (const meta of sourceMeta.values()) {
    seen.add(meta.cacheKey);
    const cache = cacheByKey.get(meta.cacheKey);
    sources.push({
      ...meta,
      cacheExists: Boolean(cache),
      lastScannedAt: cache?.scannedAt,
      fileCount: cache?.files.length,
    });
  }
  for (const cache of caches) {
    if (seen.has(cache.cacheKey)) continue;
    sources.push({
      ...metaFor(cache.cacheKey),
      cacheExists: true,
      lastScannedAt: cache.scannedAt,
      fileCount: cache.files.length,
    });
  }

  return { games, sources };
}
