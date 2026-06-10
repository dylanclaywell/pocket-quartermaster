import { existsSync } from "node:fs";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("pocket-quartermaster", { suffix: "" });
export const THUMBNAILS_DIR = join(paths.config, "thumbnails");
export const THUMBNAIL_INDEX_DIR = join(paths.config, "thumbnails-index");

const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/** Map a Content-Type header to the file extension we'll store the image as. */
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Default cap for downloaded images. Box art is rarely above ~500 KB; 5 MB
 *  gives a comfortable margin without letting one image fill the disk. */
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** Coerce a normalizedName into a filesystem-safe basename. We don't expect
 *  unsafe chars (normalizedName already strips them) but defend in depth. */
export function safeBaseName(normalizedName: string): string {
  return normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Resolve the on-disk path for a thumbnail by trying each supported extension. */
export async function findThumbnailPath(
  normalizedName: string,
): Promise<{ absPath: string; ext: string; mime: string } | null> {
  const base = safeBaseName(normalizedName);
  if (!base) return null;
  if (!existsSync(THUMBNAILS_DIR)) return null;
  let names: string[];
  try {
    names = await readdir(THUMBNAILS_DIR);
  } catch {
    return null;
  }
  // Filename has the form `<base><ext>`. Match on exact base + supported ext.
  for (const name of names) {
    const ext = extname(name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
      continue;
    }
    if (name.slice(0, name.length - ext.length).toLowerCase() === base) {
      return { absPath: join(THUMBNAILS_DIR, name), ext, mime: MIME_BY_EXT[ext] ?? "image/png" };
    }
  }
  return null;
}

/** True iff a cached thumbnail exists for the given game. */
export async function hasThumbnail(normalizedName: string): Promise<boolean> {
  return (await findThumbnailPath(normalizedName)) !== null;
}

/** All cached thumbnail base names (lower-cased, no extension), read in one
 *  directory pass. Use this to test many games at once — calling hasThumbnail()
 *  per game re-reads the whole directory each time (O(n²) on large libraries). */
export async function thumbnailBaseSet(): Promise<Set<string>> {
  const set = new Set<string>();
  if (!existsSync(THUMBNAILS_DIR)) return set;
  let names: string[];
  try {
    names = await readdir(THUMBNAILS_DIR);
  } catch {
    return set;
  }
  for (const name of names) {
    const ext = extname(name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) continue;
    set.add(name.slice(0, name.length - ext.length).toLowerCase());
  }
  return set;
}

/** Save raw image bytes for the given normalizedName. If a thumbnail already
 *  exists under a different extension, remove the old one first. */
export async function saveThumbnail(
  normalizedName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ absPath: string; ext: string }> {
  const base = safeBaseName(normalizedName);
  if (!base) {
    throw new Error("normalizedName is empty after sanitization");
  }
  const ext = CONTENT_TYPE_TO_EXT[contentType.toLowerCase().split(";")[0].trim()];
  if (!ext) {
    throw new Error(`unsupported content type: ${contentType}`);
  }
  await mkdir(THUMBNAILS_DIR, { recursive: true });
  // Remove any existing thumbnail under a different extension before writing.
  const existing = await findThumbnailPath(normalizedName);
  if (existing) {
    try {
      await unlink(existing.absPath);
    } catch {
      // best-effort
    }
  }
  const target = join(THUMBNAILS_DIR, `${base}${ext}`);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
  return { absPath: target, ext };
}

/** Remove the cached thumbnail for a game, if any. Returns true if a file was
 *  actually deleted. */
export async function deleteThumbnail(normalizedName: string): Promise<boolean> {
  const existing = await findThumbnailPath(normalizedName);
  if (!existing) return false;
  try {
    await unlink(existing.absPath);
    return true;
  } catch {
    return false;
  }
}

/** Read on-disk mtime for the cached thumbnail (used by callers that want to
 *  set Last-Modified / ETag headers). */
export async function thumbnailMtimeMs(normalizedName: string): Promise<number | null> {
  const existing = await findThumbnailPath(normalizedName);
  if (!existing) return null;
  try {
    return (await stat(existing.absPath)).mtimeMs;
  } catch {
    return null;
  }
}
