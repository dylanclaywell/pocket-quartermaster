<script setup lang="ts">
const route = useRoute();
const showBack = computed(() => route.path !== "/");
</script>

<template>
  <div class="mx-auto flex min-h-full flex-col">
    <header
      class="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-[color-mix(in_oklab,var(--color-bg)_92%,white_8%)] px-4 py-3 backdrop-blur"
      style="padding-top: max(0.75rem, env(safe-area-inset-top))"
    >
      <button
        v-if="showBack"
        class="btn-ghost px-2 py-2"
        aria-label="Back"
        @click="useRouter().back()"
      >
        <span aria-hidden="true" class="text-xl leading-none">‹</span>
        <span class="sr-only">Back</span>
      </button>
      <NuxtLink to="/" class="flex-1 text-lg font-bold tracking-tight">
        Pocket Quartermaster
      </NuxtLink>
      <NuxtLink
        to="/activity"
        class="btn-ghost px-2 py-2 text-sm font-medium"
        aria-label="Activity"
      >
        Activity
      </NuxtLink>
      <NuxtLink
        to="/devices"
        class="btn-ghost px-2 py-2 text-sm font-medium"
        aria-label="Devices"
      >
        Devices
      </NuxtLink>
    </header>

    <main class="flex-1 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <NuxtPage />
    </main>
  </div>
</template>
