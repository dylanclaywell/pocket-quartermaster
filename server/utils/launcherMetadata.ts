import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { ConfigFile, LauncherKind } from "./types";
import { romDeviceCacheKey, romVirtualMountCacheKey } from "./romLibraryCache";

/** One game's clean name to assert into a destination's launcher metadata.
 *  `systemKey` is the immediate ROM subfolder (e.g. "gba"); `filename` is the
 *  canonical name on disk; `displayName` is what the launcher should show. */
export interface MetadataEntry {
  systemKey: string;
  filename: string;
  displayName: string;
}

/** Per-system outcome of a metadata write. `written` counts entries actually
 *  added or whose name changed (a no-op re-sync reports 0). */
export interface MetadataWriteResult {
  systemKey: string;
  ok: boolean;
  written: number;
  total: number;
  error?: string;
}

/** Absolute path of a subfolder inside a destination's ES-DE data directory
 *  (e.g. "gamelists", "downloaded_media"), or undefined when the destination
 *  isn't mounted or its ES-DE folder isn't set. */
export function esDeSubdir(
  dest: { mountPath?: string; esDeRootRelPath?: string },
  ...sub: string[]
): string | undefined {
  if (!dest.mountPath || !dest.esDeRootRelPath) return undefined;
  return join(dest.mountPath, dest.esDeRootRelPath.split("/").join(sep), ...sub);
}

/** Resolve the on-disk root a launcher's metadata should be written under for a
 *  destination. ES-DE keeps gamelists in its own data dir (not the ROM tree),
 *  under `<ES-DE root>/gamelists`; other launchers write off the mount root.
 *  Returns a `reason` instead of a `root` when not writable yet. */
export function metadataTargetRoot(
  kind: LauncherKind,
  dest: { mountPath?: string; esDeRootRelPath?: string; muosRootRelPath?: string },
): { root?: string; reason?: string } {
  if (!dest.mountPath) return { reason: "destination is not mounted" };
  if (kind === "es-de") {
    const root = esDeSubdir(dest, "gamelists");
    if (!root) return { reason: "ES-DE folder is not set on this destination" };
    return { root };
  }
  // muOS reads names + art under <MUOS>/info; the writer keys off that dir.
  if (!dest.muosRootRelPath) return { reason: "muOS folder is not set on this destination" };
  return { root: join(dest.mountPath, dest.muosRootRelPath.split("/").join(sep), "info") };
}

/** Resolve a destination's launcher from its ROM cache key, scanning both
 *  devices and virtual mounts. Returns undefined when none is set. */
export function launcherKindForCacheKey(
  cfg: ConfigFile,
  cacheKey: string,
): LauncherKind | undefined {
  for (const dev of cfg.devices) {
    if (romDeviceCacheKey(dev.id) === cacheKey) return dev.launcherKind;
  }
  for (const vm of cfg.virtualMounts) {
    if (romVirtualMountCacheKey(resolve(vm.path)) === cacheKey) return vm.launcherKind;
  }
  return undefined;
}

/** Write clean display names into a destination's launcher metadata, grouped by
 *  system. Merges into existing files — only the games in `entries` are touched;
 *  everything else (other games, scraped fields) is preserved. */
export async function writeLauncherMetadata(
  kind: LauncherKind,
  destRoot: string,
  entries: MetadataEntry[],
): Promise<MetadataWriteResult[]> {
  if (kind === "es-de") return writeEsDe(destRoot, entries);
  return writeMuos(destRoot, entries);
}

/** Group entries by their system folder, preserving first-seen order. */
function bySystem(entries: MetadataEntry[]): [string, MetadataEntry[]][] {
  const map = new Map<string, MetadataEntry[]>();
  for (const e of entries) {
    const arr = map.get(e.systemKey) ?? [];
    arr.push(e);
    map.set(e.systemKey, arr);
  }
  return [...map.entries()];
}

// ES-DE writes one gamelist.xml per system folder. With its
// LegacyGamelistFileLocation setting enabled, that file lives at
// <romsRoot>/<system>/gamelist.xml — exactly the destination root this app
// already targets. Root element is <gameList>, each <game> carries a <path>
// (relative to the system folder, leading "./") and a <name>.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // A single <game> would otherwise parse to an object, not an array.
  isArray: (name) => name === "game",
  // Names like "F-1 Race" must stay strings, never become numbers/booleans.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "  ",
  suppressEmptyNode: true,
});

interface EsDeGame {
  path?: string;
  name?: string;
  [field: string]: unknown;
}

/** A ROM filename matches a <path> tag when their basenames agree, ignoring a
 *  leading "./" and slash direction. */
function pathMatches(pathTag: unknown, filename: string): boolean {
  if (typeof pathTag !== "string") return false;
  const base = pathTag.replace(/^\.\//, "").split(/[\\/]/).pop() ?? "";
  return base === filename;
}

async function writeEsDe(
  destRoot: string,
  entries: MetadataEntry[],
): Promise<MetadataWriteResult[]> {
  const results: MetadataWriteResult[] = [];
  for (const [systemKey, list] of bySystem(entries)) {
    const file = join(destRoot, systemKey.split("/").join(sep), "gamelist.xml");
    try {
      const written = await upsertEsDeGamelist(file, list);
      results.push({ systemKey, ok: true, written, total: list.length });
    } catch (err) {
      results.push({
        systemKey,
        ok: false,
        written: 0,
        total: list.length,
        error: (err as Error).message,
      });
    }
  }
  return results;
}

/** Read (if present), upsert each entry's name, and write back one system's
 *  gamelist.xml atomically. Returns how many entries were added or changed. */
async function upsertEsDeGamelist(
  file: string,
  entries: MetadataEntry[],
): Promise<number> {
  let games: EsDeGame[] = [];
  if (existsSync(file)) {
    const raw = await readFile(file, "utf8");
    const doc = parser.parse(raw) as { gameList?: { game?: EsDeGame[] } };
    if (doc.gameList?.game) games = doc.gameList.game;
  }

  let written = 0;
  for (const e of entries) {
    const existing = games.find((g) => pathMatches(g.path, e.filename));
    if (!existing) {
      games.push({ path: `./${e.filename}`, name: e.displayName });
      written++;
    } else if (existing.name !== e.displayName) {
      existing.name = e.displayName;
      written++;
    }
  }

  if (written === 0 && existsSync(file)) return 0;

  const body = builder.build({ gameList: { game: games } });
  const xml = `<?xml version="1.0"?>\n${body}`;
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, xml, "utf8");
  await rename(tmp, file);
  return written;
}

// muOS resolves a game's display name from <MUOS>/info/name/<content-dir>.json,
// falling back to name/global.json — a flat JSON object keyed by the lowercased
// ROM filename without extension (confirmed in muxshare.c: resolve_friendly_name).
// We write global.json so it applies regardless of the device's folder names.
// The value is read directly at runtime, so no lookup-table generation is needed.

async function writeMuos(
  infoRoot: string,
  entries: MetadataEntry[],
): Promise<MetadataWriteResult[]> {
  const file = join(infoRoot, "name", "global.json");

  let names: Record<string, string> = {};
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        names = parsed as Record<string, string>;
      }
    } catch {
      // Malformed file — start fresh rather than throw.
    }
  }

  let written = 0;
  for (const e of entries) {
    const key = basename(e.filename, extname(e.filename)).toLowerCase();
    if (!key) continue;
    if (names[key] !== e.displayName) {
      names[key] = e.displayName;
      written++;
    }
  }

  const result: MetadataWriteResult = {
    systemKey: "names",
    ok: true,
    written,
    total: entries.length,
  };

  if (written === 0 && existsSync(file)) return [result];

  try {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(names, null, 2)}\n`, "utf8");
    await rename(tmp, file);
  } catch (err) {
    return [{ ...result, ok: false, written: 0, error: (err as Error).message }];
  }
  return [result];
}
