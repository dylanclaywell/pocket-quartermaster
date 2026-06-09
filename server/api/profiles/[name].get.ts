import { loadConfig } from "../../utils/storage";
import { findProfile, findDevice, profileIsReady } from "../../utils/profiles";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  if (!name) throw createError({ statusCode: 400, statusMessage: "name required" });
  const decoded = decodeURIComponent(name);
  const cfg = await loadConfig();
  const profile = findProfile(cfg, decoded);
  if (!profile) throw createError({ statusCode: 404, statusMessage: "profile not found" });
  return {
    profile: { ...profile, ready: profileIsReady(profile) },
    slots: profile.slots.map((s) => ({
      ...s,
      device: findDevice(cfg, s.deviceId) ?? null,
    })),
  };
});
