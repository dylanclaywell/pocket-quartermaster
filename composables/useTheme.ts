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
  {
    id: "gbpocket",
    label: "Pocket LCD",
    blurb: "Black on grey-green reflective LCD. High-contrast mono, no glow.",
    swatch: ["#a7b4a0", "#2f3a2c", "#95a48d"],
  },
  {
    id: "virtualboy",
    label: "Virtual Boy",
    blurb: "Blood-red phosphor on black. All-mono, glowing scanlines. Eye-searing.",
    swatch: ["#0a0506", "#e8253a", "#2a0d10"],
  },
  {
    id: "blueprint",
    label: "Blueprint",
    blurb: "Cyan lines on deep navy. Drafting-table grid. Cool and technical.",
    swatch: ["#1c2b52", "#6cc6e8", "#3a4a7a"],
  },
  {
    id: "synthwave",
    label: "Synthwave",
    blurb: "Magenta + cyan on twilight purple. Neon sun, perspective grid.",
    swatch: ["#1a1030", "#ff48b0", "#3a2058"],
  },
  {
    id: "bubblegum",
    label: "Bubblegum",
    blurb: "Hot pink + cyan on cream. Mallsoft. Loud, but light.",
    swatch: ["#f7e6ef", "#ff4fa3", "#f3c9dd"],
  },
  {
    id: "hotdog",
    label: "Hot Dog Stand",
    blurb: "Win 3.1 red-on-yellow. Loud, obnoxious, unrepentant.",
    swatch: ["#cf2317", "#f2cf2a", "#1c1c1c"],
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
