import { loadConfig, saveConfig } from "../../../../utils/storage";
import { findProfile, removeSlot, upsertProfile } from "../../../../utils/profiles";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  const id = getRouterParam(event, "id");
  if (!name) throw createError({ statusCode: 400, statusMessage: "name required" });
  if (!id) throw createError({ statusCode: 400, statusMessage: "slot id required" });
  const decoded = decodeURIComponent(name);

  const cfg = await loadConfig();
  const profile = findProfile(cfg, decoded);
  if (!profile) throw createError({ statusCode: 404, statusMessage: "profile not found" });
  const removed = removeSlot(profile, id);
  if (!removed) throw createError({ statusCode: 404, statusMessage: "slot not found" });
  upsertProfile(cfg, profile);
  await saveConfig(cfg);
  return { ok: true };
});
