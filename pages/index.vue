<script setup lang="ts">
import { formatDuration, formatRelativeIso } from "~/composables/useFormat";

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
interface PerDevice {
  cacheKey: string;
  sourceLabel: string;
  runtimeSeconds: number;
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
  perDevice: PerDevice[];
}
interface TrendsData {
  days: { date: string; seconds: number }[];
  weekSeconds: number;
  streakDays: number;
  haveHistory: boolean;
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

const { data: trendsData, refresh: refreshTrends } = await useFetch<TrendsData>(
  "/api/activity/trends",
  { query: { days: 14 } },
);

const profiles = computed(() => profileData.value?.profiles ?? []);
const profileDevices = computed(() => profileData.value?.devices ?? []);
const knownDevices = computed(() => deviceData.value?.devices ?? []);
const games = computed(() => activityData.value?.games ?? []);

const recentGames = computed(() => games.value.slice(0, 5));
const attentionProfiles = computed(() => profiles.value.filter((p) => !p.ready));

// Headline totals — folded client-side from the activity list.
const totalSeconds = computed(() =>
  games.value.reduce((s, g) => s + g.totalSeconds, 0),
);
const totalSessions = computed(() =>
  games.value.reduce((s, g) => s + g.totalPlayCount, 0),
);
const hasActivity = computed(() => games.value.length > 0);

// Top 5 by total playtime (distinct from Recently-played, which is by last-played).
const topPlayed = computed(() =>
  [...games.value].sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 5),
);

// Hours per source, folding each game's per-device breakdown.
const byDevice = computed(() => {
  const acc = new Map<string, { label: string; seconds: number }>();
  for (const g of games.value) {
    for (const pd of g.perDevice ?? []) {
      const cur = acc.get(pd.cacheKey) ?? { label: pd.sourceLabel, seconds: 0 };
      cur.seconds += pd.runtimeSeconds;
      acc.set(pd.cacheKey, cur);
    }
  }
  return [...acc.values()].sort((a, b) => b.seconds - a.seconds);
});

const trends = computed(() => trendsData.value);
const weekSparkValues = computed(
  () => trends.value?.days.slice(-7).map((d) => d.seconds) ?? [],
);

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
    await Promise.all([refreshActivity(), refreshTrends()]);
  } catch (e) {
    scanError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

async function refreshAll() {
  await Promise.all([
    refreshProfiles(),
    refreshDevices(),
    refreshActivity(),
    refreshTrends(),
  ]);
}
const anyPending = computed(
  () => profilesPending.value || devicesPending.value || activityPending.value,
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Dashboard summary -->
    <section v-if="hasActivity" class="flex flex-col gap-3">
      <!-- Headline tiles -->
      <div class="grid grid-cols-3 gap-2">
        <div class="card flex flex-col items-center gap-0.5 py-3 text-center">
          <span class="text-lg font-semibold">{{ formatDuration(totalSeconds) }}</span>
          <span class="text-[11px] uppercase tracking-wide text-fg-dim">Total played</span>
        </div>
        <div class="card flex flex-col items-center gap-0.5 py-3 text-center">
          <span class="text-lg font-semibold">{{ games.length }}</span>
          <span class="text-[11px] uppercase tracking-wide text-fg-dim">Games</span>
        </div>
        <div class="card flex flex-col items-center gap-0.5 py-3 text-center">
          <span class="text-lg font-semibold">{{ totalSessions }}</span>
          <span class="text-[11px] uppercase tracking-wide text-fg-dim">Sessions</span>
        </div>
      </div>

      <!-- This week -->
      <div class="card flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-fg-dim">
            This week
          </span>
          <span v-if="trends?.haveHistory" class="text-xs text-fg-dim">
            {{ formatDuration(trends.weekSeconds) }}
            <template v-if="trends.streakDays > 0">
              · {{ trends.streakDays }}-day streak
            </template>
          </span>
        </div>
        <Sparkline v-if="trends?.haveHistory" :values="weekSparkValues" />
        <p v-else class="text-xs text-fg-dim">
          Building history — daily trends appear after a couple of scans.
        </p>
      </div>

      <!-- Hours by device -->
      <div v-if="byDevice.length > 1" class="card flex flex-col gap-1.5">
        <span class="text-xs font-semibold uppercase tracking-wide text-fg-dim">
          By device
        </span>
        <div
          v-for="d in byDevice"
          :key="d.label"
          class="flex items-center justify-between gap-2 text-sm"
        >
          <span class="truncate">{{ d.label }}</span>
          <span class="font-mono text-fg-dim">{{ formatDuration(d.seconds) }}</span>
        </div>
      </div>
    </section>

    <!-- Top played -->
    <section v-if="topPlayed.length > 0" class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
        Most played
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <GameCard v-for="g in topPlayed" :key="g.normalizedName" :game="g" />
      </div>
    </section>

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
