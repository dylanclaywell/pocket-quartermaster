---
id: rom-management-feature-design
title: ROM management feature design
status: active
created: 2026-06-10T00:03:54.228Z
updated: 2026-06-10T18:26:41.364Z
tags:
  - rom-management
  - design
  - schema
  - ux
---

# ROM management feature — IN PROGRESS (build well past original design)

Status as of 2026-06-10: the design phase is done AND most of v1 is built. The original "next step" (mock /games/[id] with fixtures) is obsolete — the real, API-backed implementation shipped across commits 765c8bf → 34cc931.

## Built and live

- `pages/roms/index.vue` — ROM library scanning + UI
- `pages/roms/[gameKey].vue` — game-detail page, fully API-backed: variants list (with make-default), per-device matrix with installed/preferred status pills (match/mismatch/unknown/not-installed), preferred-variant picker with inherit-default, save-profile link, display-name override, notes
- `pages/roms/transfer.vue` — ROM transfer (built as its own page, NOT the bottom sheet the design floated)
- `components/GameCard.vue`, `components/AppSelect.vue` (replaced native selects)
- ROM variant management with master/destination device roles
- Reconnect devices registered on another computer
- Virtual mounts as transfer sources/destinations

## Open decisions — resolution status

1. Variant detection → RESOLVED: filename-match on scan (status pills computed server-side). Full-hash audit still not built.
2. "Installed: unknown" handling → PARTIAL: unknown variants surfaced as warn pill on device rows; one-tap "adopt as new variant" / "replace with preferred" NOT yet built.
3. inherit-default vs explicit pick → RESOLVED: `preferredInherited` + "Use default (…)" option in AppSelect.
4. Push action shape → RESOLVED differently: dedicated `/roms/transfer` page instead of bottom sheet.
5. "Add" in Variants section → NOT built: no "+Add variant" affordance on the detail page yet.

## Still on the table (candidate next work)

- "+Add variant" affordance on game-detail (folder picker rooted at master romsRoot, CRC + filename parse).
- One-tap adopt/replace for unknown installed variants on device rows.
- Full-CRC hash-verification "audit" page (opt-in; Pi-friendly as explicit user action only).
- DAT-file ingestion (No-Intro/Redump XML) to populate CRC/SHA1 deterministically.
- Multi-launcher metadata writers: ES-DE (gamelist.xml) + muOS first; RetroArch/Anbernic/OnionOS/Knulli planned. (Verify whether any writer is wired yet — design names this as the differentiator.)
- Device-side "what's on this device" view (flip the matrix).
- Bulk transfer (select N games → destination plan → confirm).

## Constraints unchanged

Pi Zero 2 W (~512MB): no on-device AI/embeddings, lazy/cached hashing only, heavy work pushed to an offline desktop indexer. See memory/project_deploy_target_pi_zero_2w.md.

## Pickup hint

Confirm with the user which thread to pull next — likely "+Add variant" + unknown-variant adopt/replace (closes decisions 2 & 5), OR start the ES-DE/muOS metadata writers (the stated differentiator, not yet verified as built).
