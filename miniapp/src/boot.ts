// Кіру нүктесі: алдымен тіл (орыс сөздігі керек болса жүктеледі), сосын қосымшаның өзі.
import { initLang } from "./i18n";

// Негізгі файл сөздікті күтпей, қатар жүктеле бастайды (бұрын орысша ашқанда сөздік → сосын негізгі файл, кезекпен).
// Атауын құрастыру кезінде vite.config.ts ішіндегі medeoMainPreload ауыстырады; әзірлеу режимінде ештеңе істемейді.
const MAIN_CHUNK = "__MEDEO_MAIN_CHUNK__";
if (!MAIN_CHUNK.startsWith("__")) {
  const l = document.createElement("link");
  l.rel = "modulepreload"; l.href = new URL(MAIN_CHUNK, import.meta.url).href;
  document.head.appendChild(l);
}
void initLang().catch(() => undefined).then(() => import("./main"));
