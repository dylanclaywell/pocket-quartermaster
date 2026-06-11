<script setup lang="ts">
import { systemFallbackBackground } from "~/composables/useGameVisuals";

interface LiteGame {
  gameKey: string;
  displayName: string;
  system: string;
  installedOn: string[];
  hasThumbnail: boolean;
}

const props = defineProps<{
  destCacheKey: string;
  destLabel: string;
}>();

const games = ref<LiteGame[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const pushing = ref(false);
const note = ref<string | null>(null);
const search = ref("");
// Blank = use the device's configured size (or full size if none set).
const maxEdge = ref<string>("");
const selected = ref<Set<string>>(new Set());

const installedHere = computed(() =>
  props.destCacheKey
    ? games.value.filter((g) => g.installedOn.includes(props.destCacheKey))
    : [],
);
const withArt = computed(() =>
  installedHere.value.filter((g) => g.hasThumbnail),
);
const withoutArt = computed(
  () => installedHere.value.length - withArt.value.length,
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = q
    ? installedHere.value.filter(
        (g) =>
          g.displayName.toLowerCase().includes(q) ||
          g.system.toLowerCase().includes(q),
      )
    : installedHere.value;
  return [...list].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );
});

function resetSelection() {
  selected.value = new Set(withArt.value.map((g) => g.gameKey));
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ games: LiteGame[] }>("/api/roms");
    games.value = res.games;
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
// Re-seed the selection (all art-bearing games) whenever the destination or the
// underlying data changes.
watch(
  [() => props.destCacheKey, withArt],
  () => {
    note.value = null;
    resetSelection();
  },
  { immediate: true },
);

function toggle(g: LiteGame) {
  if (!g.hasThumbnail) return;
  const next = new Set(selected.value);
  if (next.has(g.gameKey)) next.delete(g.gameKey);
  else next.add(g.gameKey);
  selected.value = next;
}
function selectAll() {
  selected.value = new Set(withArt.value.map((g) => g.gameKey));
}
function selectNone() {
  selected.value = new Set();
}

function thumbUrl(gameKey: string) {
  return `/api/thumbnails/${encodeURIComponent(gameKey)}`;
}

async function push() {
  if (!props.destCacheKey || selected.value.size === 0) return;
  pushing.value = true;
  error.value = null;
  note.value = null;
  try {
    const body: {
      destCacheKey: string;
      gameKeys: string[];
      maxEdgePx?: number;
    } = {
      destCacheKey: props.destCacheKey,
      gameKeys: [...selected.value],
    };
    const m = parseInt(maxEdge.value, 10);
    if (Number.isFinite(m) && m > 0) body.maxEdgePx = m;
    const res = await $fetch<{
      pushed: number;
      skippedNoArt: number;
      resizedTo?: number;
      reason?: string;
    }>("/api/roms/art/push", { method: "POST", body });
    note.value = res.reason
      ? res.reason
      : `Pushed ${res.pushed} cover${res.pushed === 1 ? "" : "s"}` +
        (res.resizedTo ? `, resized to ${res.resizedTo}px` : "") +
        ".";
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    pushing.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="error" class="text-danger text-sm">{{ error }}</p>

    <div v-if="!destCacheKey" class="card text-center text-sm text-fg-dim">
      Choose a destination above to push art.
    </div>

    <div
      v-else-if="loading"
      class="flex items-center justify-center gap-3 py-6 text-fg-dim"
    >
      <Spinner /> <span>Loading…</span>
    </div>

    <div
      v-else-if="installedHere.length === 0"
      class="card text-center text-sm text-fg-dim"
    >
      No games installed on {{ destLabel }} yet.
    </div>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <h2
          class="min-w-0 text-sm font-semibold uppercase tracking-wide text-fg-dim"
        >
          <span class="text-fg">{{ withArt.length }} ready</span>
          <template v-if="withoutArt > 0">
            · {{ withoutArt }} have no art</template
          >
        </h2>
        <div class="flex shrink-0 gap-2">
          <button class="btn-secondary text-sm" @click="selectAll">All</button>
          <button class="btn-ghost text-sm" @click="selectNone">None</button>
        </div>
      </div>

      <input
        v-model="search"
        class="input"
        placeholder="Filter by name or system…"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
      />

      <div
        v-if="filtered.length === 0"
        class="card text-center text-sm text-fg-dim"
      >
        No games match “{{ search }}”.
      </div>
      <div v-else class="grid grid-cols-3 gap-4 sm:grid-cols-4">
        <button
          v-for="g in filtered"
          :key="g.gameKey"
          type="button"
          class="group flex flex-col gap-1 text-left"
          :class="g.hasThumbnail ? '' : 'cursor-default opacity-50'"
          :disabled="!g.hasThumbnail"
          @click="toggle(g)"
        >
          <div
            class="relative aspect-square overflow-hidden rounded-[12%]"
            :class="
              g.hasThumbnail && selected.has(g.gameKey)
                ? 'ring-[3px] ring-accent'
                : 'ring-1 ring-border'
            "
            :style="{ background: systemFallbackBackground(g.system) }"
          >
            <img
              v-if="g.hasThumbnail"
              :src="thumbUrl(g.gameKey)"
              :alt="g.displayName"
              class="absolute inset-0 size-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span
              v-else
              class="absolute inset-0 flex items-center justify-center text-[10px] font-medium uppercase tracking-wide text-white/70"
            >
              no art
            </span>
            <!-- Darken selected covers so the selection reads at a glance. -->
            <div
              v-if="g.hasThumbnail && selected.has(g.gameKey)"
              class="absolute inset-0 bg-black/45"
            />
            <span
              v-if="g.hasThumbnail"
              class="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full text-sm font-bold ring-1"
              :class="
                selected.has(g.gameKey)
                  ? 'bg-accent text-white ring-white/30'
                  : 'bg-black/45 text-white/70 ring-white/20'
              "
              aria-hidden="true"
            >
              {{ selected.has(g.gameKey) ? "✓" : "" }}
            </span>
          </div>
          <span class="line-clamp-2 text-xs leading-tight text-fg-dim">
            {{ g.displayName }}
          </span>
        </button>
      </div>

      <label class="flex flex-col gap-1">
        <span class="label">Max size (px)</span>
        <input
          v-model="maxEdge"
          class="input"
          inputmode="numeric"
          placeholder="Blank = this device's setting, or full size"
        />
        <span class="text-xs text-fg-dim">
          Downscales the longest edge for small screens. Larger art is shrunk
          and saved as PNG; smaller art is left as-is.
        </span>
      </label>

      <p v-if="note" class="text-sm text-ok">{{ note }}</p>

      <div
        class="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-[color-mix(in_oklab,var(--color-bg)_92%,white_8%)] py-3 backdrop-blur"
        style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
      >
        <span class="min-w-0 truncate text-sm text-fg-dim">
          {{ selected.size }} selected
          <span v-if="destLabel"> → {{ destLabel }}</span>
        </span>
        <button
          class="btn-primary"
          :disabled="selected.size === 0 || pushing"
          @click="push"
        >
          <Spinner v-if="pushing" size="sm" />
          <span>{{ pushing ? "Pushing…" : `Push ${selected.size}` }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
