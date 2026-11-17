// Figma «01 · Кіру және қауіпсіздік» (14062:9692): Кіру, Рұқсат жоқ, PIN енгізу / қате / бұғатталды.
import { useCallback, useEffect, useState } from "react";
import { useGo } from "../nav";
import { copyText, haptic, inTelegram, tg } from "../telegram";
import { Buttons, VPage, VSticker } from "../venue/ui";
import { hasToken, me, pinLogin, setToken, type Me } from "./api";
import { PinPad, pinError } from "./ui";
import v from "../venue/V.module.css";
import s from "./A.module.css";

/** /a — кім екенін тексеріп, тиісті бетке жібереді */
export function AGate() {
  const go = useGo();
  const [m, setM] = useState<Me | null | "err">(null);
  useEffect(() => { me().then(setM).catch(() => setM("err")); }, []);
  useEffect(() => {
    if (!m || m === "err" || !m.admin) return;
    if (!m.hasPin) go("/a/pin/setup", "fade", { replace: true });
    else if (m.session && hasToken()) go("/a/pulse", "fade", { replace: true });
  }, [m, go]);
  if (m === null) return <VPage><div className={v.state}><VSticker name="wait" size={100} /></div></VPage>;
  if (m === "err" || !m.admin) return <ANoAccess id={m === "err" ? null : m.telegramId} />;
  if (!m.hasPin || (m.session && hasToken())) return <VPage><div className={v.state}><VSticker name="wait" size={100} /></div></VPage>;
  return <AWelcome name={m.name ?? ""} />;
}

/** Figma «Кіру»: hello стикері 120, «Қош келдіңіз, Исахан», «Жалғастыру» */
function AWelcome({ name }: { name: string }) {
  const go = useGo();
  return (
    <VPage>
      <div className={v.state} style={{ top: "calc(300px + var(--top-shift))" }}>
        <VSticker name="hello" size={120} />
        <h2 className={v.stateTitle}>Қош келдіңіз, {name}</h2>
        <p className={v.stateText}>Jazl+ Басқару тек рұқсат тізіміндегі Telegram аккаунттарына ашылады. Аккаунтыңыз расталды.</p>
      </div>
      <Buttons main={{ text: "Жалғастыру", onClick: () => go("/a/pin", "fade") }} />
    </VPage>
  );
}

/** Figma «Рұқсат жоқ»: stop стикері; Telegram ID көрсетіледі — ADMIN_IDS-ке қосу үшін (Патша көшіріп алады) */
export function ANoAccess({ id }: { id: number | null }) {
  const go = useGo();
  const close = () => (inTelegram ? go("/profile", "fade") : tg?.close?.());
  return (
    <VPage>
      <div className={v.state} style={{ top: "calc(280px + var(--top-shift))" }}>
        <VSticker name="stop" size={120} />
        <h2 className={v.stateTitle}>Бұл бет сізге ашық емес</h2>
        <p className={v.stateText}>Telegram аккаунтыңыз рұқсат тізімінде жоқ. Қате деп ойласаңыз, платформа иесіне жазыңыз.</p>
        {id && <button className={s.idBox} style={{ marginTop: 16 }} onClick={() => { void copyText(String(id)); haptic.success(); }}>Telegram ID: {id} <span style={{ color: "var(--link)", fontWeight: 500 }}>көшіру</span></button>}
      </div>
      <Buttons main={{ text: "Жабу", onClick: close }} />
    </VPage>
  );
}

/** Figma «PIN енгізу» / «PIN қате» / «PIN бұғатталды»; /a/pin/setup — алғаш орнату (екі рет енгізу) */
export function APin({ setup }: { setup?: boolean }) {
  const go = useGo();
  const [first, setFirst] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const done = useCallback(async (pin: string) => {
    if (setup && !first) { setFirst(pin); setMsg(null); return "again"; }
    if (setup && pin !== first) { setFirst(""); setMsg("Кодтар сәйкес келмеді. Қайта ойлап табыңыз"); return "mismatch"; }
    try {
      const r = await pinLogin(pin, setup);
      setToken(r.token); haptic.success();
      go("/a/pulse", "fade", { replace: true });
      return null;
    } catch (e) {
      const b = (e as { body?: { error?: string } }).body;
      if (b?.error === "weak_pin") { setFirst(""); setMsg("Тым оңай код. Басқасын ойлап табыңыз"); return "weak"; }
      if (b?.error === "locked") setLocked(true);
      const m = pinError(e); setMsg(m); return m;
    }
  }, [setup, first, go]);
  const title = locked ? "PIN бұғатталды" : setup ? (first ? "PIN-ді қайталаңыз" : "PIN-код ойлап табыңыз") : msg ? "Қате PIN" : "PIN-кодты енгізіңіз";
  const text = locked ? msg ?? "15 минуттан кейін қайталаңыз" : msg ?? (setup ? "Басқару беті мен қауіпті әрекеттерді растау үшін" : "Басқару бетіне кіру үшін");
  return (
    <VPage>
      <div className={s.pinWrap} style={{ paddingTop: 24 }}>
        <VSticker name={locked ? "stop" : msg ? "think" : "lock"} size={100} />
        <h1 className={s.pinTitle}>{title}</h1>
        <p className={`${s.pinText} ${msg ? s.pinErr : ""}`}>{text}</p>
        {/* алғашқы кіруде (setup) екінші енгізу — кілт ауысқанда нүктелер тазарады */}
        <PinPad key={setup ? first || "a" : "p"} disabled={locked} onDone={done} />
      </div>
    </VPage>
  );
}
