import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface EjectResult {
  ok: boolean;
  /** Human-readable outcome, shown to the user. */
  message: string;
}

/** Safely unmount/eject the volume at `mountPath` so the card can be pulled.
 *  OS-specific; flushes pending writes first. Best-effort on Windows, where
 *  there is no clean CLI eject for removable volumes. */
export async function ejectMount(mountPath: string): Promise<EjectResult> {
  switch (platform()) {
    case "win32":
      return ejectWindows(mountPath);
    case "darwin":
      return ejectMac(mountPath);
    default:
      return ejectLinux(mountPath);
  }
}

// ---------- Linux / Pi (prod target) ----------

async function ejectLinux(mountPath: string): Promise<EjectResult> {
  // Flush pending writes before unmounting.
  await tryRun("sync");

  // udisksctl unmounts via polkit without root and is the right tool on a
  // desktop/Pi session. Prefer the block device so power-off can follow.
  const dev = await blockDeviceFor(mountPath);
  if (dev && (await hasCommand("udisksctl"))) {
    const unmount = await run(`udisksctl unmount -b ${shellQuote(dev)}`);
    if (!unmount.ok) {
      return { ok: false, message: unmountError(unmount.stderr || unmount.stdout) };
    }
    // Power-off spins down / cuts power to the whole drive. Optional — a failure
    // here (e.g. SD reader doesn't support it) doesn't undo the safe unmount.
    await run(`udisksctl power-off -b ${shellQuote(dev)}`);
    return { ok: true, message: "Ejected — safe to remove the card." };
  }

  // Fall back to a plain unmount of the mount point.
  const um = await run(`umount ${shellQuote(mountPath)}`);
  if (um.ok) return { ok: true, message: "Unmounted — safe to remove the card." };
  return { ok: false, message: unmountError(um.stderr || um.stdout) };
}

/** Resolve the block device backing a mount point (e.g. /dev/sdb1). */
async function blockDeviceFor(mountPath: string): Promise<string | undefined> {
  const r = await run(`findmnt -n -o SOURCE --target ${shellQuote(mountPath)}`);
  const dev = r.stdout.trim().split("\n")[0]?.trim();
  return r.ok && dev?.startsWith("/dev/") ? dev : undefined;
}

// ---------- macOS ----------

async function ejectMac(mountPath: string): Promise<EjectResult> {
  await tryRun("sync");
  const r = await run(`diskutil eject ${shellQuote(mountPath)}`);
  if (r.ok) return { ok: true, message: "Ejected — safe to remove the card." };
  return { ok: false, message: unmountError(r.stderr || r.stdout) };
}

// ---------- Windows (dev) ----------

async function ejectWindows(mountPath: string): Promise<EjectResult> {
  const letter = mountPath.match(/^([A-Za-z]):/)?.[1];
  if (!letter) {
    return { ok: false, message: "Could not determine the drive letter to eject." };
  }
  const drive = `${letter}:`;
  const root = `${drive}\\`;
  const gone = () => !existsSync(root);

  // 1. mountvol /p dismounts the volume and takes it offline — the documented
  //    safe-removal path for removable media, and the most reliable from a CLI.
  await run(`mountvol ${root} /p`);
  if (gone()) return { ok: true, message: "Ejected — safe to remove the card." };

  // 2. Fall back to the Shell "Eject" verb. It returns nothing and runs async,
  //    so give Windows a moment, then verify the volume actually went away —
  //    on busy or fixed-type card readers it silently no-ops.
  const script =
    `$d=(New-Object -comObject Shell.Application).Namespace(17).ParseName('${drive}');` +
    `if($d){$d.InvokeVerb('Eject')}`;
  await run(`powershell -NoProfile -Command "${script}"`);
  await sleep(1500);
  if (gone()) return { ok: true, message: "Ejected — safe to remove the card." };

  return {
    ok: false,
    message:
      "Windows couldn't eject this volume — it may be in use, or the card reader " +
      "presents the card as a fixed disk (no eject). Close anything using it, or " +
      "use the tray's Safely Remove Hardware.",
  };
}

// ---------- helpers ----------

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function run(cmd: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "" };
  }
}

/** Run a command, ignoring failure (used for best-effort steps like `sync`). */
async function tryRun(cmd: string): Promise<void> {
  await run(cmd);
}

async function hasCommand(name: string): Promise<boolean> {
  const r = await run(`command -v ${name}`);
  return r.ok && r.stdout.trim().length > 0;
}

/** Quote a path for a POSIX shell. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Turn raw stderr into a short, friendly failure message. */
function unmountError(raw: string): string {
  const msg = raw.trim().split("\n").pop()?.trim() || "Unmount failed.";
  if (/busy|in use|target is busy/i.test(msg)) {
    return "Device is busy — close anything using it (or finish a running transfer) and try again.";
  }
  if (/not permitted|permission|not authorized|polkit/i.test(msg)) {
    return "Not permitted to eject — the server needs unmount rights for this device.";
  }
  return msg;
}
