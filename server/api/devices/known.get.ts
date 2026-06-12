import { loadConfig } from "../../utils/storage";
import { listAllMounts } from "../../utils/devices";
import { readMarker } from "../../utils/deviceId";
import { deviceCacheKey } from "../../utils/activityCache";

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const mounts = await listAllMounts(cfg.virtualMounts);
  const virtualPaths = new Set(cfg.virtualMounts.map((v) => v.path));
  const deviceMounts = new Map<string, { mountPath: string; driveType?: string }>();
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker) deviceMounts.set(marker.id, { mountPath: m.mountPath, driveType: m.driveType });
  }
  return {
    devices: cfg.devices.map((d) => {
      const mount = deviceMounts.get(d.id);
      // Ejectable only for real removable media — not virtual mounts (folders)
      // or the host's own fixed disk.
      const isVirtual =
        mount?.driveType === "Virtual" ||
        (mount !== undefined && virtualPaths.has(mount.mountPath));
      return {
        ...d,
        mounted: Boolean(mount),
        currentMountPath: mount?.mountPath,
        ejectable: Boolean(mount) && !isVirtual && mount?.driveType !== "Fixed",
        activityCacheKey: deviceCacheKey(d.id),
      };
    }),
  };
});
