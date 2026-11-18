// Vite плагині: құрастыру кезінде src/ ішіндегі қазақша жолдарды аудару шақыруына орайды (бастапқы код өзгермейді).
//   "Мәтін"            → __t("Мәтін")
//   <b>Мәтін</b>        → <b>{__t("Мәтін")}</b>
//   title="Мәтін"       → title={__t("Мәтін")}
//   `${n} күн қалды`    → __tt("{0} күн қалды", [n])   — орыс тілінде сөз реті өзгере алады: «Осталось {0} дн.»
import path from "node:path";
import { CYR, rewrite, scan } from "./core.mjs";

export default function medeoI18n() {
  let root = "";
  return {
    name: "medeo-i18n", enforce: "pre",
    configResolved(c) { root = c.root; },
    transform(code, id) {
      const file = id.split("?")[0];
      if (!/\/src\/.*\.(tsx?|mjs)$/.test(file) || /\/src\/i18n\/(index|ru|products)\.ts$/.test(file) || file.includes("node_modules") || !CYR.test(code)) return null;
      const items = scan(code, file);
      if (!items.length) return null;
      const out = rewrite(code, items);
      let rel = path.relative(path.dirname(file), path.join(root, "src/i18n/index.ts")).replace(/\\/g, "/").replace(/\.ts$/, "");
      if (!rel.startsWith(".")) rel = "./" + rel;
      return { code: `import { __t as __mt, __tt as __mtt } from ${JSON.stringify(rel)};\n` + out, map: null };
    },
  };
}
