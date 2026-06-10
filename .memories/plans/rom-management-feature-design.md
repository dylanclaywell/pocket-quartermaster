---
id: rom-management-feature-design
title: ROM management feature design
status: active
created: 2026-06-10T00:03:54.228Z
updated: 2026-06-10T00:03:54.228Z
tags:
  - rom-management
  - design
  - schema
  - ux
---

# ROM management feature design

Picked up after the dashboard reframe (2026-06-09). User wants Pocket Quartermaster to grow from save-sync + activity into a general ROM-management tool: one master library, many destination handhelds, push selected games to selected devices.

## Why

The user already has a clear mental model: one device holds the canonical ROM collection; other devices receive transfers. The closest existing tools (EmuDeck — Deck-centric; SRM — Steam-shortcut ingestion only; ClrMamePro/RomVault — desktop DAT auditors; rsync — no layout awareness, no UI) each hit one piece of the problem. The unique-ish niche being claimed: web-served, Pi-hostable, multi-device-aware, mobile UI from your phone next to the cradle, bundled with the existing save-sync + activity-tracking.

Hardware constraint that shapes everything: server runs on a **Raspberry Pi Zero 2 W** (~512 MB RAM, quad A53). Rules out on-device LLM/embeddings; full-content hashing of multi-GB ROMs needs to be lazy/cached. See `memory/project_deploy_target_pi_zero_2w.md`.

## Decisions reached

1. **Concrete schema for v1, not the full abstract resolver.** Per-device path config parallel to the existing `retroarchActivityDir`. The abstract version (logical roms + device layouts + manifest reconciler) is the right *destination* if this app ever grows past single-user-curated, but it's a lot of moving parts before the first transfer works. Start concrete; structure schema so a future logical layer can be hoisted out.

2. **Game vs RomFile split.** A `Game` is the user-facing entity (display name, save profile linkage, boxart). A `RomFile` is the physical fact (filename, CRC32, size, region/revision tags). One game has N rom files (regional variants, romhacks, revisions). This is the No-Intro mental model and aligns with how every launcher already separates `label` from `path`.

3. **Filename ≠ display name.** Master keeps canonical No-Intro filenames (`Pokemon Emerald (USA) (Rev 1).gba`) for CRC stability and DAT-matching. Display strings (`Pokemon Emerald`) are written into the device's launcher metadata file at transfer time — *not* baked into the filename. This is what unlocks multi-launcher support.

4. **Per-device preferred variant.** For each `(game, device)` pair, store which variant should be there. Falls back to a game-level default if not set. Most users ship one variant per device; the schema accommodates "USA on Deck, EUR on RG35XX" without ceremony.

5. **Saves key on `(game, variant)`, not `(game)`.** USA vs EUR Emerald aren't byte-compatible saves — different battery formats, language locks. Coupling save profiles to a specific variant prevents silent corruption and is invisible UX when only one variant exists.

6. **Multi-launcher metadata writers are the differentiator.** Start with **ES-DE** (`gamelist.xml`) and **muOS** (SQLite/scrape format). Others (RetroArch playlists, Anbernic stock, OnionOS, Knulli) are planned. The metadata writer is what lets canonical filenames live on disk while the device shows clean display names.

7. **No on-device AI.** AI-driven fuzzy matching for romhacks / weird dumps is explicitly out of this app — may land in a companion desktop indexer later. DAT-file ingestion (No-Intro / Redump XML, opt-in) gives ~95% of the value deterministically.

## Data model sketch

```
Game {
  id: stable uuid
  displayName: string          # user-editable, what shows in launchers
  system: string               # canonical key, mirrors RetroArch playlist names
  defaultVariantId?: RomFileId # falls back to this when device has no preference
  notes?: string
  saveProfileId?: ProfileId    # link to existing save-profile feature
}

RomFile {
  id: stable uuid
  gameId: GameId
  filename: string             # canonical No-Intro name on master
  crc32: string                # populated lazily; primary identity
  sha1?: string                # nullable, populated when DAT integration lands
  size: number
  regionTags: string[]         # parsed from filename, editable
  revision?: number
  languages?: string[]
  sourcePath: string           # path on master library
}

DeviceRomConfig {            # one per device, extends existing Device
  romsRootRelPath?: string     # parallel to retroarchActivityDir
  systemFolderOverrides?: Record<string, string>  # rare; only for handhelds that diverge
  launcherKind: 'es-de' | 'muos' | 'retroarch' | 'anbernic-stock' | ...
}

DeviceGamePreference {       # per-(game, device) row
  gameId
  deviceId
  preferredVariantId?: RomFileId   # null = use game's default
  installedVariantId?: RomFileId   # null = not installed; populated by scan
}
```

Multi-disc games (PS1/Saturn/PCE-CD): make `RomFile` actually able to represent multiple files at the entity level (`files: Path[]`) from day one — cheap upfront, miserable to retrofit.

## Game-detail page mock

```
‹  Pokemon Emerald                              [⋮]

   [boxart]   Game Boy Advance
              42h 18m · last played 3 days ago
              Save profile: gba/emerald-shared  ›

VARIANTS                                       + Add
─────────────────────────────────────────────────────
● Pokemon Emerald (USA).gba                  [default]
  USA · 16 MB · CRC 1F1BB527
  from: SSD Library  /Roms/gba/

○ Pokemon Emerald (Europe) (En,Fr,De,Es,It).gba
  EUR · 16 MB · CRC E5C7A8A8 · En, Fr, De, Es, It
  from: SSD Library  /Roms/gba/

ON YOUR DEVICES
─────────────────────────────────────────────────────
RG35XX SP            installed: USA           [···]
  prefers: USA  ·  Roms/GBA/Pokemon Emerald.gba

Steam Deck           installed: USA           [···]
  prefers: USA  ·  Emulation/roms/gba/Pokemon Emerald.gba

RP4 Pro              not installed            [push]
  prefers: (use default)

Anbernic Win600      installed: EUR ⚠         [···]
  prefers: USA  ·  ROMS/GBA/Pokemon Emerald (EUR).gba

PLAYTIME BY VARIANT
─────────────────────────────────────────────────────
USA    42h 12m    RG35XX SP · Steam Deck
EUR     0h 06m    Anbernic Win600
```

`[⋮]` menu on header: edit display name, change system, unlink save profile.
`[···]` per device row: push / pull / remove / change preferred variant.
`⚠` next to "installed: X" means installed variant ≠ preferred variant.

## Open decisions (pick these up next session)

1. **Variant detection on a device.** CRC every ROM on scan (slow on multi-GB systems over USB) or filename-match against the catalog + on-demand "verify this device" hash sweep button. Leaning toward filename-match for the scan path; full-hash as explicit user action.
2. **"Installed: unknown" handling.** A file at the right path with no CRC match in the catalog. Two affordances: "adopt as a new variant of this game" (CRC it and add a RomFile row) or "replace with preferred variant." Both should be one-tap.
3. **`prefers: (use default)` vs explicit pick.** Worth keeping explicit "inherit game default" as a state so changing the game's default propagates. The mock shows this on RP4 Pro.
4. **Push action UX shape.** Bottom sheet on the same page (variant pick + path preview + metadata-write note + confirm) vs. dedicated page. Sheet probably; matches phone-first feel.
5. **What does "Add" do in the Variants section?** Probably opens a folder picker rooted at the master's romsRoot for that system, lets user pick file(s), CRCs them, parses filename for region tags.

## Next-page candidates (after game-detail)

- **Device-side view:** "what's on this RG35XX" from the device's perspective — flip the matrix, one row per game with current/preferred variant.
- **Push sheet:** the bottom sheet that fires when the user pushes a single game to a device.
- **Bulk transfer page:** select N games, see destination plan, confirm.
- **Master library ingest:** scan a folder, identify games via filename parsing, group variants under games.

## Rejected alternative

**Full abstract resolver.** `LogicalRom` + `DeviceLayout` + `DeviceManifest` + bidirectional resolver. Big wins are roundtrip recognition (parse paths placed by other tools), reorg-without-data-movement, and master-less peer-to-peer transfers. Rejected for v1 because: (a) recognition requires a hash-or-mini-DSL-filenames decision that gets ugly fast; (b) two sources of truth (catalog + per-device manifests) introduce drift bugs; (c) most of the win is hypothetical for a single-user-curated workflow. Keep the door open by storing `(system, normalized_filename)` as a `romKey` field on transfer records from day one — that's the vocabulary a future `LogicalRom.id` would derive from.

## Out of scope for v1

- AI-assisted matching (companion desktop app, much later).
- DAT-file ingestion (designed-for, not built; CRC and SHA1 fields nullable until then).
- Multi-disc handling beyond the schema support (UX comes later).
- Launchers beyond ES-DE + muOS (RetroArch, Anbernic stock, OnionOS, Knulli planned).
- Hash-verification "audit" page (relies on full-CRC sweep; opt-in feature later).

## Pickup hint for next session

The natural next step is implementing the **game-detail page** as a Vue route at `/games/[id]` with placeholder data (mock the variants + per-device rows from a static fixture). That gets the UX in front of the user before any schema work. Schema changes to `config.json` and the migration story come after the page shape is validated.

