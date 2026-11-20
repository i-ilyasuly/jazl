// Medeo Басқару (Figma «Medeo Басқару» 14060:7998): серверге сұраулар. Кіру — Telegram initData + PIN → X-Admin-Token (12 сағ).
// Токен тек осы сеанста (sessionStorage) сақталады: мини апп жабылса, қайта PIN сұралады.
import { useEffect, useState } from "react";
import { api, API_URL, apiFetch } from "../api";

const KEY = "medeo_adm";
const WEB_KEY = "medeo_adm_web";
const hasInit = () => { const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } } }; if (w.Telegram?.WebApp?.initData) return true; try { return import.meta.env.DEV && Boolean(localStorage.getItem("medeo_dev_init")); } catch { return false; } };
/** Веб-режим: Telegram-нан тыс браузер (Басқару тек веб арқылы — Патша, 2026-11-17). Кіру — Telegram Login Widget + PIN. */
export const isWeb = () => !hasInit();
// Аудит 2026-11-21: веб-токен localStorage-те емес, тек осы терезенің сеансында (sessionStorage); ескісі тазартылады
try { localStorage.removeItem(WEB_KEY); } catch { /* */ }
let webToken = (() => { try { return sessionStorage.getItem(WEB_KEY) ?? ""; } catch { return ""; } })();
export const setWebToken = (t: string) => { webToken = t; try { if (t) sessionStorage.setItem(WEB_KEY, t); else sessionStorage.removeItem(WEB_KEY); } catch { /* жеке терезе */ } };
export const webTokenNow = () => webToken;
/** Админ PIN ұзындығы: жаңасы 6, ескі (4 таңбалы) PIN ауыстырылғанша 4 */
export const pinLen = { v: 6 };
const authHeaders = (): Record<string, string> => {
  if (isWeb()) { if (!webToken) return {}; const [, e, sg] = webToken.split("."); return { Authorization: "adm " + webToken, "X-Admin-Token": `${e}.${sg}` }; }
  return { "X-Admin-Token": token };
};
/** Шығу: сеанс токендерін өшіреді */
export const logout = () => { setToken(""); setWebToken(""); };
let token = (() => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } })();
export const setToken = (t: string) => { token = t; try { sessionStorage.setItem(KEY, t); } catch { /* жеке терезе */ } };
export const hasToken = () => Boolean(isWeb() ? webToken : token);

/** Басқару API: сеанс бітсе (401 admin_session) — кіру бетіне қайтарады */
export async function A<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await api<T>("/v1/admin" + path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() } }, 10000);
  } catch (e) {
    const b = (e as { body?: { error?: string } }).body;
    if (b?.error === "admin_session") { setToken(""); setWebToken(""); window.location.hash = "#/a"; }
    throw e;
  }
}
export const post = <T = { ok: true }>(path: string, body: object = {}) => A<T>(path, { method: "POST", body: JSON.stringify(body) });
export const errOf = (e: unknown) => (e as { body?: { error?: string; left?: number | null; until?: string | null } }).body ?? { error: "network" };

export interface Me { admin: boolean; telegramId: number | null; name?: string; hasPin?: boolean; pinLen?: number; upgrade?: boolean; lockedUntil?: string | null; session?: boolean; needLogin?: boolean }
export const me = async (): Promise<Me> => {
  if (isWeb() && !webToken) return { admin: false, telegramId: null, needLogin: true };
  try { const r = await api<Me>("/v1/admin/me", { headers: authHeaders() }); if (r.pinLen) pinLen.v = r.pinLen; return r; }
  catch (e) { if (isWeb() && (e as { status?: number }).status === 401) { setWebToken(""); return { admin: false, telegramId: null, needLogin: true }; } throw e; }
};
/** Веб-кіру: Telegram Login Widget деректері (бір рет алынады, PIN қадамына дейін жадта) */
export type WidgetAuth = Record<string, string | number>;
let widgetAuth: WidgetAuth | null = null;
export const setWidgetAuth = (a: WidgetAuth | null) => { widgetAuth = a; };
export const getWidgetAuth = () => widgetAuth;
export async function webLogin(pin?: string, setup?: boolean): Promise<{ ok: true; hasPin?: boolean; pinLen?: number; upgrade?: boolean; name?: string; token?: string }> {
  const res = await apiFetch("/admin-web/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auth: widgetAuth, pin, setup }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j?.error ?? "http_" + res.status), { status: res.status, body: j });
  if (j.token) setWebToken(j.token);
  if (j.pinLen) pinLen.v = j.pinLen;
  if (j.name) { try { localStorage.setItem("medeo_adm_name", j.name); } catch { /* жеке терезе */ } }
  return j;
}
export const pinLogin = (pin: string, setup = false) => api<{ token: string; upgrade?: boolean }>("/v1/admin/pin", { method: "POST", body: JSON.stringify({ pin, setup }) });
/** Ескі 4 таңбалы PIN-ді 6 таңбаға ауыстыру (аудит 2026-11-21) */
export const pinChange = (pin: string) => post("/pin/change", { pin });

// ── Пішімдеу ──
export const money = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/[\s,]/g, " ") + " ₸";
const tz = { timeZone: "Asia/Almaty" } as const;
export const hm = (d: string) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", ...tz });
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", tz);
export const dayMonth = (d: string) => { const x = ymd(new Date(d)); return `${Number(x.slice(8, 10))} ${MON[Number(x.slice(5, 7)) - 1]}`; };
/** «бүгін 09:14», «кеше 18:40», «12 қараша» */
export const when = (d: string, time = true) => {
  const x = ymd(new Date(d)); const t = ymd(new Date()); const y = ymd(new Date(Date.now() - 86400_000));
  return x === t ? `бүгін${time ? " " + hm(d) : ""}` : x === y ? `кеше${time ? " " + hm(d) : ""}` : dayMonth(d);
};
/** «5 сағ», «1 күн» — өткен уақыт */
export const ago = (d: string) => { const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3600_000)); return h < 24 ? `${h} сағ` : `${Math.round(h / 24)} күн`; };
export const kindTile = { food: "🍔", coffee: "☕", hair: "✂" } as Record<string, string>;

/** Профильде «Medeo Басқару» жолы тек рұқсат тізіміндегі аккаунтқа көрінеді (бір рет тексеріледі) */
let adminFlag: boolean | null = null;
export function useIsAdmin() {
  const [v, setV] = useState(adminFlag ?? false);
  useEffect(() => { if (import.meta.env.VITE_NO_ADMIN === "1") return; if (adminFlag === null) me().then((m) => { adminFlag = m.admin; setV(m.admin); }).catch(() => { adminFlag = false; }); }, []);
  return v;
}
