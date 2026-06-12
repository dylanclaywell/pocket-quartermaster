import { listAllMounts } from "../../utils/devices";
import { readMarker } from "../../utils/deviceId";
import { findDevice } from "../../utils/profiles";
import { loadConfig } from "../../utils/storage";
import { deviceCacheKey } from "../../utils/activityCache";
import { romDeviceCacheKey } from "../../utils/romLibraryCache";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });

  const cfg = await loadConfig();
  const dev = findDevice(cfg, id);
  if (!dev) throw createError({ statusCode: 404, statusMessage: "device not found" });

  // Find this device's current mount, if any, by reading markers from each mount.
  const mounts = await listAllMounts(cfg.virtualMounts);
  let currentMountPath: string | undefined;
  let currentDriveType: string | undefined;
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker?.id === id) {
      currentMountPath = m.mountPath;
      currentDriveType = m.driveType;
      break;
    }
  }
  // Ejectable only for real removable media — never a virtual mount (a folder)
  // or the host's own fixed disk.
  const isVirtualMount =
    currentDriveType === "Virtual" ||
    (currentMountPath !== undefined &&
      cfg.virtualMounts.some((v) => v.path === currentMountPath));
  const ejectable =
    Boolean(currentMountPath) && !isVirtualMount && currentDriveType !== "Fixed";

  // Every profile slot that references this device — drives the "Save slots" section.
  const slots: {
    profileName: string;
    slotId: string;
    fileRelPath: string;
    isDirectory?: boolean;
    lastSyncedAt?: string;
  }[] = [];
  for (const p of cfg.profiles) {
    for (const slot of p.slots) {
      if (slot.deviceId === id) {
        slots.push({
          profileName: p.name,
          slotId: slot.id,
          fileRelPath: slot.fileRelPath,
          isDirectory: slot.isDirectory,
          lastSyncedAt: slot.lastSyncedAt,
        });
      }
    }
  }

  return {
    device: {
      ...dev,
      mounted: Boolean(currentMountPath),
      currentMountPath,
      ejectable,
      activityCacheKey: deviceCacheKey(dev.id),
      romsCacheKey: romDeviceCacheKey(dev.id),
    },
    slots,
  };
});
