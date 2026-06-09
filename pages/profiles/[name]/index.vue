<script setup lang="ts">
import { formatBytes, formatRelativeTime } from "~/composables/useFormat";

const route = useRoute();
const router = useRouter();
const rawName = computed(() => decodeURIComponent(route.params.name as string));

interface SlotResolved {
  slotId: string;
  deviceId: string;
  deviceNickname: string;
  fileRelPath: string;
  mounted: boolean;
  exists: boolean;
  directoryMode?: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  lastSyncedAt?: string;
}
interface ResolveResponse {
  name: string;
  ready: boolean;
  slots: SlotResolved[];
}

const encName = computed(() => encodeURIComponent(rawName.value));
const { data: resolveData, refresh, pending } = await useFetch<ResolveResponse>(
  () => `/api/profiles/${encName.value}/resolve`,
);

const slots = computed<SlotResolved[]>(() => resolveData.value?.slots ?? []);
const ready = computed(() => resolveData.value?.ready ?? false);

const sourceSlotId = ref<string | null>(null);
const destinationSlotId = ref<string | null>(null);

interface TransferResponse {
  destinationPath: string;
  bytesCopied: number;
  backupPath: string | null;
  promotedSlot: { slotId: string; fileRelPath: string } | null;
  syncedAt?: string;
}

const transferError = ref<string | null>(null);
const transferResult = ref<TransferResponse | null>(null);
const transferring = ref(false);
const showConfirm = ref(false);

const sourceSlot = computed(() => slots.value.find((s) => s.slotId === sourceSlotId.value) ?? null);
const destinationSlot = computed(
  () => slots.value.find((s) => s.slotId === destinationSlotId.value) ?? null,
);

const sourceCandidates = computed(() =>
  slots.value.filter((s) => s.mounted && s.exists && !s.directoryMode),
);
const destinationCandidates = computed(() =>
  slots.value.filter((s) => s.mounted && s.slotId !== sourceSlotId.value),
);

const pendingFileName = computed(() => {
  const src = sourceSlot.value;
  if (!src) return null;
  const path = src.fileRelPath;
  if (!path) return null;
  return path.split("/").pop() ?? path;
});

const canSync = computed(() => {
  if (!sourceSlot.value || !destinationSlot.value) return false;
  if (sourceSlot.value.slotId === destinationSlot.value.slotId) return false;
  if (!sourceSlot.value.mounted || !destinationSlot.value.mounted) return false;
  if (sourceSlot.value.directoryMode || !sourceSlot.value.exists) return false;
  return true;
});

const blockedReason = computed(() => {
  if (!sourceSlot.value) return "Pick a source.";
  if (!destinationSlot.value) return "Pick a destination.";
  if (sourceSlot.value.slotId === destinationSlot.value.slotId) {
    return "Source and destination must be different.";
  }
  if (!sourceSlot.value.mounted) return `${sourceSlot.value.deviceNickname} is not mounted.`;
  if (!destinationSlot.value.mounted) {
    return `${destinationSlot.value.deviceNickname} is not mounted.`;
  }
  if (sourceSlot.value.directoryMode) {
    return `${sourceSlot.value.deviceNickname} is a folder slot — it has no file to copy from.`;
  }
  if (!sourceSlot.value.exists) {
    return `Source file is missing on ${sourceSlot.value.deviceNickname}.`;
  }
  return null;
});

function pickInitialSelection() {
  if (sourceSlotId.value && slots.value.some((s) => s.slotId === sourceSlotId.value)) {
    if (
      destinationSlotId.value &&
      slots.value.some((s) => s.slotId === destinationSlotId.value)
    ) {
      return;
    }
  }
  // Default source: the slot that was most recently *modified on disk*, then
  // most recently synced, then the first sourceable slot.
  const candidates = [...sourceCandidates.value];
  candidates.sort((a, b) => {
    const am = a.mtimeMs ?? 0;
    const bm = b.mtimeMs ?? 0;
    if (am !== bm) return bm - am;
    const as = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
    const bs = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
    return bs - as;
  });
  sourceSlotId.value = candidates[0]?.slotId ?? null;
  // Default destination: the mounted slot that is *not* the source, preferring
  // the staler one (oldest lastSyncedAt; missing slots win).
  const destCandidates = slots.value
    .filter((s) => s.mounted && s.slotId !== sourceSlotId.value)
    .sort((a, b) => {
      const as = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
      const bs = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
      return as - bs;
    });
  destinationSlotId.value = destCandidates[0]?.slotId ?? null;
}

watch(slots, () => pickInitialSelection(), { immediate: true });

watch(sourceSlotId, () => {
  if (destinationSlotId.value === sourceSlotId.value) {
    destinationSlotId.value =
      slots.value.find((s) => s.mounted && s.slotId !== sourceSlotId.value)?.slotId ?? null;
  }
});

async function runTransfer() {
  if (!sourceSlot.value || !destinationSlot.value) return;
  transferring.value = true;
  transferError.value = null;
  transferResult.value = null;
  try {
    transferResult.value = await $fetch<TransferResponse>(
      `/api/profiles/${encName.value}/transfer`,
      {
        method: "POST",
        body: {
          sourceSlotId: sourceSlot.value.slotId,
          destinationSlotId: destinationSlot.value.slotId,
        },
      },
    );
    await refresh();
  } catch (e) {
    transferError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    transferring.value = false;
    showConfirm.value = false;
  }
}

async function removeSlot(slotId: string) {
  const slot = slots.value.find((s) => s.slotId === slotId);
  if (!slot) return;
  if (!confirm(`Remove ${slot.deviceNickname} from this profile? Files on the device are untouched.`)) {
    return;
  }
  try {
    await $fetch<{ ok: true }>(`/api/profiles/${encName.value}/slot/${slotId}`, { method: "DELETE" });
    await refresh();
  } catch (e) {
    transferError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  }
}

async function deleteProfile() {
  if (!confirm(`Delete profile "${rawName.value}"? Save files on devices are untouched.`)) return;
  await $fetch<{ ok: true }>(`/api/profiles/${encName.value}`, { method: "DELETE" });
  router.push("/");
}

function slotSubtitle(s: SlotResolved): string {
  const synced = s.lastSyncedAt
    ? ` · synced ${formatRelativeTime(Date.parse(s.lastSyncedAt))}`
    : "";
  if (!s.mounted) return `${s.deviceNickname} — not mounted${synced}`;
  if (s.directoryMode) {
    return `${s.deviceNickname} — folder · waiting for a source${synced}`;
  }
  if (!s.exists) return `${s.deviceNickname} — file missing on device${synced}`;
  return `${s.deviceNickname} — ${formatBytes(s.sizeBytes)} · ${formatRelativeTime(s.mtimeMs)}${synced}`;
}

function resolvedForConfirm(s: SlotResolved) {
  // The destination slot in the confirm dialog needs the pending filename
  // computed against the *current* source — augment the resolved object with
  // it on the fly rather than threading it through the resolve API.
  return {
    deviceNickname: s.deviceNickname,
    fileRelPath: s.fileRelPath,
    exists: s.exists,
    directoryMode: s.directoryMode,
  };
}

function dropdownLabel(s: SlotResolved): string {
  const parts: string[] = [s.deviceNickname];
  if (s.directoryMode) parts.push("📂 folder");
  else if (!s.exists) parts.push("missing");
  if (!s.mounted) parts.push("absent");
  return parts.join(" · ");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-col gap-1">
      <h1 class="text-xl font-bold">{{ rawName }}</h1>
      <p class="text-sm" :class="ready ? 'text-ok' : 'text-warn'">
        {{ ready ? `${slots.length} device${slots.length === 1 ? '' : 's'} — ready to transfer` : "Add at least two devices to enable transfer" }}
      </p>
    </header>

    <div
      v-if="pending && !resolveData"
      class="flex items-center justify-center gap-3 py-8 text-fg-dim"
    >
      <Spinner /> <span>Resolving slots…</span>
    </div>

    <section v-else class="flex flex-col gap-3">
      <SlotPanel
        v-for="(s, i) in slots"
        :key="s.slotId"
        :index="i"
        :resolved="{ ...s, pendingFileName: s.directoryMode ? pendingFileName : null }"
        :encoded-name="encName"
        :subtitle="slotSubtitle(s)"
        @remove="removeSlot(s.slotId)"
      />
      <NuxtLink
        :to="`/profiles/${encName}/slot/new`"
        class="btn-secondary self-start"
      >
        + Add device slot
      </NuxtLink>
    </section>

    <section v-if="ready" class="card flex flex-col gap-3">
      <div>
        <p class="font-semibold">Transfer</p>
        <p class="text-xs text-fg-dim">
          Pick which device is the source of truth and which receives the copy.
          A timestamped backup is saved before any overwrite.
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-xs uppercase tracking-wide text-fg-dim">Source</span>
          <select v-model="sourceSlotId" class="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <option :value="null">— pick a source —</option>
            <option v-for="s in slots" :key="s.slotId" :value="s.slotId" :disabled="!sourceCandidates.includes(s)">
              {{ dropdownLabel(s) }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-xs uppercase tracking-wide text-fg-dim">Destination</span>
          <select v-model="destinationSlotId" class="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <option :value="null">— pick a destination —</option>
            <option
              v-for="s in slots"
              :key="s.slotId"
              :value="s.slotId"
              :disabled="!destinationCandidates.includes(s)"
            >
              {{ dropdownLabel(s) }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="blockedReason" class="text-xs text-warn">{{ blockedReason }}</p>

      <button
        class="btn-primary"
        :disabled="!canSync || transferring"
        @click="showConfirm = true"
      >
        <Spinner v-if="transferring" size="sm" />
        <span>
          {{ transferring ? "Copying…" : "Sync" }}
          <span v-if="sourceSlot && destinationSlot" class="text-xs opacity-75">
            ({{ sourceSlot.deviceNickname }} → {{ destinationSlot.deviceNickname }})
          </span>
        </span>
      </button>

      <div
        v-if="transferResult"
        class="rounded-xl border border-ok bg-[color-mix(in_oklab,var(--color-ok)_15%,transparent)] p-3 text-sm"
      >
        <p class="font-semibold text-ok">Transfer complete</p>
        <p class="break-all text-fg-dim">
          {{ formatBytes(transferResult.bytesCopied) }} → {{ transferResult.destinationPath }}
        </p>
        <p v-if="transferResult.promotedSlot" class="text-xs text-accent">
          That slot now points at
          <span class="font-mono">{{ transferResult.promotedSlot.fileRelPath }}</span>
          — future transfers can go either way.
        </p>
        <p v-if="transferResult.backupPath" class="break-all text-xs text-fg-dim">
          Backup: {{ transferResult.backupPath }}
        </p>
      </div>

      <p v-if="transferError" class="text-danger">{{ transferError }}</p>
    </section>

    <div class="flex justify-between gap-2 pt-2">
      <button class="btn-ghost" :disabled="pending" @click="refresh()">
        <Spinner v-if="pending" size="sm" />
        <span>{{ pending ? "Refreshing…" : "Refresh" }}</span>
      </button>
      <button class="btn-danger" @click="deleteProfile">Delete profile</button>
    </div>

    <TransferConfirm
      v-if="showConfirm && sourceSlot && destinationSlot"
      :source="resolvedForConfirm(sourceSlot)"
      :destination="resolvedForConfirm(destinationSlot)"
      :busy="transferring"
      @cancel="showConfirm = false"
      @confirm="runTransfer"
    />
  </div>
</template>
