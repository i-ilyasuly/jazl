// Аударылмаған кілттер тізімі: node i18n/list.mjs → i18n/work/list.tsv (N <tab> файл <tab> кілт), файл бойынша топталған
import fs from "node:fs"; import path from "node:path";
const D = import.meta.dirname;
const keys = JSON.parse(fs.readFileSync(path.join(D, "keys.json"), "utf8"));
const ru = fs.existsSync(path.join(D, "ru.json")) ? JSON.parse(fs.readFileSync(path.join(D, "ru.json"), "utf8")) : {};
const rows = Object.entries(keys).filter(([k]) => !(k in ru)).map(([k, f]) => [f[0], k]).sort((a, b) => a[0].localeCompare(b[0]));
fs.mkdirSync(path.join(D, "work/ru"), { recursive: true });
fs.writeFileSync(path.join(D, "work/list.tsv"), rows.map(([f, k], i) => `${i + 1}\t${f}\t${k.replace(/\n/g, "\\n")}`).join("\n"));
console.log("left", rows.length);
