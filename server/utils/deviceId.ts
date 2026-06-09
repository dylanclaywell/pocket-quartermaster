import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MARKER_FILENAME, type DeviceIdentity } from "./types";

interface MarkerFile {
  id: string;
  nickname: string;
  registeredAt: string;
  /** Soft-pin to the pocket-quartermaster schema for forward compat */
  schema: 1;
}

/** Read the device marker file at the given mount path, if present. */
export async function readMarker(mountPath: string): Promise<MarkerFile | undefined> {
  const markerPath = join(mountPath, MARKER_FILENAME);
  if (!existsSync(markerPath)) return undefined;
  try {
    const raw = await readFile(markerPath, "utf8");
    const parsed = JSON.parse(raw) as MarkerFile;
    if (!parsed.id || !parsed.nickname) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Write a fresh marker at the device root and return the resulting identity. */
export async function writeMarker(
  mountPath: string,
  nickname: string,
): Promise<DeviceIdentity> {
  const marker: MarkerFile = {
    id: randomUUID(),
    nickname,
    registeredAt: new Date().toISOString(),
    schema: 1,
  };
  const markerPath = join(mountPath, MARKER_FILENAME);
  await writeFile(markerPath, JSON.stringify(marker, null, 2), "utf8");
  return {
    id: marker.id,
    nickname: marker.nickname,
    lastMountPath: mountPath,
    registeredAt: marker.registeredAt,
  };
}

/** Update the nickname inside an existing marker file (rewrite in place). */
export async function rewriteMarkerNickname(
  mountPath: string,
  identity: DeviceIdentity,
  nickname: string,
): Promise<void> {
  const marker: MarkerFile = {
    id: identity.id,
    nickname,
    registeredAt: identity.registeredAt,
    schema: 1,
  };
  await writeFile(join(mountPath, MARKER_FILENAME), JSON.stringify(marker, null, 2), "utf8");
}
