import { loadConfig } from "../../../utils/storage";
import { computeLibrary } from "../../../utils/romLibrary";
import { hasThumbnail } from "../../../utils/thumbnails";

export default defineEventHandler(async (event) => {
  const gameKey = getRouterParam(event, "gameKey");
  if (!gameKey) throw createError({ statusCode: 400, statusMessage: "gameKey required" });
  const decoded = decodeURIComponent(gameKey);

  const cfg = await loadConfig();
  const { games } = await computeLibrary(cfg);
  const game = games.find((g) => g.gameKey === decoded);
  if (!game) throw createError({ statusCode: 404, statusMessage: "game not found" });

  return { game: { ...game, hasThumbnail: await hasThumbnail(decoded) } };
});
