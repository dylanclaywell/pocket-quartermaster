---
id: storage-quartermaster
title: Storage quartermaster — space-aware ROM curation
status: completed
created: 2026-06-16T00:00:00.000Z
updated: 2026-06-16T01:00:00.000Z
tags:
  - feature
  - storage
  - roms
  - activity
  - dashboard
---

# Storage quartermaster — space-aware ROM curation

The literal quartermaster job: show each device's space budget, then surface dead weight — ROMs taking space you never play that are safely backed up elsewhere — and let the user dump it in one tap. Joins three data sources that already exist (device free/size, ROM library footprint, activity playtime). Sibling to [[activity-dashboard]].

## Core principle — never auto-delete (non-negotiable)
The tool only ever **suggests + reclaims on command**. Three gates stand between a candidate and deletion:
1. **Suggest** — `GET /api/storage` is strictly read-only; it computes candidates, never touches files. Candidates render **unselected** by default.
2. **User selects + confirms** — deletion happens only via a separate explicit endpoint, on a user-ticked subset, behind a confirm dialog that names the device, file count, and whether it's the last copy.
3. **Server validates** — the delete endpoint re-checks every path (inside `romsRoot`, mounted, not host disk) and deletes only the exact filenames passed.
No code path deletes without user action. The quartermaster advises; the user signs the order.

## Data already available
- **Free/size per mount** — `safeStatfs` → `MountInfo.sizeBytes`/`freeBytes` (`server/utils/devices.ts:141`). NOTE: `/api/devices/known` currently drops these (keeps only mountPath/driveType) — the storage endpoint must surface them itself.
- **ROM footprint** — `computeLibrary` gives per-game `variants[].sizeBytes` + `variants[].librarySources[]` (which sources hold each file) + per-destination `status` (`romLibrary.ts`).
- **Playtime** — `/api/activity` aggregated `totalSeconds` per `normalizedName`.

## The name-join — RESOLVED: direct
ROM `gameKey` IS the activity `normalizedName` — both are `normalizeGameName(displayName)` from `retroarchActivity.ts` (`romScan.ts:355` ↔ `retroarchActivity.ts:164`). So joining ROM footprint to playtime is a direct key match; no new normalizer needed. Unmatched/unplayed ROMs get `playSeconds = 0` (prime prune candidates anyway).

## Backend — `GET /api/storage` (NEW)
One endpoint, folds everything:

```ts
{
  devices: {
    id: string; nickname: string; mounted: boolean;
    sizeBytes?: number; freeBytes?: number;     // from statfs, mounted only
    romBytes: number;                            // Σ sizes of variants installed on this source
    romCount: number;
  }[];
  pruneCandidates: {
    gameKey: string; displayName: string; system: string;
    sourceCacheKey: string; sourceLabel: string;
    filenames: string[];                         // files to delete on that source
    bytes: number;                               // reclaimable on that source
    playSeconds: number;                         // joined from activity (0 if never/unmatched)
    backedUpElsewhere: boolean;                  // same game present on another source
  }[];
}
```

Candidate rule: a (game, source) pair where the game is **installed** on that source (`destination.status !== "not-installed"`) AND (`playSeconds` low/zero). Flag `backedUpElsewhere` = the same game present on ≥2 sources (`librarySources.length > 1`, or destinations installed-count > 1). Sort client-side by **bytes ÷ (playSeconds + 1)** desc — biggest space, least-played first. Show `backedUpElsewhere` prominently; deleting the only copy is the dangerous case.

## Backend — delete op (NEW, careful)
`POST /api/roms/destination/remove` — body `{ sourceCacheKey, gameKey, filenames }`.
- **Irreversible.** Resolve the source's current mount; the target files live at `<romsRoot>/<system>/<filename>`.
- **Guard hard** (mirror the eject safety in `server/api/devices/[id]/eject.post.ts`): resolve absolute paths, assert each is *inside* the resolved `romsRoot` (no traversal), refuse if the source isn't currently mounted, refuse host fixed disk.
- Unlink the files, then refresh that source's ROM cache so the matrix updates.
- Return `{ removed: string[], freedBytes, errors }`.
- UI must confirm with an explicit dialog naming the device + file count + whether it's the last copy.

## UI — `/storage` page (linked from home + nav)
- **Per-device budget**: row per mounted device — used/free bar (`sizeBytes`/`freeBytes`), `romBytes` footprint annotation, romCount. Offline devices listed greyed (no statfs). Reuse `formatBytes`.
- **Prune list**: candidates sorted by reclaimable-per-playtime. Each row: art/name, system, size, playtime ("never played" / "12m"), a `backed up on N sources` / `⚠ only copy` pill, checkbox.
- **Reclaim bar** (sticky): N selected · X reclaimable → "Remove from <device>" → confirm dialog → call delete op → refresh.
- Optional home teaser: a compact "Storage" card showing the fullest device's free % + "N GB reclaimable" linking to `/storage`.

## Build order (each independently testable)
1. Resolve the name-join: verify whether ROM `gameKey` matches activity `normalizedName`; pick/centralize one normalizer.
2. `GET /api/storage` — device budgets + footprint first (no activity join) → renders a useful page immediately.
3. Join activity playtime + `backedUpElsewhere` into `pruneCandidates`.
4. `/storage` page: device budget bars + prune list (read-only, no delete yet).
5. `POST /api/roms/destination/remove` with path guards + post-delete cache refresh.
6. Wire selection + confirm dialog + reclaim bar to the delete op.
7. Optional home "Storage" teaser card.

## Notes / constraints
- Pi Zero 2 W: all reads are folds over already-cached data + a few statfs calls. Delete is an explicit user action. No hashing. Comfortable.
- Never auto-delete. Every removal is user-initiated + confirmed; default-surface the "only copy" warning.
- Offline devices: show last-known footprint from cache if useful, but free/size require a live mount — gate clearly.
- Relates to [[project_deploy_target_pi_zero_2w]] and the home-as-control-tower direction [[project_dashboard_direction]].
