import { loadConfig, saveConfig } from "../../utils/storage";
import { findDevice, upsertDevice } from "../../utils/profiles";
import { rewriteMarkerNickname, readMarker } from "../../utils/deviceId";
import { listAllMounts } from "../../utils/devices";

function normalizeRelPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });
  const body = await readBody<{
    nickname?: string;
    retroarchActivityDir?: string | null;
    romsRootRelPath?: string | null;
    romLibraryRole?: "master" | "destination" | null;
  }>(event);

  const cfg = await loadConfig();
  const dev = findDevice(cfg, id);
  if (!dev) throw createError({ statusCode: 404, statusMessage: "device not found" });

  let nicknameChanged = false;
  if (typeof body?.nickname === "string") {
    const nickname = body.nickname.trim();
    if (!nickname) throw createError({ statusCode: 400, statusMessage: "nickname must not be empty" });
    if (nickname !== dev.nickname) {
      dev.nickname = nickname;
      nicknameChanged = true;
    }
  }

  if (body && "retroarchActivityDir" in body) {
    if (body.retroarchActivityDir === null || body.retroarchActivityDir === "") {
      delete dev.retroarchActivityDir;
    } else if (typeof body.retroarchActivityDir === "string") {
      const trimmed = body.retroarchActivityDir.trim();
      dev.retroarchActivityDir = trimmed ? normalizeRelPath(trimmed) : undefined;
      if (!dev.retroarchActivityDir) delete dev.retroarchActivityDir;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "retroarchActivityDir must be a string or null",
      });
    }
  }

  if (body && "romsRootRelPath" in body) {
    if (body.romsRootRelPath === null || body.romsRootRelPath === "") {
      delete dev.romsRootRelPath;
    } else if (typeof body.romsRootRelPath === "string") {
      const trimmed = body.romsRootRelPath.trim();
      dev.romsRootRelPath = trimmed ? normalizeRelPath(trimmed) : undefined;
      if (!dev.romsRootRelPath) delete dev.romsRootRelPath;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "romsRootRelPath must be a string or null",
      });
    }
  }

  if (body && "romLibraryRole" in body) {
    if (body.romLibraryRole === null) {
      delete dev.romLibraryRole;
    } else if (body.romLibraryRole === "master" || body.romLibraryRole === "destination") {
      dev.romLibraryRole = body.romLibraryRole;
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: "romLibraryRole must be 'master', 'destination', or null",
      });
    }
  }

  upsertDevice(cfg, dev);
  await saveConfig(cfg);

  // Only rewrite the marker on a real nickname change — touching it on every PATCH would
  // require the device to be mounted just to set a logs folder.
  if (nicknameChanged) {
    const mounts = await listAllMounts(cfg.virtualMounts);
    for (const m of mounts) {
      const marker = await readMarker(m.mountPath);
      if (marker?.id === id) {
        try {
          await rewriteMarkerNickname(m.mountPath, dev, dev.nickname);
        } catch {
          // best-effort
        }
        break;
      }
    }
  }

  return { device: dev };
});
