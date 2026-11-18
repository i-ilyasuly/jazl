import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error — JS плагин (типсіз)
import medeoI18n from "./i18n/plugin.mjs";

export default defineConfig({ plugins: [medeoI18n(), react()], base: "./" });
