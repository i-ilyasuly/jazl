// Figma: «PIN / 1 PIN ойлап тап», «2 PIN қайтала», «3 Қолданба құлыпталған», «4 Қате код», «5 Биометрия сұрауы»,
// «6 PIN өзгерту: ағымдағы код», «7 Кодтар сәйкес келмеді» (13886:38955…39071, 14084:12765, 14084:12867)
// unlock — қолданба құлпы (Shell үстінде ашылады); биометрия сұрауы — Telegram-ның нативті BiometricManager терезесі.
// Режимдер: create — жаңа PIN (екі рет енгізу); change — алдымен ескі PIN, содан кейін жаңасы;
// pay — төлемді растау (Figma «10»: «PIN: төлемді растау» 13907:7998): дұрыс PIN-нен кейін бірлік шегеріледі.
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useGo } from "../nav";
import { checkPin, markPinOk, pinServer, pinServerBio, redeem, removePin, savePin, setSettings, unlockApp, useSettings } from "../store";
import { openScanner } from "../scanFlow";
import { biometricAuth, haptic, inTelegram, tg, useBackButton, useHideNativeButtons } from "../telegram";
import { Sticker, preloadSticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import finger from "../assets/icons/keyLeft.svg";
import erase from "../assets/icons/keyRight.svg";
import s from "./Pin.module.css";

type Step = "old" | "new" | "repeat";
const titles: Record<Step, string> = { old: "Ағымдағы PIN-кодты енгіз", new: "PIN-код ойлап тап", repeat: "PIN-ді қайтала" };
const hints: Record<Step, string> = { old: "PIN енгіз немесе саусақ ізін қолдан", new: "4 таңбалы код енгіз", repeat: "Сол кодты тағы бір рет енгіз" };
const MAX_TRIES = 3;

const LOCK_WAIT = 30;

export function Pin({ lock }: { lock?: boolean } = {}) {
  const go = useGo();
  const st = useSettings();
  const param = useParams().mode;
  const mode = lock ? "unlock" : param;
  const unlocking = mode === "unlock";
  const change = mode === "change";
  const paying = mode === "pay";
  const scanning = mode === "scan"; // Патша (2026-11-17): PIN сканерлеуден бұрын
  const turningOff = mode === "off"; // құлыпты өшіру: PIN-мен расталады
  const confirming = mode === "confirm"; // тапсырыс/жоспар алдындағы растау: сәтті болса — артқа, батырманы қайта басады
  const locState = useLocation().state as { packId?: string; sum?: string } | null;
  const payInfo = paying ? locState : null;
  const [step, setStep] = useState<Step>(change || paying || unlocking || scanning || confirming || turningOff ? "old" : "new");
  const [wait, setWait] = useState(0);
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [old, setOld] = useState(""); // PIN ауыстырғанда ескісі (сервер ескісін сұрайды)
  const [error, setError] = useState("");
  const [tries, setTries] = useState(MAX_TRIES);
  const [shake, setShake] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void preloadSticker("lock").catch(() => null); }, []); // орнатылды көрінісі кешікпесін
  // Құлып экранында «Жабу» — Mini App-ты жабады (артқа өтуге болмайды)
  const back = useCallback(() => { if (unlocking) { if (inTelegram) tg?.close?.(); return; } go(-1, "back"); }, [go, unlocking]);
  useBackButton(back, !unlocking);
  useHideNativeButtons(unlocking); // құлып экранында астыңғы беттің батырмалары көрінбейді
  useEffect(() => { if (!wait) return; const t = setTimeout(() => { if (wait === 1) { setTries(MAX_TRIES); setError(""); } setWait(wait - 1); }, 1000); return () => clearTimeout(t); }, [wait]);
  // Құлып ашылғанда биометрия бірден сұралады (Figma «5 Биометрия сұрауы»)
  useEffect(() => { if (unlocking && st.bio) void biometricAuth("Squirrel қолданбасын ашу").then((r) => { if (r === "ok") { haptic.success(); unlockApp(); } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = useCallback((msg: string) => { haptic.error(); setError(msg); setShake((n) => n + 1); setTimeout(() => setCode(""), 420); }, []);
  const next = useCallback((to: Step) => { haptic.rigid(); setTimeout(() => { setCode(""); setError(""); setStep(to); }, 180); }, []);

  useEffect(() => {
    if (code.length < 4) return;
    if (step === "old") {
      // Аудит 2026-11-21: дұрыс PIN-нен кейін сервер токені алынады (бірлік жұмсауды сервер де тексереді)
      const okServer = checkPin(code) ? pinServer(code) : null;
      if (okServer && turningOff) { haptic.success(); void removePin(code).then(() => { setSettings({ lock: false, bio: false }); go(-1, "back"); }); }
      else if (okServer && unlocking) { haptic.success(); setTimeout(unlockApp, 200); }
      else if (okServer && confirming) { haptic.success(); markPinOk(); void okServer.then(() => go(-1, "back")); }
      else if (okServer && scanning) { haptic.success(); markPinOk(); void okServer.then(() => openScanner(go, locState?.packId, true)); }
      else if (okServer && paying) { haptic.success(); void okServer.then(() => { if (payInfo?.packId && redeem(payInfo.packId)) go("/paid/" + payInfo.packId, "up", { replace: true }); else back(); }); }
      else if (okServer) { setOld(code); next("new"); }
      else if (tries > 1) { setTries(tries - 1); fail(`Қате код. ${tries - 1} әрекет қалды`); }
      else if (unlocking) { fail(`Тым көп қате әрекет. ${LOCK_WAIT} секундтан кейін қайтала`); setWait(LOCK_WAIT); }
      else { fail("Тым көп қате әрекет. Кейінірек қайталап көр"); setTimeout(() => (paying ? go("/scan/state/limit", "up", { replace: true }) : back()), 1400); }
    } else if (step === "new") { setFirst(code); next("repeat"); }
    else if (code === first) {
      haptic.success(); savePin(code, old || undefined); setSettings({ lock: true }); setSaved(true);
      setTimeout(async () => {
        // PIN қойылған соң биометрияны да қосуды ұсынамыз (екеуі бірге жұмыс істейді)
        if (!st.bio && (await biometricAuth("Squirrel төлемдерін биометриямен растау")) === "ok") setSettings({ bio: true });
        back();
      }, 1600); // «PIN орнатылды» көрінісі (құлыпты үйрек) бір сәт тұрады
    } else { fail("Кодтар сәйкес келмеді. Қайта ойлап тап"); setTimeout(() => { setStep("new"); setFirst(""); }, 420); }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (d: string) => { if (code.length >= 4 || wait) return; haptic.tap(); setError(""); setCode(code + d); };
  const del = () => { if (!code) return; haptic.soft(); setCode(code.slice(0, -1)); };
  const bio = async () => { if (step !== "old" || !st.bio || wait) return; if ((await biometricAuth(unlocking ? "Squirrel қолданбасын ашу" : scanning ? "Сканерлеуді растау" : paying ? "Төлемді растау" : "PIN-кодты өзгерту")) !== "ok") return; await pinServerBio(); if (unlocking) { haptic.success(); unlockApp(); } else if (scanning) { haptic.success(); markPinOk(); openScanner(go, locState?.packId, true); } else if (confirming) { haptic.success(); markPinOk(); go(-1, "back"); } else if (paying) { if (payInfo?.packId && redeem(payInfo.packId)) go("/paid/" + payInfo.packId, "up", { replace: true }); } else next("new"); };

  // Нақты пернетақтадан да теруге болады (десктоп Telegram)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") del(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`${s.page} ${unlocking ? s.lock : ""}`}>
      <TelegramChrome mode="close" onBack={back} />
      {saved && (
        <div className={s.saved}>
          <Sticker name="lock" size={140} />
          <h2 className={s.savedTitle}>PIN орнатылды</h2>
          <p className="t-sub2">Енді әр төлем PIN-мен расталады</p>
        </div>
      )}
      {/* Figma: «PIN / 3 Қолданба құлыпталған» — сейф ұстаған үйрек, «4 Қате код» — ойланған үйрек (146,96 120×120) */}
      {step === "old" && <Sticker key={error ? "think" : "lock"} name={error ? "think" : "lock"} className={s.sticker} />}
      <h1 key={step} className={s.title}>{unlocking ? "Қолданба құлыпталған" : scanning || confirming ? "Растаңыз" : paying ? "Төлемді растаңыз" : titles[step]}</h1>
      <div key={shake} className={`${s.boxes} ${shake ? s.shake : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`${s.box} ${i === code.length && !error ? s.active : ""}`}>{i < code.length && <i className={error ? s.bad : ""} />}</span>
        ))}
      </div>
      <p className={`t-sub2 ${s.hint} ${error || wait ? s.err : ""}`}>{(wait ? `Тым көп қате әрекет. ${wait} секундтан кейін қайтала` : error) || (scanning ? "QR сканерлеу үшін PIN енгіз" : confirming ? "Бірлікті жұмсау үшін PIN енгіз" : paying ? "Төлемді растау үшін PIN енгіз" : step === "old" && !st.bio ? "PIN енгіз" : hints[step])}</p>
      {paying && payInfo?.sum && <p className={s.sum}>{payInfo.sum}</p>}
      <div className={s.keys}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} className={s.key} onClick={() => press(d)}>{d}</button>)}
        <button className={`${s.key} ${step !== "old" || !st.bio ? s.off : ""}`} onClick={bio} aria-label="Биометрия"><img src={finger} width={116} height={56} alt="" /></button>
        <button className={s.key} onClick={() => press("0")}>0</button>
        <button className={s.key} onClick={del} aria-label="Өшіру"><img src={erase} width={116} height={56} alt="" /></button>
      </div>
    </div>
  );
}
