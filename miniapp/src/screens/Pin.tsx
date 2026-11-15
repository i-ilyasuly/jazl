// Figma: «PIN / 1 PIN ойлап тап», «2 PIN қайтала», «4 Қате код» (13886:38955, 13886:38983, 13886:39041)
// Режимдер: create — жаңа PIN (екі рет енгізу); change — алдымен ескі PIN, содан кейін жаңасы.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { checkPin, savePin, setSettings, useSettings } from "../store";
import { biometricAuth, haptic, useBackButton } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import finger from "../assets/icons/keyLeft.svg";
import erase from "../assets/icons/keyRight.svg";
import s from "./Pin.module.css";

type Step = "old" | "new" | "repeat";
const titles: Record<Step, string> = { old: "Ағымдағы PIN-кодты енгіз", new: "PIN-код ойлап тап", repeat: "PIN-ді қайтала" };
const hints: Record<Step, string> = { old: "PIN енгіз немесе саусақ ізін қолдан", new: "4 таңбалы код енгіз", repeat: "Сол кодты тағы бір рет енгіз" };
const MAX_TRIES = 3;

export function Pin() {
  const go = useGo();
  const st = useSettings();
  const change = useParams().mode === "change";
  const [step, setStep] = useState<Step>(change ? "old" : "new");
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(MAX_TRIES);
  const [shake, setShake] = useState(0);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);

  const fail = useCallback((msg: string) => { haptic.error(); setError(msg); setShake((n) => n + 1); setTimeout(() => setCode(""), 420); }, []);
  const next = useCallback((to: Step) => { haptic.rigid(); setTimeout(() => { setCode(""); setError(""); setStep(to); }, 180); }, []);

  useEffect(() => {
    if (code.length < 4) return;
    if (step === "old") {
      if (checkPin(code)) next("new");
      else if (tries > 1) { setTries(tries - 1); fail(`Қате код. ${tries - 1} әрекет қалды`); }
      else { fail("Тым көп қате әрекет. Кейінірек қайталап көр"); setTimeout(back, 1400); }
    } else if (step === "new") { setFirst(code); next("repeat"); }
    else if (code === first) {
      haptic.success(); savePin(code); setSettings({ lock: true });
      setTimeout(async () => {
        // PIN қойылған соң биометрияны да қосуды ұсынамыз (екеуі бірге жұмыс істейді)
        if (!st.bio && (await biometricAuth("Jazl+ төлемдерін биометриямен растау")) === "ok") setSettings({ bio: true });
        back();
      }, 350);
    } else { fail("Кодтар сәйкес келмеді. Қайта ойлап тап"); setTimeout(() => { setStep("new"); setFirst(""); }, 420); }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (d: string) => { if (code.length >= 4) return; haptic.tap(); setError(""); setCode(code + d); };
  const del = () => { if (!code) return; haptic.soft(); setCode(code.slice(0, -1)); };
  const bio = async () => { if (step !== "old" || !st.bio) return; if ((await biometricAuth("PIN-кодты өзгерту")) === "ok") next("new"); };

  // Нақты пернетақтадан да теруге болады (десктоп Telegram)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") del(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={back} />
      {/* Figma: «PIN / 3 Қолданба құлыпталған» — сейф ұстаған үйрек, «4 Қате код» — ойланған үйрек (146,96 120×120) */}
      {step === "old" && <Sticker key={error ? "think" : "lock"} name={error ? "think" : "lock"} className={s.sticker} />}
      <h1 key={step} className={s.title}>{titles[step]}</h1>
      <div key={shake} className={`${s.boxes} ${shake ? s.shake : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`${s.box} ${i === code.length && !error ? s.active : ""}`}>{i < code.length && <i className={error ? s.bad : ""} />}</span>
        ))}
      </div>
      <p className={`t-sub2 ${s.hint} ${error ? s.err : ""}`}>{error || (step === "old" && !st.bio ? "PIN енгіз" : hints[step])}</p>
      <div className={s.keys}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} className={s.key} onClick={() => press(d)}>{d}</button>)}
        <button className={`${s.key} ${step !== "old" || !st.bio ? s.off : ""}`} onClick={bio} aria-label="Биометрия"><img src={finger} width={116} height={56} alt="" /></button>
        <button className={s.key} onClick={() => press("0")}>0</button>
        <button className={s.key} onClick={del} aria-label="Өшіру"><img src={erase} width={116} height={56} alt="" /></button>
      </div>
    </div>
  );
}
