<script setup lang="ts">
import { formatBytes, formatDuration, formatRelativeIso } from "~/composables/useFormat";
import { systemFallbackBackground } from "~/composables/useGameVisuals";

interface ComputedVariant {
  key: string;
  filename: string;
  relPath: string;
  systemKey: string;
  system: string;
  sizeBytes: number;
  regionTags: string[];
  languages: string[];
  revision?: string;
  flags: string[];
  extension: string;
  isDefault: boolean;
  librarySources: { cacheKey: string; sourceLabel: string }[];
}
interface DestinationState {
  cacheKey: string;
  sourceLabel: string;
  sourceKind: "device" | "virtualMount";
  installedVariantKey?: string;
  installedFilenames: string[];
  unknownInstalled: string[];
  preferredVariantKey?: string;
  preferredInherited: boolean;
  status: "not-installed" | "match" | "mismatch" | "unknown";
}
interface ComputedGame {
  gameKey: string;
  displayName: string;
  displayNameOverride?: string;
  systemKey: string;
  system: string;
  variantCount: number;
  totalSizeBytes: number;
  defaultVariantKey?: string;
  saveProfileName?: string;
  notes?: string;
  hasThumbnail?: boolean;
  libretroDbNames?: string[];
  variants: ComputedVariant[];
  destinations: DestinationState[];
}
interface ArtSearchResult {
  filename: string;
  displayName: string;
  system: string;
  downloadUrl: string;
}
interface ActivityGame {
  normalizedName: string;
  totalSeconds: number;
  totalPlayCount: number;
  lastPlayedAt?: string;
  hasThumbnail: boolean;
}

const route = useRoute();
const router = useRouter();
const gameKey = computed(() => decodeURIComponent(route.params.gameKey as string));

const game = ref<ComputedGame | null>(null);
const activity = ref<ActivityGame | null>(null);
const profileNames = ref<string[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const editingName = ref(false);
const nameDraft = ref("");
const notesDraft = ref("");
const savingMeta = ref(false);
const savingPrefKey = ref<string | null>(null);

const fallbackBackground = computed(() =>
  systemFallbackBackground(game.value?.system ?? "unknown"),
);
// Cache-busting version bumped after every art download/remove so the <img>
// refetches.
const thumbnailVersion = ref(Date.now());
const thumbnailUrl = computed(() =>
  game.value
    ? `/api/thumbnails/${encodeURIComponent(game.value.gameKey)}?v=${thumbnailVersion.value}`
    : "",
);

// --- Box-art management (libretro search + URL, shared thumbnail cache) ---
const searchQuery = ref("");
const searchResults = ref<ArtSearchResult[]>([]);
const searchBusy = ref(false);
const searchError = ref<string | null>(null);
const searchSystems = ref<{ system: string; ok: boolean; reason?: string }[]>([]);
const urlInput = ref("");
const downloadBusy = ref(false);
const artError = ref<string | null>(null);
const removeBusy = ref(false);

let searchToken = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = [];
    searchError.value = null;
    return;
  }
  searchTimer = setTimeout(() => runArtSearch(q), 300);
});

async function runArtSearch(q: string) {
  const dbNames = game.value?.libretroDbNames ?? [];
  if (dbNames.length === 0) {
    searchError.value = "No libretro system mapped for this game.";
    return;
  }
  const token = ++searchToken;
  searchBusy.value = true;
  searchError.value = null;
  try {
    const res = await $fetch<{
      results: ArtSearchResult[];
      systems: { system: string; ok: boolean; reason?: string }[];
    }>("/api/thumbnails/search", { params: { systems: dbNames.join(","), q } });
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

async function downloadArt(sourceUrl: string) {
  if (!game.value) return;
  downloadBusy.value = true;
  artError.value = null;
  try {
    await $fetch("/api/thumbnails/download", {
      method: "POST",
      body: { normalizedName: game.value.gameKey, sourceUrl },
    });
    thumbnailVersion.value = Date.now();
    game.value = { ...game.value, hasThumbnail: true };
    urlInput.value = "";
    searchResults.value = [];
    searchQuery.value = "";
  } catch (e) {
    artError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    downloadBusy.value = false;
  }
}

async function removeArt() {
  if (!game.value || !confirm("Remove the cached box art for this game?")) return;
  removeBusy.value = true;
  artError.value = null;
  try {
    await $fetch(`/api/thumbnails/${encodeURIComponent(game.value.gameKey)}`, {
      method: "DELETE",
    });
    thumbnailVersion.value = Date.now();
    game.value = { ...game.value, hasThumbnail: false };
  } catch (e) {
    artError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    removeBusy.value = false;
  }
}

function variantLabel(key?: string): string {
  if (!key) return "—";
  return game.value?.variants.find((v) => v.key === key)?.filename ?? key;
}

const prefOptions = computed(() => {
  if (!game.value) return [];
  const def = game.value.defaultVariantKey;
  return [
    { value: "", label: `Use default${def ? ` (${variantLabel(def)})` : ""}` },
    ...game.value.variants.map((v) => ({ value: v.key, label: v.filename })),
  ];
});
const profileOptions = computed(() => [
  { value: "", label: "(none)" },
  ...profileNames.value.map((n) => ({ value: n, label: n })),
]);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [g, act, profs] = await Promise.all([
      $fetch<{ game: ComputedGame }>(`/api/roms/games/${encodeURIComponent(gameKey.value)}`),
      $fetch<{ games: ActivityGame[] }>("/api/activity").catch(() => ({ games: [] })),
      $fetch<{ profiles: { name: string }[] }>("/api/profiles").catch(() => ({ profiles: [] })),
    ]);
    game.value = g.game;
    activity.value = act.games.find((x) => x.normalizedName === gameKey.value) ?? null;
    profileNames.value = profs.profiles.map((p) => p.name);
    notesDraft.value = g.game.notes ?? "";
  } catch (e) {
    loadError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function patchMeta(body: Record<string, string | null>) {
  if (!game.value) return;
  savingMeta.value = true;
  actionError.value = null;
  try {
    await $fetch(`/api/roms/games/${encodeURIComponent(game.value.gameKey)}`, {
      method: "PATCH",
      body,
    });
    await load();
  } catch (e) {
    actionError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    savingMeta.value = false;
  }
}

function startEditName() {
  if (!game.value) return;
  nameDraft.value = game.value.displayName;
  editingName.value = true;
}
async function saveName() {
  await patchMeta({ displayNameOverride: nameDraft.value.trim() });
  editingName.value = false;
}
async function resetName() {
  await patchMeta({ displayNameOverride: null });
  editingName.value = false;
}

const setDefault = (variantKey: string) => patchMeta({ defaultVariantKey: variantKey });
const setSaveProfile = (name: string) => patchMeta({ saveProfileName: name || null });
const saveNotes = () => patchMeta({ notes: notesDraft.value.trim() || null });

async function setPreference(dest: DestinationState, variantKey: string) {
  if (!game.value) return;
  savingPrefKey.value = dest.cacheKey;
  actionError.value = null;
  try {
    await $fetch("/api/roms/preference", {
      method: "POST",
      body: {
        gameKey: game.value.gameKey,
        sourceCacheKey: dest.cacheKey,
        preferredVariantKey: variantKey || null,
      },
    });
    await load();
  } catch (e) {
    actionError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    savingPrefKey.value = null;
  }
}

function statusPill(status: DestinationState["status"]): { text: string; cls: string } {
  switch (status) {
    case "match":
      return { text: "installed", cls: "bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok" };
    case "mismatch":
      return { text: "needs update", cls: "bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn" };
    case "unknown":
      return { text: "unknown variant", cls: "bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn" };
    default:
      return { text: "not installed", cls: "bg-surface-2 text-fg-dim" };
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
      <button class="btn-secondary self-start text-sm" @click="router.push('/roms')">
        Back to ROM library
      </button>
    </div>

    <template v-else-if="game">
      <header class="flex items-start gap-3">
        <div
          class="relative aspect-square w-24 shrink-0 overflow-hidden rounded-[22%] ring-1 ring-border"
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
            No art
          </span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <p class="text-xs uppercase tracking-wide text-fg-dim">{{ game.system }}</p>
          <div v-if="!editingName" class="flex items-center gap-2">
            <h1 class="text-xl font-bold leading-tight">{{ game.displayName }}</h1>
            <button class="btn-secondary shrink-0 text-sm" @click="startEditName">Edit</button>
          </div>
          <div v-else class="flex flex-col gap-2">
            <input v-model="nameDraft" class="input" @keyup.enter="saveName" />
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary text-sm" :disabled="savingMeta" @click="saveName">Save</button>
              <button class="btn-ghost text-sm" @click="editingName = false">Cancel</button>
              <button
                v-if="game.displayNameOverride"
                class="btn-ghost text-sm text-fg-dim"
                @click="resetName"
              >
                Reset to filename
              </button>
            </div>
          </div>
          <p class="text-xs text-fg-dim">
            {{ game.variantCount }} variant{{ game.variantCount === 1 ? "" : "s" }} ·
            {{ formatBytes(game.totalSizeBytes) }}
          </p>
          <p v-if="activity" class="text-xs text-fg-dim">
            {{ formatDuration(activity.totalSeconds) }} ·
            {{ activity.totalPlayCount }} session{{ activity.totalPlayCount === 1 ? "" : "s" }}
            <span v-if="activity.lastPlayedAt">
              · last played {{ formatRelativeIso(activity.lastPlayedAt) }}
            </span>
          </p>
        </div>
      </header>

      <p v-if="actionError" class="text-danger text-sm">{{ actionError }}</p>

      <!-- Box art -->
      <section class="card flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">Box art</h2>
          <button
            v-if="game.hasThumbnail"
            class="btn-ghost text-xs text-danger"
            :disabled="removeBusy"
            @click="removeArt"
          >
            <Spinner v-if="removeBusy" size="sm" />
            <span>{{ removeBusy ? "Removing…" : "Remove" }}</span>
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <label class="label" for="art-search">Search libretro thumbnails</label>
          <input
            id="art-search"
            v-model="searchQuery"
            class="input"
            type="search"
            placeholder="Start typing the game title…"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="(game.libretroDbNames?.length ?? 0) === 0"
          />
          <p v-if="(game.libretroDbNames?.length ?? 0) === 0" class="text-warn text-xs">
            No libretro system mapped for {{ game.system }} — use the URL field below.
          </p>
          <p v-if="searchError" class="text-warn text-xs">{{ searchError }}</p>

          <div v-if="searchBusy" class="flex items-center gap-2 py-2 text-xs text-fg-dim">
            <Spinner size="sm" /> <span>Searching libretro…</span>
          </div>
          <ul
            v-else-if="searchResults.length > 0"
            class="flex max-h-72 flex-col gap-1 overflow-y-auto rounded border border-border bg-surface-2 p-1"
          >
            <li v-for="r in searchResults" :key="`${r.system}/${r.filename}`">
              <button class="row-button" :disabled="downloadBusy" @click="downloadArt(r.downloadUrl)">
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
          <p v-else-if="searchQuery.trim()" class="text-xs text-fg-dim">No matches.</p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="label" for="art-url">Or paste an image URL</label>
          <div class="flex gap-2">
            <input
              id="art-url"
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
              @click="downloadArt(urlInput.trim())"
            >
              <Spinner v-if="downloadBusy" size="sm" />
              <span>{{ downloadBusy ? "Downloading…" : "Download" }}</span>
            </button>
          </div>
          <p v-if="artError" class="text-danger text-xs">{{ artError }}</p>
          <p class="text-[11px] text-fg-dim">
            PNG, JPG, or WebP, max 5 MB. Cached on the server and shown everywhere this
            game appears.
          </p>
        </div>
      </section>

      <!-- Variants (from master) -->
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">Variants</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="v in game.variants" :key="v.key" class="card flex flex-col gap-1">
            <div class="flex items-start justify-between gap-2">
              <span class="break-all font-mono text-sm">{{ v.filename }}</span>
              <span
                v-if="v.isDefault"
                class="pill shrink-0 bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok"
                >default</span
              >
              <button
                v-else
                class="btn-secondary shrink-0 text-sm"
                :disabled="savingMeta"
                @click="setDefault(v.key)"
              >
                Make default
              </button>
            </div>
            <span class="flex flex-wrap items-center gap-1 text-xs text-fg-dim">
              <span v-for="r in v.regionTags" :key="r" class="pill bg-surface-2">{{ r }}</span>
              <span v-if="v.revision" class="pill bg-surface-2">{{ v.revision }}</span>
              <span v-if="v.languages.length" class="pill bg-surface-2">
                {{ v.languages.join(", ") }}
              </span>
              <span>· {{ formatBytes(v.sizeBytes) }}</span>
            </span>
            <span class="text-xs text-fg-dim">
              from: {{ v.librarySources.map((s) => s.sourceLabel).join(", ") }}
            </span>
          </li>
        </ul>
      </section>

      <!-- On your devices -->
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">On your devices</h2>
        <p v-if="game.destinations.length === 0" class="card text-center text-sm text-fg-dim">
          No destination devices configured. Mark a device or virtual mount as a
          <span class="font-semibold text-fg">destination</span> on the Devices page.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="d in game.destinations" :key="d.cacheKey" class="card flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-semibold">{{ d.sourceLabel }}</span>
              <span class="pill shrink-0" :class="statusPill(d.status).cls">
                {{ statusPill(d.status).text }}
              </span>
            </div>
            <p class="text-xs text-fg-dim">
              installed:
              <span class="font-mono">
                {{ d.installedVariantKey ? variantLabel(d.installedVariantKey) : "—" }}
              </span>
              <span v-if="d.unknownInstalled.length" class="text-warn">
                · unknown: {{ d.unknownInstalled.join(", ") }}
              </span>
            </p>
            <div class="flex flex-col gap-1 text-xs text-fg-dim">
              <span>prefers</span>
              <AppSelect
                :model-value="d.preferredInherited ? '' : (d.preferredVariantKey ?? '')"
                :options="prefOptions"
                :disabled="savingPrefKey === d.cacheKey"
                aria-label="Preferred variant"
                @update:model-value="(val) => setPreference(d, val)"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- Links & notes -->
      <section class="card flex flex-col gap-3">
        <h2 class="font-semibold">Links &amp; notes</h2>
        <div class="flex flex-col gap-1">
          <span class="label">Save profile</span>
          <AppSelect
            :model-value="game.saveProfileName ?? ''"
            :options="profileOptions"
            :disabled="savingMeta"
            aria-label="Save profile"
            @update:model-value="setSaveProfile"
          />
        </div>
        <label class="flex flex-col gap-1">
          <span class="label">Notes</span>
          <textarea
            v-model="notesDraft"
            class="input min-h-20"
            rows="3"
            placeholder="Anything worth remembering about this game…"
          ></textarea>
          <button class="btn-secondary self-start text-xs" :disabled="savingMeta" @click="saveNotes">
            Save notes
          </button>
        </label>
      </section>

      <button class="btn-ghost self-start text-sm" @click="router.push('/roms')">
        ‹ Back to library
      </button>
    </template>
  </div>
</template>
