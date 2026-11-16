// Jazl+ API клиенті (backend/, Cloud Run). Әр сұрауға Telegram initData қосылады — сервер қолтаңбасын тексереді.
// Сервер жауап бермесе, мини апп үлгі деректермен жұмысын жалғастырады (бэкенд толық қосылғанша).
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://jazl-api-595435045772.europe-west3.run.app";

const initData = () => (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "";

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
    const res = await fetch(API_URL + path, { ...init, headers, signal: ctl.signal });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j?.error ?? "http_" + res.status), { status: res.status, body: j });
    return j as T;
  } finally { clearTimeout(t); }
}
