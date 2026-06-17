<script setup lang="ts">
import { formatRelativeIso } from "~/composables/useFormat";

interface PerDevice {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  runtimeSeconds: number;
  playCount: number;
  lastPlayedAt?: string;
}
interface AggregatedGame {
  normalizedName: string;
  displayName: string;
  system?: string;
  cores: string[];
  libretroDbNames: string[];
  totalSeconds: number;
  totalPlayCount: number;
  lastPlayedAt?: string;
  hasThumbnail: boolean;
  perDevice: PerDevice[];
}
interface DeviceSummary {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  configured: boolean;
  cacheExists: boolean;
  lastScannedAt?: string;
  retroarchActivityDir?: string;
  entryCount?: number;
}
interface ScanResultRow {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  summary?: {
    cacheKey: string;
    scannedAt: string;
    totalEntries: number;
    reused: number;
    parsed: number;
    dropped: number;
    errors: { sourceFile: string; reason: string }[];
  };
  error?: string;
  skippedReason?: string;
}

type SortMode = "recent" | "playtime" | "alpha";

const games = ref<AggregatedGame[]>([]);
const devices = ref<DeviceSummary[]>([]);
const loadError = ref<string | null>(null);
const initialLoading = ref(true);
const scanning = ref(false);
const scanResults = ref<ScanResultRow[]>([]);
const sortMode = ref<SortMode>("recent");
const lastScanExpanded = ref(false);

const lastScanSummary = computed(() => {
  if (scanResults.value.length === 0) return null;
  let entries = 0;
  let parsed = 0;
  let errors = 0;
  let skipped = 0;
  for (const r of scanResults.value) {
    if (r.summary) {
      entries += r.summary.totalEntries;
      parsed += r.summary.parsed;
      errors += r.summary.errors.length;
    }
    if (r.error) errors += 1;
    if (r.skippedReason) skipped += 1;
  }
  return { entries, parsed, errors, skipped };
});

const sortedGames = computed(() => {
  const list = [...games.value];
  switch (sortMode.value) {
    case "playtime":
      return list.sort((a, b) => b.totalSeconds - a.totalSeconds);
    case "alpha":
      return list.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
      );
    case "recent":
    default:
      return list.sort((a, b) => {
        if (a.lastPlayedAt && b.lastPlayedAt) {
          if (a.lastPlayedAt > b.lastPlayedAt) return -1;
          if (a.lastPlayedAt < b.lastPlayedAt) return 1;
        } else if (a.lastPlayedAt) return -1;
        else if (b.lastPlayedAt) return 1;
        return b.totalSeconds - a.totalSeconds;
      });
  }
});

const configuredCount = computed(() => devices.value.filter((d) => d.configured).length);
const cachedCount = computed(() => devices.value.filter((d) => d.cacheExists).length);

async function loadCached() {
  loadError.value = null;
  try {
    const res = await $fetch<{ games: AggregatedGame[]; devices: DeviceSummary[] }>(
      "/api/activity",
    );
    games.value = res.games;
    devices.value = res.devices;
  } catch (e) {
    loadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    initialLoading.value = false;
  }
}

async function runScan(cacheKey?: string) {
  scanning.value = true;
  try {
    const body = cacheKey ? { cacheKey } : {};
    const res = await $fetch<{ results: ScanResultRow[] }>("/api/activity/scan", {
      method: "POST",
      body,
    });
    scanResults.value = res.results;
    await loadCached();
  } catch (e) {
    loadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

onMounted(async () => {
  await loadCached();
  // Hybrid: show cached data immediately, kick a background scan that refreshes when done.
  runScan();
});

function hasScanError(row: ScanResultRow): boolean {
  return Boolean(row.error || row.skippedReason);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Activity</h1>
      <button
        class="btn-secondary text-sm"
        :disabled="scanning"
        @click="runScan()"
      >
        <Spinner v-if="scanning" size="sm" />
        <span>{{ scanning ? "Scanning…" : "Scan all" }}</span>
      </button>
    </header>

    <p v-if="loadError" class="text-danger">{{ loadError }}</p>

    <section v-if="scanResults.length > 0" class="flex flex-col gap-1.5">
      <button
        class="flex items-center justify-between gap-2 text-left"
        :aria-expanded="lastScanExpanded"
        @click="lastScanExpanded = !lastScanExpanded"
      >
        <h2 class="eyebrow">
          <span aria-hidden="true" class="inline-block w-3">
            {{ lastScanExpanded ? "▾" : "▸" }}
          </span>
          Last scan
        </h2>
        <span
          v-if="lastScanSummary"
          class="text-xs"
          :class="
            lastScanSummary.errors > 0 || lastScanSummary.skipped > 0
              ? 'text-warn'
              : 'text-fg-dim'
          "
        >
          {{ lastScanSummary.entries }} games · {{ lastScanSummary.parsed }} new/changed
          <template v-if="lastScanSummary.errors > 0">
            · {{ lastScanSummary.errors }} error{{ lastScanSummary.errors === 1 ? "" : "s" }}
          </template>
          <template v-if="lastScanSummary.skipped > 0">
            · {{ lastScanSummary.skipped }} skipped
          </template>
        </span>
      </button>
      <ul v-if="lastScanExpanded" class="flex flex-col gap-1.5">
        <li
          v-for="r in scanResults"
          :key="r.cacheKey"
          class="card flex flex-col gap-1 text-xs"
          :class="hasScanError(r) ? 'border border-[color-mix(in_oklab,var(--color-warn)_45%,transparent)]' : ''"
        >
          <p class="font-semibold">{{ r.sourceLabel }}</p>
          <p v-if="r.summary" class="text-fg-dim">
            {{ r.summary.totalEntries }} games · parsed {{ r.summary.parsed }} new/changed,
            reused {{ r.summary.reused }}, dropped {{ r.summary.dropped }}
            <span v-if="r.summary.errors.length > 0" class="text-warn">
              · {{ r.summary.errors.length }} file error(s)
            </span>
          </p>
          <p v-if="r.skippedReason" class="text-warn">Skipped: {{ r.skippedReason }}</p>
          <p v-if="r.error" class="text-danger">Error: {{ r.error }}</p>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="eyebrow">Games</h2>
        <div class="flex gap-1 text-xs">
          <button
            class="pill"
            :class="
              sortMode === 'recent'
                ? 'bg-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] text-accent'
                : 'bg-surface-2 text-fg-dim'
            "
            @click="sortMode = 'recent'"
          >
            Recent
          </button>
          <button
            class="pill"
            :class="
              sortMode === 'playtime'
                ? 'bg-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] text-accent'
                : 'bg-surface-2 text-fg-dim'
            "
            @click="sortMode = 'playtime'"
          >
            Most played
          </button>
          <button
            class="pill"
            :class="
              sortMode === 'alpha'
                ? 'bg-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] text-accent'
                : 'bg-surface-2 text-fg-dim'
            "
            @click="sortMode = 'alpha'"
          >
            A–Z
          </button>
        </div>
      </div>

      <div
        v-if="initialLoading"
        class="flex items-center justify-center gap-3 py-6 text-fg-dim"
      >
        <Spinner /> <span>Loading activity…</span>
      </div>
      <div
        v-else-if="sortedGames.length === 0"
        class="card text-center text-fg-dim"
      >
        <p>No activity yet.</p>
        <p class="mt-2 text-xs">
          Set a RetroArch activity folder on a device, then tap “Scan all”. With
          per-content runtime logging enabled, RetroArch writes
          <span class="font-mono">.lrtl</span> files we can read.
        </p>
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <GameCard v-for="g in sortedGames" :key="g.normalizedName" :game="g" />
      </div>
    </section>

    <section v-if="devices.length > 0" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="eyebrow">Sources</h2>
        <p class="text-xs text-fg-dim">
          {{ configuredCount }} configured · {{ cachedCount }} cached
        </p>
      </div>
      <ul class="flex flex-col gap-1">
        <li
          v-for="d in devices"
          :key="d.cacheKey"
          class="flex items-center justify-between gap-2 rounded border border-border bg-surface-2/40 px-3 py-2 text-xs"
        >
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium text-fg">{{ d.sourceLabel }}</span>
            <span class="truncate text-fg-dim">
              <span v-if="d.cacheExists">
                {{ d.entryCount }} games · last scan
                {{ formatRelativeIso(d.lastScannedAt) }}
              </span>
              <span v-else-if="d.configured">configured, not yet scanned</span>
              <span v-else>no activity folder set</span>
            </span>
          </div>
          <button
            v-if="d.configured"
            class="btn-ghost text-xs"
            :disabled="scanning"
            @click="runScan(d.cacheKey)"
          >
            Scan
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
