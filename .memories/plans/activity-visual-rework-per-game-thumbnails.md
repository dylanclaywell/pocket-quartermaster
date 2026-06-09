---
id: activity-visual-rework-per-game-thumbnails
title: Activity visual rework + per-game thumbnails
status: active
created: 2026-06-09T15:46:23.401Z
updated: 2026-06-09T15:46:23.401Z
tags:
  - feature
  - activity
  - thumbnails
---

# Activity visual rework + per-game thumbnails

Make the activity page the focal point with a squircle grid, and add a per-game config page where users can search libretro-thumbnails or paste an image URL to cache box art on the Pi.

## Storage model

- `{CONFIG_DIR}/thumbnails/<sanitizedName>.<ext>` — cached game art
- `{CONFIG_DIR}/thumbnails-index/<libretroRepoName>.json` — cached file list per libretro repo (refresh after 7 days)
- Filename uses the normalizedName from activity (already lowercase + punctuation-stripped + ASCII)

## Backend

- `server/utils/cores.ts` (NEW) — single source of truth `core → { displaySystem, libretroDbNames[] }`. Replaces inline map in retroarchActivity.ts. Multi-system cores like Gambatte get multiple candidate dbNames.
- `server/api/activity/index.get.ts` — include `libretroDbNames: string[]` per aggregated game.
- `server/utils/thumbnails.ts` (NEW) — sanitize name, save/find/delete cached files.
- `server/api/thumbnails/[name].get.ts` (NEW) — stream cached PNG/JPG, 404 if missing.
- `server/api/thumbnails/[name].delete.ts` (NEW) — remove cached thumbnail.
- `server/api/thumbnails/download.post.ts` (NEW) — `{ normalizedName, sourceUrl }`. Validates content-type is image, caps size at 5 MB, writes to cache dir.
- `server/api/thumbnails/search.get.ts` (NEW) — `?systems=<a,b>&q=<query>`. Fetches `api.github.com/repos/libretro-thumbnails/{repo}/git/trees/HEAD?recursive=1` per system, caches per-repo on disk, filters Named_Boxarts/ matches by query.

## Activity page rework (`/activity`)

- Header: title + "Scan all" (unchanged)
- Last scan results: same as today
- **Games grid first** — responsive `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`, `aspect-square rounded-[22%]`. Card content:
  - Background = `<img>` of thumbnail if cached, else dark gradient
  - Bottom translucent footer overlay: display name, system, total time
  - Whole card is a `<NuxtLink>` → `/activity/[normalizedName]`
- **Sources** section collapses to a compact summary bar at the bottom (count configured + count cached + last-scan time link)

Move `pages/activity.vue` → `pages/activity/index.vue` first so the dynamic child route works (same nested-routing fix we did for devices).

## Per-game config page (`/activity/[normalizedName]`)

Reached by tapping a game card. Content:
- Header: display name, system, total playtime, last played
- **Box art** section:
  - Preview tile (current art, or placeholder)
  - **Search libretro thumbnails**: debounced autocomplete. Results = dropdown of filename + tiny preview. Click → POST /api/thumbnails/download → preview updates.
  - **Or paste an image URL**: input + Download button → same download endpoint.
  - **Remove** button when art exists.
- **Per-device breakdown**: where this game was played, total per device, last played per device. (Moved from card expansion.)
- Back link.

## Build order

1. Move `pages/activity.vue` → `pages/activity/index.vue`.
2. Extract `server/utils/cores.ts`, refactor retroarchActivity.ts, include libretroDbNames in /api/activity output.
3. Thumbnail storage util + GET/DELETE endpoints.
4. Squircle grid layout on `pages/activity/index.vue` — cards display thumbnail when cached, fallback gradient otherwise. Sources section below.
5. Download endpoint with URL validation.
6. Search endpoint with disk-cached GitHub trees.
7. Per-game config page with autocomplete + URL fallback.

Each chunk is independently testable: the page looks good even before art is wired; art works before the config UI; config UI works before search is added (URL paste already covers the path).

## Notes

- GitHub unauth API: 60 req/hr/IP. Disk cache per-repo with 7-day TTL makes this comfortably under limit.
- Network use is opt-in (user explicitly clicks "Search" or pastes a URL). Default behavior is fully local.
- Sanitize the filename defensively even though normalizedName is already safe.

