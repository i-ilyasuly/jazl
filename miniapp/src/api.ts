// Medeo API клиенті (backend/, Cloud Run). Әр сұрауға Telegram initData қосылады — сервер қолтаңбасын тексереді.
// Сервер жауап бермесе, мини апп үлгі деректермен жұмысын жалғастырады (бэкенд толық қосылғанша).
// Medeo. атауына ауысу (2026-11-17): жаңа сервер — medeo-api. Ол әлі іске қосылмаған болса (Cloud Run 404 HTML не желі қатесі),
// мини апп бір рет ескі серверге (jazl-api) ауысады — Vercel фронтенді бэкендтен ерте жарияланса да жұмыс тоқтамайды.
// Ескі сервер өшірілген соң LEGACY_API жолын алып тастау керек.
const PRIMARY_API = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://medeo-api-595435045772.europe-west3.run.app";
const LEGACY_API = import.meta.env.VITE_API_URL ? null : "https://jazl-api-595435045772.europe-west3.run.app";
export let API_URL = PRIMARY_API;
/** Жаңа сервер осы сеанста бір рет жауап берсе (JSON) — енді ескісіне ешқашан ауыспаймыз (желі үзілісі ескіге жабыстырмайды) */
let primaryAnswered = false;
const isJson = (r: Response) => (r.headers.get("content-type") ?? "").includes("json");
/** Серверге сұрау: medeo-api мүлде жоқ болса ғана (сеанстың басында) — бір рет jazl-api-ға ауысады. Барлық API сұрауы осы арқылы. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const canFallback = () => Boolean(LEGACY_API) && API_URL === PRIMARY_API && !primaryAnswered;
  let res: Response;
  try { res = await fetch(API_URL + path, init); }
  catch (e) {
    if (!canFallback() || init.signal?.aborted) throw e;
    API_URL = LEGACY_API!; return fetch(API_URL + path, init);
  }
  if (API_URL === PRIMARY_API && isJson(res)) primaryAnswered = true;
  else if (res.status === 404 && canFallback() && !isJson(res)) { API_URL = LEGACY_API!; return fetch(API_URL + path, init); } // Cloud Run: «сервис жоқ» беті
  return res;
}

const devInit = () => { try { return import.meta.env.DEV ? localStorage.getItem("medeo_dev_init") ?? "" : ""; } catch { return ""; } }; // тек жергілікті әзірлеуде: браузерден сынау
const initData = () => (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || devInit();

export async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 6000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    const id = initData();
    if (id) headers.set("Authorization", "tma " + id);
    // Чектің ішкі бөлігі үшін: қай платформадан, қай нұсқадан (клиентке көрсетілмейді)
    const wa = (window as unknown as { Telegram?: { WebApp?: { platform?: string; version?: string } } }).Telegram?.WebApp;
    if (wa?.platform) headers.set("X-Tg-Platform", wa.platform);
    if (wa?.version) headers.set("X-Tg-Version", wa.version);
    headers.set("X-App-Version", String(import.meta.env.VITE_APP_VERSION ?? "web"));
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await apiFetch(path, { ...init, headers, signal: ctl.signal });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Жүйелік күйлер (Figma 13): сессия аяқталды, техникалық жұмыстар — мекеме бөлімі арнайы бет көрсетеді
      if (res.status === 401 && j?.reason === "expired") window.dispatchEvent(new CustomEvent("medeo:sys", { detail: "session" }));
      if (res.status === 503 && j?.error === "maintenance") window.dispatchEvent(new CustomEvent("medeo:sys", { detail: "maintenance" }));
      throw Object.assign(new Error(j?.error ?? "http_" + res.status), { status: res.status, body: j });
    }
    return j as T;
  } finally { clearTimeout(t); }
}
