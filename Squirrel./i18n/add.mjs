// Аударманы тікелей қосу: node i18n/add.mjs файл.tsv  (әр жол: қазақша<TAB>орысша; \n — жаңа жол)
import fs from "node:fs"; import path from "node:path";
const D = import.meta.dirname; const f = path.join(D, "ru.json");
const ru = JSON.parse(fs.readFileSync(f, "utf8"));
for (const l of fs.readFileSync(process.argv[2], "utf8").split("\n")) { if (!l.includes("\t")) continue; const [k, v] = l.split("\t"); ru[k.replace(/\\n/g, "\n")] = v.replace(/\\n/g, "\n"); }
fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(ru).sort(([a], [b]) => a.localeCompare(b))), null, 1));
