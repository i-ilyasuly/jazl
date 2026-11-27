// Medeo сайты (28-құжат): дайын беттер (Astro), мини апптан бөлек. Тілдер: / — қазақша, /ru/ — орысша.
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Домен алынған соң осы жерге жазылады (canonical, hreflang)
  site: "https://medeo.kz",
  trailingSlash: "ignore",
  build: { format: "directory" },
  vite: { plugins: [tailwindcss()] },
});
