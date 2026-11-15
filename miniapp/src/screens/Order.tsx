// Figma «20 · Тапсырыс»: «Тапсырыс беру» 13911:7999, «Филиал таңдау» 13911:8105, «Тапсырыс жіберілуде» 13914:8002;
// «23»: «Тапсырыс: алу уақыты» 14043:12745. Пакет бұрын төленген — бұл жерде шот та, карта төлемі де жоқ,
// тек пакеттен 1 бірлік шегеріледі. Шаштаразда бұл бет «Жазылу» болып ашылады (күн + уақыт).
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { branches, getPack, offerOf, placeOrder, usePacks } from "../store";
import { haptic, inTelegram, tg, useBottomButtons } from "../telegram";
import { SubPage } from "../ui/SubPage";
import s from "./Order.module.css";

const demo = () => (window.location.hash.match(/[?&]order=(\w+)/)?.[1] ?? "");
const pad = (n: number) => String(n).padStart(2, "0");
/** Келесі жарты сағаттық уақыттар */
function slots(n: number, from = new Date()) {
  const d = new Date(from); d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 30) + 30, 0, 0);
  return Array.from({ length: n }, (_, i) => { const t = new Date(d.getTime() + i * 30 * 60000); return `${pad(t.getHours())}:${pad(t.getMinutes())}`; });
}
const dayNames = ["Бүгін", "Ертең"];
const months = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const dayLabel = (i: number) => { if (i < 2) return dayNames[i]; const d = new Date(Date.now() + i * 86400000); return `${d.getDate()} ${months[d.getMonth()]}`; };

export function Order() {
  const { packId = "" } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(packId);
  const o = pack ? offerOf(pack) : null;
  const hair = o?.kind === "hair";
  const list = useMemo(() => (o ? branches(o.venue, o.address) : []), [o]);
  const [branch, setBranch] = useState(list.find((b) => b.open)?.id ?? "");
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(0);
  const times = useMemo(() => (hair ? ["10:00", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"] : ["now", ...slots(4)]), [hair]);
  const [time, setTime] = useState(times[hair ? 3 : 0]);
  const [sending, setSending] = useState(false);
  const b = list.find((x) => x.id === branch);
  const days = pack ? Math.min(7, pack.daysLeft + 1) : 0;

  // Тапсырыс беру мүмкін болмаса, бірден түсінікті бетке өтеміз
  useEffect(() => {
    if (!pack) return;
    if (pack.left < 1) go(`/order/state/nounits/${pack.id}`, "up", { replace: true });
    else if (demo() === "noaccept") go(`/order/state/noaccept/${pack.id}`, "up", { replace: true });
    else if (demo() === "closed" || list.every((x) => !x.open)) go(`/order/state/closed/${pack.id}`, "up", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMemo(() => ({ text: hair ? "Жазылу" : "Тапсырыс беру", shine: true, onClick: () => {
    if (!pack || !b || sending) return;
    haptic.medium();
    setSending(true);
    tg?.MainButton?.showProgress?.(false);
    setTimeout(() => {
      tg?.MainButton?.hideProgress?.();
      const label = time === "now" ? "≈15 мин" : (hair ? `${dayLabel(day)}, ${time}` : time);
      const order = placeOrder(pack.id, b.address, label);
      if (!order) { haptic.error(); go(`/order/state/nounits/${pack.id}`, "up", { replace: true }); return; }
      if (demo() === "fail") { haptic.error(); go(`/order/state/fail/${pack.id}?o=${order.id}`, "up", { replace: true }); return; }
      haptic.success();
      go("/order/done/" + order.id, "up", { replace: true });
    }, 1400);
  } }), [pack, b, sending, time, hair, day, go]);
  useBottomButtons(send, undefined, Boolean(pack) && !picking);

  if (!pack || !o) return <SubPage title="Тапсырыс"><p className={s.empty}>Пакет табылмады</p></SubPage>;
  return (
    <SubPage title={hair ? "Жазылу" : "Тапсырыс"} variant="settings">
      <div className={`${s.pack} rise`} style={{ ["--i" as string]: 0 }}>
        <span className={s.emoji}>{hair ? "✂️" : o.kind === "coffee" ? "☕" : "🍔"}</span>
        <span className={s.packText}><b>{o.title}</b><small>Шегеріледі: 1 бірлік • Қалады: {pack.left - 1} / {pack.total}</small></span>
      </div>

      <h2 className={`${s.h2} rise`} style={{ ["--i" as string]: 1 }}>{hair ? "Қай салон" : "Қайда"}</h2>
      <button className={`${s.card} ${s.branch} rise`} style={{ ["--i" as string]: 1 }} onClick={() => { haptic.tap(); setPicking(true); }} disabled={list.length < 2}>
        <span className={s.pin}>📍</span>
        <span className={s.packText}><small>{o.venue} · филиал</small><b>{b?.address}</b></span>
        {list.length > 1 && <i className={s.chev} />}
      </button>

      {hair && <>
        <h2 className={`${s.h2} rise`} style={{ ["--i" as string]: 2 }}>Қай күні</h2>
        <div className={`${s.chips} rise`} style={{ ["--i" as string]: 2 }}>
          {Array.from({ length: days }, (_, i) => <button key={i} className={`${s.chip} ${day === i ? s.on : ""}`} onClick={() => { if (day !== i) { haptic.select(); setDay(i); } }}>{dayLabel(i)}</button>)}
        </div>
      </>}

      <h2 className={`${s.h2} rise`} style={{ ["--i" as string]: 3 }}>{hair ? "Қай уақытта" : "Қашан аласың"}</h2>
      <div className={`${s.chips} rise`} style={{ ["--i" as string]: 3 }}>
        {times.map((t) => <button key={t} className={`${s.chip} ${time === t ? s.on : ""}`} onClick={() => { if (time !== t) { haptic.select(); setTime(t); } }}>{t === "now" ? "Қазір · ≈15 мин" : t}</button>)}
      </div>

      <p className={`${s.quote} rise`} style={{ ["--i" as string]: 4 }}>
        {hair
          ? "Таңдаған уақытта салонға кел, шеберге QR-ды көрсет. Жазылуды 3 сағат бұрын тегін ауыстыруға болады."
          : "Ақша төленбейді: пакеттен 1 бірлік шегеріледі. Тапсырысты өзің аласың — кассирге «Jazl, тапсырыс нөмірі» және 4 таңбалы кодты айт. Қаласаң, курьер жалдап, жеткенде кодты айтқыз."}
        <i>”</i>
      </p>

      {picking && (
        <div className={s.root}>
          <div className={s.scrim} onClick={() => { haptic.soft(); setPicking(false); }} />
          <div className={s.sheet}>
            <span className={s.grabber} />
            <h2 className={s.sheetTitle}>Филиал таңда</h2>
            {list.map((x) => (
              <button key={x.id} className={`${s.bRow} ${branch === x.id ? s.bOn : ""}`} disabled={!x.open} onClick={() => { haptic.select(); setBranch(x.id); setTimeout(() => setPicking(false), 180); }}>
                <span className={s.packText}><b>{x.address}</b><small>Бүгін {x.hours} • <span className={x.open ? s.green : s.red}>{x.open ? "ашық" : "уақытша жабық"}</span></small></span>
                <span className={s.km}>{x.km.toFixed(1).replace(".", ",")} км</span>
                <span className={s.radio} />
              </button>
            ))}
          </div>
        </div>
      )}

      {sending && (
        <div className={s.root}>
          <div className={s.scrim} />
          <div className={`${s.sheet} ${s.sendSheet}`}>
            <span className={s.ring} />
            <h2 className={s.sheetTitle}>{hair ? "Жазылу жіберілуде" : "Тапсырыс мекемеге жіберілуде"}</h2>
            <p className={s.sendText}>Қолданбаны жаппай күте тұр.</p>
          </div>
        </div>
      )}

      {!inTelegram && !picking && <div className={s.bar}><button className={s.btn} disabled={sending} onClick={send.onClick}>{sending ? "Жіберілуде…" : send.text}</button></div>}
    </SubPage>
  );
}
