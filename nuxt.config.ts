import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  ssr: true,
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      title: "Pocket Quartermaster",
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "theme-color", content: "#11140f" },
        { name: "mobile-web-app-capable", content: "yes" },
      ],
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
        },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    preset: "node-server",
  },
});
