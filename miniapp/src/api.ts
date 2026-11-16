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
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await fetch(API_URL + path, { ...init, headers, signal: ctl.signal });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j?.error ?? "http_" + res.status), { status: res.status, body: j });
    return j as T;
  } finally { clearTimeout(t); }
}
