import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../utils/storage";
import { virtualMountCacheKey } from "../../utils/activityCache";
import { romVirtualMountCacheKey } from "../../utils/romLibraryCache";

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const entries = await Promise.all(
    cfg.virtualMounts.map(async (v) => {
      let exists = false;
      let isDirectory = false;
      if (existsSync(v.path)) {
        try {
          const s = await stat(v.path);
          exists = true;
          isDirectory = s.isDirectory();
        } catch {
          // ignore
        }
      }
      return {
        ...v,
        exists,
        isDirectory,
        activityCacheKey: virtualMountCacheKey(resolve(v.path)),
        romsCacheKey: romVirtualMountCacheKey(resolve(v.path)),
      };
    }),
  );
  return { virtualMounts: entries };
});
