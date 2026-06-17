/** Stable hue derived from a system or core name. Gives each game a consistent
 *  fallback gradient when no thumbnail is cached, without needing a lookup table. */
export function systemHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

/** Linear-gradient `background` value derived from a system or core name. */
export function systemFallbackBackground(name: string): string {
  const hue = systemHue(name);
  return `linear-gradient(135deg, hsl(${hue}, 60%, 28%) 0%, hsl(${(hue + 30) % 360}, 55%, 12%) 100%)`;
}

/** A vivid solid color for the same system/core name — used for the tile's
 *  system stripe and dot so a dense grid clusters by color at a glance.
 *  Deliberately a data-derived color, not a theme token: a system keeps the
 *  same identity color across every theme. */
export function systemAccentColor(name: string): string {
  return `hsl(${systemHue(name)}, 70%, 55%)`;
}
