<script setup lang="ts">
import { formatDuration, formatRelativeIso } from "~/composables/useFormat";
import {
  systemAccentColor,
  systemFallbackBackground,
} from "~/composables/useGameVisuals";

/** Minimal shape this card needs. Pages can pass their full AggregatedGame —
 *  the extra fields are ignored. */
interface GameCardData {
  normalizedName: string;
  displayName: string;
  system?: string;
  cores?: string[];
  totalSeconds: number;
  lastPlayedAt?: string;
  hasThumbnail: boolean;
}

const props = defineProps<{
  game: GameCardData;
}>();

const systemKey = computed(
  () => props.game.system ?? props.game.cores?.[0] ?? "unknown",
);
const fallbackBackground = computed(() =>
  systemFallbackBackground(systemKey.value),
);
const accentColor = computed(() => systemAccentColor(systemKey.value));

const thumbnailUrl = computed(
  () => `/api/thumbnails/${encodeURIComponent(props.game.normalizedName)}`,
);
</script>

<template>
  <NuxtLink
    :to="`/activity/${encodeURIComponent(game.normalizedName)}`"
    class="game-tile group relative aspect-square overflow-hidden rounded-[10%] bg-surface-2 ring-1 ring-border/60 active:scale-[0.98]"
  >
    <!-- Fallback gradient — always rendered so the squircle isn't blank
         while the <img> loads. -->
    <div class="absolute inset-0" :style="{ background: fallbackBackground }" />

    <img
      v-if="game.hasThumbnail"
      :src="thumbnailUrl"
      :alt="game.displayName"
      class="absolute inset-0 size-full object-cover"
      loading="lazy"
      decoding="async"
    />

    <!-- System color stripe — same hue as the badge dot. Always on (even
         over art) so a dense grid clusters by system at a glance. -->
    <div
      class="absolute inset-x-0 top-0 z-20 h-[3px]"
      :style="{ background: accentColor }"
    />

    <!-- System badge, always shown, with a color dot keyed to the stripe. -->
    <span
      v-if="game.system"
      class="absolute left-2 top-2.5 z-10 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm"
    >
      <span class="size-1.5 rounded-full" :style="{ background: accentColor }" />
      {{ game.system }}
    </span>

    <!-- Bottom overlay with title + playtime. -->
    <div
      class="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-black/85 via-black/60 to-transparent px-4 pb-2.5 pt-6 text-white"
    >
      <span class="line-clamp-2 text-sm font-semibold leading-tight">
        {{ game.displayName }}
      </span>
      <span class="flex items-center justify-between gap-2 text-[11px]">
        <span class="font-mono text-xs font-bold text-white">
          {{ formatDuration(game.totalSeconds) }}
        </span>
        <span v-if="game.lastPlayedAt" class="truncate text-white/70">
          {{ formatRelativeIso(game.lastPlayedAt) }}
        </span>
      </span>
    </div>
  </NuxtLink>
</template>
