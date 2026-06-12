import { listAllMounts } from "../../../utils/devices";
import { readMarker } from "../../../utils/deviceId";
import { findDevice } from "../../../utils/profiles";
import { loadConfig } from "../../../utils/storage";
import { ejectMount } from "../../../utils/eject";

/** Safely unmount/eject a mounted real device so its card can be pulled.
 *  Refuses virtual mounts (just folders — nothing to eject) and non-removable
 *  drives, so a misconfigured marker can't unmount the host's own disk. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });

  const cfg = await loadConfig();
  const dev = findDevice(cfg, id);
  if (!dev) throw createError({ statusCode: 404, statusMessage: "device not found" });

  // Find this device's current mount by reading markers, as the detail route does.
  const mounts = await listAllMounts(cfg.virtualMounts);
  const mount = (
    await Promise.all(
      mounts.map(async (m) => ((await readMarker(m.mountPath))?.id === id ? m : null)),
    )
  ).find(Boolean);

  if (!mount) {
    throw createError({ statusCode: 409, statusMessage: "Device is not mounted." });
  }

  // A virtual mount is a configured folder on the host — nothing to eject.
  const isVirtual =
    mount.driveType === "Virtual" ||
    cfg.virtualMounts.some((v) => v.path === mount.mountPath);
  if (isVirtual) {
    throw createError({
      statusCode: 400,
      statusMessage: "This is a virtual mount (a folder), so there is nothing to eject.",
    });
  }

  // Guard against unmounting the host's own system disk if a marker ended up there.
  if (mount.driveType === "Fixed") {
    throw createError({
      statusCode: 400,
      statusMessage: "Refusing to eject a fixed (non-removable) drive.",
    });
  }

  const result = await ejectMount(mount.mountPath);
  if (!result.ok) {
    throw createError({ statusCode: 500, statusMessage: result.message });
  }
  return { ok: true, message: result.message, mountPath: mount.mountPath };
});
