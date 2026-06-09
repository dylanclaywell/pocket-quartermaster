<script setup lang="ts">
import { formatRelativeIso } from "~/composables/useFormat";

interface ProfileSlot {
  id: string;
  deviceId: string;
  fileRelPath: string;
}
interface ProfileSummary {
  name: string;
  notes?: string;
  ready: boolean;
  slots: ProfileSlot[];
  updatedAt: string;
}
interface KnownDeviceLite {
  id: string;
  nickname: string;
}
interface KnownDevice extends KnownDeviceLite {
  lastMountPath?: string;
  registeredAt: string;
  mounted: boolean;
  currentMountPath?: string;
  retroarchActivityDir?: string;
  activityCacheKey: string;
}
interface AggregatedGame {
  normalizedName: string;
  displayName: string;
  system?: string;
  cores: string[];
  totalSeconds: number;
  totalPlayCount: number;
  lastPlayedAt?: string;
  hasThumbnail: boolean;
}

const { data: profileData, refresh: refreshProfiles, pending: profilesPending } = await useFetch<{
  profiles: ProfileSummary[];
  devices: KnownDeviceLite[];
}>("/api/profiles");

const { data: deviceData, refresh: refreshDevices, pending: devicesPending } = await useFetch<{
  devices: KnownDevice[];
}>("/api/devices/known");

const { data: activityData, refresh: refreshActivity, pending: activityPending } = await useFetch<{
  games: AggregatedGame[];
}>("/api/activity");

const profiles = computed(() => profileData.value?.profiles ?? []);
const profileDevices = computed(() => profileData.value?.devices ?? []);
const knownDevices = computed(() => deviceData.value?.devices ?? []);
const games = computed(() => activityData.value?.games ?? []);

const recentGames = computed(() => games.value.slice(0, 5));
const attentionProfiles = computed(() => profiles.value.filter((p) => !p.ready));

function deviceName(id: string): string {
  return profileDevices.value.find((d) => d.id === id)?.nickname ?? "(unknown)";
}
function profileDevicesSummary(p: ProfileSummary): string {
  if (p.slots.length === 0) return "(no devices)";
  return p.slots.map((s) => deviceName(s.deviceId)).join(" ⇄ ");
}

const scanning = ref(false);
const scanError = ref<string | null>(null);
async function scanActivity() {
  scanning.value = true;
  scanError.value = null;
  try {
    await $fetch("/api/activity/scan", { method: "POST", body: {} });
    await refreshActivity();
  } catch (e) {
    scanError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

async function refreshAll() {
  await Promise.all([refreshProfiles(), refreshDevices(), refreshActivity()]);
}
const anyPending = computed(
  () => profilesPending.value || devicesPending.value || activityPending.value,
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Recently played -->
    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
          Recently played
        </h2>
        <NuxtLink
          v-if="recentGames.length > 0"
          to="/activity"
          class="text-xs text-fg-dim hover:text-fg"
        >
          See all →
        </NuxtLink>
      </div>

      <div
        v-if="activityPending && recentGames.length === 0"
        class="flex items-center justify-center gap-3 py-6 text-fg-dim"
      >
        <Spinner /> <span>Loading activity…</span>
      </div>
      <div
        v-else-if="recentGames.length === 0"
        class="card text-center text-fg-dim"
      >
        <p>No activity yet.</p>
        <p class="mt-2 text-xs">
          Point a device at its RetroArch activity folder, then scan.
        </p>
      </div>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <GameCard v-for="g in recentGames" :key="g.normalizedName" :game="g" />
      </div>
    </section>

    <!-- Devices at a glance -->
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
          Devices
        </h2>
        <NuxtLink to="/devices" class="text-xs text-fg-dim hover:text-fg">
          Manage →
        </NuxtLink>
      </div>

      <div v-if="devicesPending && knownDevices.length === 0" class="card text-fg-dim">
        Loading devices…
      </div>
      <div
        v-else-if="knownDevices.length === 0"
        class="card text-center text-fg-dim"
      >
        <p class="mb-3">No devices registered yet.</p>
        <NuxtLink to="/devices" class="btn-primary">Add a device</NuxtLink>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="d in knownDevices" :key="d.id">
          <NuxtLink :to="`/devices/${d.id}`" class="row-button">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base font-semibold">{{ d.nickname }}</span>
              <span class="truncate text-xs text-fg-dim">
                <template v-if="d.mounted">
                  Mounted · <span class="font-mono">{{ d.currentMountPath }}</span>
                </template>
                <template v-else-if="d.lastMountPath">
                  Last seen at <span class="font-mono">{{ d.lastMountPath }}</span>
                </template>
                <template v-else>Not yet mounted</template>
              </span>
            </div>
            <span
              class="pill"
              :class="
                d.mounted
                  ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                  : 'bg-surface-2 text-fg-dim'
              "
            >
              {{ d.mounted ? "online" : "offline" }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- Profiles needing attention -->
    <section v-if="attentionProfiles.length > 0" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-warn">
          Needs attention
        </h2>
        <NuxtLink to="/profiles" class="text-xs text-fg-dim hover:text-fg">
          All profiles →
        </NuxtLink>
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="p in attentionProfiles" :key="p.name">
          <NuxtLink :to="`/profiles/${encodeURIComponent(p.name)}`" class="row-button">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base font-semibold">{{ p.name }}</span>
              <span class="truncate text-xs text-fg-dim">
                {{ profileDevicesSummary(p) }}
              </span>
            </div>
            <span
              class="pill bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn"
            >
              incomplete
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- Quick actions -->
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
        Quick actions
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn-secondary text-sm"
          :disabled="scanning"
          @click="scanActivity()"
        >
          <Spinner v-if="scanning" size="sm" />
          <span>{{ scanning ? "Scanning…" : "Scan activity" }}</span>
        </button>
        <NuxtLink to="/profiles/new" class="btn-secondary text-sm">
          + New profile
        </NuxtLink>
        <NuxtLink to="/devices" class="btn-secondary text-sm">
          + Add device
        </NuxtLink>
      </div>
      <p v-if="scanError" class="text-xs text-danger">{{ scanError }}</p>
      <p v-if="recentGames.length > 0 && recentGames[0].lastPlayedAt" class="text-xs text-fg-dim">
        Last activity: {{ formatRelativeIso(recentGames[0].lastPlayedAt) }}
      </p>
    </section>

    <button class="btn-ghost self-start text-sm" :disabled="anyPending" @click="refreshAll()">
      <Spinner v-if="anyPending" size="sm" />
      <span>{{ anyPending ? "Refreshing…" : "Refresh" }}</span>
    </button>
  </div>
</template>
