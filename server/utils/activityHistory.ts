import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("pocket-quartermaster", { suffix: "" });
export const ACTIVITY_HISTORY_DIR = join(paths.config, "activity-history");

/** One point-in-time reading of a source's cumulative playtime, appended on
 *  every scan. Diffing successive snapshots yields per-day playtime deltas —
 *  the only way to derive trends, since `.lrtl` stores cumulative runtime only. */
export interface RuntimeSnapshot {
  /** ISO timestamp of the scan that produced this snapshot. */
  at: string;
  /** Σ cumulative runtime (seconds) across every game on this source. */
  totalSeconds: number;
  /** normalizedName → cumulative runtimeSeconds. Kept so per-game trends are
   *  possible later; a few hundred small ints, negligible on disk. */
  games: Record<string, number>;
}

function historyFilePath(cacheKey: string): string {
  return join(ACTIVITY_HISTORY_DIR, `${cacheKey}.jsonl`);
}

/** Append one snapshot line to a source's history. JSONL means a single append
 *  with no full-file rewrite, so this stays cheap on the scan hot path. */
export async function appendSnapshot(
  cacheKey: string,
  snapshot: RuntimeSnapshot,
): Promise<void> {
  await mkdir(ACTIVITY_HISTORY_DIR, { recursive: true });
  await appendFile(historyFilePath(cacheKey), `${JSON.stringify(snapshot)}\n`, "utf8");
}

/** Read every snapshot for a source, oldest line first. Malformed lines are
 *  skipped rather than failing the whole read. */
export async function loadHistory(cacheKey: string): Promise<RuntimeSnapshot[]> {
  const path = historyFilePath(cacheKey);
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out: RuntimeSnapshot[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RuntimeSnapshot;
      if (typeof parsed.at === "string" && typeof parsed.totalSeconds === "number") {
        out.push(parsed);
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/** List the cache keys that have a history file on disk. */
export async function listHistoryKeys(): Promise<string[]> {
  if (!existsSync(ACTIVITY_HISTORY_DIR)) return [];
  try {
    const names = await readdir(ACTIVITY_HISTORY_DIR);
    return names
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => n.slice(0, -".jsonl".length));
  } catch {
    return [];
  }
}
