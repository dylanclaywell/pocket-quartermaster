import { basename } from "node:path";
import { loadConfig, saveConfig } from "../../../utils/storage";
import {
  findDevice,
  findProfile,
  findSlot,
  markSlotSynced,
  updateSlot,
  upsertProfile,
} from "../../../utils/profiles";
import { listAllMounts } from "../../../utils/devices";
import { readMarker } from "../../../utils/deviceId";
import { resolveSlot, transfer } from "../../../utils/sync";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  if (!name) throw createError({ statusCode: 400, statusMessage: "name required" });
  const decoded = decodeURIComponent(name);
  const body = await readBody<{ sourceSlotId?: string; destinationSlotId?: string }>(event);
  const sourceSlotId = body?.sourceSlotId?.trim();
  const destinationSlotId = body?.destinationSlotId?.trim();
  if (!sourceSlotId || !destinationSlotId) {
    throw createError({ statusCode: 400, statusMessage: "sourceSlotId and destinationSlotId are required" });
  }
  if (sourceSlotId === destinationSlotId) {
    throw createError({ statusCode: 400, statusMessage: "source and destination must be different slots" });
  }

  const cfg = await loadConfig();
  const profile = findProfile(cfg, decoded);
  if (!profile) throw createError({ statusCode: 404, statusMessage: "profile not found" });

  const sourceSlot = findSlot(profile, sourceSlotId);
  const destinationSlot = findSlot(profile, destinationSlotId);
  if (!sourceSlot || !destinationSlot) {
    throw createError({ statusCode: 404, statusMessage: "slot not found on this profile" });
  }

  const sourceDevice = findDevice(cfg, sourceSlot.deviceId);
  const destinationDevice = findDevice(cfg, destinationSlot.deviceId);
  if (!sourceDevice || !destinationDevice) {
    throw createError({ statusCode: 400, statusMessage: "one or both devices are unknown" });
  }

  const mounts = await listAllMounts(cfg.virtualMounts);
  let sourceMount: string | undefined;
  let destinationMount: string | undefined;
  for (const m of mounts) {
    const marker = await readMarker(m.mountPath);
    if (!marker) continue;
    if (marker.id === sourceDevice.id) sourceMount = m.mountPath;
    if (marker.id === destinationDevice.id) destinationMount = m.mountPath;
  }
  if (!sourceMount || !destinationMount) {
    const missing = [
      !sourceMount ? sourceDevice.nickname : null,
      !destinationMount ? destinationDevice.nickname : null,
    ].filter(Boolean).join(" and ");
    throw createError({ statusCode: 400, statusMessage: `Device not mounted: ${missing}` });
  }

  const resolvedSource = await resolveSlot(sourceSlot, sourceMount, sourceDevice.nickname);
  const resolvedDestination = await resolveSlot(
    destinationSlot,
    destinationMount,
    destinationDevice.nickname,
  );

  if (resolvedSource.directoryMode) {
    throw createError({
      statusCode: 400,
      statusMessage: `Source slot (${resolvedSource.deviceNickname}) is a folder. Pick a specific file in that slot or flip the direction.`,
    });
  }
  if (!resolvedSource.exists) {
    throw createError({
      statusCode: 400,
      statusMessage: `Source file does not exist on ${resolvedSource.deviceNickname}`,
    });
  }

  try {
    const result = await transfer(resolvedSource, resolvedDestination);

    // If the destination slot was a folder target, promote it to a regular
    // file slot now that the file exists at <folder>/<sourceBasename>.
    // Without this the slot stays in "waiting" state and round-trip transfers
    // back from this device wouldn't work.
    let promotedSlot: { slotId: string; fileRelPath: string } | null = null;
    if (resolvedDestination.directoryMode) {
      const dirRel = resolvedDestination.fileRelPath.replace(/[\\/]+$/, "");
      const newRel = [dirRel, basename(resolvedSource.fileRelPath)].filter(Boolean).join("/");
      updateSlot(profile, destinationSlot.id, { fileRelPath: newRel, isDirectory: undefined });
      promotedSlot = { slotId: destinationSlot.id, fileRelPath: newRel };
    }

    const now = new Date().toISOString();
    markSlotSynced(profile, sourceSlot.id, now);
    markSlotSynced(profile, destinationSlot.id, now);
    upsertProfile(cfg, profile);
    await saveConfig(cfg);

    return {
      ok: true,
      bytesCopied: result.bytesCopied,
      destinationPath: result.destinationPath,
      backupPath: result.backupPath ?? null,
      promotedSlot,
      syncedAt: now,
    };
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: (err as Error).message });
  }
});
