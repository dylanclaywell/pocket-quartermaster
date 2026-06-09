# Pocket Quartermaster

A mobile-friendly web UI for manually managing retro game saves (and, eventually, ROM loadouts) across your handhelds, PC, and SD cards. Meant to be run on a server (I built it with Raspberry Pi in mind). Built on Nuxt 3 + Tailwind.

- **Multi-device profiles**: each save belongs to a profile that can bind any number of devices. You pick the source and destination explicitly at transfer time — no auto-resolution, allowing for complete control to avoid accidental overwrites.
- **Per-slot sync timestamps**: every slot records when it was last touched by a transfer so you can tell at a glance which device is stale (or ignore it - you might know better!)
- **Device identity that survives mount changes**: a tiny marker file on each device's root keeps the device's identity stable even when the drive letter or mount path changes between sessions.
- **Backups on every overwrite**: before the destination is replaced, the prior file is copied into your user data directory so you can roll back a bad transfer.
- **Virtual mounts**: point at any folder (e.g. a network share) and treat it like a removable drive — handy for syncing to a PC without juggling SD cards or keeping multiple copies of the same save on your desktop.
- **RetroArch activity view**: if your devices expose RetroArch playlists, Pocket Quartermaster surfaces per-game playtime and thumbnails alongside the saves they belong to.

---

## Install

You don't need to clone this repo to run Pocket Quartermaster. The installers pull the latest prebuilt release from GitHub. If you'd rather not run a script, [Manual install](#manual-install-any-platform) and [Build from source](#build-from-source) below cover the same thing by hand.

### Prerequisites

**Node.js 22 or newer** must be installed and on your `PATH` before running either installer below. The installers won't download or install Node for you — grab the LTS build from <https://nodejs.org/> or your distro's package manager first.

### Raspberry Pi / Linux

One-liner first-time install on Debian-based systems (Raspberry Pi OS, Ubuntu, etc.). Pick a host and port up front — `HOST=0.0.0.0` makes Pocket Quartermaster reachable from other devices on your network; `HOST=127.0.0.1` keeps it local-only:

```bash
curl -fsSL https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/install.sh | sudo HOST=0.0.0.0 PORT=3000 bash
```

The `HOST=... PORT=...` go between `sudo` and `bash` (not before `curl`) — sudo treats `NAME=value` args before the command as env-var assignments for the spawned process, so they reach the installer. Putting them before `curl` would scope them to `curl` only and `sudo` wouldn't see them.

What this does:

1. Verifies Node.js is installed (exits with instructions if not).
2. Creates `/opt/pqm/` owned by the `pi` user (override with `PQM_USER=...`).
3. Drops a systemd unit at `/etc/systemd/system/pqm.service`, enables it, and starts the server on `http://<host>:<port>`.
4. Seeds `/opt/pqm/pqm.env` with your chosen `HOST` and `PORT`.

| Action         | Command                      |
| -------------- | ---------------------------- |
| Update later   | `sudo /opt/pqm/update.sh`    |
| Service status | `systemctl status pqm`       |
| Tail logs      | `journalctl -u pqm -f`       |
| Edit config    | `sudo nano /opt/pqm/pqm.env` |
| Apply config   | `sudo systemctl restart pqm` |

To change `HOST` or `PORT` later, edit `pqm.env` and restart the service — see [Configuration](#configuration). The installer respects an existing env file on re-runs and won't overwrite it.

Other installer overrides (install location, service user, repo) follow the same `sudo NAME=value bash` shape — for example `... | sudo PQM_DIR=/srv/pqm PQM_USER=pqm HOST=0.0.0.0 PORT=3000 bash`.

### Windows

1. Install Node.js LTS from <https://nodejs.org/> if you don't have it already (24 LTS is the current Active LTS; anything 22+ works).
2. Create a folder for Pocket Quartermaster (e.g. `C:\PocketQuartermaster`).
3. Download [`install.bat`](https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/install.bat) from the latest release into that folder.
4. Double-click `install.bat`. It will prompt you for `Host` and `Port` (press Enter to accept `0.0.0.0` / `3000`), check that Node is on `PATH`, then pull down `run.bat`, `update.bat`, and the latest build with your chosen values baked into `pqm.env`.
5. Double-click `run.bat` to start the server, then open <http://localhost:3000> (or whatever port you picked) in any browser on the same network.

| Action           | What to do                                             |
| ---------------- | ------------------------------------------------------ |
| Start the server | Double-click `run.bat`                                 |
| Stop the server  | Close the `run.bat` window or press `Ctrl+C` inside it |
| Update later     | Double-click `update.bat`                              |
| Edit config      | Open `pqm.env` in any text editor                      |
| Apply config     | Close `run.bat` and reopen it                          |

To skip the interactive prompts (e.g. for unattended installs), set `$env:HOST` and `$env:PORT` in PowerShell before launching `install.bat`:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3000"
.\install.bat
```

To change `HOST` or `PORT` later, edit `pqm.env` and reopen `run.bat` — see [Configuration](#configuration). The installer respects an existing env file on re-runs and won't overwrite it.

### Manual install (any platform)

If you'd rather not run a script — or you're on a platform the installers don't cover (macOS, BSD, NAS, etc.) — you can grab the prebuilt server straight from the release and start it yourself.

1. Install Node.js 22+ (see [Prerequisites](#prerequisites)).
2. Make a folder for Pocket Quartermaster and `cd` into it.
3. Download [`pocket-quartermaster-output.zip`](https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/pocket-quartermaster-output.zip) from the latest release and unzip it. You'll get a `.output/` directory next to wherever you unzipped.
4. Start the server:

   Linux/macOS:

   ```bash
   HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs
   ```

   Windows PowerShell:

   ```powershell
   $env:HOST="0.0.0.0"; $env:PORT="3000"; node .output\server\index.mjs
   ```

   Then open <http://localhost:3000>.

This is exactly what the scripted installers do under the hood — they just add a systemd unit (Linux) or a `run.bat` wrapper (Windows) that wires `HOST`/`PORT` through `pqm.env` and starts the same `node .output/server/index.mjs` command. If you want Pocket Quartermaster to start on boot, set up systemd / `pm2` / NSSM / Task Scheduler yourself; the [pqm.service](https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/pqm.service) unit from the release is a good template.

To update later, repeat the download step — overwrite `.output/` with the contents of the newer zip.

### Build from source

If you'd rather build the server yourself instead of the release artifact:

```bash
git clone https://github.com/dylanclaywell/pocket-quartermaster.git
cd pocket-quartermaster
npm install
npm run build
npm start
```

`npm start` is just `node .output/server/index.mjs`, so the same `HOST` / `PORT` environment variables apply:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

This is the production path. For an HMR dev loop, see [Development](#development) below.

### Configuration

`pqm.env` lives next to `run.bat` (Windows) or in `/opt/pqm/` (Linux) and is a simple `KEY=VALUE` file:

```env
# Bind address. 0.0.0.0 = reachable from other devices on your LAN. 127.0.0.1 = local only.
HOST=0.0.0.0

# TCP port to listen on.
PORT=3000
```

Changes don't take effect until the server is restarted:

- **Linux (systemd):** `sudo systemctl restart pqm`
- **Windows:** close the `run.bat` window (or `Ctrl+C` inside it) and reopen it
- **Manual install / build from source:** stop the `node .output/server/index.mjs` process and start it again with the new env vars in scope

App state (profiles, registered devices, virtual mounts) and overwrite backups live in the OS user data directory — typically `%APPDATA%\pocket-quartermaster\` on Windows and `~/.config/pocket-quartermaster/` + `~/.local/share/pocket-quartermaster/backups/` on Linux.

---

## Usage

The UI is designed to be driven from a phone or PC while you have access to the same network. Open <http://your-host:3000> from any device on the same network.

### 1. Register your devices

Plug a device in (SD card, handheld in mass-storage mode, etc.) and open **Devices** in the top-right of the app.

1. Tap your mounted device in the list.
2. Give it a nickname (e.g. _"RG35XX SD card"_ or _"PC RetroArch"_).
3. Pocket Quartermaster writes a small marker file (`.pqm-device-id.json`) to the root of the device. From now on, the device is recognized by its stable ID — drive letter changes are fine.

Repeat for each device you want to sync between (two is the minimum, but there's no upper bound — add a handheld for the road and another for the couch alongside your desktop and the same profile handles all three).

> No physical device? Use a **virtual mount** to expose any folder (such as a network share) as if it were a removable drive. This is enabled automatically in development; in production, set `PQM_ALLOW_VIRTUAL_MOUNTS=1` in `pqm.env` to allow adding them from the UI.

### 2. Create a profile

Profiles bind one or more devices to a save-file path on each. From the home screen:

1. Tap **+ New** under **Profiles**.
2. Name the profile (e.g. _"Pokemon Emerald"_).
3. Tap **+ Add device slot** and, for each device you want in this profile:
   - Pick which registered device the slot belongs to.
   - Browse to the save file's location on that device. You can pick a specific file, or pick a directory if the device doesn't have the save yet — in that case the filename is derived from the source side at transfer time.

A profile is _ready_ once it has at least two slots and one of them holds a real file.

### 3. Transfer

Open the profile. Pocket Quartermaster lists every slot with its file size, modification timestamp, and the time it was last touched by a transfer. To copy:

1. Pick the **Source** — the device you trust as the current source of truth.
2. Pick the **Destination** — the device that should receive the copy.
3. Tap **Sync**, then confirm.

Defaults are filled in for you: source defaults to the slot with the most recent on-disk modification, destination defaults to the mounted slot with the oldest last-sync time. You can change either before confirming.

The previous destination file is backed up to your data directory's `backups/` folder before being overwritten, named with a timestamp and the destination's nickname. Both slots' last-sync timestamps are updated when the copy completes.

### 4. Activity view (optional)

If a device's RetroArch installation is configured, point its `retroarchActivityDir` setting at the `playlists/logs` folder (the directory that contains per-core `.lrtl` files). Pocket Quartermaster will scan it and surface per-game playtime under **Activity**, with thumbnails when available.

---

## Development

If you want to hack on the app itself rather than just run it:

```bash
git clone https://github.com/dylanclaywell/pocket-quartermaster.git
cd pocket-quartermaster
npm install
npm run dev
```

The dev server binds to `0.0.0.0:3000` so you can test from a phone on the same network.

| Script              | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Nuxt dev server with HMR, exposed on all interfaces |
| `npm run build`     | Production build into `.output/`                    |
| `npm run preview`   | Serve the production build locally                  |
| `npm run start`     | Run the production build (what the installers use)  |
| `npm run typecheck` | `vue-tsc` over the whole project                    |

Releases are cut by [release-please](https://github.com/googleapis/release-please) on every merge to `main`. The release workflow packages `.output/` into `pocket-quartermaster-output.zip` and uploads it alongside the install/update scripts so the one-liner installers above always pull the latest tagged build.

---

## License

This project is provided as-is for personal use. See the repository for any additional terms.
