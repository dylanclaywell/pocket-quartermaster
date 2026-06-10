<script setup lang="ts">
import { formatBytes, formatRelativeIso } from "~/composables/useFormat";

interface LibraryGame {
  gameKey: string;
  displayName: string;
  systemKey: string;
  system: string;
  variantCount: number;
  totalSizeBytes: number;
  saveProfileName?: string;
  destinationCount: number;
  destinationsInstalled: number;
  hasMismatch: boolean;
}
interface LibrarySummary {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  role: "master" | "destination";
  configured: boolean;
  cacheExists: boolean;
  lastScannedAt?: string;
  romsRootRelPath?: string;
  fileCount?: number;
}
interface ScanResultRow {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  summary?: {
    cacheKey: string;
    scannedAt: string;
    totalFiles: number;
    reused: number;
    parsed: number;
    dropped: number;
    errors: { sourceFile: string; reason: string }[];
  };
  error?: string;
  skippedReason?: string;
}

const games = ref<LibraryGame[]>([]);
const libraries = ref<LibrarySummary[]>([]);
const loadError = ref<string | null>(null);
const initialLoading = ref(true);
const scanning = ref(false);
const scanResults = ref<ScanResultRow[]>([]);
const search = ref("");

const configuredCount = computed(() => libraries.value.filter((l) => l.configured).length);

const scanSummary = computed(() => {
  if (scanResults.value.length === 0) return null;
  let files = 0;
  let parsed = 0;
  let errors = 0;
  let skipped = 0;
  for (const r of scanResults.value) {
    if (r.summary) {
      files += r.summary.totalFiles;
      parsed += r.summary.parsed;
      errors += r.summary.errors.length;
    }
    if (r.error) errors += 1;
    if (r.skippedReason) skipped += 1;
  }
  return { files, parsed, errors, skipped };
});

const filteredGames = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return games.value;
  return games.value.filter(
    (g) => g.displayName.toLowerCase().includes(q) || g.system.toLowerCase().includes(q),
  );
});

const totalFiles = computed(() =>
  games.value.reduce((sum, g) => sum + g.variantCount, 0),
);

async function loadCached() {
  loadError.value = null;
  try {
    const res = await $fetch<{ games: LibraryGame[]; libraries: LibrarySummary[] }>("/api/roms");
    games.value = res.games;
    libraries.value = res.libraries;
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
    const res = await $fetch<{ results: ScanResultRow[] }>("/api/roms/scan", {
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

onMounted(loadCached);
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">ROM library</h1>
      <button class="btn-primary text-sm" :disabled="scanning" @click="runScan()">
        <Spinner v-if="scanning" size="sm" />
        <span>{{ scanning ? "Scanning…" : "Scan libraries" }}</span>
      </button>
    </header>

    <p v-if="loadError" class="text-danger">{{ loadError }}</p>

    <!-- Scan result banner -->
    <div
      v-if="scanSummary"
      class="card text-sm"
      :class="scanSummary.errors > 0 ? 'text-warn' : 'text-ok'"
    >
      Scanned {{ scanSummary.files }} files ({{ scanSummary.parsed }} new/changed)
      <template v-if="scanSummary.skipped > 0">
        · {{ scanSummary.skipped }} source(s) unreachable
      </template>
      <template v-if="scanSummary.errors > 0"> · {{ scanSummary.errors }} error(s)</template>
    </div>

    <!-- Libraries -->
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">Libraries</h2>
      <div
        v-if="configuredCount === 0"
        class="card text-center text-fg-dim"
      >
        <p class="mb-1">No ROM libraries configured yet.</p>
        <p class="text-xs">
          Set a <span class="font-semibold text-fg">ROM library folder</span> on a device
          or virtual mount, then scan. Its subfolders (gba, snes, …) are read as systems.
        </p>
        <NuxtLink to="/devices" class="btn-secondary mt-3 text-sm">Configure a source</NuxtLink>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="lib in libraries.filter((l) => l.configured || l.cacheExists)"
          :key="lib.cacheKey"
          class="card flex items-center justify-between gap-3"
        >
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="flex items-center gap-2">
              <span class="truncate font-semibold">{{ lib.sourceLabel }}</span>
              <span
                class="pill shrink-0"
                :class="
                  lib.role === 'destination'
                    ? 'bg-surface-2 text-fg-dim'
                    : 'bg-[color-mix(in_oklab,var(--color-accent,var(--color-ok))_22%,transparent)] text-fg'
                "
              >
                {{ lib.role }}
              </span>
            </span>
            <span class="truncate text-xs text-fg-dim">
              <span v-if="lib.romsRootRelPath" class="font-mono">/{{ lib.romsRootRelPath }}</span>
              <span v-else>not configured</span>
              <template v-if="lib.cacheExists">
                · {{ lib.fileCount ?? 0 }} files ·
                {{ lib.lastScannedAt ? formatRelativeIso(lib.lastScannedAt) : "—" }}
              </template>
            </span>
          </div>
          <button
            class="btn-ghost text-sm"
            :disabled="scanning || !lib.configured"
            @click="runScan(lib.cacheKey)"
          >
            Scan
          </button>
        </li>
      </ul>
    </section>

    <!-- Games -->
    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
          Games <span v-if="games.length" class="text-fg-dim">· {{ games.length }}</span>
        </h2>
        <span v-if="totalFiles" class="text-xs text-fg-dim">{{ totalFiles }} files</span>
      </div>

      <input
        v-if="games.length > 0"
        v-model="search"
        class="input"
        placeholder="Filter by name or system…"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
      />

      <div
        v-if="initialLoading"
        class="flex items-center justify-center gap-3 py-6 text-fg-dim"
      >
        <Spinner /> <span>Loading library…</span>
      </div>
      <div v-else-if="games.length === 0" class="card text-center text-fg-dim">
        <p>No ROMs scanned yet.</p>
        <p class="mt-2 text-xs">Configure a library folder and press “Scan libraries”.</p>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="g in filteredGames" :key="g.gameKey">
          <NuxtLink :to="`/roms/${encodeURIComponent(g.gameKey)}`" class="row-button">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold">{{ g.displayName }}</span>
              <span class="truncate text-xs text-fg-dim">
                {{ g.system }} · {{ g.variantCount }} variant{{ g.variantCount === 1 ? "" : "s" }}
                · {{ formatBytes(g.totalSizeBytes) }}
                <template v-if="g.destinationCount > 0">
                  · on {{ g.destinationsInstalled }}/{{ g.destinationCount }} devices
                </template>
              </span>
            </div>
            <span
              v-if="g.hasMismatch"
              class="pill shrink-0 bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn"
              title="A device has a variant installed that differs from its preferred variant"
              >⚠</span
            >
            <span aria-hidden="true" class="text-fg-dim">›</span>
          </NuxtLink>
        </li>
        <li
          v-if="filteredGames.length === 0"
          class="card text-center text-sm text-fg-dim"
        >
          No games match “{{ search }}”.
        </li>
      </ul>
    </section>
  </div>
</template>
