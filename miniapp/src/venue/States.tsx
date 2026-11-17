// Figma «13 · Жүйелік күйлер және жетістіктер»: Желі жоқ (14012:9773), Сессия аяқталды (9802), Техникалық жұмыстар (9842),
// Жетістік: 100 қолдану (9862), Жетістік: рекорд күн (9884), Жаңа тапсырыс (баннер, 9904);
// «16»: Басты: жаңа мекеме (14045:10248), Мекеме уақытша тоқтатылды (14071:15402).
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, kv, openChat, shareToChat, tg } from "../telegram";
import { Tile } from "../ui/Tile";
import { preloadSticker } from "../ui/Sticker";
import { api } from "../api";
import { BOT_APP_LINK, SUPPORT_BOT } from "../config";
import { hm, useCurrent, V, type Dashboard, type VOrder } from "./api";
import { Buttons, VPage, VSticker } from "./ui";
import s from "./V.module.css";

export type Sys = "offline" | "session" | "maintenance" | null;
/** Желі, сессия, техникалық жұмыстар — мекеме беттерінде бүкіл бетті ауыстырады */
export function useSys(): [Sys, () => void] {
  const [sys, setSys] = useState<Sys>(navigator.onLine ? null : "offline");
  // Желі жоқ кезде стикердің өзі жүктелмей қалмасын — алдын ала жүктеп қоямыз
  useEffect(() => { for (const n of ["offline", "sleep", "repair"] as const) void preloadSticker(n).catch(() => null); }, []);
  useEffect(() => {
    const off = () => setSys("offline"); const on = () => setSys((x) => (x === "offline" ? null : x));
    const ev = (e: Event) => setSys((e as CustomEvent).detail as Sys);
    window.addEventListener("offline", off); window.addEventListener("online", on); window.addEventListener("jazl:sys", ev);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); window.removeEventListener("jazl:sys", ev); };
  }, []);
  return [sys, () => setSys(navigator.onLine ? null : "offline")];
}

export function SysScreen({ sys, retry }: { sys: Exclude<Sys, null>; retry: () => void }) {
  const c = {
    offline: { st: "offline" as const, y: 362, t: "Желі жоқ", x: "Интернетті тексеріп, қайта көр. Кассир режимі желісіз жұмыс істемейді.", b: "Қайта көру" },
    session: { st: "sleep" as const, y: 373, t: "Сессия аяқталды", x: "Қауіпсіздік үшін қолданбаны қайта аш.", b: "Қайта ашу" },
    maintenance: { st: "repair" as const, y: 362, t: "Техникалық жұмыстар", x: "Қызмет уақытша қолжетімсіз. Шамамен 30 минуттан кейін қайта кір.", b: "Тексеру" },
  }[sys];
  const act = () => {
    haptic.tap();
    if (sys === "session") { if (tg?.close) tg.close(); else window.location.reload(); return; }
    if (sys === "maintenance") { api("/health").then(() => { retry(); window.location.reload(); }).catch(() => haptic.error()); return; }
    if (navigator.onLine) retry(); else haptic.error();
  };
  return (
    <div className={s.page}>
      <div className={s.state} style={{ top: `calc(${c.y}px + var(--top-shift))` }}>
        <VSticker name={c.st} size={120} />
        <h2 className={s.stateTitle}>{c.t}</h2>
        <p className={s.stateText}>{c.x}</p>
      </div>
      <Buttons main={{ text: c.b, onClick: act }} />
    </div>
  );
}

/** «Басты: жаңа мекеме»: ұсыныс жоқ кезде — 3 қадамдық тізім */
export function NewVenueHome({ d }: { d: Dashboard & { offers: number; cashiers: number } }) {
  const go = useGo();
  const me = useCurrent();
  const [poster, setPoster] = useState(false);
  useEffect(() => { if (me) void kv.get("jazl_v_poster_" + me.venue.id).then((v) => setPoster(Boolean(v))); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps: [boolean, string, string, string, string][] = [
    [d.offers > 0, "v:offer", "Бірінші ұсынысты жариялау", "Пакет бағасы мен санын көрсет", "/v/offers/new"],
    [d.cashiers > 0, "v:invite", "Кассирді шақыру", "Telegram арқылы сілтеме жібер", "/v/team/invite"],
    [poster, "v:poster", "Кассирге плакат басып шығару", "QR-ды төлем орнына қой", "/v/guide"],
  ];
  const done = steps.filter((x) => x[0]).length;
  return (
    <VPage title="Басты" tab="home">
      <VSticker name="hello" size={110} at={[151, 104]} />
      <div style={{ marginTop: 130, textAlign: "center" }}>
        <h1 className={s.resultTitle} style={{ fontSize: 24 }}>Бастайық!</h1>
        <p className={s.muted} style={{ marginTop: 4 }}>3 қадам: бірінші сатылымға дейін</p>
      </div>
      <div className={s.card}>
        {steps.map(([ok, e, t, sub, to]) => (
          <button key={t} className={s.row} onClick={() => { if (to === "/v/guide" && me) kv.set("jazl_v_poster_" + me.venue.id, "1"); go(to); }}>
            {ok ? <span style={{ width: 36, height: 36, borderRadius: 9, background: "#31d158", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>✓</span> : <Tile e={e} size={36} />}
            <span className={s.rowText}><span className={s.rowTitle} style={ok ? { color: "var(--text-secondary)", textDecoration: "line-through" } : undefined}>{t}</span><span className={s.rowSub}>{sub}</span></span><i className={s.arrow} />
          </button>
        ))}
      </div>
      <span className={`${s.tag} ${s.tagGray}`} style={{ alignSelf: "flex-start" }}>{done} / 3 орындалды</span>
    </VPage>
  );
}

/** «Мекеме уақытша тоқтатылды»: жаңа пакеттер сатылмайды, бірақ сатылғандарына қызмет көрсету міндетті — кассир режимі ашық */
export function Suspended({ note }: { note: string | null }) {
  const go = useGo();
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(340px + var(--top-shift))" }}>
        <VSticker name="stop" size={120} />
        <h2 className={s.stateTitle}>Мекеме уақытша тоқтатылды</h2>
        <p className={s.stateText}>{note ? `Себебі: ${note}. ` : ""}Жаңа пакеттер сатылмайды, бірақ сатылған пакеттер мерзімі біткенше қолданылады: клиенттерге қызмет көрсету міндетті.</p>
      </div>
      <Buttons main={{ text: "Қолдауға жазу", onClick: () => openChat(SUPPORT_BOT) }} second={{ text: "Кассир режимі", onClick: () => go("/v/cashier") }} />
    </VPage>
  );
}

/** Жетістіктер: 100-ші қолдану (кубок), рекорд күн (диско) — бір рет қана көрсетіледі */
export async function achievementFor(venueId: string, d: Dashboard & { total: number; record: number }): Promise<string | null> {
  const milestones = [1000, 500, 100];
  for (const m of milestones) if (d.total >= m && !(await kv.get(`jazl_v_ach_${venueId}_${m}`))) { kv.set(`jazl_v_ach_${venueId}_${m}`, "1"); return `/v/achieve/${m}`; }
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
  if (d.record > 0 && d.today > d.record && !(await kv.get(`jazl_v_rec_${venueId}_${day}`))) { kv.set(`jazl_v_rec_${venueId}_${day}`, "1"); return `/v/achieve/record?n=${d.today}&diff=${d.today - d.yesterday}`; }
  return null;
}
export function VAchievement() {
  const go = useGo();
  const me = useCurrent();
  const { kind = "100" } = useParams();
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const rec = kind === "record";
  const name = me?.venue.name ?? "Мекеме";
  const title = rec ? "Бүгін рекорд!" : `${kind}-ші қолдану!`;
  const text = rec ? `${q.get("n")} қолдану: ең жақсы күн. Кешегіден ${q.get("diff")} артық.` : `${name} Jazl+ арқылы ${kind} пакет бірлігін қолданды. Керемет жұмыс!`;
  const back = () => go("/v/home", "fade", { replace: true });
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(347px + var(--top-shift))" }}>
        <VSticker name={rec ? "disco" : "trophy"} size={150} />
        <h2 className={s.stateTitle}>{title}</h2>
        <p className={s.stateText}>{text}</p>
      </div>
      {rec ? <Buttons main={{ text: "Жабу", onClick: back }} />
        : <Buttons main={{ text: "Рақмет", onClick: back }} second={{ text: "Бөлісу", onClick: () => void shareToChat({ url: BOT_APP_LINK, text: `${name}: Jazl+ арқылы ${kind}-ші қолдану! 🎉` }) }} />}
    </VPage>
  );
}

/** «Жаңа тапсырыс» баннері: мекеме беттерінде 20 с сайын тексеріледі, жаңасы келсе — жоғарыдан шығады */
export function NewOrderBanner() {
  const go = useGo();
  const me = useCurrent();
  const known = useRef<Set<string> | null>(null);
  const [o, setO] = useState<VOrder | null>(null);
  useEffect(() => {
    if (!me) return;
    let dead = false;
    const load = async () => {
      try {
        const list = (await V.orders()).filter((x) => me.branches.some((b) => b.id === x.branchId));
        if (dead) return;
        if (known.current) { const fresh = list.find((x) => !known.current!.has(x.id) && x.status === "sent"); if (fresh) { haptic.success(); setO(fresh); window.setTimeout(() => setO((c) => (c?.id === fresh.id ? null : c)), 8000); } }
        known.current = new Set(list.map((x) => x.id));
      } catch { /* желі */ }
    };
    void load(); const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    return () => { dead = true; clearInterval(t); };
  }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o) return null;
  return (
    <button className={s.banner} onClick={() => { setO(null); go(`/v/orders/${o.id}`); }}>
      <VSticker name="chef" size={36} />
      <span className={s.rowText} style={{ textAlign: "left" }}><b style={{ color: "#fff", fontSize: 16 }}>Жаңа тапсырыс №{o.no}</b><span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{o.title.split(" · ")[0]} • {o.scheduledAt ? hm(o.scheduledAt) : "қазір"}</span></span>
      <span style={{ color: "#5cb4f4", fontWeight: 600 }}>Ашу</span>
    </button>
  );
}
