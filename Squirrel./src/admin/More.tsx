// Figma «07 · Ақша» (14066:9764, шолу), «15 · Баптаулар және бизнес-ережелер» (14067:9810): Тағы, Бизнес-ережелер, Техникалық жұмыстар, Өзгерістер журналы.
import { useState } from "react";
import { useGo } from "../nav";
import { haptic, nativeAlert } from "../telegram";
import { Switch } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import { useCached } from "../venue/api";
import { Note, Person, Sheet, Sk, VPage, Buttons } from "../venue/ui";
import { A, hm, money, post, when, dayMonth } from "./api";
import { Badge, Field, Growth, PinSheet, RadioRow } from "./ui";
import type { Attention } from "./Pulse";
import { ExportSheet } from "./Money";
import v from "../venue/V.module.css";
import s from "./A.module.css";

const PERIODS = [["today", "Бүгін"], ["7", "7 күн"], ["30", "30 күн"], ["all", "Барлығы"]] as const;
const soon = () => nativeAlert("Салыстыру нақты төлем провайдері (Kaspi) қосылғанда іске қосылады: сынақ режимінде салыстыратын дерек жоқ.");

export function AMoney() {
  const go = useGo();
  const [exp, setExp] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("30");
  const [d] = useCached<{ money: { sales: number; salesGrowth: number | null; fee: number; feeGrowth: number | null; venue: number; uses: number; balance: number; payments: number; refunds: number; expired: number; testMode: boolean } }>(`a:money:${period}`, () => A(`/money?period=${period}`));
  const m = d?.money;
  const label = { today: "Бүгін", "7": "Соңғы 7 күн", "30": "Соңғы 30 күн", all: "Барлық уақыт" }[period];
  const rows = [
    { e: "a:pay", t: "Төлемдер", r: m ? String(m.payments) : "–", on: () => go("/a/money/payments") }, { e: "a:settle", t: "Мекемелермен есеп", r: "", on: () => go("/a/money/settlements") }, { e: "a:recon", t: "Салыстыру", r: "", on: soon },
    { e: "a:refunds", t: "Қайтарулар", r: m ? String(m.refunds) : "–", on: () => go("/a/money/refunds") }, { e: "a:expired", t: "Мерзімі өткен қалдық", r: m ? money(m.expired) : "–", on: () => go("/a/packs?tab=grace") }, { e: "a:export", t: "Экспорт", r: "", on: () => setExp(true) },
  ];
  return (
    <VPage nav>
      <h1 className={v.h1}>Ақша</h1>
      <p className={s.sub}>{label}</p>
      <div className={v.seg}>{PERIODS.map(([k, t]) => <button key={k} className={`${v.segBtn} ${period === k ? v.segOn : ""}`} onClick={() => { haptic.select(); setPeriod(k); }}>{t}</button>)}</div>
      <div className={v.stats}>
        <div className={`${v.stat} ${s.statBlue}`}><span className={v.statLabel}>Сатылым</span><span className={v.statNum}>{m ? money(m.sales) : "–"}</span>{m && m.salesGrowth !== null && <span className={s.pillWhite}>▲ {m.salesGrowth}%</span>}</div>
        <div className={v.stat}><span className={v.statLabel}>Платформа комиссиясы</span><span className={v.statNum}>{m ? money(m.fee) : "–"}</span>{m && <Growth v={m.feeGrowth} />}</div>
      </div>
      <div className={v.stats}>
        <div className={v.stat}><span className={v.statLabel}>Мекемелерге өтті</span><span className={v.statNum}>{m ? money(m.venue) : "–"}</span>{m && <span className={`${v.tag} ${v.tagGray}`} style={{ alignSelf: "flex-start" }}>{`${m.uses} қолдану`}</span>}</div>
        <div className={v.stat}><span className={v.statLabel}>Клиенттердегі қалдық</span><span className={v.statNum}>{m ? money(m.balance) : "–"}</span><span className={`${v.tag} ${v.tagGray}`} style={{ alignSelf: "flex-start" }}>әлі қолданылмаған</span></div>
      </div>
      {m?.testMode && <Note tone="warn">Сынақ режимі: ақша нақты жүрмейді. Сандар сынақ сатылымдарынан есептелген.</Note>}
      <div className={v.card}>{rows.map((r) => (
        <button key={r.t} className={v.row} style={{ minHeight: 56 }} onClick={() => { haptic.tap(); r.on(); }}><Tile e={r.e} size={36} /><span className={v.rowText}><span className={v.rowTitle}>{r.t}</span></span>{r.r && <b className={v.lead} style={{ fontSize: 16 }}>{r.r}</b>}<i className={v.arrow} /></button>
      ))}</div>
      {exp && <ExportSheet onClose={() => setExp(false)} />}
    </VPage>
  );
}

export function AMore() {
  const go = useGo();
  const [a] = useCached<{ attention: Attention }>("a:attention", () => A("/attention"));
  const [st, , reload] = useCached<{ settings: { maintenance: boolean } }>("a:settings", () => A("/settings"));
  const [pin, setPin] = useState(false);
  const name = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? "Сіз";
  const n = a ? a.attention.offers_new + a.attention.offers_changed : 0;
  const rows: [string, string, string, number?][][] = [
    [["a:moderation", "Ұсыныстар модерациясы", "/a/offers", n], ["a:packs", "Пакеттер және қолданулар", "/a/packs"], ["a:apps", "Мекеме өтінімдері", "/a/apps", a?.attention.apps ?? 0]],
    [["a:bell", "Хабарламалар", "/a/notifications"], ["a:rules", "Бизнес-ережелер", "/a/rules"], ["a:log", "Өзгерістер журналы", "/a/log"]],
  ];
  const m = st?.settings.maintenance ?? false;
  return (
    <VPage nav>
      <h1 className={v.h1}>Тағы</h1>
      <div className={v.card}><div className={v.row} style={{ minHeight: 64 }}><Person name={name} size={40} /><span className={v.rowText}><span className={v.rowTitle}>{name}</span><span className={v.rowSub}>Иесі · толық рұқсат</span></span></div></div>
      {rows.map((g, i) => <div key={i} className={v.card}>{g.map(([e, t, to, b]) => (
        <button key={t} className={v.row} style={{ minHeight: 56 }} onClick={() => { haptic.tap(); go(to); }}><Tile e={e} size={36} /><span className={v.rowText}><span className={v.rowTitle}>{t}</span></span>{b ? <Badge n={b} /> : null}<i className={v.arrow} /></button>
      ))}</div>)}
      <div className={v.card}><div className={v.row} style={{ minHeight: 60 }}>
        <Tile e="a:maint" size={36} /><span className={v.rowText}><span className={v.rowTitle}>Техникалық жұмыстар</span><span className={v.rowSub}>{m ? "Қосулы: клиенттер мен мекемелер кіре алмайды" : "Қазір өшірулі"}</span></span>
        {st && <Switch on={m} onChange={() => setPin(true)} />}
      </div></div>
      {pin && <PinSheet text={m ? "Техникалық жұмыстарды өшіру: қолданба бәріне қайта ашылады." : "Техникалық жұмыстарды қосу: клиенттер мен мекемелер уақытша кіре алмайды."} onClose={() => setPin(false)}
        run={async (p) => { await post("/settings", { key: "maintenance", value: !m, pin: p }); await reload(); }} />}
    </VPage>
  );
}

type Settings = { maintenance: boolean; maintenanceText: string; moderation: boolean; graceDays: number; complaintHours: number; maxDiscount: number; refusedPauseAt: number; bonusMonths: number };
export function ARules() {
  const [d, , reload] = useCached<{ settings: Settings; feePct: number; paymentsMode: string }>("a:settings", () => A("/settings"));
  const [edit, setEdit] = useState<null | { key: keyof Settings; title: string; options: (number | boolean)[]; fmt: (v: number | boolean) => string }>(null);
  const [val, setVal] = useState<number | boolean>(0);
  const [text, setText] = useState("");
  const [pin, setPin] = useState<null | { key: keyof Settings; value: number | boolean | string; label: string }>(null);
  if (!d) return <VPage title="Бизнес-ережелер" back><Sk h={240} /></VPage>;
  const x = d.settings;
  const rows: { t: string; r: string; on?: () => void }[] = [
    { t: "Комиссия", r: `${d.feePct}% · жоғары рейтингке 8%` },
    { t: "Күту кезеңі (мерзімі өткен пакет)", r: `${x.graceDays} күн`, on: () => { setVal(x.graceDays); setEdit({ key: "graceDays", title: "Күту кезеңі", options: [1, 3, 5, 7], fmt: (v) => `${v} күн` }); } },
    { t: "Шағымға жауап мерзімі", r: `${x.complaintHours} сағат`, on: () => { setVal(x.complaintHours); setEdit({ key: "complaintHours", title: "Шағымға жауап мерзімі", options: [12, 24, 48, 72], fmt: (v) => `${v} сағат` }); } },
    { t: "Жеңілдік шегі (ұсыныс)", r: `${x.maxDiscount ?? 30}%-дан аспайды`, on: () => { setVal(x.maxDiscount ?? 30); setEdit({ key: "maxDiscount", title: "Жеңілдік шегі", options: [20, 30, 40, 50], fmt: (v) => `${v}%` }); } },
    { t: "«Мекеме қабылдамады» → тоқтату", r: `30 күнде ${x.refusedPauseAt ?? 5} клиент`, on: () => { setVal(x.refusedPauseAt ?? 5); setEdit({ key: "refusedPauseAt", title: "Неше түрлі клиенттен кейін тоқтатылады", options: [3, 5, 7, 10], fmt: (v) => `${v} клиент` }); } },
    { t: "Күйген бірлік", r: `клиентке бонус · ${x.bonusMonths ?? 12} ай` },
    { t: "Жаңа ұсынысты тексеру (модерация)", r: x.moderation ? "қосулы" : "өшірулі", on: () => { setVal(x.moderation); setEdit({ key: "moderation", title: "Модерация", options: [true, false], fmt: (v) => (v ? "Қосулы: жаңа ұсыныс тексеруге түседі" : "Өшірулі: бірден жарияланады") }); } },
    { t: "Техникалық жұмыстар мәтіні", r: "өзгерту", on: () => { setText(x.maintenanceText); setEdit({ key: "maintenanceText", title: "Техникалық жұмыстар мәтіні", options: [], fmt: String }); } },
    { t: "Төлем режимі", r: d.paymentsMode === "test" ? "сынақ" : "нақты" },
    { t: "Ақшалай қайтару", r: "өшірулі" },
  ];
  return (
    <VPage title="Бизнес-ережелер" back>
      <div className={v.card}>{rows.map((r) => (
        <button key={r.t} className={v.row} style={{ minHeight: 56, ["--inset" as string]: "16px" }} onClick={() => { if (r.on) { haptic.tap(); r.on(); } }} disabled={!r.on}>
          <span className={v.rowText}><span className={v.rowTitle} style={{ whiteSpace: "normal" }}>{r.t}</span></span><b className={v.lead} style={{ fontSize: 15, color: r.on ? undefined : "var(--text-secondary)" }}>{r.r}</b>{r.on && <i className={v.arrow} />}
        </button>
      ))}</div>
      <Note>Бұл мәндер Figma жазбасындағы ұсыныс бойынша қойылған. Әр өзгеріс PIN-мен расталып, журналға жазылады.</Note>
      {edit && !pin && (
        <Sheet title={edit.title} onClose={() => setEdit(null)}>
          {edit.key === "maintenanceText" ? <Field label="Клиенттерге көрінетін мәтін" value={text} onChange={setText} rows={2} max={200} />
            : <div className={v.card}>{edit.options.map((o) => <RadioRow key={String(o)} on={val === o} title={edit.fmt(o)} onClick={() => setVal(o)} />)}</div>}
          <Buttons main={{ text: "Сақтау", onClick: () => setPin({ key: edit.key, value: edit.key === "maintenanceText" ? text.trim() : val, label: edit.title }) }} second={{ text: "Бас тарту", onClick: () => setEdit(null) }} />
        </Sheet>
      )}
      {pin && <PinSheet text={`«${pin.label}» өзгерту.`} onClose={() => { setPin(null); setEdit(null); }} run={async (p) => { await post("/settings", { key: pin.key, value: pin.value, pin: p }); await reload(); }} />}
    </VPage>
  );
}

export function ALog() {
  const [d] = useCached<{ log: { id: string; action: string; target: string; at: string; author: string }[] }>("a:log", () => A("/log"));
  const groups: { title: string; items: NonNullable<typeof d>["log"] }[] = [];
  for (const x of d?.log ?? []) { const t = when(x.at, false); const tt = t === "бүгін" ? "Бүгін" : t === "кеше" ? "Кеше" : dayMonth(x.at); let g = groups.find((y) => y.title === tt); if (!g) { g = { title: tt, items: [] }; groups.push(g); } g.items.push(x); }
  return (
    <VPage title="Журнал" back>
      {!d ? <Sk h={200} /> : groups.length === 0 ? <Note>Әзірге өзгеріс жоқ.</Note> : groups.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <h2 className={v.blueHead}>{g.title}</h2>
          <div className={v.card}>{g.items.map((x) => (
            <div key={x.id} className={v.row} style={{ minHeight: 60 }}><Person name={x.author} size={36} /><span className={v.rowText}><span className={v.rowTitle}>{x.action}</span><span className={v.rowSub} style={{ whiteSpace: "normal" }}>{x.target} · {hm(x.at)}</span></span></div>
          ))}</div>
        </div>
      ))}
      <Note>Журнал жазбаларын өшіруге немесе өзгертуге болмайды.</Note>
    </VPage>
  );
}
