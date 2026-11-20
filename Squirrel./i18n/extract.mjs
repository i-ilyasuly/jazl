// Барлық аударылатын кілттерді жинау: node i18n/extract.mjs → i18n/keys.json ({кілт: [файлдар]})
import fs from "node:fs"; import path from "node:path";
import { scan } from "./core.mjs";
const root = path.resolve(import.meta.dirname, "../src");
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f) && !/\.d\.ts$/.test(f) && !/\/i18n\/(index|ru|products)\.ts$/.test(p)) files.push(p); } })(root);
const keys = {};
for (const f of files) for (const x of scan(fs.readFileSync(f, "utf8"), f)) (keys[x.key] ??= new Set()).add(path.relative(root, f));
const out = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, [...v]]));
fs.writeFileSync(path.resolve(import.meta.dirname, "keys.json"), JSON.stringify(out, null, 1));
console.log("files", files.length, "keys", Object.keys(out).length, "chars", Object.keys(out).join("").length);
