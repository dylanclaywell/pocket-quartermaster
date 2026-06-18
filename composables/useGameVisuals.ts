/** Stable hue (0–359) derived from a system or core name. Gives each game a
 *  consistent color when no thumbnail is cached, without a lookup table. */
export function systemHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

/** Stable lightness offset (~-0.09..+0.11) from the name, independent of the
 *  hue hash. Mono themes pin every system to one hue (via --sys-h), so this
 *  tone is what keeps systems distinguishable by shade alone. */
export function systemTone(name: string): number {
  let h = 7;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i) * 31) | 0;
  }
  return ((Math.abs(h) % 200) - 90) / 1000;
}

/** `calc()` adding a signed tone to a base lightness var. */
function withTone(base: string, tone: number): string {
  return `calc(${base} ${tone < 0 ? "-" : "+"} ${Math.abs(tone).toFixed(3)})`;
}

/** Solid system color for the tile stripe/dot and activity markers.
 *  Lightness, chroma, and (for mono themes) hue come from theme tokens, so
 *  the system palette harmonizes with the active theme. The per-system hue
 *  is only the fallback when a theme leaves --sys-h unset (color themes). */
export function systemAccentColor(name: string): string {
  return `oklch(${withTone("var(--sys-l)", systemTone(name))} var(--sys-c) var(--sys-h, ${systemHue(name)}))`;
}

/** Linear-gradient `background` for the no-thumbnail fallback tile, themed
 *  the same way as the solid accent (darker lightness band). */
export function systemFallbackBackground(name: string): string {
  const hue = systemHue(name);
  const tone = systemTone(name);
  const top = `oklch(${withTone("var(--sys-bg-l)", tone)} var(--sys-bg-c) var(--sys-h, ${hue}))`;
  const bottom = `oklch(${withTone("var(--sys-bg-l2)", tone)} var(--sys-bg-c) var(--sys-h, ${(hue + 30) % 360}))`;
  return `linear-gradient(135deg, ${top} 0%, ${bottom} 100%)`;
}
