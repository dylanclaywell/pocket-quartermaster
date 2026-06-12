<script setup lang="ts">
interface NamePlanGame {
  gameKey: string;
  system: string;
  canonicalName: string;
  existingName: string | null;
  newName: string;
  needsUpdate: boolean;
}

const props = defineProps<{
  destCacheKey: string;
  destLabel: string;
}>();

const games = ref<NamePlanGame[]>([]);
const reconciled = ref(true);
const planReason = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const pushing = ref(false);
const note = ref<string | null>(null);
const search = ref("");
const selected = ref<Set<string>>(new Set());

// Full (unfiltered) buckets — drive counts and the selection helpers.
const needAll = computed(() => games.value.filter((g) => g.needsUpdate));
const sameAll = computed(() => games.value.filter((g) => !g.needsUpdate));

function matchesSearch(g: NamePlanGame, q: string) {
  return (
    g.newName.toLowerCase().includes(q) ||
    g.canonicalName.toLowerCase().includes(q) ||
    (g.existingName ?? "").toLowerCase().includes(q) ||
    g.system.toLowerCase().includes(q)
  );
}
function sortByName(list: NamePlanGame[]) {
  return [...list].sort((a, b) =>
    a.newName.localeCompare(b.newName, undefined, { sensitivity: "base" }),
  );
}

const sections = computed(() => {
  const q = search.value.trim().toLowerCase();
  const f = (list: NamePlanGame[]) =>
    sortByName(q ? list.filter((g) => matchesSearch(g, q)) : list);
  return [
    { key: "need", title: "Needs update", games: f(needAll.value) },
    { key: "same", title: "Already matching", games: f(sameAll.value) },
  ];
});

async function load() {
  if (!props.destCacheKey) {
    games.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  note.value = null;
  try {
    const res = await $fetch<{
      reconciled: boolean;
      reason?: string;
      games: NamePlanGame[];
    }>("/api/roms/metadata/plan", {
      method: "POST",
      body: { destCacheKey: props.destCacheKey },
    });
    games.value = res.games;
    reconciled.value = res.reconciled;
    planReason.value = res.reason ?? null;
    selectNeeded();
  } catch (e) {
    error.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => props.destCacheKey, load);

function toggle(g: NamePlanGame) {
  const next = new Set(selected.value);
  if (next.has(g.gameKey)) next.delete(g.gameKey);
  else next.add(g.gameKey);
  selected.value = next;
}
function selectNeeded() {
  selected.value = new Set(needAll.value.map((g) => g.gameKey));
}
function selectAll() {
  selected.value = new Set(games.value.map((g) => g.gameKey));
}
function selectNone() {
  selected.value = new Set();
}

async function push() {
  if (!props.destCacheKey || selected.value.size === 0) return;
  pushing.value = true;
  error.value = null;
  note.value = null;
  try {
    const res = await $fetch<{ entryCount: number }>("/api/roms/metadata/sync", {
      method: "POST",
      body: { destCacheKey: props.destCacheKey, gameKeys: [...selected.value] },
    });
    note.value =
      `Wrote names for ${selected.value.size} game` +
      (selected.value.size === 1 ? "" : "s") +
      ` (${res.entryCount} file${res.entryCount === 1 ? "" : "s"}).`;
    await load(); // re-reconcile so renamed games move to "Already matching"
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
      Choose a destination above to push names.
    </div>

    <div
      v-else-if="loading"
      class="flex items-center justify-center gap-3 py-6 text-fg-dim"
    >
      <Spinner /> <span>Loading…</span>
    </div>

    <div
      v-else-if="games.length === 0"
      class="card text-center text-sm text-fg-dim"
    >
      No games installed on {{ destLabel }} yet.
    </div>

    <template v-else>
      <p v-if="planReason" class="text-warn text-xs">{{ planReason }}</p>

      <div class="flex items-center justify-between gap-2">
        <h2 class="min-w-0 text-sm font-semibold uppercase tracking-wide text-fg-dim">
          <span class="text-fg">{{ needAll.length }} to update</span>
          <template v-if="sameAll.length > 0"> · {{ sameAll.length }} matching</template>
        </h2>
        <div class="flex shrink-0 gap-2">
          <button class="btn-secondary text-sm" @click="selectNeeded">Needed</button>
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

      <section
        v-for="sec in sections"
        v-show="sec.games.length > 0"
        :key="sec.key"
        class="flex flex-col gap-2"
      >
        <h3 class="text-xs font-semibold uppercase tracking-wide text-fg-dim">
          {{ sec.title }} <span class="text-fg-dim/70">· {{ sec.games.length }}</span>
        </h3>

        <!-- Column header for the name grid. -->
        <div
          class="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-fg-dim/70"
        >
          <span class="w-5" aria-hidden="true"></span>
          <span>Canonical name</span>
          <span>Existing name</span>
          <span>New name</span>
        </div>

        <ul class="flex flex-col">
          <li v-for="g in sec.games" :key="g.gameKey">
            <button
              type="button"
              class="grid w-full grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-3 rounded-md px-2 py-2 text-left text-sm hover:bg-white/5"
              :class="selected.has(g.gameKey) ? 'bg-accent/10' : ''"
              @click="toggle(g)"
            >
              <span
                class="flex size-5 items-center justify-center rounded text-xs font-bold ring-1"
                :class="
                  selected.has(g.gameKey)
                    ? 'bg-accent text-white ring-accent'
                    : 'text-transparent ring-border'
                "
                aria-hidden="true"
              >
                ✓
              </span>
              <span class="min-w-0 truncate text-fg-dim" :title="g.canonicalName">
                {{ g.canonicalName }}
              </span>
              <span
                class="min-w-0 truncate"
                :class="g.existingName ? 'text-fg-dim' : 'italic text-fg-dim/50'"
                :title="g.existingName ?? ''"
              >
                {{ g.existingName ?? "— none —" }}
              </span>
              <span class="min-w-0 truncate font-medium text-fg" :title="g.newName">
                {{ g.newName }}
              </span>
            </button>
          </li>
        </ul>
      </section>

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
          <span>{{ pushing ? "Writing…" : `Write ${selected.size}` }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
