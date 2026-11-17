// Jazl+ Басқару (Figma «Jazl+ Басқару» 14060:7998): серверге сұраулар. Кіру — Telegram initData + PIN → X-Admin-Token (12 сағ).
// Токен тек осы сеанста (sessionStorage) сақталады: мини апп жабылса, қайта PIN сұралады.
import { useEffect, useState } from "react";
import { api } from "../api";

const KEY = "jazl_adm";
let token = (() => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } })();
export const setToken = (t: string) => { token = t; try { sessionStorage.setItem(KEY, t); } catch { /* жеке терезе */ } };
export const hasToken = () => Boolean(token);

/** Басқару API: сеанс бітсе (401 admin_session) — кіру бетіне қайтарады */
export async function A<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await api<T>("/v1/admin" + path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "X-Admin-Token": token } }, 10000);
  } catch (e) {
    const b = (e as { body?: { error?: string } }).body;
    if (b?.error === "admin_session") { setToken(""); window.location.hash = "#/a"; }
    throw e;
  }
}
export const post = <T = { ok: true }>(path: string, body: object = {}) => A<T>(path, { method: "POST", body: JSON.stringify(body) });
export const errOf = (e: unknown) => (e as { body?: { error?: string; left?: number | null; until?: string | null } }).body ?? { error: "network" };

export interface Me { admin: boolean; telegramId: number; name?: string; hasPin?: boolean; lockedUntil?: string | null; session?: boolean }
export const me = () => api<Me>("/v1/admin/me", { headers: { "X-Admin-Token": token } });
export const pinLogin = (pin: string, setup = false) => api<{ token: string }>("/v1/admin/pin", { method: "POST", body: JSON.stringify({ pin, setup }) });

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

/** Профильде «Jazl+ Басқару» жолы тек рұқсат тізіміндегі аккаунтқа көрінеді (бір рет тексеріледі) */
let adminFlag: boolean | null = null;
export function useIsAdmin() {
  const [v, setV] = useState(adminFlag ?? false);
  useEffect(() => { if (import.meta.env.VITE_NO_ADMIN === "1") return; if (adminFlag === null) me().then((m) => { adminFlag = m.admin; setV(m.admin); }).catch(() => { adminFlag = false; }); }, []);
  return v;
}
