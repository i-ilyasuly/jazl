// Figma «07 · Ақша» (14066:9764): Төлемдер, Есеп айырысу (айлар), Қайтарулар, Экспорт (CSV — Excel ашады).
import { useState } from "react";
import { haptic, nativeAlert } from "../telegram";
import { Switch } from "../ui/SubPage";
import { useCached } from "../venue/api";
import { Buttons, Note, Person, Sheet, Sk, VPage, VSticker } from "../venue/ui";
import { API_URL, apiFetch } from "../api";
import { A, dayMonth, hm, isWeb, money, when } from "./api";
import { Tile } from "../ui/Tile";
import { PinSheet } from "./ui";
import v from "../venue/V.module.css";
import s from "./A.module.css";

const method: Record<string, string> = { kaspi: "Kaspi Pay", card: "карта", test: "сынақ" };
const pst: Record<string, [string, string]> = { paid: ["сәтті", ""], created: ["күтуде", "#b07a00"], pending: ["күтуде", "#b07a00"], failed: ["сәтсіз", "#e53935"], refunded: ["қайтарылды", "#8e8e93"] };

export function APayments() {
  const [tab, setTab] = useState<"all" | "paid" | "pending" | "failed">("all");
  const [d] = useCached<{ counts: { failed: number }; payments: { id: string; amount: number; status: string; method: string; at: string; customer: string; title: string }[] }>(`a:pay:${tab}`, () => A(`/payments?tab=${tab}`));
  const groups: { t: string; items: NonNullable<typeof d>["payments"] }[] = [];
  for (const x of d?.payments ?? []) { const w = when(x.at, false); const t = w === "бүгін" ? "Бүгін" : w === "кеше" ? "Кеше" : dayMonth(x.at); let g = groups.find((y) => y.t === t); if (!g) { g = { t, items: [] }; groups.push(g); } g.items.push(x); }
  return (
    <VPage title="Төлемдер" back>
      <div className={v.seg}>{([["all", "Барлығы"], ["paid", "Сәтті"], ["pending", "Күтуде"], ["failed", "Сәтсіз"]] as const).map(([k, t]) => (
        <button key={k} className={`${v.segBtn} ${tab === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setTab(k); }}>{t}{k === "failed" && d?.counts.failed ? ` · ${d.counts.failed}` : ""}</button>
      ))}</div>
      {!d ? <Sk h={220} /> : groups.length === 0 ? <div className={v.result}><VSticker name="sleep" size={96} /><p className={v.stateText}>Бұл бөлімде төлем жоқ.</p></div>
        : groups.map((g) => (
          <div key={g.t} style={{ display: "contents" }}>
            <h2 className={v.blueHead}>{g.t}</h2>
            <div className={v.card}>{g.items.map((x) => { const [st, col] = pst[x.status] ?? [x.status, ""]; return (
              <div key={x.id} className={v.row} style={{ minHeight: 62 }}>
                <Person name={x.customer} size={40} />
                <span className={v.rowText}><span className={v.rowTitle}>{x.customer}</span><span className={v.rowSub}>{x.title} · {method[x.method] ?? x.method} · {hm(x.at)}</span></span>
                <span className={s.right}><b style={{ color: col || undefined }}>{money(x.amount)}</b><span>{st}</span></span>
              </div>); })}</div>
          </div>
        ))}
    </VPage>
  );
}

const MON = ["Қаңтар", "Ақпан", "Наурыз", "Сәуір", "Мамыр", "Маусым", "Шілде", "Тамыз", "Қыркүйек", "Қазан", "Қараша", "Желтоқсан"];
export function ASettlements() {
  const now = new Date();
  const months = [0, 1, 2].map((i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { k: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, t: MON[d.getMonth()] }; });
  const [m, setM] = useState(months[0].k);
  const [d] = useCached<{ venues: { id: string; name: string; status: string; fee: number; uses: number; amount: number }[] }>(`a:settle:${m}`, () => A(`/settlements?month=${m}`));
  return (
    <VPage title="Есеп айырысу" back>
      <div className={v.seg}>{months.map((x) => <button key={x.k} className={`${v.segBtn} ${m === x.k ? v.segOn : ""}`} onClick={() => { haptic.select(); setM(x.k); }}>{x.t}</button>)}</div>
      {!d ? <Sk h={220} /> : <div className={v.card}>{d.venues.map((x) => (
        <div key={x.id} className={v.row} style={{ minHeight: 62 }}>
          <Person name={x.name} size={40} />
          <span className={v.rowText}><span className={v.rowTitle}>{x.name}</span><span className={v.rowSub}>{`${x.status === "paused" ? "Тоқтатылған · " : ""}${x.uses} қолдану · комиссия ${x.fee}%`}</span></span>
          <span className={s.right}><b>{money(x.amount)}</b>{x.amount > 0 && <span>өтті</span>}</span>
        </div>
      ))}</div>}
      <Note>Мекемеге ақша әр қолданған сәтте бірден өтеді. Бұл бет тек қорытынды есеп: қосымша аударым жасаудың қажеті жоқ.</Note>
      <Buttons main={{ text: "Excel", onClick: () => void download("30", ["settlements"]) }} />
    </VPage>
  );
}

export function ARefunds() {
  const [d] = useCached<{ refunds: { id: string; units: number; at: string; customer: string; title: string; venue: string; amount: number; why: string; platform: boolean }[] }>("a:refunds", () => A("/refunds"));
  return (
    <VPage title="Қайтарулар" back>
      <FailedRefunds />
      <Note>Шағым бойынша бірлік клиенттің пакетіне оралады, сомасы мекемеден ұсталады. Қолданылмаған пакетті клиент 14 күн ішінде қайтарса — карта бөлігі картасына провайдер арқылы, бонус бөлігі Medeo бонусына оралады.</Note>
      {!d ? <Sk h={200} /> : d.refunds.length === 0 ? <div className={v.result}><VSticker name="love" size={96} /><p className={v.stateText}>Қайтару болған жоқ.</p></div>
        : <div className={v.card}>{d.refunds.map((x) => (
          <div key={x.id} className={v.row} style={{ minHeight: 64, alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
            <Tile e="a:refunds" size={36} />
            <span className={v.rowText}><span className={v.rowTitle}>{`${x.units} бірлік · ${x.title}`}</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{x.customer} · {x.venue} · {when(x.at, false)} · {x.why}</span></span>
            <span className={s.right}><b>−{money(x.amount)}</b><span>{x.platform ? "платформадан" : "мекемеден"}</span></span>
          </div>
        ))}</div>}
    </VPage>
  );
}

const REFUND_WHY: Record<string, string> = { declined: "Банк қабылдамады", provider_unavailable: "Төлем провайдері бапталмаған", refund_not_supported: "Провайдер қайтаруды қолдамайды", no_external_id: "Төлем нөмірі жоқ", provider_error: "Провайдер қатесі" };
/** Провайдер қабылдамаған ақшалай қайтарулар (2026-11-18): клиент ақшасын әлі алмаған — «Қайта жіберу» */
function FailedRefunds() {
  const [d, , reload] = useCached<{ refunds: { id: string; amount: number; status: string | null; reason: string | null; at: string | null; customer: string }[] }>("a:refunds-failed", () => A("/refunds/failed"));
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState<{ id: string; amount: number } | null>(null);
  if (!d || d.refunds.length === 0) return null;
  // Ақша әрекеті — PIN-мен (сервер де тексереді). PIN қате болса PinSheet өзі айтады; провайдер бас тартса — ескерту.
  const retry = async (id: string, pin: string) => {
    setBusy(id);
    try {
      const r = await A<{ ok: boolean }>(`/payments/${id}/refund-retry`, { method: "POST", body: JSON.stringify({ pin }) });
      if (!r.ok) { haptic.error(); nativeAlert("Провайдер тағы қабылдамады. Себебін тексеріңіз."); }
    } finally { setBusy(""); void reload(); }
  };
  return (
    <>
      <Note tone="warn">{`Картаға қайтарылмаған ақша: ${d.refunds.length}. Клиент ақшасын күтіп отыр — қайта жіберіңіз.`}</Note>
      <div className={v.card}>{d.refunds.map((x) => (
        <div key={x.id} className={v.row} style={{ minHeight: 64 }}>
          <Tile e="a:payfail" size={36} />
          <span className={v.rowText}><span className={v.rowTitle}>{`${money(x.amount)} · ${x.customer}`}</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{[x.status === "pending" ? "Провайдерден жауап келмеді: ақша қайтты ма — кабинеттен тексеріңіз" : REFUND_WHY[x.reason ?? ""] ?? x.reason ?? "Провайдер қатесі", x.at ? when(x.at, false) : ""].filter(Boolean).join(" · ")}</span></span>
          {/* Жауабы белгісіз қайтаруды қайта жібермейміз — ақша екі рет қайтуы мүмкін */}
          {x.status === "failed" && <button className={`${v.chip} ${v.chipOn}`} disabled={busy === x.id} onClick={() => { haptic.medium(); setAsk({ id: x.id, amount: x.amount }); }}>{busy === x.id ? "…" : "Қайта жіберу"}</button>}
        </div>
      ))}</div>
      {ask && <PinSheet text={`${money(ask.amount)} клиентке қайта жіберу.`} onClose={() => setAsk(null)} run={(pin) => retry(ask.id, pin)} />}
    </>
  );
}

/** CSV-ті токенмен жүктеп алу (веб: файл ретінде сақталады). pdf — сол деректен басып шығаруға дайын бет ашылады (браузерде «PDF ретінде сақтау») */
async function download(period: string, parts: string[], pdf = false) {
  try {
    const { hasToken } = await import("./api");
    if (!hasToken()) return;
    const headers: Record<string, string> = {};
    // A() JSON қайтарады — мұнда файл керек, сондықтан тақырыптарды өзіміз қоямыз
    const web = isWeb();
    const tok = (() => { try { return web ? localStorage.getItem("medeo_adm_web") ?? "" : sessionStorage.getItem("medeo_adm") ?? ""; } catch { return ""; } })();
    if (web) { const [, e, sg] = tok.split("."); headers.Authorization = "adm " + tok; headers["X-Admin-Token"] = `${e}.${sg}`; }
    else { headers.Authorization = "tma " + (window.Telegram?.WebApp?.initData || (import.meta.env.DEV ? localStorage.getItem("medeo_dev_init") ?? "" : "")); headers["X-Admin-Token"] = tok; }
    const res = await apiFetch(`/v1/admin/export?period=${period}&parts=${parts.join(",")}`, { headers });
    if (!res.ok) throw new Error("http_" + res.status);
    if (pdf) { openPdf(await res.text(), period); haptic.success(); return; }
    const blob = await res.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `medeo-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    haptic.success();
  } catch { haptic.error(); nativeAlert("Жүктелмеді. Қайталап көріңіз."); }
}

/** PDF есеп: CSV-тен кесте жасап, жаңа бетте басып шығару терезесін ашады (Басқару — тек веб, компьютерде «PDF ретінде сақтау») */
function openPdf(csv: string, period: string) {
  const rows = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => (l.match(/("([^"]|"")*"|[^;]*)(;|$)/g) ?? []).map((c) => c.replace(/;$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')).filter((_, i, a) => i < a.length - 1 || a[i] !== ""));
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let html = "", open = false;
  for (const r of rows) {
    if (!r.length || r.every((c) => !c)) { if (open) { html += "</table>"; open = false; } continue; }
    if (r.length === 1) { if (open) { html += "</table>"; open = false; } html += `<h2>${esc(r[0])}</h2>`; continue; }
    if (!open) { html += `<table><tr>${r.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`; open = true; continue; }
    html += `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  }
  if (open) html += "</table>";
  const w = window.open("", "_blank"); if (!w) { nativeAlert("Жаңа бет ашылмады: браузерде қалқымалы терезеге рұқсат беріңіз."); return; }
  const label = ({ today: "Бүгін", "7": "Соңғы 7 күн", "30": "Соңғы 30 күн", all: "Барлық уақыт" } as Record<string, string>)[period] ?? period;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Medeo есеп</title><style>
    body{font:13px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}p{color:#666;margin:0 0 16px}
    h2{font-size:15px;margin:20px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f3f6f9}
    @media print{body{margin:0}}</style></head><body><h1>Medeo · есеп</h1><p>${esc(label)} · ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}</p>${html}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

/** Figma «Экспорт»: кезең, не қосылады, пішім */
export function ExportSheet({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState("30");
  const [parts, setParts] = useState({ payments: true, settlements: true, refunds: false });
  const [fmt, setFmt] = useState<"csv" | "pdf">("csv");
  return (
    <Sheet title="Экспорт" onClose={onClose}>
      <h2 className={v.blueHead}>Кезең</h2>
      <div className={s.chipsWrap}>{([["today", "Бүгін"], ["7", "7 күн"], ["30", "30 күн"], ["all", "Барлығы"]] as const).map(([k, t]) => <button key={k} className={`${v.chip} ${period === k ? v.chipOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}</div>
      <h2 className={v.blueHead}>Не қосылады</h2>
      <div className={v.card}>{([["payments", "Төлемдер"], ["settlements", "Мекемелермен есеп"], ["refunds", "Қайтарулар"]] as const).map(([k, t]) => (
        <div key={k} className={v.row} style={{ ["--inset" as string]: "16px" }}><span className={v.rowText}><span className={v.rowTitle}>{t}</span></span><Switch on={parts[k]} onChange={(x) => setParts({ ...parts, [k]: x })} /></div>
      ))}</div>
      <h2 className={v.blueHead}>Пішімі</h2>
      <div className={s.chipsWrap}>{([["csv", "Excel (CSV)"], ["pdf", "PDF"]] as const).map(([k, t]) => <button key={k} className={`${v.chip} ${fmt === k ? v.chipOn : ""}`} onClick={() => { haptic.select(); setFmt(k); }}>{t}</button>)}</div>
      <Note>{fmt === "pdf" ? "Есеп жаңа бетте ашылады: басып шығару терезесінде «PDF ретінде сақтау» таңдаңыз." : "Excel ашады (CSV, кириллицамен)."}</Note>
      <Buttons main={{ text: "Жүктеу", onClick: () => { const p = Object.entries(parts).filter(([, x]) => x).map(([k]) => k); if (!p.length) return; void download(period, p, fmt === "pdf").then(onClose); } }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}
