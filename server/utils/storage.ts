import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import envPaths from "env-paths";
import type { ConfigFile, LegacyProfileV1, Profile, ProfileSlot } from "./types";
import { newSlotId } from "./profiles";

const paths = envPaths("pocket-quartermaster", { suffix: "" });
export const CONFIG_DIR = paths.config;
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const BACKUP_DIR = join(paths.data, "backups");

const EMPTY_CONFIG: ConfigFile = {
  version: 3,
  devices: [],
  profiles: [],
  virtualMounts: [],
  gameMeta: [],
  deviceGamePreferences: [],
};

export async function loadConfig(): Promise<ConfigFile> {
  if (!existsSync(CONFIG_PATH)) {
    return structuredClone(EMPTY_CONFIG);
  }
  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<ConfigFile> & {
    profiles?: unknown[];
    version?: number;
  };
  parsed.devices ??= [];
  parsed.profiles ??= [];
  parsed.virtualMounts ??= [];
  let migrated = false;
  parsed.profiles = (parsed.profiles as (Profile | LegacyProfileV1)[]).map((p) => {
    if (Array.isArray((p as Profile).slots)) return p as Profile;
    migrated = true;
    return migrateProfile(p as LegacyProfileV1);
  });
  // v3 added ROM-management arrays. Initialize them when absent.
  if (!Array.isArray(parsed.gameMeta)) {
    parsed.gameMeta = [];
    migrated = true;
  }
  if (!Array.isArray(parsed.deviceGamePreferences)) {
    parsed.deviceGamePreferences = [];
    migrated = true;
  }
  if (parsed.version !== 3) {
    parsed.version = 3;
    migrated = true;
  }
  const cfg = parsed as ConfigFile;
  // Persist the migration so slot IDs are stable across requests. Otherwise
  // every call would generate fresh UUIDs and POSTs that reference an id from
  // a prior GET would 404.
  if (migrated) {
    await saveConfig(cfg);
  }
  return cfg;
}

function migrateProfile(legacy: LegacyProfileV1): Profile {
  const slots: ProfileSlot[] = [];
  if (legacy.slotA) {
    slots.push({
      id: newSlotId(),
      deviceId: legacy.slotA.deviceId,
      fileRelPath: legacy.slotA.fileRelPath,
      ...(legacy.slotA.isDirectory ? { isDirectory: true } : {}),
    });
  }
  if (legacy.slotB) {
    slots.push({
      id: newSlotId(),
      deviceId: legacy.slotB.deviceId,
      fileRelPath: legacy.slotB.fileRelPath,
      ...(legacy.slotB.isDirectory ? { isDirectory: true } : {}),
    });
  }
  return {
    name: legacy.name,
    notes: legacy.notes,
    slots,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

export async function saveConfig(cfg: ConfigFile): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), "utf8");
  await rename(tmp, CONFIG_PATH);
}

export async function ensureBackupDir(): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}
