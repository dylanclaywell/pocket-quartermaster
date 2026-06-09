import { loadConfig } from "../../../utils/storage";
import { findProfile, findDevice, profileIsReady } from "../../../utils/profiles";
import { listAllMounts } from "../../../utils/devices";
import { readMarker } from "../../../utils/deviceId";
import { resolveSlot, type ResolvedSlot } from "../../../utils/sync";

interface ResolvedSlotResponse extends Omit<ResolvedSlot, "absolutePath" | "mountPath"> {
  mounted: boolean;
}

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  if (!name) throw createError({ statusCode: 400, statusMessage: "name required" });
  const decoded = decodeURIComponent(name);
  const cfg = await loadConfig();
  const profile = findProfile(cfg, decoded);
  if (!profile) throw createError({ statusCode: 404, statusMessage: "profile not found" });

  const mounts = await listAllMounts(cfg.virtualMounts);
  const mountByDeviceId = new Map<string, string>();
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (marker) mountByDeviceId.set(marker.id, m.mountPath);
  }

  const slots: ResolvedSlotResponse[] = [];
  for (const slot of profile.slots) {
    const device = findDevice(cfg, slot.deviceId) ?? null;
    const mountPath = mountByDeviceId.get(slot.deviceId);
    if (!mountPath || !device) {
      slots.push({
        slotId: slot.id,
        deviceId: slot.deviceId,
        deviceNickname: device?.nickname ?? "(unknown device)",
        fileRelPath: slot.fileRelPath,
        directoryMode: slot.isDirectory === true,
        exists: false,
        mounted: false,
        lastSyncedAt: slot.lastSyncedAt,
      });
      continue;
    }
    const resolved = await resolveSlot(slot, mountPath, device.nickname);
    // Strip absolute path / mount path — the client doesn't need them.
    const { absolutePath: _abs, mountPath: _mp, ...rest } = resolved;
    void _abs;
    void _mp;
    slots.push({ ...rest, mounted: true });
  }

  return {
    name: profile.name,
    ready: profileIsReady(profile),
    slots,
  };
});
