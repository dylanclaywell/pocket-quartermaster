import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LauncherKind } from "./types";
import { esDeSubdir } from "./launcherMetadata";

/** A destination's launcher already resolved to mount + folder settings. */
export interface ArtDest {
  mountPath?: string;
  esDeRootRelPath?: string;
  muosRootRelPath?: string;
}

/** Where a launcher stores box art on disk, abstracted over ES-DE and muOS. */
export interface ArtLayout {
  /** Absolute box/cover directory for a system's ROMs, or null when the
      destination has no folder for that system (skip rather than guess). */
  boxDir(systemKey: string): string | null;
  /** Absolute box dirs that already exist, for harvesting — ordered so the
      preferred art type for a game is seen first. */
  harvestDirs: string[];
}

/** Canonical muOS catalogue folder names per system key. Used to match the
 *  device's existing catalogue folders (we only ever write into folders muOS
 *  already created, so an imperfect name here just means "skip", never a bad
 *  write). */
const MUOS_CATALOGUE_NAMES: Record<string, string> = {
  gb: "Nintendo Game Boy",
  gbc: "Nintendo Game Boy Color",
  gba: "Nintendo Game Boy Advance",
  nes: "Nintendo NES - Famicom",
  snes: "Nintendo SNES - SFC",
  n64: "Nintendo N64",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  genesis: "Sega Mega Drive - Genesis",
  sms: "Sega Master System",
  gg: "Sega Game Gear",
  saturn: "Sega Saturn",
  dreamcast: "Sega Dreamcast",
  psx: "Sony PlayStation",
  psp: "Sony PlayStation Portable",
  pce: "NEC PC Engine",
  wonderswan: "Bandai WonderSwan",
  ngp: "SNK Neo Geo Pocket - Color",
  atari2600: "Atari 2600",
  atari7800: "Atari 7800",
  lynx: "Atari Lynx",
  colecovision: "ColecoVision",
  arcade: "Arcade",
};

/** ES-DE downloaded_media subfolders to harvest from, best first. */
const ES_DE_ART_TYPES = ["covers", "miximages", "screenshots"] as const;

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Resolve a launcher's box-art layout for a destination. Async because muOS
 *  has to read the device's existing catalogue folders. Returns a `reason`
 *  instead of a layout when art can't be located (not mounted / folder unset). */
export async function getArtLayout(
  kind: LauncherKind,
  dest: ArtDest,
): Promise<{ layout?: ArtLayout; reason?: string }> {
  if (!dest.mountPath) return { reason: "destination is not mounted" };

  if (kind === "es-de") {
    const mediaDir = esDeSubdir(dest, "downloaded_media");
    if (!mediaDir) return { reason: "ES-DE folder is not set on this destination" };

    // Harvest dirs: per system, each existing art type (covers first).
    const harvestDirs: string[] = [];
    if (existsSync(mediaDir)) {
      let systems: string[] = [];
      try {
        systems = (await readdir(mediaDir, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        systems = [];
      }
      for (const sys of systems) {
        for (const t of ES_DE_ART_TYPES) {
          const dir = join(mediaDir, sys, t);
          if (existsSync(dir)) harvestDirs.push(dir);
        }
      }
    }

    return {
      layout: {
        boxDir: (systemKey) => join(mediaDir, systemKey, "covers"),
        harvestDirs,
      },
    };
  }

  // muOS: art lives under <MUOS>/info/catalogue/<CatalogueName>/box. We only
  // write into catalogue folders muOS already created for the device.
  if (!dest.muosRootRelPath) return { reason: "muOS folder is not set on this destination" };
  const catRoot = join(dest.mountPath, dest.muosRootRelPath.split("/").join("/"), "info", "catalogue");
  if (!existsSync(catRoot)) {
    return { reason: `No muOS catalogue folder found at ${catRoot}` };
  }
  let folders: string[] = [];
  try {
    folders = (await readdir(catRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    folders = [];
  }
  const byNorm = new Map(folders.map((f) => [normalizeName(f), f]));

  return {
    layout: {
      boxDir: (systemKey) => {
        const want = MUOS_CATALOGUE_NAMES[systemKey];
        if (!want) return null;
        const match = folders.includes(want) ? want : byNorm.get(normalizeName(want));
        return match ? join(catRoot, match, "box") : null;
      },
      harvestDirs: folders.map((f) => join(catRoot, f, "box")).filter((d) => existsSync(d)),
    },
  };
}
