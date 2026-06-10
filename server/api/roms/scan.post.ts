import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listAllMounts } from "../../utils/devices";
import { readMarker } from "../../utils/deviceId";
import { loadConfig } from "../../utils/storage";
import {
  refreshRomCache,
  romDeviceCacheKey,
  romVirtualMountCacheKey,
  type RomRefreshSummary,
} from "../../utils/romLibraryCache";

type SourceKind = "device" | "virtualMount";

interface ScanTarget {
  cacheKey: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  absRomsRoot: string;
}

interface ScanResultRow {
  cacheKey: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  summary?: RomRefreshSummary;
  error?: string;
  skippedReason?: string;
}

async function isDir(p: string): Promise<boolean> {
  if (!existsSync(p)) return false;
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ cacheKey?: string }>(event);
  const onlyKey = body?.cacheKey?.trim() || undefined;

  const cfg = await loadConfig();
  const mounts = await listAllMounts(cfg.virtualMounts);

  // deviceId → current mount path, by reading each mount's marker file.
  const deviceMountPaths = new Map<string, string>();
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker?.id) deviceMountPaths.set(marker.id, m.mountPath);
  }

  const targets: ScanTarget[] = [];
  const unreachable: ScanResultRow[] = [];

  for (const dev of cfg.devices) {
    if (!dev.romsRootRelPath) continue;
    const mountPath = deviceMountPaths.get(dev.id);
    if (!mountPath) {
      unreachable.push({
        cacheKey: romDeviceCacheKey(dev.id),
        sourceKind: "device",
        sourceLabel: dev.nickname,
        skippedReason: "device not currently mounted",
      });
      continue;
    }
    targets.push({
      cacheKey: romDeviceCacheKey(dev.id),
      sourceKind: "device",
      sourceLabel: dev.nickname,
      absRomsRoot: join(mountPath, dev.romsRootRelPath),
    });
  }

  for (const vm of cfg.virtualMounts) {
    if (!vm.romsRootRelPath) continue;
    const absVm = resolve(vm.path);
    targets.push({
      cacheKey: romVirtualMountCacheKey(absVm),
      sourceKind: "virtualMount",
      sourceLabel: vm.label || vm.path,
      absRomsRoot: join(absVm, vm.romsRootRelPath),
    });
  }

  const filtered = onlyKey ? targets.filter((t) => t.cacheKey === onlyKey) : targets;
  const filteredUnreachable = onlyKey
    ? unreachable.filter((u) => u.cacheKey === onlyKey)
    : unreachable;

  const results: ScanResultRow[] = [...filteredUnreachable];
  for (const t of filtered) {
    if (!(await isDir(t.absRomsRoot))) {
      results.push({
        cacheKey: t.cacheKey,
        sourceKind: t.sourceKind,
        sourceLabel: t.sourceLabel,
        error: `ROM library root not found at ${t.absRomsRoot}`,
      });
      continue;
    }
    try {
      const summary = await refreshRomCache(t.cacheKey, t.absRomsRoot);
      results.push({
        cacheKey: t.cacheKey,
        sourceKind: t.sourceKind,
        sourceLabel: t.sourceLabel,
        summary,
      });
    } catch (err) {
      results.push({
        cacheKey: t.cacheKey,
        sourceKind: t.sourceKind,
        sourceLabel: t.sourceLabel,
        error: (err as Error).message,
      });
    }
  }

  return { results };
});
