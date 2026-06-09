import { randomUUID } from "node:crypto";
import type { ConfigFile, DeviceIdentity, Profile, ProfileSlot } from "./types";

export function findProfile(cfg: ConfigFile, name: string): Profile | undefined {
  return cfg.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function upsertProfile(cfg: ConfigFile, profile: Profile): void {
  const idx = cfg.profiles.findIndex(
    (p) => p.name.toLowerCase() === profile.name.toLowerCase(),
  );
  if (idx >= 0) cfg.profiles[idx] = profile;
  else cfg.profiles.push(profile);
}

export function deleteProfile(cfg: ConfigFile, name: string): boolean {
  const before = cfg.profiles.length;
  cfg.profiles = cfg.profiles.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  return cfg.profiles.length < before;
}

export function newSlotId(): string {
  return randomUUID();
}

export function findSlot(profile: Profile, slotId: string): ProfileSlot | undefined {
  return profile.slots.find((s) => s.id === slotId);
}

export function addSlot(profile: Profile, slot: Omit<ProfileSlot, "id">): ProfileSlot {
  const created: ProfileSlot = { id: newSlotId(), ...slot };
  profile.slots.push(created);
  profile.updatedAt = new Date().toISOString();
  return created;
}

export function updateSlot(
  profile: Profile,
  slotId: string,
  patch: Partial<Omit<ProfileSlot, "id">>,
): ProfileSlot | undefined {
  const slot = findSlot(profile, slotId);
  if (!slot) return undefined;
  Object.assign(slot, patch);
  profile.updatedAt = new Date().toISOString();
  return slot;
}

export function removeSlot(profile: Profile, slotId: string): boolean {
  const before = profile.slots.length;
  profile.slots = profile.slots.filter((s) => s.id !== slotId);
  if (profile.slots.length === before) return false;
  profile.updatedAt = new Date().toISOString();
  return true;
}

export function markSlotSynced(profile: Profile, slotId: string, at: string): void {
  const slot = findSlot(profile, slotId);
  if (!slot) return;
  slot.lastSyncedAt = at;
  profile.updatedAt = at;
}

export function newProfile(name: string, notes?: string): Profile {
  const now = new Date().toISOString();
  return { name, notes, slots: [], createdAt: now, updatedAt: now };
}

export function findDevice(cfg: ConfigFile, deviceId: string): DeviceIdentity | undefined {
  return cfg.devices.find((d) => d.id === deviceId);
}

export function upsertDevice(cfg: ConfigFile, device: DeviceIdentity): void {
  const idx = cfg.devices.findIndex((d) => d.id === device.id);
  if (idx >= 0) cfg.devices[idx] = device;
  else cfg.devices.push(device);
}

export function profileIsReady(p: Profile): boolean {
  return p.slots.length >= 2;
}

export function profileSummary(p: Profile, cfg: ConfigFile): string {
  if (p.slots.length === 0) return "[no slots]";
  return p.slots.map((s) => describeSlot(s, cfg)).join("  ⇄  ");
}

function describeSlot(slot: ProfileSlot, cfg: ConfigFile): string {
  const dev = findDevice(cfg, slot.deviceId);
  const devName = dev?.nickname ?? "(unknown device)";
  return `${devName}:${slot.fileRelPath}`;
}
