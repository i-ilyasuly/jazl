// Ортақ қысқа хабар (snackbar): кез келген беттен toast("…") — экранның төменгі жағында 2.4 с көрінеді.
import { useEffect, useSyncExternalStore } from "react";
import s from "./Toast.module.css";

let msg: { text: string; id: number } | null = null;
const subs = new Set<() => void>();
export function toast(text: string) { msg = { text, id: Date.now() }; subs.forEach((f) => f()); }
const useToast = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => msg);

export function Toast() {
  const m = useToast();
  useEffect(() => { if (!m) return; const t = setTimeout(() => { if (msg?.id === m.id) { msg = null; subs.forEach((f) => f()); } }, 2400); return () => clearTimeout(t); }, [m]);
  return m ? <div key={m.id} className={`t-sub2 ${s.toast}`} role="status">{m.text}</div> : null;
}
