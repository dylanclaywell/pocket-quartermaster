import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { THUMBNAIL_INDEX_DIR } from "../../utils/thumbnails";

interface IndexEntry {
  filename: string;     // e.g. "Pokemon - Emerald Version (USA, Europe).png"
  /** Decoded display name — filename with the .png/.jpg stripped. */
  displayName: string;
  system: string;       // libretro db name
  downloadUrl: string;  // raw.githubusercontent.com URL
}

interface CachedIndex {
  system: string;
  fetchedAt: string;
  /** Default branch of the repo at fetch time — embedded in the download URL. */
  defaultBranch: string;
  entries: IndexEntry[];
}

interface GhTreeResponse {
  sha: string;
  url: string;
  tree: { path: string; type: string; size?: number }[];
  truncated?: boolean;
}

interface GhRepoResponse {
  default_branch: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESULTS_PER_SYSTEM = 20;

/** libretro-thumbnails repo names use `_` for spaces and `_-_` for dashes. */
function libretroDbNameToRepo(dbName: string): string {
  return dbName.replaceAll(" ", "_");
}

function indexPath(system: string): string {
  // Filenames safe-ify the repo identifier so we don't trip on weird chars.
  const safe = system.replace(/[^A-Za-z0-9_-]/g, "_");
  return join(THUMBNAIL_INDEX_DIR, `${safe}.json`);
}

async function loadIndexFromDisk(system: string): Promise<CachedIndex | null> {
  const path = indexPath(system);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CachedIndex;
  } catch {
    return null;
  }
}

async function persistIndex(index: CachedIndex): Promise<void> {
  await mkdir(THUMBNAIL_INDEX_DIR, { recursive: true });
  await writeFile(indexPath(index.system), JSON.stringify(index, null, 2), "utf8");
}

async function fetchRepoMeta(repo: string): Promise<{ defaultBranch: string }> {
  const res = await fetch(`https://api.github.com/repos/libretro-thumbnails/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "PocketQuartermaster-Thumbnail/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub repo meta returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as GhRepoResponse;
  return { defaultBranch: json.default_branch || "master" };
}

async function fetchTree(repo: string, branch: string): Promise<GhTreeResponse> {
  const res = await fetch(
    `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "PocketQuartermaster-Thumbnail/1.0",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub tree returned HTTP ${res.status}`);
  }
  return (await res.json()) as GhTreeResponse;
}

async function buildIndex(system: string): Promise<CachedIndex> {
  const repo = libretroDbNameToRepo(system);
  const { defaultBranch } = await fetchRepoMeta(repo);
  const tree = await fetchTree(repo, defaultBranch);
  const entries: IndexEntry[] = [];
  for (const node of tree.tree) {
    if (node.type !== "blob") continue;
    if (!node.path.startsWith("Named_Boxarts/")) continue;
    if (!/\.(png|jpe?g|webp)$/i.test(node.path)) continue;
    const filename = node.path.slice("Named_Boxarts/".length);
    const displayName = filename.replace(/\.(png|jpe?g|webp)$/i, "");
    entries.push({
      filename,
      displayName,
      system,
      downloadUrl: `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/${defaultBranch}/Named_Boxarts/${encodeURIComponent(
        filename,
      )}`,
    });
  }
  return {
    system,
    fetchedAt: new Date().toISOString(),
    defaultBranch,
    entries,
  };
}

async function getIndex(system: string): Promise<CachedIndex> {
  const cached = await loadIndexFromDisk(system);
  if (cached) {
    const age = Date.now() - Date.parse(cached.fetchedAt);
    if (age >= 0 && age < SEVEN_DAYS_MS) return cached;
  }
  // Cache miss or stale — rebuild. On failure, fall back to the stale cache
  // if we have one so transient GitHub errors don't break search entirely.
  try {
    const fresh = await buildIndex(system);
    await persistIndex(fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

/** Substring + token-aware match. Splits the query on whitespace and requires
 *  every token to appear in the entry's lowercased displayName. */
function matchScore(displayName: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = displayName.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx === -1) return -1;
    // Earlier match = higher score; shorter name with all tokens beats longer.
    score += 1000 - Math.min(idx, 999);
  }
  return score - displayName.length * 0.1;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { systems?: string; q?: string };
  const systemsRaw = query.systems?.toString().trim() ?? "";
  const q = query.q?.toString().trim().toLowerCase() ?? "";
  if (!systemsRaw) {
    throw createError({ statusCode: 400, statusMessage: "systems required" });
  }
  if (!q) return { results: [], systems: [] };

  const systems = systemsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const tokens = q.split(/\s+/).filter(Boolean);

  const matches: { entry: IndexEntry; score: number }[] = [];
  const sourcesQueried: { system: string; ok: boolean; reason?: string }[] = [];

  for (const system of systems) {
    let index: CachedIndex;
    try {
      index = await getIndex(system);
      sourcesQueried.push({ system, ok: true });
    } catch (err) {
      sourcesQueried.push({ system, ok: false, reason: (err as Error).message });
      continue;
    }
    for (const entry of index.entries) {
      const s = matchScore(entry.displayName, tokens);
      if (s >= 0) matches.push({ entry, score: s });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const results = matches.slice(0, MAX_RESULTS_PER_SYSTEM * systems.length).map((m) => m.entry);
  return { results, systems: sourcesQueried };
});
