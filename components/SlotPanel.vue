<script setup lang="ts">
interface SlotResolved {
  slotId: string;
  deviceNickname: string;
  fileRelPath: string;
  mounted: boolean;
  exists: boolean;
  directoryMode?: boolean;
  pendingFileName?: string | null;
  lastSyncedAt?: string;
}

const props = defineProps<{
  encodedName: string;
  index: number;
  resolved: SlotResolved;
  subtitle: string;
}>();

defineEmits<{ remove: [] }>();

const configureHref = computed(
  () => `/profiles/${props.encodedName}/slot/${props.resolved.slotId}`,
);

const statusPill = computed(() => {
  const r = props.resolved;
  if (!r.mounted) {
    return {
      text: "absent",
      cls: "bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn",
    };
  }
  if (r.directoryMode) {
    return {
      text: r.pendingFileName ? "ready to receive" : "folder (waiting)",
      cls: "bg-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] text-accent",
    };
  }
  if (r.exists) {
    return {
      text: "present",
      cls: "bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok",
    };
  }
  return {
    text: "missing",
    cls: "bg-[color-mix(in_oklab,var(--color-danger)_25%,transparent)] text-danger",
  };
});
</script>

<template>
  <div class="card flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-2">
        <span
          class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-sm font-bold"
          >{{ index + 1 }}</span
        >
        <p class="font-semibold">{{ resolved.deviceNickname }}</p>
      </div>
      <span class="pill" :class="statusPill.cls">{{ statusPill.text }}</span>
    </div>

    <p v-if="resolved.fileRelPath" class="break-all text-sm text-fg-dim">
      <span v-if="resolved.directoryMode" class="mr-1">📂</span>
      /{{ resolved.fileRelPath }}{{ resolved.directoryMode ? "/" : "" }}
    </p>

    <p
      v-if="resolved.directoryMode && resolved.mounted && resolved.pendingFileName"
      class="text-sm text-warn"
    >
      Will be created as
      <span class="font-mono">{{ resolved.pendingFileName }}</span> on transfer.
    </p>

    <p class="text-xs text-fg-dim">{{ subtitle }}</p>

    <div class="flex flex-wrap gap-2">
      <NuxtLink :to="configureHref" class="btn-secondary">Replace</NuxtLink>
      <button class="btn-ghost text-danger text-sm" @click="$emit('remove')">
        Remove
      </button>
    </div>
  </div>
</template>
