<script setup lang="ts">
import { formatDuration, formatRelativeIso } from "~/composables/useFormat";

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
interface SearchResult {
  filename: string;
  displayName: string;
  system: string;
  downloadUrl: string;
}
interface SearchResponse {
  results: SearchResult[];
  systems: { system: string; ok: boolean; reason?: string }[];
}

const route = useRoute();
const router = useRouter();
const normalizedName = computed(() => decodeURIComponent(route.params.normalizedName as string));

const game = ref<AggregatedGame | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const searchQuery = ref("");
const searchResults = ref<SearchResult[]>([]);
const searchBusy = ref(false);
const searchError = ref<string | null>(null);
const searchSystems = ref<{ system: string; ok: boolean; reason?: string }[]>([]);

const urlInput = ref("");
const downloadBusy = ref(false);
const downloadError = ref<string | null>(null);
const removeBusy = ref(false);

// Cache-busting query string on the thumbnail URL — bumped after every
// download/remove so the browser refetches.
const thumbnailVersion = ref(Date.now());

const thumbnailUrl = computed(() => {
  if (!game.value) return "";
  return `/api/thumbnails/${encodeURIComponent(game.value.normalizedName)}?v=${thumbnailVersion.value}`;
});

function systemHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

const fallbackBackground = computed(() => {
  if (!game.value) return "";
  const hue = systemHue(game.value.system ?? game.value.cores[0] ?? "unknown");
  return `linear-gradient(135deg, hsl(${hue}, 60%, 28%) 0%, hsl(${(hue + 30) % 360}, 55%, 12%) 100%)`;
});

async function loadGame() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await $fetch<{ games: AggregatedGame[] }>("/api/activity");
    const match = res.games.find((g) => g.normalizedName === normalizedName.value);
    if (!match) {
      loadError.value = `No game found for "${normalizedName.value}".`;
    } else {
      game.value = match;
    }
  } catch (e) {
    loadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadGame);

let searchToken = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = [];
    searchError.value = null;
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 300);
});

async function runSearch(q: string) {
  if (!game.value || game.value.libretroDbNames.length === 0) {
    searchError.value = "No libretro system mapped for this game's core.";
    return;
  }
  const token = ++searchToken;
  searchBusy.value = true;
  searchError.value = null;
  try {
    const res = await $fetch<SearchResponse>("/api/thumbnails/search", {
      params: {
        systems: game.value.libretroDbNames.join(","),
        q,
      },
    });
    // Discard if a newer search has already started.
    if (token !== searchToken) return;
    searchResults.value = res.results;
    searchSystems.value = res.systems;
  } catch (e) {
    if (token !== searchToken) return;
    searchError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    if (token === searchToken) searchBusy.value = false;
  }
}

async function downloadFromUrl(sourceUrl: string) {
  if (!game.value) return;
  downloadBusy.value = true;
  downloadError.value = null;
  try {
    await $fetch("/api/thumbnails/download", {
      method: "POST",
      body: { normalizedName: game.value.normalizedName, sourceUrl },
    });
    thumbnailVersion.value = Date.now();
    game.value = { ...game.value, hasThumbnail: true };
    urlInput.value = "";
    searchResults.value = [];
    searchQuery.value = "";
  } catch (e) {
    downloadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    downloadBusy.value = false;
  }
}

async function removeThumbnail() {
  if (!game.value) return;
  if (!confirm("Remove the cached thumbnail for this game?")) return;
  removeBusy.value = true;
  downloadError.value = null;
  try {
    await $fetch(`/api/thumbnails/${encodeURIComponent(game.value.normalizedName)}`, {
      method: "DELETE",
    });
    thumbnailVersion.value = Date.now();
    game.value = { ...game.value, hasThumbnail: false };
  } catch (e) {
    downloadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center gap-3 py-8 text-fg-dim">
      <Spinner /> <span>Loading game…</span>
    </div>
    <div v-else-if="loadError" class="card flex flex-col gap-2">
      <p class="text-danger">{{ loadError }}</p>
      <button class="btn-secondary self-start text-sm" @click="router.push('/activity')">
        Back to Activity
      </button>
    </div>

    <template v-else-if="game">
      <header class="flex flex-col gap-1">
        <p class="eyebrow">
          {{ game.system ?? game.cores.join(", ") }}
        </p>
        <h1 class="text-xl font-bold leading-tight">{{ game.displayName }}</h1>
        <p class="text-xs text-fg-dim">
          {{ formatDuration(game.totalSeconds) }} ·
          {{ game.totalPlayCount }} session{{ game.totalPlayCount === 1 ? "" : "s" }}
          <span v-if="game.lastPlayedAt">
            · last played {{ formatRelativeIso(game.lastPlayedAt) }}
          </span>
        </p>
      </header>

      <section class="card flex flex-col gap-3">
        <h2 class="eyebrow">Box art</h2>

        <div class="flex items-start gap-3">
          <div
            class="relative aspect-square w-32 shrink-0 overflow-hidden rounded-[22%] ring-1 ring-border"
            :style="{ background: fallbackBackground }"
          >
            <img
              v-if="game.hasThumbnail"
              :src="thumbnailUrl"
              :alt="game.displayName"
              class="absolute inset-0 size-full object-cover"
            />
            <span
              v-else
              class="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] font-medium uppercase tracking-wide text-white/70"
            >
              No art yet
            </span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <p class="text-xs text-fg-dim">
              Normalized name: <span class="font-mono">{{ game.normalizedName }}</span>
            </p>
            <p class="text-xs text-fg-dim">
              <template v-if="game.libretroDbNames.length > 0">
                Searches:
                <span
                  v-for="(s, i) in game.libretroDbNames"
                  :key="s"
                  class="font-mono"
                >
                  {{ i > 0 ? ", " : "" }}{{ s }}
                </span>
              </template>
              <template v-else>
                No libretro repo mapped — use the URL field below.
              </template>
            </p>
            <button
              v-if="game.hasThumbnail"
              class="btn-ghost self-start text-xs text-danger"
              :disabled="removeBusy"
              @click="removeThumbnail"
            >
              <Spinner v-if="removeBusy" size="sm" />
              <span>{{ removeBusy ? "Removing…" : "Remove art" }}</span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="label" for="search">Search libretro thumbnails</label>
          <input
            id="search"
            v-model="searchQuery"
            class="input"
            type="search"
            placeholder="Start typing the game title…"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="game.libretroDbNames.length === 0"
          />
          <p v-if="searchError" class="text-warn text-xs">{{ searchError }}</p>
          <p
            v-if="searchSystems.length > 0 && searchQuery.trim()"
            class="text-[11px] text-fg-dim"
          >
            <span
              v-for="(s, i) in searchSystems"
              :key="s.system"
            >
              <span v-if="i > 0"> · </span>
              <span :class="s.ok ? 'text-fg-dim' : 'text-warn'">
                {{ s.system }}{{ s.ok ? "" : " (failed)" }}
              </span>
            </span>
          </p>

          <div
            v-if="searchBusy"
            class="flex items-center gap-2 py-2 text-xs text-fg-dim"
          >
            <Spinner size="sm" /> <span>Searching libretro…</span>
          </div>
          <ul
            v-else-if="searchResults.length > 0"
            class="flex max-h-72 flex-col gap-1 overflow-y-auto rounded border border-border bg-surface-2 p-1"
          >
            <li v-for="r in searchResults" :key="`${r.system}/${r.filename}`">
              <button
                class="row-button"
                :disabled="downloadBusy"
                @click="downloadFromUrl(r.downloadUrl)"
              >
                <img
                  :src="r.downloadUrl"
                  :alt="r.displayName"
                  class="size-10 shrink-0 rounded object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div class="flex min-w-0 flex-1 flex-col text-left">
                  <span class="truncate text-sm">{{ r.displayName }}</span>
                  <span class="truncate text-[10px] text-fg-dim">{{ r.system }}</span>
                </div>
              </button>
            </li>
          </ul>
          <p
            v-else-if="searchQuery.trim() && !searchBusy"
            class="text-xs text-fg-dim"
          >
            No matches.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="label" for="url">Or paste an image URL</label>
          <div class="flex gap-2">
            <input
              id="url"
              v-model="urlInput"
              class="input flex-1"
              type="url"
              placeholder="https://…/box-art.png"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button
              class="btn-secondary text-sm"
              :disabled="!urlInput.trim() || downloadBusy"
              @click="downloadFromUrl(urlInput.trim())"
            >
              <Spinner v-if="downloadBusy" size="sm" />
              <span>{{ downloadBusy ? "Downloading…" : "Download" }}</span>
            </button>
          </div>
          <p v-if="downloadError" class="text-danger text-xs">{{ downloadError }}</p>
          <p class="text-[11px] text-fg-dim">
            Accepted: PNG, JPG, WebP. Max 5 MB. The image is fetched server-side and
            cached on the Pi.
          </p>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="eyebrow">Where this game was played</h2>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="(pd, idx) in game.perDevice"
            :key="`${pd.cacheKey}-${idx}`"
            class="card flex items-center justify-between gap-2 text-sm"
          >
            <span class="truncate">{{ pd.sourceLabel }}</span>
            <span class="font-mono text-xs">
              {{ formatDuration(pd.runtimeSeconds) }}
              <span class="text-fg-dim">
                · {{ pd.playCount }}× ·
                {{ pd.lastPlayedAt ? formatRelativeIso(pd.lastPlayedAt) : "—" }}
              </span>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
