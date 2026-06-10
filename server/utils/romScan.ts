import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { normalizeGameName } from "./retroarchActivity";

/** A physical ROM file discovered on a library's disk. This is the "RomFile"
 *  entity from the design doc: the physical fact, not the user-facing game.
 *  CRC32/SHA1 are intentionally absent — hashing multi-GB ROMs is lazy and
 *  explicit (Pi Zero constraint), not part of the cheap filename scan. */
export interface RomFileRecord {
  /** Join key shared with the activity feature: lowercased, tag-stripped title. */
  gameKey: string;
  /** Title with region/revision tags stripped, e.g. "Pokemon Emerald". */
  displayName: string;
  /** Canonical system key (folder-independent), e.g. "gba". */
  systemKey: string;
  /** Human-friendly system name, e.g. "Game Boy Advance". */
  system: string;
  /** Filename including extension, e.g. "Pokemon Emerald (USA).gba". */
  filename: string;
  /** Forward-slash path relative to the library root (e.g. "gba/Pokemon...gba"). */
  relPath: string;
  sizeBytes: number;
  /** Region tags parsed from parenthetical groups, e.g. ["USA"]. */
  regionTags: string[];
  /** Language codes parsed from parenthetical groups, e.g. ["En","Fr"]. */
  languages: string[];
  /** Revision string parsed from filename, e.g. "Rev 1" or "v1.1". */
  revision?: string;
  /** Bracketed dump flags, e.g. ["!"] or ["b"]. */
  flags: string[];
  /** Lowercased file extension including the dot, e.g. ".gba". */
  extension: string;
  /** mtime in ms — used by the cache layer for incremental refresh. */
  sourceMtimeMs: number;
}

export interface RomScanResult {
  files: RomFileRecord[];
  /** Files/folders we attempted but had to skip, with the reason. */
  errors: { sourceFile: string; reason: string }[];
}

export interface SystemInfo {
  /** Canonical, stable key. */
  key: string;
  /** Human-friendly name shown in the UI. */
  display: string;
  /** Lowercased folder names that map to this system across launchers. */
  folderAliases: string[];
  /** Lowercased extensions (with dot) that count as a ROM for this system. */
  extensions: string[];
}

/** Folder-name → system catalog. Aliases cover the common RetroArch and
 *  handheld-stock layouts (gba / GBA / gameboyadvance, etc.). Extensions are
 *  per-system so we don't pick up cover art, saves, or BIOS files. */
export const SYSTEMS: SystemInfo[] = [
  { key: "gb", display: "Game Boy", folderAliases: ["gb", "gameboy"], extensions: [".gb"] },
  { key: "gbc", display: "Game Boy Color", folderAliases: ["gbc", "gameboycolor"], extensions: [".gbc"] },
  {
    key: "gba",
    display: "Game Boy Advance",
    folderAliases: ["gba", "gameboyadvance"],
    extensions: [".gba"],
  },
  {
    key: "nes",
    display: "NES",
    folderAliases: ["nes", "fc", "famicom", "entertainmentsystem", "nintendoentertainmentsystem"],
    extensions: [".nes", ".fds", ".unf", ".unif"],
  },
  {
    key: "snes",
    display: "SNES",
    folderAliases: ["snes", "sfc", "superfamicom", "supernintendo", "supernintendoentertainmentsystem"],
    extensions: [".smc", ".sfc", ".swc", ".fig"],
  },
  { key: "n64", display: "Nintendo 64", folderAliases: ["n64", "nintendo64"], extensions: [".z64", ".n64", ".v64"] },
  { key: "nds", display: "Nintendo DS", folderAliases: ["nds", "ds", "nintendods"], extensions: [".nds"] },
  { key: "3ds", display: "Nintendo 3DS", folderAliases: ["3ds", "n3ds", "nintendo3ds"], extensions: [".3ds", ".cia"] },
  {
    key: "genesis",
    display: "Sega Genesis",
    folderAliases: ["genesis", "megadrive", "md", "gen", "megadrivegenesis"],
    extensions: [".gen", ".md", ".smd", ".bin"],
  },
  {
    key: "sms",
    display: "Sega Master System",
    folderAliases: ["sms", "mastersystem", "mastersystemmarkiii"],
    extensions: [".sms"],
  },
  { key: "gg", display: "Game Gear", folderAliases: ["gg", "gamegear"], extensions: [".gg"] },
  {
    key: "saturn",
    display: "Sega Saturn",
    folderAliases: ["saturn", "ss"],
    extensions: [".cue", ".chd", ".iso", ".bin"],
  },
  {
    key: "dreamcast",
    display: "Sega Dreamcast",
    folderAliases: ["dreamcast", "dc"],
    extensions: [".cue", ".chd", ".gdi", ".cdi"],
  },
  {
    key: "psx",
    display: "PlayStation",
    folderAliases: ["psx", "ps1", "playstation", "psone"],
    extensions: [".cue", ".chd", ".pbp", ".iso", ".img", ".bin"],
  },
  {
    key: "psp",
    display: "PlayStation Portable",
    folderAliases: ["psp", "playstationportable"],
    extensions: [".iso", ".cso", ".pbp"],
  },
  {
    key: "pce",
    display: "PC Engine / TurboGrafx-16",
    folderAliases: [
      "pce", "pcengine", "tg16", "turbografx", "turbografx16",
      "pcengineturbografx16",
    ],
    extensions: [".pce", ".sgx", ".cue", ".chd"],
  },
  { key: "wonderswan", display: "WonderSwan", folderAliases: ["wonderswan", "ws", "wsc"], extensions: [".ws", ".wsc"] },
  {
    key: "ngp",
    display: "Neo Geo Pocket",
    folderAliases: ["ngp", "ngpc", "neogeopocket", "neogeopocketcolor"],
    extensions: [".ngp", ".ngc"],
  },
  { key: "atari2600", display: "Atari 2600", folderAliases: ["atari2600", "2600", "a2600"], extensions: [".a26", ".bin"] },
  { key: "atari7800", display: "Atari 7800", folderAliases: ["atari7800", "7800", "a7800"], extensions: [".a78"] },
  { key: "lynx", display: "Atari Lynx", folderAliases: ["lynx", "atarilynx"], extensions: [".lnx"] },
  { key: "colecovision", display: "ColecoVision", folderAliases: ["colecovision", "coleco"], extensions: [".col"] },
  { key: "arcade", display: "Arcade", folderAliases: ["arcade", "mame", "fbneo", "fba"], extensions: [".zip", ".7z"] },
];

/** Archive extensions accepted for any system (a zipped ROM is still a ROM). */
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar"]);

/** folderName(lowercased) → SystemInfo lookup, built once. */
const SYSTEM_BY_FOLDER = new Map<string, SystemInfo>();
for (const s of SYSTEMS) {
  for (const alias of s.folderAliases) SYSTEM_BY_FOLDER.set(alias, s);
}

/** Resolve a top-level folder name to a known system, or null if unrecognized.
 *  Match is case-insensitive and ignores spaces/underscores/dashes so
 *  "Game Boy Advance" and "game_boy_advance" both hit "gameboyadvance". */
export function systemForFolder(folderName: string): SystemInfo | null {
  const norm = folderName.toLowerCase().replace(/[\s_-]+/g, "");
  const direct = SYSTEM_BY_FOLDER.get(norm);
  if (direct) return direct;
  // Fallback: drop a leading manufacturer token and retry, so playlist-style
  // names like "Nintendo - Game Boy Advance" or "Sony PlayStation" resolve even
  // when only the bare form ("gameboyadvance") is in the alias table.
  const stripped = norm.replace(MANUFACTURER_PREFIX_RE, "");
  if (stripped && stripped !== norm) {
    const m = SYSTEM_BY_FOLDER.get(stripped);
    if (m) return m;
  }
  return null;
}

const MANUFACTURER_PREFIX_RE =
  /^(nintendo|sega|sony|nec|atari|bandai|snk|coleco|microsoft)/;

/** Lowercased extension (with dot) of a filename, or "" if none. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

/** Known region tokens seen in No-Intro / Redump parenthetical groups. */
const REGION_TOKENS = new Set([
  "usa", "europe", "japan", "world", "asia", "australia", "korea", "china",
  "brazil", "canada", "france", "germany", "italy", "spain", "sweden",
  "netherlands", "uk", "us", "eur", "jpn", "jp", "ntsc", "pal", "ntsc-u",
  "ntsc-j", "u", "e", "j",
]);

/** Two-letter language codes commonly listed like "(En,Fr,De,Es,It)". */
const LANGUAGE_TOKENS = new Set([
  "en", "fr", "de", "es", "it", "ja", "nl", "pt", "sv", "no", "da", "fi",
  "pl", "ru", "ko", "zh", "cs", "hu", "el", "tr",
]);

/** Pull every `(...)` group and every `[...]` group out of a base filename
 *  (extension already removed). Returns the leading title plus the raw groups. */
function splitTags(base: string): { title: string; parens: string[]; brackets: string[] } {
  const parens: string[] = [];
  const brackets: string[] = [];
  for (const m of base.matchAll(/\(([^)]*)\)/g)) parens.push(m[1].trim());
  for (const m of base.matchAll(/\[([^\]]*)\]/g)) brackets.push(m[1].trim());
  // Title is everything before the first tag of either kind.
  const firstParen = base.indexOf("(");
  const firstBracket = base.indexOf("[");
  let cut = base.length;
  if (firstParen >= 0) cut = Math.min(cut, firstParen);
  if (firstBracket >= 0) cut = Math.min(cut, firstBracket);
  const title = base.slice(0, cut).trim();
  return { title: title || base.trim(), parens, brackets };
}

interface ParsedName {
  displayName: string;
  regionTags: string[];
  languages: string[];
  revision?: string;
  flags: string[];
}

/** Parse a No-Intro-style filename (sans extension handled by caller) into its
 *  display title plus region/language/revision/flag metadata. Tolerant: an
 *  unrecognized parenthetical is ignored rather than rejected. */
export function parseRomFilename(filename: string): ParsedName {
  const ext = extensionOf(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const { title, parens, brackets } = splitTags(base);

  const regionTags: string[] = [];
  const languages: string[] = [];
  let revision: string | undefined;

  for (const group of parens) {
    const lower = group.toLowerCase();
    // Revision: "Rev 1", "Rev A", "v1.1".
    const revMatch = /^(rev\s+\S+|v[\d.]+)$/i.exec(group);
    if (revMatch) {
      revision = group;
      continue;
    }
    // Comma-separated language list, e.g. "En,Fr,De".
    const parts = group.split(",").map((p) => p.trim());
    if (parts.length > 1 && parts.every((p) => LANGUAGE_TOKENS.has(p.toLowerCase()))) {
      for (const p of parts) if (!languages.includes(p)) languages.push(p);
      continue;
    }
    // Single region/locale token.
    if (REGION_TOKENS.has(lower)) {
      if (!regionTags.includes(group)) regionTags.push(group);
      continue;
    }
    // A bare single language code on its own.
    if (LANGUAGE_TOKENS.has(lower) && !languages.includes(group)) {
      languages.push(group);
      continue;
    }
    // Anything else (e.g. "Beta", publisher) is treated as a region-ish tag
    // so it survives round-trip into the UI without being silently dropped.
    if (!regionTags.includes(group)) regionTags.push(group);
  }

  return {
    displayName: title,
    regionTags,
    languages,
    revision,
    flags: brackets,
  };
}

/** Lightweight reference to a candidate ROM file, produced without reading
 *  contents — cheap enough to enumerate every scan for the mtime-skip cache. */
export interface RomFileRef {
  systemKey: string;
  system: string;
  filename: string;
  absPath: string;
  /** Forward-slash path relative to the library root. */
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
}

/** Walk `<romsRoot>/<systemFolder>/*` one level deep (plus one nested level for
 *  multi-file disc games), statting every file. Only files under a recognized
 *  system folder with a system-appropriate extension are returned. */
export async function enumerateRomFiles(romsRoot: string): Promise<RomFileRef[]> {
  let topEntries;
  try {
    topEntries = await readdir(romsRoot, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read ROM library root "${romsRoot}": ${(err as Error).message}`);
  }

  const out: RomFileRef[] = [];
  for (const top of topEntries) {
    if (!top.isDirectory()) continue;
    const system = systemForFolder(top.name);
    if (!system) continue;
    const systemAbs = join(romsRoot, top.name);
    const allowedExt = new Set(system.extensions);
    await collectInto(systemAbs, top.name, system, allowedExt, out, 0);
  }
  return out;
}

/** Recurse into a system folder collecting ROM files. Depth-capped at 1 nested
 *  level so a "Game (USA)/disc1.cue" layout works without walking deep trees. */
async function collectInto(
  dirAbs: string,
  dirRel: string,
  system: SystemInfo,
  allowedExt: Set<string>,
  out: RomFileRef[],
  depth: number,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    // Skip dotfiles: macOS AppleDouble twins ("._Game.gba") share the ROM's
    // extension and would otherwise collapse into the real game as a phantom
    // variant, and ".DS_Store"/".Trashes" etc. are never ROMs.
    if (e.name.startsWith(".")) continue;
    const abs = join(dirAbs, e.name);
    const rel = `${dirRel}/${e.name}`;
    if (e.isDirectory()) {
      if (depth < 1) await collectInto(abs, rel, system, allowedExt, out, depth + 1);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = extensionOf(e.name);
    if (!allowedExt.has(ext) && !ARCHIVE_EXTENSIONS.has(ext)) continue;
    let s;
    try {
      s = await stat(abs);
    } catch {
      continue;
    }
    out.push({
      systemKey: system.key,
      system: system.display,
      filename: e.name,
      absPath: abs,
      relPath: rel,
      sizeBytes: s.size,
      mtimeMs: s.mtimeMs,
    });
  }
}

/** Turn a cheap ref into a full record by parsing its filename. Never reads
 *  file contents — no hashing happens here. */
export function recordFromRef(ref: RomFileRef): RomFileRecord {
  const parsed = parseRomFilename(ref.filename);
  return {
    gameKey: normalizeGameName(parsed.displayName),
    displayName: parsed.displayName,
    systemKey: ref.systemKey,
    system: ref.system,
    filename: ref.filename,
    relPath: ref.relPath,
    sizeBytes: ref.sizeBytes,
    regionTags: parsed.regionTags,
    languages: parsed.languages,
    revision: parsed.revision,
    flags: parsed.flags,
    extension: extensionOf(ref.filename),
    sourceMtimeMs: ref.mtimeMs,
  };
}

/** Full scan with no prior cache: enumerate and parse every ROM file. */
export async function scanRomsRoot(romsRoot: string): Promise<RomScanResult> {
  const errors: { sourceFile: string; reason: string }[] = [];
  const refs = await enumerateRomFiles(romsRoot);
  const files: RomFileRecord[] = [];
  for (const ref of refs) {
    const rec = recordFromRef(ref);
    if (!rec.gameKey) {
      errors.push({ sourceFile: ref.relPath, reason: "empty normalized game name" });
      continue;
    }
    files.push(rec);
  }
  return { files, errors };
}
