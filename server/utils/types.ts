export interface MountedDevice {
  /** Absolute mount path (e.g. "E:\\" on Windows, "/Volumes/SDCARD" on macOS) */
  mountPath: string;
  /** Filesystem label, when known */
  label?: string;
  /** Drive type as reported by OS (Removable, Fixed, Network, etc.) */
  driveType?: string;
  /** Total size in bytes, if known */
  sizeBytes?: number;
  /** Free space in bytes, if known */
  freeBytes?: number;
}

/** Identifies a specific physical device across mounts via a marker file at the device root. */
export interface DeviceIdentity {
  /** Stable UUID written into the marker file on first registration */
  id: string;
  /** Friendly nickname chosen by the user (e.g. "RG35XX SD card") */
  nickname: string;
  /** Last mount path we saw this device at (informational only) */
  lastMountPath?: string;
  /** ISO timestamp the marker was written */
  registeredAt: string;
  /** Forward-slash path, relative to the mount root, of the RetroArch
      `playlists/logs` directory containing per-core `.lrtl` files. When set,
      the activity feature scans this directory for playtime data. */
  retroarchActivityDir?: string;
  /** Forward-slash path, relative to the mount root, of the ROM library root —
      the directory whose immediate subfolders are per-system ROM folders
      (e.g. `gba/`, `snes/`). When set, the ROM-management feature scans this
      device. Parallel to `retroarchActivityDir`. */
  romsRootRelPath?: string;
}

/** A ROM source's role, derived from `ConfigFile.romLibrarySourceKey`: the one
    source matching that key is the `library`; every other ROM-configured source
    is a `destination`. Never stored per-source. */
export type RomLibraryRole = "library" | "destination";

/** A single device slot inside a profile. A profile holds N of these and the
    user picks source + destination explicitly at transfer time. */
export interface ProfileSlot {
  /** Stable id for the slot within its profile, used in URLs and the transfer
      payload. Does not need to be globally unique. */
  id: string;
  /** Which device is bound to this slot, by stable id */
  deviceId: string;
  /** Path of the save file (or destination directory when isDirectory is true),
      relative to the device root, using forward slashes */
  fileRelPath: string;
  /** When true, fileRelPath points at a directory and the actual filename is
      derived from the *source* slot at transfer time. Used to seed a device
      that doesn't have the save yet. */
  isDirectory?: boolean;
  /** ISO timestamp of the last transfer that touched this slot (either as
      source or destination). Surfaced in the UI so the user can tell at a
      glance how stale each device is. */
  lastSyncedAt?: string;
}

export interface Profile {
  name: string;
  /** Free-form notes (e.g. "Pokemon Emerald — RG35XX <-> RetroArch on PC") */
  notes?: string;
  slots: ProfileSlot[];
  createdAt: string;
  updatedAt: string;
}

/** Legacy shape from version 1 of the config file. Read-only — loadConfig
    migrates these into the slots[] form. */
export interface LegacyProfileV1 {
  name: string;
  notes?: string;
  slotA?: { deviceId: string; fileRelPath: string; isDirectory?: boolean };
  slotB?: { deviceId: string; fileRelPath: string; isDirectory?: boolean };
  createdAt: string;
  updatedAt: string;
}

/** A user-configured folder treated as if it were a mounted device.
   Useful for testing without hardware, or for syncing to a network share folder. */
export interface VirtualMount {
  /** Absolute path to the folder on the host filesystem */
  path: string;
  /** Optional friendly label shown in the UI */
  label?: string;
  /** ISO timestamp this entry was added */
  addedAt: string;
  /** Forward-slash path, relative to this mount, of the RetroArch
      `playlists/logs` directory containing per-core `.lrtl` files. */
  retroarchActivityDir?: string;
  /** Forward-slash path, relative to this mount, of the ROM library root
      whose immediate subfolders are per-system ROM folders. When set, the
      ROM-management feature scans this mount. */
  romsRootRelPath?: string;
}

/** User-editable, persisted per-game data. Keyed by `gameKey`
    (the normalized game name) — a deterministic, scan-stable identity, so no
    entity reconciler is needed when the library is re-scanned. */
export interface GameMeta {
  /** normalizeGameName() of the game. Stable across rescans. */
  gameKey: string;
  /** Overrides the filename-derived display name shown in the UI. */
  displayNameOverride?: string;
  /** Variant chosen as the game-level default, by variant key
      (`${systemKey}/${filename}`). Falls back to the sole variant when unset. */
  defaultVariantKey?: string;
  /** Links this game to an existing save Profile, by profile name. */
  saveProfileName?: string;
  /** Free-form notes. */
  notes?: string;
}

/** Per-(game, destination) preferred variant. The destination is keyed by its
    ROM cache key (`romdev-…` / `romvm-…`) so it unifies devices and virtual
    mounts under one stable identifier. */
export interface DeviceGamePreference {
  gameKey: string;
  /** ROM cache key of the destination source. */
  sourceCacheKey: string;
  /** Variant key the destination should hold. Unset = inherit game default. */
  preferredVariantKey?: string;
}

export interface ConfigFile {
  version: 3;
  devices: DeviceIdentity[];
  profiles: Profile[];
  virtualMounts: VirtualMount[];
  /** Persisted per-game user data, keyed by gameKey. */
  gameMeta: GameMeta[];
  /** Per-(game, destination) preferred-variant rows. */
  deviceGamePreferences: DeviceGamePreference[];
  /** ROM cache key (`romdev-…` / `romvm-…`) of the source designated as the
      canonical library. Every other ROM-configured source is a destination.
      Unset means no library chosen yet (the ROMs page prompts for one). */
  romLibrarySourceKey?: string;
}

export const MARKER_FILENAME = ".pqm-device-id.json";
