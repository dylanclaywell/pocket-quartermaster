<script setup lang="ts">
import { formatBytes, formatDuration } from "~/composables/useFormat";

interface DeviceBudget {
  romCacheKey: string;
  kind: "device" | "virtualMount";
  label: string;
  mounted: boolean;
  sizeBytes?: number;
  freeBytes?: number;
  romBytes: number;
  romCount: number;
  excludedFromReclaim: boolean;
}
interface PruneCandidate {
  gameKey: string;
  displayName: string;
  system: string;
  sourceCacheKey: string;
  sourceLabel: string;
  filenames: string[];
  bytes: number;
  playSeconds: number;
  backedUpElsewhere: boolean;
}
interface StorageData {
  devices: DeviceBudget[];
  pruneCandidates: PruneCandidate[];
  totalCandidates: number;
  reclaimableBytes: number;
}

const { data, refresh, pending } = await useFetch<StorageData>("/api/storage");

const devices = computed(() => data.value?.devices ?? []);
const candidates = computed(() => data.value?.pruneCandidates ?? []);

// "Only show stuff I never play" toggle — default on, since that's the point.
const unplayedOnly = ref(true);
const visibleCandidates = computed(() =>
  unplayedOnly.value ? candidates.value.filter((c) => c.playSeconds === 0) : candidates.value,
);

function candidateId(c: PruneCandidate): string {
  return `${c.sourceCacheKey}::${c.gameKey}`;
}

const selected = ref<Set<string>>(new Set());
function toggle(c: PruneCandidate): void {
  const id = candidateId(c);
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
const selectedCandidates = computed(() =>
  visibleCandidates.value.filter((c) => selected.value.has(candidateId(c))),
);
const selectedBytes = computed(() =>
  selectedCandidates.value.reduce((s, c) => s + c.bytes, 0),
);
const selectedOnlyCopies = computed(() =>
  selectedCandidates.value.filter((c) => !c.backedUpElsewhere),
);

function usedPct(d: DeviceBudget): number | null {
  if (!d.sizeBytes || d.freeBytes === undefined) return null;
  return Math.min(100, Math.max(0, ((d.sizeBytes - d.freeBytes) / d.sizeBytes) * 100));
}

// Devices the user opted out of clearing (e.g. a full-library HDD). Excluded
// devices still show their budget and still back up other devices' games —
// they just produce no prune candidates.
const togglingExclude = ref<Set<string>>(new Set());
async function toggleExclude(d: DeviceBudget): Promise<void> {
  const next = new Set(togglingExclude.value);
  next.add(d.romCacheKey);
  togglingExclude.value = next;
  try {
    await $fetch("/api/storage/exclude", {
      method: "POST",
      body: { cacheKey: d.romCacheKey, excluded: !d.excludedFromReclaim },
    });
    await refresh();
  } finally {
    const done = new Set(togglingExclude.value);
    done.delete(d.romCacheKey);
    togglingExclude.value = done;
  }
}

const confirming = ref(false);
const running = ref(false);
const error = ref<string | null>(null);
const lastFreed = ref<number | null>(null);

async function reclaim(): Promise<void> {
  running.value = true;
  error.value = null;
  let freed = 0;
  try {
    // Delete endpoint is per (source, game) — loop the selection.
    for (const c of selectedCandidates.value) {
      const res = await $fetch<{ freedBytes: number; errors: { reason: string }[] }>(
        "/api/roms/destination/remove",
        {
          method: "POST",
          body: {
            sourceCacheKey: c.sourceCacheKey,
            gameKey: c.gameKey,
            filenames: c.filenames,
          },
        },
      );
      freed += res.freedBytes;
      if (res.errors.length > 0 && !error.value) {
        error.value = `${c.displayName}: ${res.errors[0].reason}`;
      }
    }
    lastFreed.value = freed;
    selected.value = new Set();
    confirming.value = false;
    await refresh();
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-5 pb-28">
    <!-- Device budgets -->
    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
        Device space
      </h2>
      <div v-if="pending && devices.length === 0" class="card flex items-center gap-3 text-fg-dim">
        <Spinner /> <span>Loading…</span>
      </div>
      <div v-else-if="devices.length === 0" class="card text-center text-fg-dim">
        <p>No scanned ROM sources.</p>
        <NuxtLink to="/roms" class="btn-secondary mt-3 text-sm">Scan a library</NuxtLink>
      </div>
      <div v-for="d in devices" :key="d.romCacheKey" class="card flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate font-semibold">{{ d.label }}</span>
            <span
              v-if="d.excludedFromReclaim"
              class="pill shrink-0 bg-surface-2 text-[10px] text-fg-dim"
            >
              protected
            </span>
          </span>
          <span class="shrink-0 text-xs text-fg-dim">
            {{ d.romCount }} ROMs · {{ formatBytes(d.romBytes) }}
          </span>
        </div>
        <template v-if="usedPct(d) !== null">
          <div class="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div class="h-full rounded-full bg-accent" :style="{ width: `${usedPct(d)}%` }" />
          </div>
          <div class="flex justify-between text-xs text-fg-dim">
            <span>{{ formatBytes((d.sizeBytes ?? 0) - (d.freeBytes ?? 0)) }} used</span>
            <span>{{ formatBytes(d.freeBytes) }} free</span>
          </div>
        </template>
        <p v-else class="text-xs text-fg-dim">
          {{ d.mounted ? "Free space unknown" : "Offline — mount to see free space" }}
        </p>
        <label class="flex items-center gap-1.5 text-xs text-fg-dim">
          <input
            type="checkbox"
            class="accent-accent"
            :checked="d.excludedFromReclaim"
            :disabled="togglingExclude.has(d.romCacheKey)"
            @change="toggleExclude(d)"
          />
          Exclude from reclaim suggestions
        </label>
      </div>
    </section>

    <!-- Prune candidates -->
    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-fg-dim">
          Reclaim space
        </h2>
        <label class="flex items-center gap-1.5 text-xs text-fg-dim">
          <input v-model="unplayedOnly" type="checkbox" class="accent-accent" />
          Never-played only
        </label>
      </div>

      <p v-if="data && data.totalCandidates > candidates.length" class="text-xs text-fg-dim">
        Showing the {{ candidates.length }} biggest of {{ data.totalCandidates }} —
        {{ formatBytes(data.reclaimableBytes) }} total across all ROMs.
      </p>

      <div v-if="lastFreed !== null" class="card text-sm text-ok">
        Freed {{ formatBytes(lastFreed) }}.
      </div>
      <p v-if="error" class="text-xs text-danger">{{ error }}</p>

      <div v-if="visibleCandidates.length === 0" class="card text-center text-sm text-fg-dim">
        Nothing to suggest{{ unplayedOnly ? " — every ROM here has playtime" : "" }}.
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="c in visibleCandidates" :key="candidateId(c)">
          <button
            class="row-button w-full text-left"
            :class="selected.has(candidateId(c)) ? 'ring-2 ring-accent' : ''"
            @click="toggle(c)"
          >
            <input
              type="checkbox"
              class="pointer-events-none mr-1 accent-accent"
              :checked="selected.has(candidateId(c))"
            />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold">{{ c.displayName }}</span>
              <span class="truncate text-xs text-fg-dim">
                {{ c.system }} · {{ c.sourceLabel }} ·
                {{ c.playSeconds === 0 ? "never played" : formatDuration(c.playSeconds) }}
              </span>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="font-mono text-sm">{{ formatBytes(c.bytes) }}</span>
              <span
                class="pill text-[10px]"
                :class="
                  c.backedUpElsewhere
                    ? 'bg-surface-2 text-fg-dim'
                    : 'bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn'
                "
              >
                {{ c.backedUpElsewhere ? "backed up" : "only copy" }}
              </span>
            </div>
          </button>
        </li>
      </ul>
    </section>

    <!-- Sticky reclaim bar -->
    <div
      v-if="selectedCandidates.length > 0"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-[color-mix(in_oklab,var(--color-bg)_92%,white_8%)] px-4 py-3 backdrop-blur"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.75rem)"
    >
      <div class="mx-auto flex max-w-screen-sm items-center justify-between gap-3">
        <span class="text-sm">
          {{ selectedCandidates.length }} selected ·
          <span class="font-semibold">{{ formatBytes(selectedBytes) }}</span>
        </span>
        <button class="btn-danger" @click="confirming = true">Remove…</button>
      </div>
    </div>

    <!-- Confirm dialog -->
    <div
      v-if="confirming"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      @click.self="confirming = false"
    >
      <div
        class="w-full max-w-screen-sm rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
        style="padding-bottom: calc(env(safe-area-inset-bottom) + 1.25rem)"
      >
        <h2 class="mb-2 text-lg font-bold">Delete {{ selectedCandidates.length }} game(s)?</h2>
        <p class="mb-3 text-sm text-fg-dim">
          Permanently deletes {{ formatBytes(selectedBytes) }} of ROM files from their
          devices. This cannot be undone.
        </p>
        <div
          v-if="selectedOnlyCopies.length > 0"
          class="mb-4 rounded-lg border border-warn/40 bg-[color-mix(in_oklab,var(--color-warn)_15%,transparent)] p-3 text-sm text-warn"
        >
          ⚠ {{ selectedOnlyCopies.length }} of these are the
          <span class="font-semibold">only copy</span> — not backed up on any other
          source:
          <span class="font-medium">{{
            selectedOnlyCopies.map((c) => c.displayName).join(", ")
          }}</span>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button class="btn-secondary" :disabled="running" @click="confirming = false">
            Cancel
          </button>
          <button class="btn-danger" :disabled="running" @click="reclaim()">
            <Spinner v-if="running" size="sm" />
            <span>{{ running ? "Deleting…" : `Delete ${formatBytes(selectedBytes)}` }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
