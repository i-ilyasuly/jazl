// i18n/ru.json → src/i18n/ru.ts (қосымшаға кіретін орыс сөздігі) + аударылмаған кілттерді тексеру.
// Іске қосу: node i18n/build-ru.mjs (npm run i18n). Жаңа мәтін қосылса: аудармасын ru.json-ға жазыңыз.
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const D = import.meta.dirname;
execFileSync("node", [path.join(D, "extract.mjs")], { stdio: "inherit" });
const keys = JSON.parse(fs.readFileSync(path.join(D, "keys.json"), "utf8"));
const ru = JSON.parse(fs.readFileSync(path.join(D, "ru.json"), "utf8"));
const used = Object.fromEntries(Object.keys(keys).filter((k) => k in ru).sort().map((k) => [k, ru[k]]));
const missing = Object.keys(keys).filter((k) => !(k in ru));
fs.writeFileSync(path.join(D, "../src/i18n/ru.ts"), "// АВТОМАТТЫ ТҮРДЕ ЖАСАЛАДЫ (node i18n/build-ru.mjs). Өзгерту — i18n/ru.json-да.\nexport const RU: Record<string, string> = " + JSON.stringify(used, null, 0).replace(/","/g, '",\n"') + ";\n");
console.log("ru.ts:", Object.keys(used).length, "аударма; аударылмаған:", missing.length);
if (missing.length) { console.log(missing.slice(0, 30).map((k) => "  • " + k).join("\n")); console.log("  (аудармасы жоқ мәтін қазақша көрсетіледі)"); }
