import { loadConfig } from "../../../utils/storage";
import { computeLibrary } from "../../../utils/romLibrary";
import { resolveRomSourceRoots } from "../../../utils/romTransfer";
import { basename, extname } from "node:path";
import {
  launcherKindForCacheKey,
  metadataTargetRoot,
  readLauncherNames,
  type NameLookup,
} from "../../../utils/launcherMetadata";

/** One installed-on-destination game in a name push plan. `existingName` is the
 *  launcher's current display name (null when unset); `newName` is the clean
 *  name we'd write; `needsUpdate` is true when they differ. */
interface NamePlanGame {
  gameKey: string;
  system: string;
  /** Representative ROM filename stem installed on the destination. */
  canonicalName: string;
  existingName: string | null;
  newName: string;
  needsUpdate: boolean;
}

/** Reconcile which installed games on a destination would have their launcher
 *  display name changed by a name push — current launcher name vs. our clean
 *  displayName — so the Names tab can show Existing → New before writing. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ destCacheKey?: string }>(event);
  const destCacheKey = body?.destCacheKey?.trim();
  if (!destCacheKey)
    throw createError({ statusCode: 400, statusMessage: "destCacheKey required" });

  const cfg = await loadConfig();
  const kind = launcherKindForCacheKey(cfg, destCacheKey);
  if (!kind) {
    return {
      reconciled: false,
      reason: "This destination has no launcher set; choose one on its device page.",
      games: [] as NamePlanGame[],
    };
  }

  const roots = await resolveRomSourceRoots(cfg);
  const dest = roots.get(destCacheKey);
  const { root, reason } = dest?.mounted
    ? metadataTargetRoot(kind, dest)
    : { root: undefined, reason: "Destination is not mounted" };

  const { games } = await computeLibrary(cfg);

  // Collect every installed file across games, then read current names in one
  // pass so each gamelist / global.json is parsed only once.
  const lookups: NameLookup[] = [];
  const installedByGame: { game: (typeof games)[number]; filenames: string[] }[] = [];
  for (const g of games) {
    const d = g.destinations.find((x) => x.cacheKey === destCacheKey);
    if (!d || d.installedFilenames.length === 0) continue;
    installedByGame.push({ game: g, filenames: d.installedFilenames });
    for (const filename of d.installedFilenames) {
      lookups.push({ systemKey: g.systemKey, filename });
    }
  }

  const current = root ? await readLauncherNames(kind, root, lookups) : new Map();

  const out: NamePlanGame[] = installedByGame.map(({ game, filenames }) => {
    // First installed file with a launcher name represents the game's current
    // name; absent everywhere means it's unset.
    let existingName: string | null = null;
    for (const filename of filenames) {
      const name = current.get(`${game.systemKey}/${filename}`);
      if (name) {
        existingName = name;
        break;
      }
    }
    const rep = filenames[0];
    return {
      gameKey: game.gameKey,
      system: game.system,
      canonicalName: basename(rep, extname(rep)),
      existingName,
      newName: game.displayName,
      needsUpdate: existingName !== game.displayName,
    };
  });

  return {
    reconciled: Boolean(root),
    reason: root ? undefined : reason,
    kind,
    destLabel: dest?.label ?? destCacheKey,
    games: out,
  };
});
