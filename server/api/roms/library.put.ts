import { resolve } from "node:path";
import { loadConfig, saveConfig } from "../../utils/storage";
import { romDeviceCacheKey, romVirtualMountCacheKey } from "../../utils/romLibraryCache";

/** Designate which ROM-configured source is the canonical library. Every other
 *  ROM-configured source becomes a destination automatically. Pass null/"" to
 *  clear the designation. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ sourceCacheKey?: string | null }>(event);
  const key = body?.sourceCacheKey;

  const cfg = await loadConfig();

  if (key === null || key === undefined || key === "") {
    delete cfg.romLibrarySourceKey;
  } else {
    const configured = new Set<string>();
    for (const d of cfg.devices) if (d.romsRootRelPath) configured.add(romDeviceCacheKey(d.id));
    for (const v of cfg.virtualMounts) {
      if (v.romsRootRelPath) configured.add(romVirtualMountCacheKey(resolve(v.path)));
    }
    if (!configured.has(key)) {
      throw createError({
        statusCode: 400,
        statusMessage: "sourceCacheKey is not a ROM-configured source",
      });
    }
    cfg.romLibrarySourceKey = key;
  }

  await saveConfig(cfg);
  return { romLibrarySourceKey: cfg.romLibrarySourceKey ?? null };
});
