/** Visual themes. The `id` matches the html[data-theme="…"] blocks in
 *  assets/css/main.css; everything else is just labelling for the picker. */
export const THEMES = [
  {
    id: "lcd",
    label: "Handheld LCD",
    blurb: "DMG phosphor-green on warm charcoal. Glowing readout screen.",
    swatch: ["#16190f", "#9ec727", "#2b3024"],
  },
  {
    id: "cartridge",
    label: "Cartridge / depot",
    blurb: "Signal-amber and field-olive. Embossed label, no glow.",
    swatch: ["#241f17", "#e0a32a", "#7e8c3f"],
  },
  {
    id: "phosphor",
    label: "Phosphor terminal",
    blurb: "Amber-on-black CRT. All-mono, dense scanlines.",
    swatch: ["#0d0b07", "#f0a830", "#3a2f1c"],
  },
  {
    id: "paper",
    label: "Paper manual",
    blurb: "Cream stock, ink, spot red. Light — a printed booklet.",
    swatch: ["#f2ecdd", "#b3261e", "#2b2b2b"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const IDS = THEMES.map((t) => t.id) as ThemeId[];

/** Theme choice, persisted in a cookie so the server renders the right
 *  data-theme on first paint (no flash). The actual <html> attribute is
 *  bound once in app.vue. */
export function useTheme() {
  const cookie = useCookie<ThemeId>("pq-theme", {
    default: () => "lcd",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const theme = computed<ThemeId>({
    get: () => (IDS.includes(cookie.value) ? cookie.value : "lcd"),
    set: (v) => {
      cookie.value = v;
    },
  });

  return { theme, themes: THEMES };
}
