import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import envPaths from "env-paths";
import { enumerateRomFiles, recordFromRef, type RomFileRecord } from "./romScan";

const paths = envPaths("pocket-quartermaster", { suffix: "" });
export const ROM_LIBRARY_CACHE_DIR = join(paths.config, "rom-library-cache");

export interface RomLibraryCache {
  cacheKey: string;
  /** ISO timestamp of when this cache was last refreshed. */
  scannedAt: string;
  /** Absolute path of the library root we scanned (recorded for debugging). */
  romsRoot: string;
  files: RomFileRecord[];
}

export interface RomRefreshSummary {
  cacheKey: string;
  scannedAt: string;
  totalFiles: number;
  reused: number;
  parsed: number;
  dropped: number;
  errors: { sourceFile: string; reason: string }[];
}

/** Cache key for a real device's ROM library (by stable UUID). Distinct prefix
 *  from the activity cache keys so the two never collide. */
export function romDeviceCacheKey(deviceId: string): string {
  return `romdev-${deviceId}`;
}

/** Cache key for a virtual mount's ROM library (path-hashed). */
export function romVirtualMountCacheKey(absPath: string): string {
  const h = createHash("sha1").update(absPath).digest("hex").slice(0, 16);
  return `romvm-${h}`;
}

function cacheFilePath(cacheKey: string): string {
  return join(ROM_LIBRARY_CACHE_DIR, `${cacheKey}.json`);
}

export async function loadRomCache(cacheKey: string): Promise<RomLibraryCache | null> {
  const path = cacheFilePath(cacheKey);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as RomLibraryCache;
    if (!parsed.cacheKey || !Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function persistCache(cache: RomLibraryCache): Promise<void> {
  await mkdir(ROM_LIBRARY_CACHE_DIR, { recursive: true });
  const target = cacheFilePath(cache.cacheKey);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await rename(tmp, target);
}

/** Re-scan the library root, reusing cached records whose source file mtime is
 *  unchanged. Writes the updated cache and returns a summary. Filename parsing
 *  is cheap; this exists so multi-thousand-file libraries don't re-stat-and-parse
 *  unchanged entries every time, matching the activity cache's behavior. */
export async function refreshRomCache(
  cacheKey: string,
  romsRoot: string,
): Promise<RomRefreshSummary> {
  const existing = await loadRomCache(cacheKey);
  const errors: { sourceFile: string; reason: string }[] = [];

  const refs = await enumerateRomFiles(romsRoot);
  const refByRelPath = new Map(refs.map((r) => [r.relPath, r]));

  const reused: RomFileRecord[] = [];
  const cachedByRelPath = new Map<string, RomFileRecord>(
    (existing?.files ?? []).map((f) => [f.relPath, f]),
  );
  let dropped = 0;
  for (const cached of existing?.files ?? []) {
    const ref = refByRelPath.get(cached.relPath);
    if (ref && ref.mtimeMs === cached.sourceMtimeMs) {
      reused.push(cached);
    } else {
      dropped++;
    }
  }

  const reusedRelPaths = new Set(reused.map((f) => f.relPath));

  let parsedCount = 0;
  const parsedFiles: RomFileRecord[] = [];
  for (const ref of refs) {
    if (reusedRelPaths.has(ref.relPath)) continue;
    const rec = recordFromRef(ref);
    if (!rec.gameKey) {
      errors.push({ sourceFile: ref.relPath, reason: "empty normalized game name" });
      continue;
    }
    parsedFiles.push(rec);
    parsedCount++;
    if (cachedByRelPath.has(ref.relPath)) dropped--;
  }

  const files = [...reused, ...parsedFiles];
  const scannedAt = new Date().toISOString();
  await persistCache({ cacheKey, scannedAt, romsRoot, files });

  return {
    cacheKey,
    scannedAt,
    totalFiles: files.length,
    reused: reused.length,
    parsed: parsedCount,
    dropped: Math.max(0, dropped),
    errors,
  };
}

/** List every ROM-library cache file currently on disk. */
export async function listAllRomCaches(): Promise<RomLibraryCache[]> {
  if (!existsSync(ROM_LIBRARY_CACHE_DIR)) return [];
  let names: string[];
  try {
    names = await readdir(ROM_LIBRARY_CACHE_DIR);
  } catch {
    return [];
  }
  const out: RomLibraryCache[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const key = name.slice(0, -".json".length);
    const cache = await loadRomCache(key);
    if (cache) out.push(cache);
  }
  return out;
}
