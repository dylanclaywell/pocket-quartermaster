---
id: retroarch-activity-tracking-feature
title: RetroArch activity tracking feature
status: completed
created: 2026-06-08T22:31:24.519Z
updated: 2026-06-08T22:45:32.272Z
tags:
  - feature
  - retroarch
  - activity
---

# RetroArch Activity Tracking

Self-contained feature: per-device RetroArch playtime tracking, decoupled from save profiles and game transfer (the latter two are out of scope for now).

## Feature boundaries

- **Saves** (existing): stays as-is. Profile = save file synced between two device slots.
- **Activity** (THIS PLAN): per-device RetroArch logs dir, scan + cache playtimes, aggregate across devices, dedicated screen.
- **Game transfer** (parked): user said they'll handle this manually via Windows Explorer.

Three features share `DeviceIdentity` (one marker file per device) but otherwise stand alone.

## Data model

Add one optional field to existing types in `server/utils/types.ts`:

```ts
DeviceIdentity.retroarchLogsDir?: string   // path relative to mount root
VirtualMount.retroarchLogsDir?: string     // same
```

The field points directly at RetroArch's `playlists/logs` folder (where `.lrtl` files live under per-core subdirectories).

## `.lrtl` format (confirmed from real example)

```json
{
  "version": "1.0",
  "runtime": "0:00:11",                 // H:MM:SS, hours not zero-padded
  "last_played": "2026-06-08 18:25:10", // naive local time
  "play_count": "2",                    // bonus field — show "N sessions"
  "state_slot": "0"                     // ignore
}
```

Folder layout: `<retroarchLogsDir>/<core_name>/<content_filename[.ext]>.lrtl`

- Game name ← filename minus `.lrtl` (and strip known ROM extensions if present)
- Core ← parent dir name
- System ← derived from core via a small lookup map

## Cache shape

One JSON file per device: `{CONFIG_DIR}/activity-cache/{deviceId}.json`

```ts
interface DeviceActivityCache {
  deviceId: string;
  scannedAt: string;
  sources: { path: string; mtimeMs: number }[];  // for incremental skip
  entries: ActivityEntry[];
}

interface ActivityEntry {
  normalizedName: string;     // join key
  displayName: string;
  core: string;
  system?: string;
  runtimeSeconds: number;
  playCount: number;
  lastPlayedAt?: string;      // ISO
  sourceFile: string;         // relative path within logsDir
}
```

Name normalization: lowercase, strip `(...)` and `[...]` tags, collapse non-alphanumerics. So `Pokémon - Emerald Version (USA, Europe)` and `Pokemon - Emerald (USA)` aggregate.

## API endpoints (new)

- `POST /api/activity/scan` — body `{ deviceId? }`. If omitted, scans all configured. Writes cache files. Returns `{ scanned, skipped, errors }`.
- `GET /api/activity` — returns aggregated playtime across all device caches:

```ts
{
  games: {
    normalizedName, displayName, system,
    totalSeconds, totalPlayCount, lastPlayedAt,
    perDevice: { deviceId, nickname, runtimeSeconds, playCount, lastPlayedAt }[]
  }[],
  devices: { id, nickname, lastScannedAt, cacheExists, retroarchLogsDir }[]
}
```

Existing `PATCH /api/devices/:id` extended to set/clear `retroarchLogsDir`. Existing `POST /api/virtual-mounts` and a new PATCH (or just rebuild via POST on existing path) for virtual mount logs dir.

## UI

- New route `/activity`. Linked from header (next to "Devices") and home.
- List view: game name, system/core, total playtime, "N sessions", last-played-ago, per-device breakdown on expand.
- Sort toggles: most recent / most played / a-z.
- **Hybrid scan trigger**: on `/activity` mount, render cached data immediately and kick a background scan; refresh UI when scan finishes.
- Per-device "RetroArch logs folder" picker on devices page (reuses `/api/browse`).
- Per-device "Scan now" button.

## Performance notes

`.lrtl` is many small files (one per played ROM) vs few large `.lpl`. ~500 played games = ~500 tiny file reads, ~2-5s cold scan on Pi SD card. Cache mtime-keyed incremental skip drops re-scan to ~1 stat per file + parse changed ones. Comfortable Pi territory.

## Build order

1. Add `retroarchLogsDir` to types + API (PATCH /api/devices, virtual-mounts), wire device-edit UI (folder picker via /api/browse).
2. `server/utils/retroarchActivity.ts` — scanLogsDir(absPath) → ActivityEntry[]. Verify against real folder before moving on.
3. `server/utils/activityCache.ts` — read/write per-device cache files, mtime-based incremental skip.
4. `POST /api/activity/scan` + `GET /api/activity`.
5. `/activity` page (hybrid scan-on-mount).
6. Per-device scan-now button on devices page.

Each step independently testable.

