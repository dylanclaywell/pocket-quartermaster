<script setup lang="ts">
defineProps<{
  destCacheKey: string;
  destLabel: string;
}>();
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!destCacheKey" class="card text-center text-sm text-fg-dim">
      Choose a destination above to push art.
    </div>
    <div v-else class="card text-center text-sm text-fg-dim">
      <p class="mb-1">Art push is coming next.</p>
      <p class="text-xs">
        Send cached box art to
        <span class="font-semibold text-fg">{{ destLabel }}</span
        >, resized to its screen.
      </p>
    </div>
  </div>
</template>
