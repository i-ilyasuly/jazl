import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error — JS плагин (типсіз)
import medeoI18n from "./i18n/plugin.mjs";

// boot.ts ішіндегі "__MEDEO_MAIN_CHUNK__" орнына негізгі файлдың нақты атауын қояды (қатар жүктеу үшін)
function medeoMainPreload(): Plugin {
  return {
    name: "medeo-main-preload",
    apply: "build",
    generateBundle(_, bundle) {
      const main = Object.values(bundle).find((c) => c.type === "chunk" && c.isDynamicEntry && c.moduleIds.some((id) => id.endsWith("/src/main.tsx")));
      if (!main) { this.warn("main chunk табылмады: " + Object.values(bundle).map((c) => c.type === "chunk" ? c.facadeModuleId : "").filter(Boolean).slice(0, 5).join(", ")); return; }
      const rel = "./" + main.fileName.split("/").pop();
      for (const c of Object.values(bundle)) if (c.type === "chunk" && c.code.includes("__MEDEO_MAIN_CHUNK__")) c.code = c.code.replaceAll("__MEDEO_MAIN_CHUNK__", rel);
    },
  };
}

export default defineConfig({
  plugins: [medeoI18n(), react(), medeoMainPreload()],
  base: "./",
  // Кіші суреттер (webp/png) JS ішіне base64 болып кірмейді: олар сығылмайды және негізгі файлды ~75 КБ (gzip) ауырлататын.
  // Бөлек файл болып, JS-пен қатар жүктеледі және бір жылға кэштеледі. SVG иконкалар бұрынғыдай ішінде қалады (жақсы сығылады).
  worker: { format: "es" }, // MapLibre 6 воркері — ES модуль (type: module)
  build: { assetsInlineLimit: (file: string) => (/\.(webp|png|jpe?g)$/i.test(file) ? false : undefined) },
});
