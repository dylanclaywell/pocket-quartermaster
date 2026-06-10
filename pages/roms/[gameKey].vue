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
  masterSources: { cacheKey: string; sourceLabel: string }[];
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
  variants: ComputedVariant[];
  destinations: DestinationState[];
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
const thumbnailUrl = computed(() =>
  game.value ? `/api/thumbnails/${encodeURIComponent(game.value.gameKey)}` : "",
);

function variantLabel(key?: string): string {
  if (!key) return "—";
  return game.value?.variants.find((v) => v.key === key)?.filename ?? key;
}

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
            v-if="activity?.hasThumbnail"
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
            <button class="btn-ghost px-2 py-1 text-xs" @click="startEditName">Edit</button>
          </div>
          <div v-else class="flex flex-col gap-2">
            <input v-model="nameDraft" class="input" @keyup.enter="saveName" />
            <div class="flex gap-2">
              <button class="btn-primary text-xs" :disabled="savingMeta" @click="saveName">Save</button>
              <button class="btn-ghost text-xs" @click="editingName = false">Cancel</button>
              <button
                v-if="game.displayNameOverride"
                class="btn-ghost text-xs text-fg-dim"
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
                class="btn-ghost shrink-0 px-2 py-1 text-xs"
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
              from: {{ v.masterSources.map((s) => s.sourceLabel).join(", ") }}
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
            <label class="flex flex-col gap-1 text-xs text-fg-dim">
              <span>prefers</span>
              <select
                class="input"
                :disabled="savingPrefKey === d.cacheKey"
                :value="d.preferredInherited ? '' : (d.preferredVariantKey ?? '')"
                @change="setPreference(d, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  Use default{{ game.defaultVariantKey ? ` (${variantLabel(game.defaultVariantKey)})` : "" }}
                </option>
                <option v-for="v in game.variants" :key="v.key" :value="v.key">
                  {{ v.filename }}
                </option>
              </select>
            </label>
          </li>
        </ul>
      </section>

      <!-- Links & notes -->
      <section class="card flex flex-col gap-3">
        <h2 class="font-semibold">Links &amp; notes</h2>
        <label class="flex flex-col gap-1">
          <span class="label">Save profile</span>
          <select
            class="input"
            :value="game.saveProfileName ?? ''"
            :disabled="savingMeta"
            @change="setSaveProfile(($event.target as HTMLSelectElement).value)"
          >
            <option value="">(none)</option>
            <option v-for="n in profileNames" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
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
