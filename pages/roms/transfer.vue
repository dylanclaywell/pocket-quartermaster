<script setup lang="ts">
interface LibrarySummary {
  cacheKey: string;
  sourceLabel: string;
  configured: boolean;
  cacheExists: boolean;
}
interface GameLite {
  gameKey: string;
}

const sources = ref<LibrarySummary[]>([]);
const allGameKeys = ref<string[]>([]);
const sourceCacheKey = ref<string>("");
const destCacheKey = ref<string>("");
const tab = ref<"roms" | "art">("roms");

const loading = ref(true);
const error = ref<string | null>(null);

// Source must have a catalog (be scanned); destination must have a ROM folder
// to write into. A source can't also be its own destination.
const sourceOptions = computed(() =>
  sources.value
    .filter((s) => s.cacheExists)
    .map((s) => ({ value: s.cacheKey, label: s.sourceLabel })),
);
const destinationOptions = computed(() =>
  sources.value
    .filter((s) => s.configured && s.cacheKey !== sourceCacheKey.value)
    .map((s) => ({ value: s.cacheKey, label: s.sourceLabel })),
);
const selectedDestLabel = computed(
  () =>
    sources.value.find((s) => s.cacheKey === destCacheKey.value)?.sourceLabel ??
    "",
);

// Picking a source that equals the current destination clears the destination.
function onSelectSource(value: string) {
  sourceCacheKey.value = value;
  if (destCacheKey.value === value) destCacheKey.value = "";
}

async function loadInitial() {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ games: GameLite[]; libraries: LibrarySummary[] }>(
      "/api/roms",
    );
    allGameKeys.value = res.games.map((g) => g.gameKey);
    sources.value = res.libraries;
    const scanned = sources.value.filter((s) => s.cacheExists);
    if (scanned.length === 1) sourceCacheKey.value = scanned[0].cacheKey;
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadInitial);
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Transfer</h1>
      <NuxtLink to="/roms" class="btn-ghost text-sm">‹ Library</NuxtLink>
    </header>

    <p v-if="error" class="text-danger text-sm">{{ error }}</p>

    <div
      v-if="loading"
      class="flex items-center justify-center gap-3 py-8 text-fg-dim"
    >
      <Spinner /> <span>Loading…</span>
    </div>

    <template v-else>
      <div
        v-if="sourceOptions.length === 0"
        class="card text-center text-fg-dim"
      >
        <p class="mb-1">No scanned ROM sources yet.</p>
        <p class="text-xs">
          Set a ROM folder on a device or virtual mount and scan it on the
          <NuxtLink to="/roms" class="underline hover:text-fg">library</NuxtLink>
          page, then come back to transfer.
        </p>
      </div>

      <template v-else>
        <div class="flex flex-col gap-3 sm:flex-row">
          <div class="flex flex-1 flex-col gap-1">
            <span class="label">Source</span>
            <AppSelect
              :model-value="sourceCacheKey"
              :options="sourceOptions"
              placeholder="Copy from…"
              aria-label="Source device"
              @update:model-value="onSelectSource"
            />
          </div>
          <div class="flex flex-1 flex-col gap-1">
            <span class="label">Destination</span>
            <AppSelect
              :model-value="destCacheKey"
              :options="destinationOptions"
              placeholder="Copy to…"
              aria-label="Destination device"
              @update:model-value="(v: string) => (destCacheKey = v)"
            />
          </div>
        </div>

        <!-- ROMs / Art tabs share the source + destination chosen above. -->
        <div class="flex gap-1 border-b border-border">
          <button
            class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
            :class="
              tab === 'roms'
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-dim hover:text-fg'
            "
            @click="tab = 'roms'"
          >
            ROMs
          </button>
          <button
            class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
            :class="
              tab === 'art'
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-dim hover:text-fg'
            "
            @click="tab = 'art'"
          >
            Art
          </button>
        </div>

        <TransferRomsTab
          v-if="tab === 'roms'"
          :source-cache-key="sourceCacheKey"
          :dest-cache-key="destCacheKey"
          :dest-label="selectedDestLabel"
          :all-game-keys="allGameKeys"
        />
        <TransferArtTab
          v-else
          :dest-cache-key="destCacheKey"
          :dest-label="selectedDestLabel"
        />
      </template>
    </template>
  </div>
</template>
