## Install

> **Requires Node.js 22 or newer.** Grab the LTS build from <https://nodejs.org/> (or your distro's package manager) before running either installer below — the installers won't install Node for you.

### Raspberry Pi / Linux

One-liner first-time install on Debian-based systems (including Raspberry Pi OS):

```bash
curl -fsSL https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/install.sh | sudo bash
```

This drops a systemd unit at `/etc/systemd/system/pqm.service` and starts the server on port 3000.

- **Update later:** `sudo /opt/pqm/update.sh`
- **Service status:** `systemctl status pqm`
- **Tail logs:** `journalctl -u pqm -f`

### Windows

1. Install Node.js 22 LTS from <https://nodejs.org/> if you don't have it already.
2. Create a folder for Pocket Quartermaster (e.g. `C:\PocketQuartermaster`).
3. Download **`install.bat`** from the **Assets** section below into that folder.
4. Double-click `install.bat`. It checks for Node, then downloads the run/update scripts and the latest build.
5. Double-click **`run.bat`** to start the server. Open <http://localhost:3000> in a browser.

Update later by double-clicking **`update.bat`**.

---
