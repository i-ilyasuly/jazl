// Нөмірленген аудармаларды (work/ru/*.txt, «N<tab>аударма») work/list.tsv бойынша кілтке байлап, i18n/ru.json-ға қосады.
// Сосын list.tsv-ны тек аударылмаған кілттермен қайта жасайды (нөмірлер қайта басталады).
import fs from "node:fs"; import path from "node:path";
const D = import.meta.dirname;
const list = new Map(fs.readFileSync(path.join(D, "work/list.tsv"), "utf8").split("\n").filter(Boolean).map((l) => { const [n, , k] = l.split("\t"); return [n, k.replace(/\\n/g, "\n")]; }));
const ruFile = path.join(D, "ru.json");
const ru = fs.existsSync(ruFile) ? JSON.parse(fs.readFileSync(ruFile, "utf8")) : {};
let added = 0;
const dir = path.join(D, "work/ru");
for (const f of fs.readdirSync(dir).sort()) {
  for (const l of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
    if (!l.trim()) continue;
    const i = l.indexOf("\t"); const n = l.slice(0, i); const v = l.slice(i + 1).replace(/\\n/g, "\n");
    const k = list.get(n); if (k === undefined) { console.error("жоқ нөмір", f, n); continue; }
    ru[k] = v; added++;
  }
  fs.renameSync(path.join(dir, f), path.join(D, "work", "done_" + Date.now() + "_" + f));
}
fs.writeFileSync(ruFile, JSON.stringify(Object.fromEntries(Object.entries(ru).sort(([a], [b]) => a.localeCompare(b))), null, 1));
console.log("added", added, "total", Object.keys(ru).length);
