// C2 · Кассаның QR-ы. Кассир дана санын қояды → QR 30 секунд жарамды, өзі жаңарады (суретке түсіріп кейін қолдану мүмкін емес).
// Клиент сканерлеп растаса — экран бірден жасылға ауысады: «Айгерім · 2 дана қолданды» (сервер әр 2,5 с тексеріледі).
// Қате болса 10 минут ішінде «Қайтару» — бірліктер клиенттің пакетіне оралады.
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useGo } from "../nav";
import { currentStaff, desk, err, useStaff, type DeskUse } from "../desk";
import { haptic, inTelegram, nativePick, useBottomButtons } from "../telegram";
import { SubPage } from "../ui/SubPage";
import s from "./Desk.module.css";

export function DeskQr() {
  const go = useGo();
  useStaff();
  const me = currentStaff();
  const [branch, setBranch] = useState(me?.branchId ?? me?.branches[0]?.id ?? "");
  const [units, setUnits] = useState(1);
  const [svg, setSvg] = useState("");
  const [exp, setExp] = useState(0);
  const [ttl, setTtl] = useState(30);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [fail, setFail] = useState("");
  const [done, setDone] = useState<DeskUse | null>(null);
  const [round, setRound] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { if (!branch && me?.branches[0]) setBranch(me.branches[0].id); }, [me, branch]);

  // QR: дана/филиал өзгергенде не мерзімі біткенде жаңасы
  useEffect(() => {
    if (!branch || done) return;
    let dead = false; let timer = 0;
    const load = async () => {
      try {
        const r = await desk.qr(branch, units);
        if (dead) return;
        setFail(""); setExp(r.exp); setTtl(r.ttl || 30);
        setSvg(await QRCode.toString(r.payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111a26", light: "#ffffff" } }));
        timer = window.setTimeout(load, Math.max(1000, (r.exp - Date.now() / 1000) * 1000));
      } catch (e) { if (!dead) { setFail(err(e)); timer = window.setTimeout(load, 4000); } }
    };
    const debounce = window.setTimeout(load, 180); // «+» бірнеше рет басылса — бір сұрау
    return () => { dead = true; clearTimeout(timer); clearTimeout(debounce); };
  }, [branch, units, done, round]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now() / 1000), 500); return () => clearInterval(t); }, []);

  // Клиенттің растауын күту: осы филиалдағы жаңа қолдану пайда болса — сәтті экран
  useEffect(() => {
    if (!branch || done) return;
    let dead = false;
    const poll = async () => {
      try {
        const list = (await desk.uses()).filter((u) => u.branchId === branch && !u.cancelled);
        if (dead) return;
        if (seen.current === null) { seen.current = new Set(list.map((u) => u.id)); return; }
        const fresh = list.find((u) => !seen.current!.has(u.id));
        list.forEach((u) => seen.current!.add(u.id));
        if (fresh) { haptic.success(); setDone(fresh); }
      } catch { /* желі — келесі айналымда */ }
    };
    void poll();
    const t = window.setInterval(poll, 2500);
    return () => { dead = true; clearInterval(t); };
  }, [branch, done]);

  const next = useCallback(() => { haptic.medium(); setDone(null); setUnits(1); setSvg(""); setRound((x) => x + 1); }, []);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBottomButtons(done ? { text: "Келесі клиент", shine: true, onClick: next } : { text: "Дайын", onClick: back }, done ? { text: "Кассаға", position: "left", onClick: back } : undefined, Boolean(me));

  async function refund(u: DeskUse) {
    const id = await nativePick("Қайтару?", `${u.customer}: ${u.units} дана пакетіне қайтарылады. Тек қате болса.`, [{ id: "no", text: "Жоқ" }, { id: "ok", text: "Қайтару" }], "ok");
    if (id !== "ok") return;
    try { await desk.cancelUse(u.id); haptic.success(); setDone({ ...u, cancelled: true }); } catch { haptic.error(); }
  }

  if (!me) return <SubPage title="Касса QR"><div className={s.empty}>Мекеме бөліміне кіру рұқсаты жоқ.</div></SubPage>;
  const left = Math.max(0, Math.ceil(exp - now));
  const low = left <= 5;
  const addr = me.branches.find((b) => b.id === branch)?.address ?? "";

  return (
    <SubPage title="Касса QR">
      {me.branches.length > 1 && (
        <div className={s.chips}>
          {me.branches.map((b) => <button key={b.id} className={`${s.chip} ${b.id === branch ? s.chipOn : ""}`} onClick={() => { haptic.select(); seen.current = null; setBranch(b.id); }}>{b.address}</button>)}
        </div>
      )}
      <div className={`${s.qrWrap} rise`}>
        <div className={s.stepper}>
          <button className={s.step} disabled={units <= 1} onClick={() => { haptic.select(); setUnits((u) => Math.max(1, u - 1)); }} aria-label="Азайту">−</button>
          <span className={s.stepVal}>{units}<small>дана</small></span>
          <button className={s.step} disabled={units >= 20} onClick={() => { haptic.select(); setUnits((u) => Math.min(20, u + 1)); }} aria-label="Көбейту">+</button>
        </div>
        <div className={`${s.qrBox} ${!svg || left === 0 ? s.qrFade : ""}`}><span dangerouslySetInnerHTML={{ __html: svg }} /></div>
        {fail ? <span className={`t-sub2 ${s.timer} ${s.timerLow}`}>{fail === "network" ? "Желі жоқ — қайта қосылуда…" : "QR жасалмады: " + fail}</span> : (
          <span className={`t-sub2 ${s.timer} ${low ? s.timerLow : ""}`}>
            <span className={s.bar}><i style={{ width: `${Math.min(100, (left / ttl) * 100)}%` }} /></span>{left} с
          </span>
        )}
        <p className={`t-sub2 ${s.hint}`}>Клиент Jazl+ → «Сканер» арқылы оқиды да, растайды. Ақша көрсетілмейді — тек дана.{addr ? ` · ${addr}` : ""}</p>
      </div>

      {done && (
        <div className={s.done} role="status">
          <span className={`${s.doneMark} ${done.cancelled ? s.bad : ""}`}>{done.cancelled ? "↩" : "✓"}</span>
          <span className={s.doneBig}>{done.units} дана</span>
          <h2 className={s.doneTitle}>{done.cancelled ? "Қайтарылды" : "Қолданылды"}</h2>
          <p className={`t-sub1 ${s.doneSub}`}>{done.customer}{done.username ? " · @" + done.username : ""}<br />{done.title}</p>
          <div className={s.doneBtns}>
            {!inTelegram && <button className={s.btn} onClick={next}>Келесі клиент</button>}
            {!done.cancelled && <button className={`${s.btn} ${s.btnDanger}`} onClick={() => void refund(done)}>Қате болды — қайтару</button>}
          </div>
        </div>
      )}
    </SubPage>
  );
}
