import { loadConfig } from "../../utils/storage";
import { computeLibrary } from "../../utils/romLibrary";

export default defineEventHandler(async () => {
  const cfg = await loadConfig();
  const { games, sources } = await computeLibrary(cfg);

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
    };
  });

  return { games: list, libraries: sources };
});
