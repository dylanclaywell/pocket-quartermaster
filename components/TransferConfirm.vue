<script setup lang="ts">
interface SlotResolved {
  deviceNickname: string;
  fileRelPath: string;
  exists: boolean;
  directoryMode?: boolean;
}

const props = defineProps<{
  source: SlotResolved;
  destination: SlotResolved;
  busy: boolean;
}>();

defineEmits<{ cancel: []; confirm: [] }>();

const sourceBaseName = computed(() => {
  const p = props.source.fileRelPath;
  if (!p) return "";
  return p.split("/").pop() ?? p;
});
const destinationFinalPath = computed(() => {
  const d = props.destination;
  if (d.directoryMode) {
    const base = d.fileRelPath ? `${d.fileRelPath}/` : "";
    return `${base}${sourceBaseName.value}`;
  }
  return d.fileRelPath;
});
const willCreate = computed(
  () => !!props.destination.directoryMode && !!sourceBaseName.value,
);
</script>

<template>
  <div
    class="fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
    @click.self="$emit('cancel')"
  >
    <div
      class="w-full max-w-screen-sm rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 1.25rem)"
    >
      <h2 class="mb-2 text-lg font-bold">Confirm transfer</h2>
      <div class="mb-4 flex flex-col gap-2 text-sm">
        <div>
          <p class="text-xs uppercase tracking-wide text-fg-dim">Source</p>
          <p class="break-all">
            {{ source.deviceNickname }}:/{{ source.fileRelPath }}
          </p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wide text-fg-dim">Destination</p>
          <p class="break-all">
            {{ destination.deviceNickname }}:/{{ destinationFinalPath }}
          </p>
          <p v-if="willCreate" class="mt-1 text-xs text-accent">
            File <span class="font-semibold">{{ sourceBaseName }}</span> does
            not exist on
            <span class="font-semibold">{{ destination.deviceNickname }}</span>
            yet — will be created as
            <span class="font-mono">{{ sourceBaseName }}</span> in the chosen
            folder.
          </p>
          <p v-else-if="destination.exists" class="mt-1 text-xs text-warn">
            Will be overwritten. A timestamped backup is saved on the server
            first.
          </p>
        </div>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button class="btn-secondary" :disabled="busy" @click="$emit('cancel')">
          Cancel
        </button>
        <button class="btn-primary" :disabled="busy" @click="$emit('confirm')">
          <Spinner v-if="busy" size="sm" />
          <span>{{ busy ? "Transferring…" : "Transfer" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
