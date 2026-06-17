import { resolve } from "node:path";
import { loadConfig } from "../utils/storage";
import { listAllMounts } from "../utils/devices";
import { readMarker } from "../utils/deviceId";
import {
  listAllRomCaches,
  romDeviceCacheKey,
  romVirtualMountCacheKey,
} from "../utils/romLibraryCache";
import { listAllCaches } from "../utils/activityCache";

type SourceKind = "device" | "virtualMount";

interface DeviceBudget {
  romCacheKey: string;
  kind: SourceKind;
  label: string;
  mounted: boolean;
  sizeBytes?: number;
  freeBytes?: number;
  romBytes: number;
  romCount: number;
  /** User has excluded this source from reclaim suggestions. It still shows its
      budget and still backs up other sources' games — it just yields no prune
      candidates of its own. */
  excludedFromReclaim: boolean;
}

interface PruneCandidate {
  gameKey: string;
  displayName: string;
  system: string;
  sourceCacheKey: string;
  sourceLabel: string;
  filenames: string[];
  bytes: number;
  playSeconds: number;
  backedUpElsewhere: boolean;
}

/** Cap on rows returned so a multi-thousand-ROM library doesn't ship (or render)
 *  in full. Candidates are sorted worst-first, so the cap keeps the highest-value
 *  cleanups; `totalCandidates` reports how many exist beyond the cap. */
const MAX_CANDIDATES = 200;

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const [mounts, romCaches, activityCaches] = await Promise.all([
    listAllMounts(cfg.virtualMounts),
    listAllRomCaches(),
    listAllCaches(),
  ]);

  // deviceId → live mount (for free/size). Virtual mounts are matched by path.
  const mountByDeviceId = new Map<string, (typeof mounts)[number]>();
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker?.id) mountByDeviceId.set(marker.id, m);
  }
  const mountByPath = new Map(mounts.map((m) => [m.mountPath, m]));

  // Total playtime per gameKey, summed across every activity source. gameKey IS
  // the activity normalizedName (both are normalizeGameName(displayName)).
  const playByGameKey = new Map<string, number>();
  for (const cache of activityCaches) {
    for (const e of cache.entries) {
      playByGameKey.set(
        e.normalizedName,
        (playByGameKey.get(e.normalizedName) ?? 0) + e.runtimeSeconds,
      );
    }
  }

  // Which rom cache keys hold each game — drives backedUpElsewhere.
  const cacheKeysByGame = new Map<string, Set<string>>();
  for (const cache of romCaches) {
    for (const f of cache.files) {
      const set = cacheKeysByGame.get(f.gameKey) ?? new Set<string>();
      set.add(cache.cacheKey);
      cacheKeysByGame.set(f.gameKey, set);
    }
  }

  // Resolve each rom cache key to its configured source (label, kind, mount).
  interface SourceInfo {
    kind: SourceKind;
    label: string;
    mounted: boolean;
    sizeBytes?: number;
    freeBytes?: number;
  }
  const sourceByCacheKey = new Map<string, SourceInfo>();
  for (const dev of cfg.devices) {
    const mount = mountByDeviceId.get(dev.id);
    sourceByCacheKey.set(romDeviceCacheKey(dev.id), {
      kind: "device",
      label: dev.nickname,
      mounted: Boolean(mount),
      sizeBytes: mount?.sizeBytes,
      freeBytes: mount?.freeBytes,
    });
  }
  for (const vm of cfg.virtualMounts) {
    const mount = mountByPath.get(vm.path);
    sourceByCacheKey.set(romVirtualMountCacheKey(resolve(vm.path)), {
      kind: "virtualMount",
      label: vm.label || vm.path,
      mounted: Boolean(mount),
      sizeBytes: mount?.sizeBytes,
      freeBytes: mount?.freeBytes,
    });
  }

  // Sources the user opted out of clearing. Still counted as backup locations
  // above (cacheKeysByGame includes them), so other sources' games still read
  // as backedUpElsewhere — these just never produce candidates of their own.
  const excluded = new Set(cfg.reclaimExcludedSources);

  const devices: DeviceBudget[] = [];
  const allCandidates: PruneCandidate[] = [];

  for (const cache of romCaches) {
    const src = sourceByCacheKey.get(cache.cacheKey);
    if (!src) continue; // cache whose source was removed from config — skip

    // Footprint for this source.
    const romBytes = cache.files.reduce((s, f) => s + f.sizeBytes, 0);
    devices.push({
      romCacheKey: cache.cacheKey,
      kind: src.kind,
      label: src.label,
      mounted: src.mounted,
      sizeBytes: src.sizeBytes,
      freeBytes: src.freeBytes,
      romBytes,
      romCount: cache.files.length,
      excludedFromReclaim: excluded.has(cache.cacheKey),
    });

    // Excluded sources show their budget above but yield no prune candidates.
    if (excluded.has(cache.cacheKey)) continue;

    // One prune candidate per (game, this source): all of that game's files here.
    const byGame = new Map<string, typeof cache.files>();
    for (const f of cache.files) {
      const arr = byGame.get(f.gameKey) ?? [];
      arr.push(f);
      byGame.set(f.gameKey, arr);
    }
    for (const [gameKey, files] of byGame) {
      const heldBy = cacheKeysByGame.get(gameKey);
      allCandidates.push({
        gameKey,
        // Longest display name carries the most region/title detail.
        displayName: files.reduce(
          (best, f) => (f.displayName.length > best.length ? f.displayName : best),
          files[0].displayName,
        ),
        system: files[0].system,
        sourceCacheKey: cache.cacheKey,
        sourceLabel: src.label,
        filenames: files.map((f) => f.filename),
        bytes: files.reduce((s, f) => s + f.sizeBytes, 0),
        playSeconds: playByGameKey.get(gameKey) ?? 0,
        backedUpElsewhere: Boolean(heldBy && heldBy.size > 1),
      });
    }
  }

  // Worst-first: most bytes per second played. Never-played games (playSeconds 0)
  // float to the top, biggest first. The +1 avoids divide-by-zero.
  allCandidates.sort((a, b) => b.bytes / (b.playSeconds + 1) - a.bytes / (a.playSeconds + 1));

  devices.sort((a, b) => b.romBytes - a.romBytes);

  return {
    devices,
    pruneCandidates: allCandidates.slice(0, MAX_CANDIDATES),
    totalCandidates: allCandidates.length,
    reclaimableBytes: allCandidates.reduce((s, c) => s + c.bytes, 0),
  };
});
