// Figma: «Үнем / Негізгі» (13886:36173)
import { Emo } from "../ui/Emo";
import { useEffect, useMemo, useState } from "react";
import { demoEmpty, useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { EmptyState } from "../ui/EmptyState";
import { Group, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./Savings.module.css";

const months = [["Маус", 52], ["Шіл", 64], ["Там", 47], ["Қыр", 78], ["Қаз", 93], ["Қар", 120]] as const;
const rows = [["Тауық донері", "3 рет пайдаланылды", "1 500 ₸"], ["Шаш қию", "2 рет пайдаланылды", "2 000 ₸"], ["Бургер комбо", "4 рет пайдаланылды", "2 000 ₸"], ["Латте", "5 рет пайдаланылды", "2 900 ₸"]];
const TOTAL = 8400;

// Сома 0-ден нақты мәнге дейін «санап» шығады
function useCountUp(to: number, run: boolean, ms = 700) {
  const [v, setV] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) return;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

export function Savings() {
  const { loading } = useMock("savings", true, 450);
  const total = useCountUp(TOTAL, !loading);
  const go = useGo();
  const toOffers = useMemo(() => ({ text: "Ұсыныстарды көру", onClick: () => go("/", "fade") }), [go]);
  if (demoEmpty()) return <SubPage title="Осы айдағы үнем"><EmptyState sticker="bags" title="Әзірге үнем жоқ" text="Алғашқы пакетті сатып алып, пайдалан, үнем осында көрінеді" action={toOffers} /></SubPage>;
  return (
    <SubPage title="Осы айдағы үнем">
      <div className={`${s.summary} rise`}>
        <p className="t-sub2">Қараша айында үнемдедің</p>
        {loading ? <span className="sk" style={{ display: "block", width: 150, height: 34, borderRadius: 10, margin: "6px 0" }} /> : <p className={s.amount}>{total.toLocaleString("ru-RU").replace(/ /g, " ")} ₸</p>}
        <span className={`t-cap1 ${s.chip}`}>+2 100 ₸ өткен айдан</span>
      </div>
      <div className={`${s.chart} rise`} style={{ ["--i" as string]: 1 }}>
        {months.map(([m, h], i) => (
          <div key={m} className={s.col}>
            <span className={`${s.bar} ${i === 5 ? s.now : ""} ${loading ? "sk" : ""}`} style={{ height: h, ["--i" as string]: i }} />
            <span className={`${s.month} ${i === 5 ? s.monthNow : ""}`}>{m}</span>
          </div>
        ))}
      </div>
      <Group header="Қараша бойынша" i={2}>
        {loading ? <SkRows n={4} /> : rows.map(([t, sub, v]) => (
          <Row key={t} title={t} sub={sub} left={<span className={s.circle}><Emo kind={/шаш/i.test(t) ? "hair" : /латте|кофе/i.test(t) ? "coffee" : "food"} size={30} /></span>} right={<span className={`t-text w-600 ${s.value}`}>{v}</span>} />
        ))}
      </Group>
      <p className={`t-cap1 ${s.note} rise`} style={{ ["--i" as string]: 3 }}>Үнем = бөлек баға мен пакет бағасының айырмасы × пайдаланылған бірлік саны.</p>
    </SubPage>
  );
}
