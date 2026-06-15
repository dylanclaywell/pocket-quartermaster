---
id: activity-dashboard
title: Activity dashboard + runtime-snapshot trends
status: completed
created: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T01:00:00.000Z
tags:
  - feature
  - activity
  - dashboard
  - home
  - trends
---

# Activity dashboard + runtime-snapshot trends

Turn the playtime data already scanned from RetroArch `.lrtl` logs into the home control-tower view (per memory: home = dashboard, not profile index). Two layers:

1. **Totals** — derivable today from `/api/activity`, no new storage.
2. **Trends** — real daily/weekly playtime deltas + streak, via an append-only runtime snapshot taken on each scan. Chosen over totals-only (user picked option b, 2026-06-15).

## Why snapshots are needed

`.lrtl` stores only **cumulative** `runtime` + `last_played` per game — no per-session history. So weekly playtime / streaks are NOT recoverable from a single scan. Fix: each scan, record cumulative seconds per game; diff successive snapshots to get per-day deltas. Cumulative runtime is monotonic, so `dayDelta = lastSnapshotOfDay − lastSnapshotOfPriorDay`.

**Caveat to surface in UI:** history only accrues going forward — no backfill. First days/weeks are sparse until snapshots accumulate. Show an empty/"building history" state, not a broken graph.

## Data model — snapshot history

One append-only JSONL file per source: `{CONFIG_DIR}/activity-history/{cacheKey}.jsonl`
(`cacheKey` reuses `deviceCacheKey` / `virtualMountCacheKey` — same keys as activity-cache).

One line per scan:

```ts
interface RuntimeSnapshot {
  at: string;                      // ISO, scan time
  totalSeconds: number;            // Σ cumulative runtime across all games this source
  games: Record<string, number>;  // normalizedName → cumulative runtimeSeconds
}
```

- **Append-only** — JSONL = one append per scan, never rewrites the file. Pi-cheap (no full read on the hot scan path).
- Per-game map kept (not just total) so per-game trends are possible later; it's a few hundred small ints, negligible.
- Identical consecutive totals (scan with no play) are fine — they yield delta 0.
- Optional later: nightly compaction to one line/day (keep the max). Not v1.

## Backend

### Hook: capture snapshot in `refreshCache` (`server/utils/activityCache.ts`)
After `entries` is built and `persistCache` runs (~line 114-116), append a snapshot:
- `totalSeconds = Σ entries[].runtimeSeconds`
- `games = { [e.normalizedName]: (acc + e.runtimeSeconds) }` (fold; a name can span cores/files on one source)
- append `{ at: scannedAt, totalSeconds, games }` to `activity-history/{cacheKey}.jsonl`
- New util `appendSnapshot(cacheKey, snapshot)` + `loadHistory(cacheKey): RuntimeSnapshot[]` in a new `server/utils/activityHistory.ts` (keep cache file concerns separate). Failure to append must NOT fail the scan — wrap in try/catch, log only.

### New endpoint `GET /api/activity/trends?days=14`
- Load every history file, parse JSONL lines.
- Bucket snapshots by **server-local day** (`YYYY-MM-DD` from `at`).
- Per source: for each day, take the last snapshot's `totalSeconds`; `dayDelta = thisDay − priorObservedDay` (clamp negative to 0 — handles cache resets/source swaps).
- Sum deltas across sources per day → unified daily series.
- Return:

```ts
{
  days: { date: string; seconds: number }[];   // oldest→newest, last `days` days, zero-filled
  weekSeconds: number;                          // Σ last 7 days
  streakDays: number;                           // consecutive days up to today with seconds > 0
  haveHistory: boolean;                         // false when <2 snapshots exist anywhere → UI shows "building history"
}
```

### `/api/activity` (existing) — no change needed
Totals tiles compute client-side from the games array already returned.

## Home page (`pages/index.vue`)

Add above "Recently played" (keep that section):
- **Headline tiles** (from `/api/activity` games): total hours (`Σ totalSeconds`), games played (count), total sessions (`Σ totalPlayCount`), last-active (already shown — fold into the strip).
- **This week** (from `/api/activity/trends`): sparkline of `days[].seconds` + `weekSeconds` total + `streakDays`. Empty state when `!haveHistory`.
- **Top played** (from `/api/activity` sorted by `totalSeconds` desc, top 5) — distinct from existing Recently-played (sorted by `lastPlayedAt`).
- **By device**: hours per source, folding `perDevice[].runtimeSeconds` across games (e.g. "RG35XX 41h · Deck 12h").

Keep existing Devices / Needs-attention / Quick-actions sections.

Sparkline: tiny inline SVG component (`components/Sparkline.vue`) — array of seconds → normalized bars/polyline. No chart lib (Pi bundle stays small).

## Build order (each independently testable)

1. `server/utils/activityHistory.ts` — `appendSnapshot` + `loadHistory`. Unit-verify append/parse round-trip.
2. Hook snapshot append into `refreshCache` (try/catch, never breaks scan). Scan a source twice; confirm JSONL grows.
3. `GET /api/activity/trends` — bucketing + delta + streak. Verify against a hand-made history file.
4. `components/Sparkline.vue`.
5. Home dashboard layout: tiles + by-device split + top-played (all from existing `/api/activity`) — ships value even before trends wired.
6. Wire This-week sparkline + streak + empty state.

## Notes / constraints

- Pi Zero 2 W: append-only on scan path, full history read only on dashboard load. Comfortable.
- Day bucketing uses server-local date for consistency (`.lrtl` last_played is naive local; close enough).
- No backfill — be honest in the UI while history builds.
- Relates to [[project_dashboard_direction]] (home = control tower) and the deploy constraint [[project_deploy_target_pi_zero_2w]]. Storage-quartermaster dashboard is the planned sibling (do after this).
