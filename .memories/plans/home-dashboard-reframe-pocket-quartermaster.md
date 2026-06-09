---
id: home-dashboard-reframe-pocket-quartermaster
title: Home dashboard reframe (Pocket Quartermaster)
status: active
created: 2026-06-09T21:30:16.187Z
updated: 2026-06-09T21:30:16.187Z
tags:
  - dashboard
  - ux
  - scope-expansion
---

# Home dashboard reframe

## Why

App scope has shifted from "save manager" to "handheld quartermaster" (rename merged on `rename/pocket-quartermaster`). The current home is just a profile list — it ignores everything else the app already does (activity tracking, device mounting, virtual mounts, thumbnails) and doesn't fit the new framing of "what's going on with my handhelds."

User approved the dashboard-first variant (profiles list moves off home).

## Tiles (v1)

1. **Recently played** — top 5 from `GET /api/activity` (`games[]` already sorted by `lastPlayedAt`). Reuse `<GameCard>` for the tile (compact aspect-square grid).
2. **Devices at a glance** — from `GET /api/devices/known` (already returns `mounted` + `currentMountPath`). One row per device with mount state.
3. **Profiles needing attention** — from `GET /api/profiles`, filter `ready: false`. Hide the section entirely when empty.
4. **Quick actions** — Scan activity (POST `/api/activity/scan`), New profile (link `/profiles/new`), Add device (link `/devices`). Placeholder slot for future ROM-transfer.

## File changes

- **NEW** `pages/profiles/index.vue` — verbatim move of current `pages/index.vue` profile-list logic.
- **REWRITE** `pages/index.vue` — dashboard.
- **EDIT** `app.vue` — add Profiles link between title and Activity in the header.

## Sequencing

1. Create `pages/profiles/index.vue` (move existing list).
2. Add nav link in `app.vue`.
3. Rewrite `pages/index.vue` as dashboard.
4. `npm run typecheck`.
5. `npm run dev`, hit `/`, verify each tile renders and links work, kill child node PID.
6. Stop. Don't commit unless user asks.

## Out of scope

- New API endpoints — v1 reuses `/api/activity`, `/api/devices/known`, `/api/profiles` even though `/api/activity` returns the full aggregate for a 5-game tile. Optimize later if needed.
- ROM library / transfer queue tile — defer until that feature lands (the "placeholder slot" is just a disabled button hint).
- Storage/free-space — requires shelling out per mount; defer.

