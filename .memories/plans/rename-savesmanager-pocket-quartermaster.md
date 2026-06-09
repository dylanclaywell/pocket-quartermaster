---
id: rename-savesmanager-pocket-quartermaster
title: Rename SavesManager → Pocket Quartermaster
status: active
created: 2026-06-09T21:02:03.999Z
updated: 2026-06-09T21:02:03.999Z
tags:
  - rename
  - refactor
  - milestone
---

# Rename SavesManager → Pocket Quartermaster

## Why

App scope has outgrown "saves manager" — RetroArch activity view is already in, and the next planned feature is selecting/transferring ROMs from a master SSD to handhelds. Name was chosen for the double meaning: a quartermaster issues supplies for an expedition (matches the SSD-curate-and-pack workflow), and a quarter is the coin for arcade games. "Pocket" anchors it to handhelds.

GitHub repo already renamed by the user from `saves-manager` to `pocket-quartermaster`.

## Naming conventions

- **Display name** (UI, README h1, prose): `Pocket Quartermaster`
- **Slug** (repo, npm package, env-paths key): `pocket-quartermaster`
- **Short alias** (install dir, env file, service name, marker file): `pqm`
- **Env var prefix**: `PQM_*` (was `SAVESMANAGER_*`)
- **Build artifact**: `pocket-quartermaster-output.zip`
- **HTTP User-Agent**: `PocketQuartermaster-Thumbnail/1.0`

## Files to touch (27 total)

### Code
- `package.json` — name, description
- `nuxt.config.ts` — app head title
- `app.vue` — nav title
- `server/utils/storage.ts` — `envPaths("savesmanager")` → `envPaths("pocket-quartermaster")`, add one-shot legacy data-dir migration
- `server/utils/activityCache.ts` — same `envPaths` swap
- `server/utils/thumbnails.ts` — same `envPaths` swap
- `server/utils/types.ts` — `MARKER_FILENAME = ".pqm-device-id.json"`
- `server/utils/runtime.ts` — `SAVESMANAGER_ALLOW_VIRTUAL_MOUNTS` → `PQM_ALLOW_VIRTUAL_MOUNTS`
- `server/utils/deviceId.ts` — comment only
- `server/api/virtual-mounts/index.post.ts` — error message string
- `server/api/thumbnails/search.get.ts` — User-Agent (2 spots)
- `server/api/thumbnails/download.post.ts` — User-Agent
- `pages/devices/index.vue` — copy + UI string showing env var name

### Deploy / install
- `deploy/savesmanager.service` → rename to `deploy/pqm.service`, update paths
- `deploy/savesmanager.env.example` → rename to `deploy/pqm.env.example`, update comments
- `deploy/install.sh` — repo, install dir, service name, env file name, env var prefix
- `deploy/update.sh` — same
- `deploy/install.bat` — bootstrap URL
- `deploy/install.ps1` — repo, env file name
- `deploy/update.ps1` — repo, artifact name
- `deploy/run.ps1` — env file name, banner text
- `deploy/release-notes-header.md` — install URL, paths

### CI / release
- `.github/workflows/release.yml` — artifact name, deploy asset paths (renamed files)
- `release-please-config.json` — `package-name: pocket-quartermaster`
- `CHANGELOG.md` — leave alone (historical, release-please owns it)

### Docs
- `README.md` — full rewrite for the new name + brand

### Auto-regenerated
- `package-lock.json` — regenerates on next `npm install`

## Migration shim

One-shot in `server/utils/storage.ts` (or shared util) that runs on startup:
- If `~/.config/savesmanager/` (or `%APPDATA%\savesmanager\`) exists AND `~/.config/pocket-quartermaster/` does not, `rename` the old to the new.
- Same for the `data` dir (where `backups/` lives).
- Idempotent; safe to run on every boot.

No backward-compat read for the device marker file or `SAVESMANAGER_*` env vars — the user confirmed nobody (including them) has a live install.

## Open PR cleanup

`release-please--branches--main--components--savesmanager` exists on origin from the prior release cycle. After the rename merges, release-please will open a new PR with the `pocket-quartermaster` component name. Close the old one manually.

## Sequencing

1. Branch `rename/pocket-quartermaster` (done).
2. Edit code files (in-place, in parallel where safe).
3. Rename deploy files (`savesmanager.service` → `pqm.service`, `savesmanager.env.example` → `pqm.env.example`).
4. Update workflow to reference renamed deploy files + new zip name.
5. `npm install` (regenerates lockfile name field).
6. `npm run typecheck`.
7. Start dev server, hit `/`, verify nav title says "Pocket Quartermaster", kill the dev server.
8. Goldfish checkpoint (BEFORE commit — included in the commit so it propagates).
9. Commit + push + open PR.
