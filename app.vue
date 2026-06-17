<script setup lang="ts">
const route = useRoute();
const showBack = computed(() => route.path !== "/");

// Apply the chosen theme to <html> on both server and client so the first
// paint already carries the right data-theme (no flash-of-default-theme).
const { theme } = useTheme();
useHead({ htmlAttrs: { "data-theme": theme } });

// Single source of truth for the nav, shared by the desktop row and the
// mobile drawer. The route stays /storage; only the label is "System".
const navItems = [
  { to: "/profiles", label: "Profiles" },
  { to: "/activity", label: "Activity" },
  { to: "/roms", label: "ROMs" },
  { to: "/roms/transfer", label: "Transfer" },
  { to: "/storage", label: "System" },
  { to: "/devices", label: "Devices" },
];
function isActive(to: string): boolean {
  return route.path === to;
}

// Mobile drawer. Closes on navigation, Escape, or backdrop tap; locks the
// body scroll while open.
const menuOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);
watch(menuOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? "hidden" : "";
  }
});
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") menuOpen.value = false;
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (import.meta.client) document.body.style.overflow = "";
});
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
      <NuxtLink
        to="/"
        class="flex flex-1 items-center gap-2 font-mono text-base font-bold tracking-tight"
      >
        <span
          aria-hidden="true"
          class="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
        />
        Pocket Quartermaster
      </NuxtLink>

      <!-- Desktop nav: inline row from md up. -->
      <nav class="hidden items-center gap-1 md:flex">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="btn-ghost px-2 py-2 text-sm font-medium"
          :class="isActive(item.to) ? 'text-accent' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Mobile: hamburger opens the drawer below md. -->
      <button
        class="btn-ghost px-2 py-2 md:hidden"
        aria-label="Open menu"
        :aria-expanded="menuOpen"
        aria-controls="mobile-nav"
        @click="menuOpen = true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </header>

    <!-- Mobile nav drawer. Sibling of <header> (not inside it) because the
         header's backdrop-blur creates a containing block that would trap a
         fixed-position child. -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="menuOpen"
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        @click="menuOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200 motion-reduce:transition-none"
      enter-from-class="translate-x-full"
      leave-active-class="transition-transform duration-200 motion-reduce:transition-none"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="menuOpen"
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        class="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[80%] flex-col gap-1 border-l border-border bg-surface p-3 md:hidden"
        style="
          padding-top: max(0.75rem, env(safe-area-inset-top));
          padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
        "
      >
        <div class="mb-2 flex items-center justify-between gap-2 px-1">
          <span class="eyebrow">Menu</span>
          <button
            class="btn-ghost px-2 py-2"
            aria-label="Close menu"
            @click="menuOpen = false"
          >
            <span aria-hidden="true" class="text-lg leading-none">✕</span>
          </button>
        </div>
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="row-button"
          :class="isActive(item.to) ? 'text-accent' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </aside>
    </Transition>

    <main class="flex-1 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <NuxtPage />
    </main>
  </div>
</template>
