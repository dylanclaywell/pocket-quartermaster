/** Single source of truth for libretro core metadata.
 *
 *  `displaySystem` is the human-friendly platform name we show in the UI.
 *  `libretroDbNames` is the list of libretro-thumbnails repo names the games
 *  for this core could live under — multiple when the core spans systems
 *  (Gambatte handles both GB and GBC, Genesis Plus GX handles Genesis/MS/GG). */
export interface CoreInfo {
  displaySystem: string;
  libretroDbNames: string[];
}

const NES = "Nintendo - Nintendo Entertainment System";
const SNES = "Nintendo - Super Nintendo Entertainment System";
const GB = "Nintendo - Game Boy";
const GBC = "Nintendo - Game Boy Color";
const GBA = "Nintendo - Game Boy Advance";
const N64 = "Nintendo - Nintendo 64";
const DS = "Nintendo - Nintendo DS";
const N3DS = "Nintendo - Nintendo 3DS";
const GCN = "Nintendo - GameCube";
const WII = "Nintendo - Wii";
const GENESIS = "Sega - Mega Drive - Genesis";
const SMS = "Sega - Master System - Mark III";
const GG = "Sega - Game Gear";
const SATURN = "Sega - Saturn";
const DREAMCAST = "Sega - Dreamcast";
const PSX = "Sony - PlayStation";
const PSP = "Sony - PlayStation Portable";
const PCE = "NEC - PC Engine - TurboGrafx 16";
const PCE_SUPER = "NEC - PC Engine SuperGrafx";
const ATARI_2600 = "Atari - 2600";
const ATARI_7800 = "Atari - 7800";
const ATARI_LYNX = "Atari - Lynx";
const WSWAN = "Bandai - WonderSwan";
const WSWAN_COLOR = "Bandai - WonderSwan Color";
const NEOGEO_POCKET = "SNK - Neo Geo Pocket Color";
const NEOGEO_POCKET_BASE = "SNK - Neo Geo Pocket";
const ARCADE = "MAME";
const COLECO = "Coleco - ColecoVision";

export const CORES: Record<string, CoreInfo> = {
  // Game Boy / Color
  Gambatte: { displaySystem: "Game Boy / Color", libretroDbNames: [GB, GBC] },
  SameBoy: { displaySystem: "Game Boy / Color", libretroDbNames: [GB, GBC] },
  "TGB Dual": { displaySystem: "Game Boy / Color", libretroDbNames: [GB, GBC] },
  "Beetle GB": { displaySystem: "Game Boy / Color", libretroDbNames: [GB, GBC] },
  // GBA
  mGBA: { displaySystem: "Game Boy Advance", libretroDbNames: [GBA] },
  "VBA Next": { displaySystem: "Game Boy Advance", libretroDbNames: [GBA] },
  "VBA-M": { displaySystem: "Game Boy Advance", libretroDbNames: [GBA] },
  "Beetle GBA": { displaySystem: "Game Boy Advance", libretroDbNames: [GBA] },
  gpSP: { displaySystem: "Game Boy Advance", libretroDbNames: [GBA] },
  // NES
  Mesen: { displaySystem: "NES", libretroDbNames: [NES] },
  Nestopia: { displaySystem: "NES", libretroDbNames: [NES] },
  FCEUmm: { displaySystem: "NES", libretroDbNames: [NES] },
  QuickNES: { displaySystem: "NES", libretroDbNames: [NES] },
  // SNES
  Snes9x: { displaySystem: "SNES", libretroDbNames: [SNES] },
  "Snes9x - Current": { displaySystem: "SNES", libretroDbNames: [SNES] },
  bsnes: { displaySystem: "SNES", libretroDbNames: [SNES] },
  "bsnes-mercury Performance": { displaySystem: "SNES", libretroDbNames: [SNES] },
  "bsnes-mercury Balanced": { displaySystem: "SNES", libretroDbNames: [SNES] },
  "bsnes-mercury Accuracy": { displaySystem: "SNES", libretroDbNames: [SNES] },
  "Mesen-S": { displaySystem: "SNES", libretroDbNames: [SNES] },
  // Genesis / MS / GG (Genesis Plus GX spans all three)
  "Genesis Plus GX": {
    displaySystem: "Sega Genesis",
    libretroDbNames: [GENESIS, SMS, GG],
  },
  "Genesis Plus GX Wide": {
    displaySystem: "Sega Genesis",
    libretroDbNames: [GENESIS, SMS, GG],
  },
  PicoDrive: { displaySystem: "Sega Genesis", libretroDbNames: [GENESIS] },
  Gearsystem: { displaySystem: "Sega Master System", libretroDbNames: [SMS] },
  // Saturn / Dreamcast
  "Beetle Saturn": { displaySystem: "Sega Saturn", libretroDbNames: [SATURN] },
  YabaSanshiro: { displaySystem: "Sega Saturn", libretroDbNames: [SATURN] },
  Kronos: { displaySystem: "Sega Saturn", libretroDbNames: [SATURN] },
  Flycast: { displaySystem: "Sega Dreamcast", libretroDbNames: [DREAMCAST] },
  // PlayStation / PSP
  "Beetle PSX": { displaySystem: "PlayStation", libretroDbNames: [PSX] },
  "Beetle PSX HW": { displaySystem: "PlayStation", libretroDbNames: [PSX] },
  "PCSX ReARMed": { displaySystem: "PlayStation", libretroDbNames: [PSX] },
  SwanStation: { displaySystem: "PlayStation", libretroDbNames: [PSX] },
  PPSSPP: { displaySystem: "PlayStation Portable", libretroDbNames: [PSP] },
  // PC Engine
  "Beetle PCE": { displaySystem: "PC Engine", libretroDbNames: [PCE] },
  "Beetle PCE Fast": { displaySystem: "PC Engine", libretroDbNames: [PCE] },
  "Beetle SuperGrafx": { displaySystem: "PC Engine", libretroDbNames: [PCE_SUPER, PCE] },
  // N64 / DS / 3DS / GameCube
  "Mupen64Plus-Next": { displaySystem: "Nintendo 64", libretroDbNames: [N64] },
  "ParaLLEl N64": { displaySystem: "Nintendo 64", libretroDbNames: [N64] },
  DeSmuME: { displaySystem: "Nintendo DS", libretroDbNames: [DS] },
  melonDS: { displaySystem: "Nintendo DS", libretroDbNames: [DS] },
  "melonDS DS": { displaySystem: "Nintendo DS", libretroDbNames: [DS] },
  Citra: { displaySystem: "Nintendo 3DS", libretroDbNames: [N3DS] },
  Dolphin: {
    displaySystem: "Nintendo GameCube / Wii",
    libretroDbNames: [GCN, WII],
  },
  // Atari
  Stella: { displaySystem: "Atari 2600", libretroDbNames: [ATARI_2600] },
  ProSystem: { displaySystem: "Atari 7800", libretroDbNames: [ATARI_7800] },
  Handy: { displaySystem: "Atari Lynx", libretroDbNames: [ATARI_LYNX] },
  "Beetle Lynx": { displaySystem: "Atari Lynx", libretroDbNames: [ATARI_LYNX] },
  // Handheld misc
  "Beetle WSwan": { displaySystem: "WonderSwan", libretroDbNames: [WSWAN] },
  "Beetle NeoPop": { displaySystem: "Neo Geo Pocket", libretroDbNames: [NEOGEO_POCKET] },
  // Arcade
  "FB Neo": { displaySystem: "Arcade", libretroDbNames: [ARCADE] },
  "FinalBurn Neo": { displaySystem: "Arcade", libretroDbNames: [ARCADE] },
  MAME: { displaySystem: "Arcade", libretroDbNames: [ARCADE] },
  "MAME 2003-Plus": { displaySystem: "Arcade", libretroDbNames: [ARCADE] },
  "MAME 2010": { displaySystem: "Arcade", libretroDbNames: [ARCADE] },
  // Colecovision
  "blueMSX": { displaySystem: "ColecoVision", libretroDbNames: [COLECO] },
};

/** Maps a ROM-scan systemKey (see romScan SYSTEMS) to the libretro-thumbnails
 *  repo name(s) to search for box art. Lets the ROM library reuse the same
 *  thumbnail search the activity feature drives off cores. */
export const SYSTEM_LIBRETRO_DB_NAMES: Record<string, string[]> = {
  gb: [GB],
  gbc: [GBC],
  gba: [GBA],
  nes: [NES],
  snes: [SNES],
  n64: [N64],
  nds: [DS],
  "3ds": [N3DS],
  genesis: [GENESIS],
  sms: [SMS],
  gg: [GG],
  saturn: [SATURN],
  dreamcast: [DREAMCAST],
  psx: [PSX],
  psp: [PSP],
  pce: [PCE, PCE_SUPER],
  wonderswan: [WSWAN, WSWAN_COLOR],
  ngp: [NEOGEO_POCKET, NEOGEO_POCKET_BASE],
  atari2600: [ATARI_2600],
  atari7800: [ATARI_7800],
  lynx: [ATARI_LYNX],
  colecovision: [COLECO],
  arcade: [ARCADE],
};
