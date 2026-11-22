// Пилот көрсеткіштері мен қате бақылау (Патша, 2026-11-21). Өз серверімізге (/v1/events) аз-аздан жібереміз:
// open — қолданбаны ашты, view — ұсынысты көрді, buy_start — «Сатып алу» парағын ашты, error — қолданба қатесі.
// Сатып алу мен қолдану серверде өзі жазылады. Жеке дерек жіберілмейді: тек бет жолы (параметрлерсіз), қате мәтіні, нұсқа.
import { api } from "./api";

type Ev = { k: "open" | "view" | "buy_start" | "error" | "search" | "share" | "gift_start" | "scan"; ref?: string; m?: Record<string, string | number | boolean> };
const queue: Ev[] = [];
let timer: number | undefined;
const inTg = () => Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);

function flush() {
  timer = undefined;
  if (!queue.length || !inTg()) { queue.length = 0; return; }
  const events = queue.splice(0, 20);
  void api("/v1/events", { method: "POST", body: JSON.stringify({ events }), keepalive: true }, 8000).catch(() => null);
  if (queue.length) timer = window.setTimeout(flush, 1000);
}
export function track(k: Ev["k"], ref?: string, m?: Ev["m"]) {
  if (import.meta.env.DEV || !inTg()) return; // тек нақты Telegram ішінде
  queue.push({ k, ...(ref ? { ref } : {}), ...(m ? { m } : {}) });
  if (k === "error") { window.clearTimeout(timer); timer = window.setTimeout(flush, 300); }
  else if (timer === undefined) timer = window.setTimeout(flush, 5000);
}
addEventListener("visibilitychange", () => { if (document.hidden && queue.length) { window.clearTimeout(timer); flush(); } });

/** Ағымдағы бет: #/offer/latte?x=… → /offer/latte (параметрлерсіз) */
const route = () => location.hash.replace(/^#/, "").split(/[?&]/)[0].slice(0, 80) || "/";
const seen = new Map<string, number>();
const IGNORE = /ResizeObserver loop|^Script error\.?$|AbortError|The user aborted|Load failed|Failed to fetch|NetworkError/i;
export function reportError(err: unknown, src = "") {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "?").slice(0, 200));
  const msg = `${e.name}: ${e.message}`.slice(0, 300);
  if (IGNORE.test(e.message) || IGNORE.test(msg)) return;
  const n = (seen.get(msg) ?? 0) + 1; seen.set(msg, n);
  if (n > 3) return; // бір қате бір ашылымда 3 реттен көп жіберілмейді
  const wa = (window as unknown as { Telegram?: { WebApp?: { platform?: string } } }).Telegram?.WebApp;
  track("error", undefined, { msg, stack: (e.stack ?? "").slice(0, 1200), route: route(), ver: String(import.meta.env.VITE_APP_VERSION ?? "web"), platform: wa?.platform ?? "", src });
}
addEventListener("error", (e) => { if (e.error || e.message) reportError(e.error ?? e.message, "window"); });
addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"));
