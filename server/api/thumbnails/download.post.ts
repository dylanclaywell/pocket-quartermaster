import { MAX_THUMBNAIL_BYTES, saveThumbnail } from "../../utils/thumbnails";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default defineEventHandler(async (event) => {
  const body = await readBody<{ normalizedName?: string; sourceUrl?: string }>(event);
  const normalizedName = body?.normalizedName?.trim();
  const sourceUrl = body?.sourceUrl?.trim();
  if (!normalizedName) {
    throw createError({ statusCode: 400, statusMessage: "normalizedName required" });
  }
  if (!sourceUrl) {
    throw createError({ statusCode: 400, statusMessage: "sourceUrl required" });
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "sourceUrl is not a valid URL" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage: "sourceUrl must be http(s)",
    });
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "PocketQuartermaster-Thumbnail/1.0" },
    });
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `fetch failed: ${(err as Error).message}`,
    });
  }
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `remote returned HTTP ${response.status}`,
    });
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw createError({
      statusCode: 415,
      statusMessage: `unsupported content-type: ${contentType || "(none)"}`,
    });
  }

  // Stream into a single buffer with a hard cap. Box art is small; we don't
  // need true streaming, but we don't want to be tricked into pulling GBs either.
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_THUMBNAIL_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `image is too large (${contentLength} bytes, max ${MAX_THUMBNAIL_BYTES})`,
    });
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `image is too large (${bytes.byteLength} bytes, max ${MAX_THUMBNAIL_BYTES})`,
    });
  }

  const saved = await saveThumbnail(normalizedName, bytes, contentType);
  return {
    normalizedName,
    contentType,
    bytes: bytes.byteLength,
    ext: saved.ext,
  };
});
