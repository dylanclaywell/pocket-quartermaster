import { loadConfig, saveConfig } from "../../../utils/storage";
import { addSlot, findProfile, findSlot, updateSlot, upsertProfile } from "../../../utils/profiles";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  if (!name) throw createError({ statusCode: 400, statusMessage: "name required" });
  const decoded = decodeURIComponent(name);
  const body = await readBody<{
    slotId?: string;
    deviceId?: string;
    fileRelPath?: string;
    isDirectory?: boolean;
  }>(event);
  const deviceId = body?.deviceId?.trim();
  const fileRelPath = body?.fileRelPath?.replace(/^[\\/]+/, "").trim();
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "deviceId required" });
  if (fileRelPath === undefined || fileRelPath === null) {
    throw createError({ statusCode: 400, statusMessage: "fileRelPath required" });
  }

  const cfg = await loadConfig();
  const profile = findProfile(cfg, decoded);
  if (!profile) throw createError({ statusCode: 404, statusMessage: "profile not found" });

  const slotPayload = {
    deviceId,
    fileRelPath,
    ...(body.isDirectory ? { isDirectory: true } : { isDirectory: undefined }),
  };

  let slot;
  if (body.slotId) {
    if (!findSlot(profile, body.slotId)) {
      throw createError({ statusCode: 404, statusMessage: "slot not found" });
    }
    slot = updateSlot(profile, body.slotId, slotPayload);
  } else {
    slot = addSlot(profile, {
      deviceId,
      fileRelPath,
      ...(body.isDirectory ? { isDirectory: true } : {}),
    });
  }
  upsertProfile(cfg, profile);
  await saveConfig(cfg);
  return { profile, slot };
});
