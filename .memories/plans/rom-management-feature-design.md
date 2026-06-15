---
id: rom-management-feature-design
title: ROM management feature — shipped; scope frozen
status: completed
created: 2026-06-10T00:03:54.228Z
updated: 2026-06-15T20:57:03.950Z
tags:
  - rom-management
  - design
  - schema
  - ux
---

# ROM management feature — SHIPPED, scope frozen (2026-06-15)

v1 built and live. Reviewed full roadmap with user on 2026-06-15; cut everything speculative. Project is feature-complete for intended use (solo retro save/ROM manager on a Pi Zero 2 W). No active ROM-management work item.

## Built and live
- `pages/roms/index.vue` — library scan + list, **source selector** ("All sources" + per-device/source filter). This IS the device-inventory view.
- `pages/roms/[gameKey].vue` — game detail: variants (make-default), per-device matrix (installed/preferred pills: match/mismatch/unknown/not-installed), preferred-variant picker w/ inherit-default, save-profile link, display-name override, notes, libretro art search.
- `pages/roms/transfer.vue` — multi-source any→any transfer. ROMs / Art / Names tabs. Plan→select→execute; **the plan list is the preview** (per-item alreadyInstalled / blocker / size).
- Launcher metadata writers: **ES-DE** (gamelist.xml) + **muOS** (names + box art push/harvest/reconcile).
- Device eject (Windows verified). Reconnect/adopt devices registered on another machine. Virtual mounts as transfer endpoints.

## Scope decisions — explicitly NOT doing (2026-06-15)
- **CRC hash audit page** — CUT. Filename-match on scan is enough for solo curation; full hashing fights the Pi constraint. If integrity check ever needed → offline desktop-indexer job, never on the Pi.
- **DAT ingestion (No-Intro/Redump)** — CUT. Only pays off paired with CRC; big lift, niche reward.
- **Device-side "what's on device" view** — CUT (redundant). `/roms` source selector already does it.
- **Bulk-transfer extras (comparison view / separate Transfer+Review buttons)** — CUT. Plan screen already = preview; a skip-preview button removes the look-before-leap safety. If the screen feels heavy later, polish (auto-preselect transferable, collapse already-installed into a summary row), don't bypass.
- **+Add variant affordance** on game detail — CUT (decision 5 closed as won't-do).
- **One-tap adopt/replace** for unknown installed variants — CUT (decision 2 closed as won't-do).
- More launcher writers (RetroArch/Anbernic/OnionOS/Knulli) — not planned; revisit only if a device needs it.

## Known small cleanup
- `pages/devices/[id].vue:218` label `"muOS (names coming soon)"` is stale — muOS name writer shipped. Drop "(names coming soon)".

## Constraints unchanged
Pi Zero 2 W (~512MB): no on-device AI/embeddings, lazy/cached hashing only, heavy work pushed to an offline desktop indexer. See memory/project_deploy_target_pi_zero_2w.md.

