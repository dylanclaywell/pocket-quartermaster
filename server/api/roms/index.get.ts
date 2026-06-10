import { loadConfig } from "../../utils/storage";
import { computeLibrary } from "../../utils/romLibrary";
import { safeBaseName, thumbnailBaseSet } from "../../utils/thumbnails";

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const { games, sources } = await computeLibrary(cfg);
  const thumbs = await thumbnailBaseSet();

  // List view needs only headline fields; variants + the destination matrix are
  // served per-game by /api/roms/games/[gameKey].
  const list = games.map((g) => {
    const destinationsInstalled = g.destinations.filter(
      (d) => d.status !== "not-installed",
    ).length;
    const hasMismatch = g.destinations.some((d) => d.status === "mismatch");
    return {
      gameKey: g.gameKey,
      displayName: g.displayName,
      systemKey: g.systemKey,
      system: g.system,
      variantCount: g.variantCount,
      totalSizeBytes: g.totalSizeBytes,
      saveProfileName: g.saveProfileName,
      destinationCount: g.destinations.length,
      destinationsInstalled,
      hasMismatch,
      hasThumbnail: thumbs.has(safeBaseName(g.gameKey)),
    };
  });

  return { games: list, libraries: sources };
});
