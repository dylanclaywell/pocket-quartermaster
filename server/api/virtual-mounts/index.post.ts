import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { isVirtualMountManagementEnabled } from "../../utils/runtime";
import { loadConfig, saveConfig } from "../../utils/storage";
import type { VirtualMount } from "../../utils/types";

export default defineEventHandler(async (event) => {
  if (!isVirtualMountManagementEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Adding virtual mounts is disabled in production. Set PQM_ALLOW_VIRTUAL_MOUNTS=1 to override.",
    });
  }
  const body = await readBody<{ path?: string; label?: string }>(event);
  const raw = body?.path?.trim();
  if (!raw) throw createError({ statusCode: 400, statusMessage: "path required" });
  const path = resolve(raw);

  if (!existsSync(path)) {
    throw createError({ statusCode: 400, statusMessage: `path does not exist: ${path}` });
  }
  const s = await stat(path);
  if (!s.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: `path is not a directory: ${path}` });
  }

  const cfg = await loadConfig();
  if (cfg.virtualMounts.some((v) => v.path === path)) {
    throw createError({ statusCode: 409, statusMessage: "virtual mount already exists" });
  }
  const entry: VirtualMount = {
    path,
    label: body?.label?.trim() || undefined,
    addedAt: new Date().toISOString(),
  };
  cfg.virtualMounts.push(entry);
  await saveConfig(cfg);
  return { virtualMount: entry };
});
