import { loadConfig, saveConfig } from "../../utils/storage";

/** Set or clear the preferred variant for a (game, destination) pair. Passing
 *  preferredVariantKey null/"" removes the explicit preference, falling the
 *  destination back to the game's default variant. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    gameKey?: string;
    sourceCacheKey?: string;
    preferredVariantKey?: string | null;
  }>(event);

  const gameKey = body?.gameKey?.trim();
  const sourceCacheKey = body?.sourceCacheKey?.trim();
  if (!gameKey || !sourceCacheKey) {
    throw createError({ statusCode: 400, statusMessage: "gameKey and sourceCacheKey required" });
  }

  const cfg = await loadConfig();
  cfg.deviceGamePreferences = cfg.deviceGamePreferences.filter(
    (p) => !(p.gameKey === gameKey && p.sourceCacheKey === sourceCacheKey),
  );

  const variantKey = body?.preferredVariantKey;
  if (typeof variantKey === "string" && variantKey.trim()) {
    cfg.deviceGamePreferences.push({
      gameKey,
      sourceCacheKey,
      preferredVariantKey: variantKey.trim(),
    });
  }

  await saveConfig(cfg);
  return { ok: true };
});
