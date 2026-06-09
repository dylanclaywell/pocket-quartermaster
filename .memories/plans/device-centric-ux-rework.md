---
id: device-centric-ux-rework
title: Device-centric UX rework
status: completed
created: 2026-06-09T14:33:49.788Z
updated: 2026-06-09T14:41:24.448Z
tags:
  - ux
  - refactor
  - devices
---

# Device-centric UX rework

User found device registration confusing because it's tucked inside the save-slot flow. Make Devices the central feature; per-device config (activity, save slots) lives in dedicated detail pages.

## Screen map

- `/devices` — hub. Three sections:
  - **Connected now**: each current mount. Action = *Register* (inline form) if no marker, *Open* if marker.
  - **Registered devices**: tappable rows → device detail. Mounted + offline both listed.
  - **Virtual mounts**: kept here for now.
- `/devices/[id]` — NEW. Per-device detail:
  - Nickname (inline rename)
  - Mount status + currentMountPath
  - **Activity** section: picker, current value, scan button, last scan status
  - **Save slots** section: every profile slot referencing this device + "configure new slot" entry point
  - Danger zone: Forget
  - When unmounted: actionable sections shown read-only with "mount this device to change" gates
- `/profiles/[name]/slot/[key]` — REWORK. Pick from **already-registered** devices first. If picked device is mounted, browse for file. If unmounted, show "mount and try again". Remove the inline-registration step entirely.

## Backend additions

- `GET /api/devices/[id]` returns `{ device, slots }` where slots is `{ profileName, slotKey, fileRelPath, isDirectory? }[]` — every profile-slot referencing this device.

## Implementation order

1. Add `GET /api/devices/[id]` endpoint.
2. Build `pages/devices/[id].vue` detail page.
3. Rework `pages/devices.vue`: 3 sections, inline registration form for unregistered mounts, remove inline activity editors (moved to detail page), rows tap into detail.
4. Rework `pages/profiles/[name]/slot/[key].vue`: pick from registered devices, no inline registration.
5. Smoke test full flow.

## Out of scope

- Home page (`/`) layout — stays as-is for now.
- Game transfer feature — still parked.

