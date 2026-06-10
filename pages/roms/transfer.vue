<script setup lang="ts">
import { formatBytes } from "~/composables/useFormat";

interface LibrarySummary {
  cacheKey: string;
  sourceLabel: string;
  role: "library" | "destination";
  configured: boolean;
}
interface GameLite {
  gameKey: string;
}
interface PlanItem {
  gameKey: string;
  displayName: string;
  system: string;
  variantKey: string;
  filename: string;
  sizeBytes: number;
  sourceLabel: string;
  destLabel: string;
  destRelPath: string;
  alreadyInstalled: boolean;
  blocker?: string;
}
interface ItemResult {
  gameKey: string;
  filename: string;
  ok: boolean;
  bytesCopied?: number;
  skipped?: string;
  error?: string;
}
interface MetadataResult {
  systemKey: string;
  ok: boolean;
  written: number;
  total: number;
  error?: string;
}
interface MetadataSummary {
  kind: "es-de" | "muos";
  results: MetadataResult[];
  note?: string;
}

const destinations = ref<LibrarySummary[]>([]);
const libraryLabel = ref<string>("");
const allGameKeys = ref<string[]>([]);
const destCacheKey = ref<string>("");
const planItems = ref<PlanItem[]>([]);
const selected = ref<Set<string>>(new Set());
const results = ref<ItemResult[]>([]);
const metadata = ref<MetadataSummary | null>(null);

const loading = ref(true);
const planning = ref(false);
const running = ref(false);
const error = ref<string | null>(null);

const search = ref("");
const collapsed = ref<Set<string>>(new Set());

const transferable = computed(() =>
  planItems.value.filter((i) => !i.blocker && !i.alreadyInstalled),
);
const selectedItems = computed(() =>
  planItems.value.filter((i) => selected.value.has(i.gameKey)),
);
const selectedSize = computed(() =>
  selectedItems.value.reduce((s, i) => s + i.sizeBytes, 0),
);

const selectedDestLabel = computed(
  () =>
    destinations.value.find((d) => d.cacheKey === destCacheKey.value)
      ?.sourceLabel ?? "",
);

const destinationOptions = computed(() =>
  destinations.value.map((d) => ({ value: d.cacheKey, label: d.sourceLabel })),
);

function onSelectDest(value: string) {
  destCacheKey.value = value;
  onDestChange();
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return planItems.value;
  return planItems.value.filter(
    (i) =>
      i.displayName.toLowerCase().includes(q) ||
      i.system.toLowerCase().includes(q) ||
      i.filename.toLowerCase().includes(q),
  );
});

// Group filtered items by system, systems alphabetized, games alphabetized.
const groupedItems = computed(() => {
  const groups = new Map<string, PlanItem[]>();
  for (const i of filteredItems.value) {
    const arr = groups.get(i.system) ?? [];
    arr.push(i);
    groups.set(i.system, arr);
  }
  return [...groups.entries()]
    .map(([system, list]) => ({
      system,
      items: [...list].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      ),
    }))
    .sort((a, b) =>
      a.system.localeCompare(b.system, undefined, { sensitivity: "base" }),
    );
});

function toggleSystem(system: string) {
  const next = new Set(collapsed.value);
  if (next.has(system)) next.delete(system);
  else next.add(system);
  collapsed.value = next;
}

const resultSummary = computed(() => {
  if (results.value.length === 0) return null;
  const ok = results.value.filter((r) => r.ok && r.bytesCopied).length;
  const skipped = results.value.filter((r) => r.skipped).length;
  const failed = results.value.filter((r) => !r.ok && r.error).length;
  return { ok, skipped, failed };
});

// Names written into launcher metadata after a transfer, plus any per-system
// errors (e.g. muOS, which isn't wired yet).
const metadataSummary = computed(() => {
  if (!metadata.value) return null;
  const written = metadata.value.results.reduce((s, r) => s + r.written, 0);
  const errors = metadata.value.results.filter((r) => !r.ok && r.error);
  return { kind: metadata.value.kind, written, errors, note: metadata.value.note };
});

async function loadInitial() {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{
      games: GameLite[];
      libraries: LibrarySummary[];
    }>("/api/roms");
    allGameKeys.value = res.games.map((g) => g.gameKey);
    libraryLabel.value =
      res.libraries.find((l) => l.role === "library")?.sourceLabel ?? "";
    destinations.value = res.libraries.filter(
      (l) => l.role === "destination" && l.configured,
    );
    if (destinations.value.length === 1) {
      destCacheKey.value = destinations.value[0].cacheKey;
      await loadPlan();
    }
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function loadPlan() {
  if (!destCacheKey.value || allGameKeys.value.length === 0) {
    planItems.value = [];
    return;
  }
  planning.value = true;
  error.value = null;
  results.value = [];
  metadata.value = null;
  try {
    const res = await $fetch<{ plan: { items: PlanItem[] } }>(
      "/api/roms/transfer/plan",
      {
        method: "POST",
        body: { destCacheKey: destCacheKey.value, gameKeys: allGameKeys.value },
      },
    );
    planItems.value = res.plan.items.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: "base",
      }),
    );
    // Pre-select everything transferable and not already installed.
    selected.value = new Set(transferable.value.map((i) => i.gameKey));
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    planning.value = false;
  }
}

function onDestChange() {
  loadPlan();
}

function toggle(gameKey: string) {
  const next = new Set(selected.value);
  if (next.has(gameKey)) next.delete(gameKey);
  else next.add(gameKey);
  selected.value = next;
}
function selectNeeded() {
  selected.value = new Set(transferable.value.map((i) => i.gameKey));
}
function selectNone() {
  selected.value = new Set();
}

async function run() {
  if (selected.value.size === 0) return;
  running.value = true;
  error.value = null;
  try {
    const res = await $fetch<{
      results: ItemResult[];
      rescanError?: string;
      metadata?: MetadataSummary;
    }>("/api/roms/transfer/execute", {
      method: "POST",
      body: {
        destCacheKey: destCacheKey.value,
        gameKeys: [...selected.value],
      },
    });
    results.value = res.results;
    const md = res.metadata ?? null;
    if (res.rescanError)
      error.value = `Transfer done, but re-scan failed: ${res.rescanError}`;
    await loadPlan();
    // loadPlan() clears metadata; restore this run's result after it.
    metadata.value = md;
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    running.value = false;
  }
}

onMounted(loadInitial);

function itemState(i: PlanItem): { text: string; cls: string } {
  if (i.blocker) return { text: i.blocker, cls: "text-warn" };
  if (i.alreadyInstalled)
    return { text: "already installed", cls: "text-fg-dim" };
  return { text: formatBytes(i.sizeBytes), cls: "text-fg-dim" };
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Transfer ROMs</h1>
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
        v-if="destinations.length === 0"
        class="card text-center text-fg-dim"
      >
        <p class="mb-1">No destination devices configured.</p>
        <p class="text-xs">
          On the Devices page, set a ROM library folder on a device or virtual
          mount and set its role to
          <span class="font-semibold text-fg">destination</span>.
        </p>
        <NuxtLink to="/devices" class="btn-secondary mt-3 text-sm"
          >Go to Devices</NuxtLink
        >
      </div>

      <template v-else>
        <p v-if="libraryLabel" class="text-sm text-fg-dim">
          Transferring from
          <span class="font-semibold text-fg">{{ libraryLabel }}</span>
        </p>
        <div class="flex flex-col gap-1">
          <span class="label">Destination</span>
          <AppSelect
            :model-value="destCacheKey"
            :options="destinationOptions"
            placeholder="Choose a device…"
            aria-label="Destination device"
            @update:model-value="onSelectDest"
          />
        </div>

        <div v-if="metadataSummary" class="card flex flex-col gap-1 text-sm">
          <p v-if="metadataSummary.note" class="text-warn">
            {{ metadataSummary.kind === "es-de" ? "ES-DE" : "muOS" }} names not written:
            {{ metadataSummary.note }}
          </p>
          <p v-else :class="metadataSummary.errors.length ? 'text-warn' : 'text-ok'">
            {{ metadataSummary.kind === "es-de" ? "ES-DE" : "muOS" }}: wrote
            {{ metadataSummary.written }} name{{ metadataSummary.written === 1 ? "" : "s" }}
            <template v-if="metadataSummary.written === 0 && !metadataSummary.errors.length">
              (already up to date)
            </template>
          </p>
          <ul
            v-if="metadataSummary.errors.length"
            class="flex flex-col gap-0.5 text-xs text-warn"
          >
            <li v-for="r in metadataSummary.errors" :key="r.systemKey">
              {{ r.systemKey }}: {{ r.error }}
            </li>
          </ul>
        </div>

        <div
          v-if="planning"
          class="flex items-center justify-center gap-3 py-6 text-fg-dim"
        >
          <Spinner /> <span>Building plan…</span>
        </div>

        <template v-else-if="destCacheKey">
          <div
            v-if="planItems.length === 0"
            class="card text-center text-sm text-fg-dim"
          >
            No games in the library yet.
          </div>

          <template v-else>
            <div class="flex items-center justify-between gap-2">
              <h2
                class="min-w-0 text-sm font-semibold uppercase tracking-wide text-fg-dim"
              >
                <span class="text-fg">To {{ selectedDestLabel }}</span>
                · {{ transferable.length }} can transfer
              </h2>
              <div class="flex shrink-0 gap-2">
                <button class="btn-secondary text-sm" @click="selectNeeded">
                  Select needed
                </button>
                <button class="btn-ghost text-sm" @click="selectNone">
                  Clear
                </button>
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
              v-if="filteredItems.length === 0"
              class="card text-center text-sm text-fg-dim"
            >
              No games match “{{ search }}”.
            </div>
            <div v-else class="flex flex-col gap-5">
              <div
                v-for="grp in groupedItems"
                :key="grp.system"
                class="flex flex-col gap-2 bg-gray-800/50 rounded-2xl"
              >
                <button
                  class="row-button bg-surface-2"
                  @click="toggleSystem(grp.system)"
                >
                  <span class="text-sm font-bold uppercase tracking-wide">
                    {{ grp.system }}
                    <span class="text-fg-dim">· {{ grp.items.length }}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    class="text-xl leading-none text-accent"
                  >
                    {{ collapsed.has(grp.system) ? "▸" : "▾" }}
                  </span>
                </button>
                <ul
                  v-show="!collapsed.has(grp.system)"
                  class="flex flex-col gap-2 p-3"
                >
                  <li v-for="i in grp.items" :key="i.gameKey">
                    <button
                      type="button"
                      class="card flex w-full items-start gap-3 text-left"
                      :class="
                        i.blocker || i.alreadyInstalled ? 'opacity-60' : ''
                      "
                      :disabled="Boolean(i.blocker) || i.alreadyInstalled"
                      @click="toggle(i.gameKey)"
                    >
                      <input
                        type="checkbox"
                        class="pointer-events-none mt-1 size-4 shrink-0"
                        tabindex="-1"
                        :checked="selected.has(i.gameKey)"
                        :disabled="Boolean(i.blocker) || i.alreadyInstalled"
                      />
                      <div class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-semibold">{{
                          i.displayName
                        }}</span>
                        <span class="truncate font-mono text-xs text-fg-dim">{{
                          i.filename
                        }}</span>
                        <span
                          class="truncate text-xs"
                          :class="itemState(i).cls"
                          >{{ itemState(i).text }}</span
                        >
                      </div>
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Results -->
            <div v-if="resultSummary" class="card flex flex-col gap-1 text-sm">
              <p :class="resultSummary.failed > 0 ? 'text-warn' : 'text-ok'">
                Copied {{ resultSummary.ok }} · skipped
                {{ resultSummary.skipped }}
                <template v-if="resultSummary.failed > 0">
                  · failed {{ resultSummary.failed }}</template
                >
              </p>
              <ul
                v-if="resultSummary.failed > 0"
                class="flex flex-col gap-0.5 text-xs text-danger"
              >
                <li
                  v-for="r in results.filter((x) => !x.ok && x.error)"
                  :key="r.gameKey"
                >
                  {{ r.filename }}: {{ r.error }}
                </li>
              </ul>
            </div>

            <div
              class="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-[color-mix(in_oklab,var(--color-bg)_92%,white_8%)] py-3 backdrop-blur"
              style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
            >
              <span class="min-w-0 truncate text-sm text-fg-dim">
                {{ selected.size }} selected · {{ formatBytes(selectedSize) }}
                <span v-if="selectedDestLabel"> → {{ selectedDestLabel }}</span>
              </span>
              <button
                class="btn-primary"
                :disabled="selected.size === 0 || running"
                @click="run"
              >
                <Spinner v-if="running" size="sm" />
                <span>{{
                  running ? "Transferring…" : `Transfer ${selected.size}`
                }}</span>
              </button>
            </div>
          </template>
        </template>
      </template>
    </template>
  </div>
</template>
