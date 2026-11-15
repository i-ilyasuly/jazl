// Figma «22 · Шаштараз: жазылу» (14035:14715): «күн және уақыт» 14035:14913, «жазылуды растау» 14035:15023,
// «жазылу расталды» 14035:15133, «менің жазылуларым» 14035:15177 (Пакеттерім), «жазылуды ауыстыру» 14035:15333,
// «бас тарту (тегін)» 14035:15433, «бас тарту (кеш)» 14035:15491, «келмедің» 14035:15549.
// Өлшемдер: UI kit шкаласы (17/22, 15/20, 13/16, 24/30) және 4/8px тор; таңдалған чип — жиексіз, фоны ғана.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useGo } from "../nav";
import { atOf, book, bookLabel, cancelBooking, dayWord, freeCancel, getBooking, getPack, moveBooking, offerOf, useBookings, usePacks } from "../store";
import { haptic, inTelegram, tg, useBackButton, useBottomButtons, type BottomAction } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Group, SubPage } from "../ui/SubPage";
import r from "./PayResult.module.css";
import s from "./Booking.module.css";

const TIMES = ["10:00", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];
/** Бос емес уақыттар (мок): Figma-дағыдай ертең 11:00, 15:30, 17:00; басқа күндерде — өзгеше. Бүгін өтіп кеткен уақыт та бос емес. */
function busy(day: number, t: string) {
  if (day === 0 && atOf(0, t) < Date.now() + 3600_000) return true;
  const i = TIMES.indexOf(t);
  return day === 1 ? [1, 4, 5].includes(i) : (i + day) % 3 === 0;
}

function Bar({ left, main }: { left: BottomAction; main: BottomAction & { disabled?: boolean } }) {
  useBottomButtons(main, left, !main.disabled);
  if (inTelegram) return null;
  return (
    <div className={s.bar}>
      <button className={`${s.btn} ${s.second}`} onClick={left.onClick}>{left.text}</button>
      <button className={s.btn} disabled={main.disabled} onClick={main.onClick}>{main.text}</button>
    </div>
  );
}

function SlotPicker({ dayTitle, days, value, onChange }: { dayTitle: string; days: number; value: { day: number; time: string }; onChange: (v: { day: number; time: string }) => void }) {
  return <>
    <h2 className={`t-sub2 w-600 ${s.h2} rise`}>{dayTitle}</h2>
    <div className={`${s.chips} rise`}>
      {Array.from({ length: days }, (_, d) => (
        <button key={d} className={`t-text ${s.chip} ${value.day === d ? s.on : ""}`} onClick={() => {
          if (value.day === d) return; haptic.select();
          onChange({ day: d, time: busy(d, value.time) ? (TIMES.find((t) => !busy(d, t)) ?? "") : value.time });
        }}>{dayWord(d, true)}</button>
      ))}
    </div>
    <h2 className={`t-sub2 w-600 ${s.h2} rise`} style={{ ["--i" as string]: 1 }}>Бос уақыт</h2>
    <div className={`${s.chips} rise`} style={{ ["--i" as string]: 1 }}>
      {TIMES.map((t) => {
        const off = busy(value.day, t);
        return <button key={t} disabled={off} aria-label={off ? `${t}, бос емес` : t} className={`t-text ${s.chip} ${off ? s.busy : ""} ${value.time === t ? s.on : ""}`}
          onClick={() => { if (value.time !== t) { haptic.select(); onChange({ ...value, time: t }); } }}>{t}</button>;
      })}
    </div>
  </>;
}

/** «Күн мен уақыт»: /book/:packId */
export function BookTime() {
  const { packId = "" } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(packId);
  const days = pack ? Math.max(1, Math.min(5, pack.daysLeft + 1)) : 5;
  const [v, setV] = useState(() => ({ day: Math.min(1, days - 1), time: "14:00" }));
  const back = useCallback(() => go(-1, "back"), [go]);
  const left = useMemo(() => ({ text: "Артқа", position: "left" as const, onClick: () => { haptic.soft(); back(); } }), [back]);
  const main = useMemo(() => ({ text: "Жалғастыру", disabled: !v.time, onClick: () => { haptic.medium(); go(`/book/${packId}/confirm`, "forward", { state: { at: atOf(v.day, v.time) } }); } }), [go, packId, v]);
  return (
    <SubPage title="Күн мен уақыт" top={92}>
      <SlotPicker dayTitle="Күні" days={days} value={v} onChange={setV} />
      {v.time && <p className={`t-text ${s.picked} rise`} style={{ ["--i" as string]: 2 }}>Таңдалған: <span key={v.day + v.time} className={`t-sub2 w-600 ${s.pickedChip}`}>{dayWord(v.day)}, {v.time}</span></p>}
      <p className={`t-cap1 ${s.legend} rise`} style={{ ["--i" as string]: 2 }}>Сызылған уақыт — бос емес (басқа клиент жазылған)</p>
      <Bar left={left} main={main} />
    </SubPage>
  );
}

/** «Растау»: /book/:packId/confirm (location.state.at) */
export function BookConfirm() {
  const { packId = "" } = useParams();
  usePacks();
  const go = useGo();
  const at = (useLocation().state as { at?: number } | null)?.at ?? atOf(1, "14:00");
  const pack = getPack(packId);
  const o = pack ? offerOf(pack) : null;
  const [busyNow, setBusyNow] = useState(false);
  const left = useMemo(() => ({ text: "Артқа", position: "left" as const, onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  const main = useMemo(() => ({ text: "Растау", shine: true, disabled: busyNow, onClick: () => {
    if (busyNow) return;
    haptic.medium(); setBusyNow(true); tg?.MainButton?.showProgress?.(false);
    setTimeout(() => {
      tg?.MainButton?.hideProgress?.();
      const b = book(packId, at);
      if (!b) { haptic.error(); go(`/order/state/nounits/${packId}`, "up", { replace: true }); return; }
      haptic.success(); go("/book/done/" + b.id, "up", { replace: true });
    }, 900);
  } }), [busyNow, go, packId, at]);
  if (!pack || !o) return <SubPage title="Растау"><p className={`t-sub2 ${s.empty}`}>Пакет табылмады</p></SubPage>;
  const rows: [string, string][] = [["Мекеме", o.venue], ["Қызмет", o.title.split(" · ")[0]], ["Күні мен уақыты", bookLabel(at)], ["Жазылымнан", "1 рет жұмсалады"]];
  return (
    <SubPage title="Растау" top={92}>
      <Group i={0}>{rows.map(([k, v]) => <div key={k} className={`t-text ${s.kv}`}><span>{k}</span><b className="t-sub2 w-600">{v}</b></div>)}</Group>
      <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 1 }}>Жазылуға 2 сағат қалғанға дейін тегін бас тарта аласың. Кейін немесе келмесең, жазылымнан бір рет жұмсалады.<i>”</i></p>
      <Bar left={left} main={main} />
    </SubPage>
  );
}

/** «Жазылу расталды»: /book/done/:id */
export function BookDone() {
  const go = useGo();
  useBookings();
  const b = getBooking(useParams().id);
  const close = useCallback(() => go(b ? "/pack/" + b.packId : "/packs", "back", { replace: true }), [go, b]);
  useBackButton(close);
  const left = useMemo(() => ({ text: "Менің жазылуларым", position: "left" as const, onClick: () => { haptic.tap(); go("/packs?tab=1", "fade", { replace: true }); } }), [go]);
  const main = useMemo(() => ({ text: "Дайын", onClick: () => { haptic.soft(); close(); } }), [close]);
  return (
    <div className={r.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={r.body}>
        <Sticker name="party" size={120} className={r.sticker} />
        <h1 className={r.title}>Жазылу расталды</h1>
        <p className={r.text}>{b ? bookLabel(b.at) : ""}. Ескерту жазылуға 2 сағат қалғанда келеді.</p>
      </div>
      <Bar left={left} main={main} />
    </div>
  );
}

/** Жазылу беті: /booking/:id — уақытты ауыстыру не бас тарту */
export function BookingView() {
  const go = useGo();
  useBookings();
  const b = getBooking(useParams().id);
  const [ask, setAsk] = useState(false);
  const [snack, setSnack] = useState("");
  useEffect(() => { if (!snack) return; const t = setTimeout(() => go(-1, "back"), 1400); return () => clearTimeout(t); }, [snack, go]);
  const free = b ? freeCancel(b) : true;
  const left = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: () => { haptic.warning(); setAsk(true); } }), []);
  const main = useMemo(() => ({ text: "Уақытты ауыстыру", disabled: !free || b?.status !== "ok", onClick: () => { haptic.tap(); go(`/booking/${b?.id}/move`); } }), [go, b, free]);
  if (!b) return <SubPage title="Жазылу"><p className={`t-sub2 ${s.empty}`}>Жазылу табылмады</p></SubPage>;
  const rows: [string, string, string?][] = [["Мекеме", b.venue], ["Қызмет", b.service], ...(b.master ? [["Шебер", b.master] as [string, string]] : []), ["Мәртебе", b.status === "ok" ? "Расталды" : "Болдырылмады", b.status === "ok" ? s.blue : ""]];
  return (
    <SubPage title="Жазылу" top={92}>
      <section className={`${s.head} rise`}><b className="t-text w-600">{bookLabel(b.at)}</b><small className="t-sub2">{b.service}</small></section>
      <Group i={1}>{rows.map(([k, v, c]) => <div key={k} className={`t-text ${s.kv}`}><span>{k}</span><b className={`t-sub2 w-600 ${c ?? ""}`}>{v}</b></div>)}</Group>
      <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 2 }}>{free ? "Уақытты 2 сағатқа дейін тегін ауыстыруға не бас тартуға болады." : "Жазылуға 2 сағаттан аз қалды: ауыстыру мүмкін емес, бас тартсаң жазылымнан бір рет жұмсалады."}<i>”</i></p>
      {b.status === "ok" && !snack && <Bar left={left} main={main} />}
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">{snack}</div>}
      {ask && <Confirm danger cancel="Жоқ" ok="Бас тарту" onClose={() => setAsk(false)}
        title={free ? "Жазылудан бас тарту?" : "Кеш бас тарту"}
        text={free ? "Жазылымнан дана жұмсалмайды: жазылуға 2 сағаттан артық уақыт бар." : "Жазылуға 2 сағаттан аз қалды. Бас тартсаң, жазылымнан бір рет жұмсалады."}
        onOk={() => { const back = cancelBooking(b.id); haptic.success(); setSnack(back ? "Жазылу болдырылмады · 1 рет қайтарылды" : "Жазылу болдырылмады"); }} />}
    </SubPage>
  );
}

/** «Уақытты ауыстыру»: /booking/:id/move */
export function BookMove() {
  const go = useGo();
  useBookings();
  const b = getBooking(useParams().id);
  const pack = b ? getPack(b.packId) : undefined;
  const days = pack ? Math.max(1, Math.min(5, pack.daysLeft + 1)) : 5;
  const [v, setV] = useState({ day: 1, time: "" });
  const left = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  const main = useMemo(() => ({ text: "Ауыстыру", disabled: !v.time, onClick: () => { if (!b) return; haptic.success(); moveBooking(b.id, atOf(v.day, v.time)); go(-1, "back"); } }), [go, b, v]);
  return (
    <SubPage title="Уақытты ауыстыру" top={92}>
      <SlotPicker dayTitle="Жаңа күні" days={days} value={v} onChange={setV} />
      <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 2 }}>Уақытты 2 сағатқа дейін тегін ауыстыруға болады.<i>”</i></p>
      <Bar left={left} main={main} />
    </SubPage>
  );
}

/** «Жазылуға келмедің»: /booking/missed/:packId (бот хабарламасынан ашылады) */
export function BookMissed() {
  const { packId = "" } = useParams();
  const go = useGo();
  const close = useCallback(() => go("/packs", "back", { replace: true }), [go]);
  useBackButton(close);
  const main = useMemo(() => ({ text: "Жаңа жазылу", onClick: () => { haptic.medium(); go("/book/" + packId, "forward", { replace: true }); } }), [go, packId]);
  useBottomButtons(main);
  return (
    <div className={r.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={r.body}>
        <Sticker name="sad" size={120} className={r.sticker} />
        <h1 className={r.title}>Жазылуға келмедің</h1>
        <p className={r.text}>Ереже бойынша жазылымнан бір рет жұмсалды. Келесі жолы уақытында жазылып көр.</p>
      </div>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={main.onClick}>{main.text}</button></div>}
    </div>
  );
}
