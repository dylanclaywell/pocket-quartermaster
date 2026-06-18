<script setup lang="ts">
/**
 * Themed checkbox. The native <input> is kept for semantics/keyboard but
 * visually hidden (sr-only); the visible box is a styled span that reads
 * entirely from theme tokens (border, accent fill, on-accent tick), so it
 * restyles with every theme like the rest of the UI.
 *
 * Two modes:
 *  - default: interactive. Wrap with v-model (or :model-value + @change-ish
 *    via @update:model-value) and pass the label as the default slot.
 *  - decorative: visual only, no input — for rows where a parent <button>
 *    owns the click. Reflects :model-value, ignores pointer/keyboard.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    decorative?: boolean;
    ariaLabel?: string;
  }>(),
  { modelValue: false, disabled: false, decorative: false, ariaLabel: undefined },
);
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const slots = useSlots();

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).checked);
}
</script>

<template>
  <component
    :is="decorative ? 'span' : 'label'"
    class="inline-flex items-center gap-2 align-middle"
    :class="[
      decorative ? 'pointer-events-none' : disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      !decorative && disabled && 'opacity-60',
    ]"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <input
      v-if="!decorative"
      type="checkbox"
      class="peer sr-only"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="onChange"
    />
    <span
      class="grid size-[1.15rem] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      :class="modelValue ? 'border-accent bg-accent text-on-accent' : 'bg-surface'"
      :style="modelValue ? undefined : 'border-color: var(--color-border)'"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-3 transition-opacity"
        :class="modelValue ? 'opacity-100' : 'opacity-0'"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 8.5l3 3 7-7" />
      </svg>
    </span>
    <span v-if="!decorative && slots.default" class="leading-tight"><slot /></span>
  </component>
</template>
