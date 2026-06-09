import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import envPaths from "env-paths";
import {
  enumerateLrtlFiles,
  parseLrtl,
  type ActivityEntry,
} from "./retroarchActivity";

const paths = envPaths("pocket-quartermaster", { suffix: "" });
export const ACTIVITY_CACHE_DIR = join(paths.config, "activity-cache");

export interface DeviceActivityCache {
  cacheKey: string;
  /** ISO timestamp of when this cache was last refreshed. */
  scannedAt: string;
  /** Absolute path of the logs dir we scanned (recorded for debugging only). */
  logsDir: string;
  entries: ActivityEntry[];
}

export interface RefreshSummary {
  cacheKey: string;
  scannedAt: string;
  totalEntries: number;
  reused: number;
  parsed: number;
  dropped: number;
  errors: { sourceFile: string; reason: string }[];
}

/** Build a stable cache key for a real device (by stable UUID). */
export function deviceCacheKey(deviceId: string): string {
  return `dev-${deviceId}`;
}

/** Build a stable cache key for a virtual mount (path-hashed since paths can
 *  contain filesystem-unfriendly chars). */
export function virtualMountCacheKey(absPath: string): string {
  const h = createHash("sha1").update(absPath).digest("hex").slice(0, 16);
  return `vm-${h}`;
}

function cacheFilePath(cacheKey: string): string {
  return join(ACTIVITY_CACHE_DIR, `${cacheKey}.json`);
}

export async function loadCache(cacheKey: string): Promise<DeviceActivityCache | null> {
  const path = cacheFilePath(cacheKey);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as DeviceActivityCache;
    if (!parsed.cacheKey || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function persistCache(cache: DeviceActivityCache): Promise<void> {
  await mkdir(ACTIVITY_CACHE_DIR, { recursive: true });
  const target = cacheFilePath(cache.cacheKey);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await rename(tmp, target);
}

/** Re-scan the logs directory, reusing cached entries whose source file mtime
 *  hasn't changed. Writes the updated cache to disk and returns a summary. */
export async function refreshCache(
  cacheKey: string,
  logsDir: string,
): Promise<RefreshSummary> {
  const existing = await loadCache(cacheKey);
  const errors: { sourceFile: string; reason: string }[] = [];

  const refs = await enumerateLrtlFiles(logsDir);
  const refBySourceFile = new Map(refs.map((r) => [r.sourceFile, r]));

  // Reuse cached entries whose source file is still present with matching mtime.
  const reused: ActivityEntry[] = [];
  const cachedBySource = new Map<string, ActivityEntry>(
    (existing?.entries ?? []).map((e) => [e.sourceFile, e]),
  );
  let dropped = 0;
  for (const cached of existing?.entries ?? []) {
    const ref = refBySourceFile.get(cached.sourceFile);
    if (ref && ref.mtimeMs === cached.sourceMtimeMs) {
      reused.push(cached);
    } else {
      dropped++;
    }
  }

  const reusedSourceFiles = new Set(reused.map((e) => e.sourceFile));

  // Parse only the new or changed refs.
  let parsedCount = 0;
  const parsedEntries: ActivityEntry[] = [];
  for (const ref of refs) {
    if (reusedSourceFiles.has(ref.sourceFile)) continue;
    const entry = await parseLrtl(ref, errors);
    if (entry) {
      parsedEntries.push(entry);
      parsedCount++;
      // If this replaces an existing cached entry, that's already counted in `dropped`.
      if (cachedBySource.has(ref.sourceFile)) dropped--;
    }
  }

  const entries = [...reused, ...parsedEntries];
  const scannedAt = new Date().toISOString();
  await persistCache({ cacheKey, scannedAt, logsDir, entries });

  return {
    cacheKey,
    scannedAt,
    totalEntries: entries.length,
    reused: reused.length,
    parsed: parsedCount,
    dropped: Math.max(0, dropped),
    errors,
  };
}

/** List every cache file currently on disk. Used by the activity read endpoint. */
export async function listAllCaches(): Promise<DeviceActivityCache[]> {
  if (!existsSync(ACTIVITY_CACHE_DIR)) return [];
  let names: string[];
  try {
    names = await readdir(ACTIVITY_CACHE_DIR);
  } catch {
    return [];
  }
  const out: DeviceActivityCache[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const key = name.slice(0, -".json".length);
    const cache = await loadCache(key);
    if (cache) out.push(cache);
  }
  return out;
}
