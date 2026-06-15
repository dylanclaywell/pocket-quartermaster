<script setup lang="ts">
/** Tiny dependency-free bar sparkline. Renders one bar per value, scaled to the
 *  series max. Pure SVG so the Pi bundle stays small (no chart lib). */
const props = withDefaults(
  defineProps<{
    values: number[];
    /** viewBox height; bars scale to fill it. */
    height?: number;
    /** gap between bars as a fraction of bar slot width (0–0.5). */
    gap?: number;
  }>(),
  { height: 28, gap: 0.25 },
);

// Fixed viewBox width; the SVG stretches to its container via width=100%.
const VBW = 100;

const max = computed(() => Math.max(1, ...props.values));

const bars = computed(() => {
  const n = props.values.length;
  if (n === 0) return [];
  const slot = VBW / n;
  const gapPx = slot * props.gap;
  const barW = Math.max(0.5, slot - gapPx);
  return props.values.map((v, i) => {
    const h = (v / max.value) * props.height;
    return {
      x: i * slot + gapPx / 2,
      y: props.height - h,
      w: barW,
      h: Math.max(v > 0 ? 1 : 0, h), // ensure a sliver shows for tiny non-zero days
      zero: v <= 0,
    };
  });
});
</script>

<template>
  <svg
    :viewBox="`0 0 ${VBW} ${height}`"
    preserveAspectRatio="none"
    class="block h-7 w-full"
    role="img"
    aria-label="Playtime per day"
  >
    <rect
      v-for="(b, i) in bars"
      :key="i"
      :x="b.x"
      :y="b.y"
      :width="b.w"
      :height="b.h"
      rx="0.6"
      :class="b.zero ? 'fill-border/50' : 'fill-accent'"
    />
  </svg>
</template>
