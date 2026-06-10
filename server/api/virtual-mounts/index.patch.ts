import { resolve } from "node:path";
import { loadConfig, saveConfig } from "../../utils/storage";
import type { LauncherKind } from "../../utils/types";

const LAUNCHER_KINDS: LauncherKind[] = ["es-de", "muos"];

function normalizeRelPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    path?: string;
    label?: string | null;
    retroarchActivityDir?: string | null;
    romsRootRelPath?: string | null;
    launcherKind?: string | null;
    esDeRootRelPath?: string | null;
  }>(event);
  const raw = body?.path?.trim();
  if (!raw) throw createError({ statusCode: 400, statusMessage: "path required" });
  const path = resolve(raw);

  const cfg = await loadConfig();
  const entry = cfg.virtualMounts.find((v) => resolve(v.path) === path);
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: "virtual mount not found" });
  }

  if (body && "label" in body) {
    if (body.label === null || body.label === "") {
      delete entry.label;
    } else if (typeof body.label === "string") {
      const trimmed = body.label.trim();
      if (trimmed) entry.label = trimmed;
      else delete entry.label;
    }
  }

  if (body && "retroarchActivityDir" in body) {
    if (body.retroarchActivityDir === null || body.retroarchActivityDir === "") {
      delete entry.retroarchActivityDir;
    } else if (typeof body.retroarchActivityDir === "string") {
      const trimmed = body.retroarchActivityDir.trim();
      entry.retroarchActivityDir = trimmed ? normalizeRelPath(trimmed) : undefined;
      if (!entry.retroarchActivityDir) delete entry.retroarchActivityDir;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "retroarchActivityDir must be a string or null",
      });
    }
  }

  if (body && "romsRootRelPath" in body) {
    if (body.romsRootRelPath === null || body.romsRootRelPath === "") {
      delete entry.romsRootRelPath;
    } else if (typeof body.romsRootRelPath === "string") {
      const trimmed = body.romsRootRelPath.trim();
      entry.romsRootRelPath = trimmed ? normalizeRelPath(trimmed) : undefined;
      if (!entry.romsRootRelPath) delete entry.romsRootRelPath;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "romsRootRelPath must be a string or null",
      });
    }
  }

  if (body && "launcherKind" in body) {
    if (body.launcherKind === null || body.launcherKind === "") {
      delete entry.launcherKind;
    } else if (LAUNCHER_KINDS.includes(body.launcherKind as LauncherKind)) {
      entry.launcherKind = body.launcherKind as LauncherKind;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: `launcherKind must be one of ${LAUNCHER_KINDS.join(", ")} or null`,
      });
    }
  }

  if (body && "esDeRootRelPath" in body) {
    if (body.esDeRootRelPath === null || body.esDeRootRelPath === "") {
      delete entry.esDeRootRelPath;
    } else if (typeof body.esDeRootRelPath === "string") {
      const trimmed = body.esDeRootRelPath.trim();
      entry.esDeRootRelPath = trimmed ? normalizeRelPath(trimmed) : undefined;
      if (!entry.esDeRootRelPath) delete entry.esDeRootRelPath;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "esDeRootRelPath must be a string or null",
      });
    }
  }

  await saveConfig(cfg);
  return { virtualMount: entry };
});
