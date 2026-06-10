import { loadConfig, saveConfig } from "../../../utils/storage";
import type { GameMeta } from "../../../utils/types";

/** Upsert persisted per-game user data. Each field is optional; passing null or
 *  "" clears it. A row with no remaining data is dropped entirely. */
export default defineEventHandler(async (event) => {
  const gameKey = getRouterParam(event, "gameKey");
  if (!gameKey) throw createError({ statusCode: 400, statusMessage: "gameKey required" });
  const key = decodeURIComponent(gameKey);

  const body = await readBody<{
    displayNameOverride?: string | null;
    defaultVariantKey?: string | null;
    saveProfileName?: string | null;
    notes?: string | null;
  }>(event);

  const cfg = await loadConfig();
  const existing = cfg.gameMeta.find((m) => m.gameKey === key);
  const meta: GameMeta = existing ?? { gameKey: key };

  function apply(
    field: "displayNameOverride" | "defaultVariantKey" | "saveProfileName" | "notes",
  ): void {
    if (!body || !(field in body)) return;
    const value = body[field];
    if (value === null || value === "") {
      delete meta[field];
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) meta[field] = trimmed;
      else delete meta[field];
    } else {
      throw createError({ statusCode: 400, statusMessage: `${field} must be a string or null` });
    }
  }

  apply("displayNameOverride");
  apply("defaultVariantKey");
  apply("saveProfileName");
  apply("notes");

  const hasData =
    meta.displayNameOverride || meta.defaultVariantKey || meta.saveProfileName || meta.notes;

  cfg.gameMeta = cfg.gameMeta.filter((m) => m.gameKey !== key);
  if (hasData) cfg.gameMeta.push(meta);

  await saveConfig(cfg);
  return { gameMeta: hasData ? meta : null };
});
