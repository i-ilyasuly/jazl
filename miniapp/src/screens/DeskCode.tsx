// C2 · Кодты тексеру: клиент айтқан 4 таңбалы кодты кассир енгізеді → тапсырыс «берілді» (done) болады, клиенттің чегі жаңарады.
// Өз пернетақтасы: жүйелік пернетақта экранды жауып тастамайды, үлкен батырмалар — асығыс кассаға ыңғайлы.
import { useCallback, useState } from "react";
import { useGo } from "../nav";
import { desk, err } from "../desk";
import { haptic, inTelegram, useBottomButtons } from "../telegram";
import { SubPage } from "../ui/SubPage";
import s from "./Desk.module.css";

type Result = { no: number; title: string; customer: string; type: "now" | "plan" };

export function DeskCode() {
  const go = useGo();
  const [code, setCode] = useState("");
  const [bad, setBad] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<Result | null>(null);

  const check = useCallback(async (c: string) => {
    if (c.length !== 4 || busy) return;
    setBusy(true); haptic.medium();
    try { const r = await desk.verify(c); haptic.success(); setOk(r); }
    catch (e) {
      haptic.error(); setShake((x) => x + 1);
      const k = err(e);
      setBad(k === "code_not_found" ? "Мұндай код жоқ не тапсырыс бұрын берілген" : k === "not_staff" ? "Мекеме қызметкері емессіз" : "Желі қатесі — қайталаңыз");
      setCode("");
    } finally { setBusy(false); }
  }, [busy]);

  const press = (d: string) => {
    if (busy) return;
    haptic.select(); setBad("");
    if (d === "del") return setCode((c) => c.slice(0, -1));
    const n = (code + d).slice(0, 4);
    setCode(n);
    if (n.length === 4) void check(n); // 4-ші сан енгізілгенде бірден тексереміз
  };
  const again = useCallback(() => { haptic.tap(); setOk(null); setCode(""); }, []);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBottomButtons(ok ? { text: "Келесі код", shine: true, onClick: again } : { text: busy ? "Тексерілуде…" : "Тексеру", disabled: code.length !== 4 || busy, onClick: () => void check(code) },
    ok ? { text: "Кассаға", position: "left", onClick: back } : undefined);

  return (
    <SubPage title="Кодты тексеру">
      <p className={`t-sub1 ${s.hint} rise`}>Клиенттен тапсырыстың 4 таңбалы кодын сұраңыз</p>
      <div key={shake} className={`${s.codeBoxes} ${shake ? s.shake : ""}`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={`${s.codeBox} ${i === code.length ? s.codeBoxOn : ""}`}>{code[i] ?? ""}</span>)}
        <input className={s.codeInput} inputMode="numeric" autoComplete="one-time-code" aria-label="Код" value={code} maxLength={4}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setCode(v); setBad(""); if (v.length === 4) void check(v); }} />
      </div>
      <p className={`t-sub2 ${s.codeErr}`}>{bad}</p>
      <div className={s.keys}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} className={s.key} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button className={s.key} onClick={() => press("0")}>0</button>
        <button className={`${s.key} ${s.keyGhost}`} onClick={() => press("del")} aria-label="Өшіру">⌫</button>
      </div>
      {!inTelegram && <button className={s.btn} style={{ marginTop: 8 }} disabled={code.length !== 4 || busy} onClick={() => void check(code)}>Тексеру</button>}

      {ok && (
        <div className={s.done} role="status">
          <span className={s.doneMark}>✓</span>
          <h2 className={s.doneTitle}>Беріңіз!</h2>
          <span className={s.doneBig}>№{ok.no}</span>
          <p className={`t-sub1 ${s.doneSub}`}>{ok.title}<br />{ok.customer} · {ok.type === "plan" ? "жоспар" : "тапсырыс"}</p>
          {!inTelegram && <div className={s.doneBtns}><button className={s.btn} onClick={again}>Келесі код</button></div>}
        </div>
      )}
    </SubPage>
  );
}
