/**
 * Whether the user is allowed to add or remove virtual mounts at runtime.
 *
 * Virtual mounts let the app expose any folder on the host as if it were a
 * removable device, which on a LAN-exposed Pi is more authority than we want
 * the web UI to hand out. The feature is intended for local development and
 * one-off testing; opt back in for prod with PQM_ALLOW_VIRTUAL_MOUNTS=1.
 */
export function isVirtualMountManagementEnabled(): boolean {
  if (devMode()) return true;
  const flag = process.env.PQM_ALLOW_VIRTUAL_MOUNTS;
  return flag === "1" || flag === "true";
}

export function devMode(): boolean {
  return process.env.NODE_ENV !== "production";
}
