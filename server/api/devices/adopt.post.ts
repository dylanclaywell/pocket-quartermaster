import { readMarker } from "../../utils/deviceId";
import { loadConfig, saveConfig } from "../../utils/storage";
import { findDevice, upsertDevice } from "../../utils/profiles";
import type { DeviceIdentity } from "../../utils/types";

/** Re-add a device whose marker file still exists on the mount but whose id is
 *  no longer in config (orphaned after a config reset or a "forget"). Unlike
 *  register, this does NOT write a new marker — it adopts the existing identity
 *  so the device keeps its stable id, activity cache, and profile links. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ mountPath?: string }>(event);
  const mountPath = body?.mountPath?.trim();
  if (!mountPath) throw createError({ statusCode: 400, statusMessage: "mountPath required" });

  const marker = await readMarker(mountPath);
  if (!marker) {
    throw createError({ statusCode: 400, statusMessage: `No device marker found at ${mountPath}` });
  }

  const cfg = await loadConfig();
  const already = findDevice(cfg, marker.id);
  if (already) return { device: already };

  const identity: DeviceIdentity = {
    id: marker.id,
    nickname: marker.nickname,
    lastMountPath: mountPath,
    registeredAt: marker.registeredAt,
  };
  upsertDevice(cfg, identity);
  await saveConfig(cfg);
  return { device: identity };
});
