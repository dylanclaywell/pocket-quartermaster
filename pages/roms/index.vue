<script setup lang="ts">
import { formatBytes, formatRelativeIso } from "~/composables/useFormat";
import { systemFallbackBackground } from "~/composables/useGameVisuals";

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
  hasThumbnail: boolean;
}
interface LibrarySummary {
  cacheKey: string;
  sourceKind: "device" | "virtualMount";
  sourceLabel: string;
  role: "library" | "destination";
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

const configuredSources = computed(() =>
  libraries.value.filter((l) => l.configured),
);
const libraryKey = computed(
  () => libraries.value.find((l) => l.role === "library")?.cacheKey ?? "",
);
const librarySource = computed(
  () => libraries.value.find((l) => l.cacheKey === libraryKey.value) ?? null,
);
const destinationSources = computed(() =>
  libraries.value.filter(
    (l) => l.role === "destination" && (l.configured || l.cacheExists),
  ),
);
const settingLibrary = ref(false);

const librarySelectOptions = computed(() => [
  { value: "", label: "(choose a source)" },
  ...configuredSources.value.map((s) => ({ value: s.cacheKey, label: s.sourceLabel })),
]);

async function setLibrary(cacheKey: string) {
  settingLibrary.value = true;
  loadError.value = null;
  try {
    await $fetch("/api/roms/library", {
      method: "PUT",
      body: { sourceCacheKey: cacheKey || null },
    });
    await loadCached();
  } catch (e) {
    loadError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    settingLibrary.value = false;
  }
}

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
    (g) =>
      g.displayName.toLowerCase().includes(q) ||
      g.system.toLowerCase().includes(q),
  );
});

const totalFiles = computed(() =>
  games.value.reduce((sum, g) => sum + g.variantCount, 0),
);

// Group filtered games by system, systems alphabetized, games alphabetized.
const groupedGames = computed(() => {
  const groups = new Map<string, typeof games.value>();
  for (const g of filteredGames.value) {
    const arr = groups.get(g.system) ?? [];
    arr.push(g);
    groups.set(g.system, arr);
  }
  return [...groups.entries()]
    .map(([system, list]) => ({
      system,
      games: [...list].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      ),
    }))
    .sort((a, b) =>
      a.system.localeCompare(b.system, undefined, { sensitivity: "base" }),
    );
});

const collapsed = ref<Set<string>>(new Set());
function toggleSystem(system: string) {
  const next = new Set(collapsed.value);
  if (next.has(system)) next.delete(system);
  else next.add(system);
  collapsed.value = next;
}

async function loadCached() {
  loadError.value = null;
  try {
    const res = await $fetch<{
      games: LibraryGame[];
      libraries: LibrarySummary[];
    }>("/api/roms");
    games.value = res.games;
    libraries.value = res.libraries;
  } catch (e) {
    loadError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
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
    loadError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
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
      <div class="flex gap-2">
        <NuxtLink to="/roms/transfer" class="btn-secondary text-sm"
          >Transfer →</NuxtLink
        >
        <button
          class="btn-primary text-sm"
          :disabled="scanning"
          @click="runScan()"
        >
          <Spinner v-if="scanning" size="sm" />
          <span>{{ scanning ? "Scanning…" : "Scan libraries" }}</span>
        </button>
      </div>
    </header>

    <p v-if="loadError" class="text-danger">{{ loadError }}</p>

    <!-- Scan result banner -->
    <div
      v-if="scanSummary"
      class="card text-sm"
      :class="scanSummary.errors > 0 ? 'text-warn' : 'text-ok'"
    >
      Scanned {{ scanSummary.files }} files ({{ scanSummary.parsed }}
      new/changed)
      <template v-if="scanSummary.skipped > 0">
        · {{ scanSummary.skipped }} source(s) unreachable
      </template>
      <template v-if="scanSummary.errors > 0">
        · {{ scanSummary.errors }} error(s)</template
      >
    </div>

    <!-- Library source -->
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
        Library source
      </h2>
      <div
        v-if="configuredSources.length === 0"
        class="card text-center text-fg-dim"
      >
        <p class="mb-1">No ROM sources configured yet.</p>
        <p class="text-xs">
          Set a <span class="font-semibold text-fg">ROM library folder</span> on
          a device or virtual mount, then come back to pick which one is your
          library. Its subfolders (gba, snes, …) are read as systems.
        </p>
        <NuxtLink to="/devices" class="btn-secondary mt-3 text-sm"
          >Configure a source</NuxtLink
        >
      </div>
      <div v-else class="card flex flex-col gap-2">
        <div class="flex flex-col gap-1">
          <span class="label">This device holds your library</span>
          <AppSelect
            :model-value="libraryKey"
            :options="librarySelectOptions"
            :disabled="settingLibrary"
            aria-label="Library source"
            @update:model-value="setLibrary"
          />
        </div>
        <div
          v-if="librarySource"
          class="flex items-center justify-between gap-3 text-xs text-fg-dim"
        >
          <span class="truncate">
            <span v-if="librarySource.romsRootRelPath" class="font-mono"
              >/{{ librarySource.romsRootRelPath }}</span
            >
            <template v-if="librarySource.cacheExists">
              · {{ librarySource.fileCount ?? 0 }} files ·
              {{
                librarySource.lastScannedAt
                  ? formatRelativeIso(librarySource.lastScannedAt)
                  : "—"
              }}
            </template>
          </span>
          <button
            class="btn-ghost shrink-0 text-sm"
            :disabled="scanning"
            @click="runScan(libraryKey)"
          >
            Scan
          </button>
        </div>
      </div>
    </section>

    <!-- Destinations -->
    <section v-if="destinationSources.length > 0" class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
        Destinations
      </h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="lib in destinationSources"
          :key="lib.cacheKey"
          class="card flex items-center justify-between gap-3"
        >
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-semibold">{{ lib.sourceLabel }}</span>
            <span class="truncate text-xs text-fg-dim">
              <span v-if="lib.romsRootRelPath" class="font-mono"
                >/{{ lib.romsRootRelPath }}</span
              >
              <template v-if="lib.cacheExists">
                · {{ lib.fileCount ?? 0 }} files ·
                {{
                  lib.lastScannedAt ? formatRelativeIso(lib.lastScannedAt) : "—"
                }}
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
          Games
          <span v-if="games.length" class="text-fg-dim"
            >· {{ games.length }}</span
          >
        </h2>
        <span v-if="totalFiles" class="text-xs text-fg-dim"
          >{{ totalFiles }} files</span
        >
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
        <template v-if="configuredSources.length > 0 && !libraryKey">
          <p>No library source chosen.</p>
          <p class="mt-2 text-xs">
            Pick which device holds your library above.
          </p>
        </template>
        <template v-else>
          <p>No ROMs scanned yet.</p>
          <p class="mt-2 text-xs">
            Press “Scan libraries”, or check the library folder path.
          </p>
        </template>
      </div>
      <div
        v-else-if="filteredGames.length === 0"
        class="card text-center text-sm text-fg-dim"
      >
        No games match “{{ search }}”.
      </div>
      <div v-else class="flex flex-col gap-4">
        <div
          v-for="grp in groupedGames"
          :key="grp.system"
          class="flex flex-col gap-2 bg-gray-800/50 rounded-2xl"
        >
          <button
            class="row-button bg-surface-2"
            @click="toggleSystem(grp.system)"
          >
            <span class="text-sm font-bold uppercase tracking-wide">
              {{ grp.system }}
              <span class="text-fg-dim">· {{ grp.games.length }}</span>
            </span>
            <span aria-hidden="true" class="text-xl leading-none text-accent">
              {{ collapsed.has(grp.system) ? "▸" : "▾" }}
            </span>
          </button>
          <ul
            v-show="!collapsed.has(grp.system)"
            class="flex flex-col gap-2 p-3"
          >
            <li v-for="g in grp.games" :key="g.gameKey">
              <NuxtLink
                :to="`/roms/${encodeURIComponent(g.gameKey)}`"
                class="row-button"
              >
                <div
                  class="relative size-10 shrink-0 overflow-hidden rounded-[22%] ring-1 ring-border"
                  :style="{ background: systemFallbackBackground(g.system) }"
                >
                  <img
                    v-if="g.hasThumbnail"
                    :src="`/api/thumbnails/${encodeURIComponent(g.gameKey)}`"
                    :alt="g.displayName"
                    class="absolute inset-0 size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-semibold">{{
                    g.displayName
                  }}</span>
                  <span class="truncate text-xs text-fg-dim">
                    {{ g.variantCount }} variant{{
                      g.variantCount === 1 ? "" : "s"
                    }}
                    · {{ formatBytes(g.totalSizeBytes) }}
                    <template v-if="g.destinationCount > 0">
                      · on {{ g.destinationsInstalled }}/{{
                        g.destinationCount
                      }}
                      devices
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
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
