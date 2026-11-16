// Figma, «01 · Кіру және таныстыру»: «Жүктелу / Бастапқы экран» 13886:14677, «Бірінші ашу / Onboarding» 13886:14713,
// «Тіл таңдау» 13940:7998, «Қала таңдау» 13940:8029, «Шарттармен келісу» 13940:8073
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useGo } from "../nav";
import { finishOnboarding, setSettings, useSettings } from "../store";
import { haptic, inTelegram, nativeAlert, useBottomButtons } from "../telegram";
import { HowSheet } from "../ui/HowSheet";
import { MainBar } from "../ui/MainBar";
import { Sticker } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import spin from "../assets/icons/splashSpin.svg";
import arrow from "../assets/icons/docArrow.svg";
import s from "./Welcome.module.css";

export function Splash() {
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" />
      <span className={s.logo} />
      <h1 className={s.brand}>Jazl+</h1>
      <p className={`t-sub2 ${s.tagline}`}>Күнделікті шығыс, үнем болып</p>
      <img src={spin} width={32} height={32} className={s.spin} alt="" />
    </div>
  );
}

// Эмодзи ұяшықтарының торы: 4 қатар, қадамы 74, қатарлар кезекпен ығысқан. Қатарлар баяу қарама-қарсы жылжиды.
const colors = [["#fbe4de", "#f3ead8", "#e3ecf7", "#e9e9ec", "#f6eedb", "#e4f0e4", "#ece7f6"], ["#e9e9ec", "#f6eedb", "#e4f0e4", "#ece7f6", "#fbe4de", "#f3ead8", "#e3ecf7"], ["#ece7f6", "#fbe4de", "#f3ead8", "#e3ecf7", "#e9e9ec", "#f6eedb", "#e4f0e4"], ["#e3ecf7", "#e9e9ec", "#f6eedb", "#e4f0e4", "#ece7f6", "#fbe4de", "#f3ead8"]];
const perks = [["#f3ead8", "Пакетті алдын ала ал", "4–12 бірлік жеңілдікпен, бір төлеммен"], ["#e9e9ec", "Кассирде сканерле", "Кассирге «Jazl бойынша» дегенің жеткілікті"], ["#e4f0e4", "Қалғанын бақыла", "Мерзімі мен бірліктер әрдайым көз алдыңда"]];

export function Welcome() {
  const go = useGo();
  const [how, setHow] = useState(false);
  const start = useMemo(() => ({ text: "Бастау", onClick: () => go("/welcome/lang") }), [go]);
  const more = useMemo(() => ({ text: "Қалай жұмыс істейді?", onClick: () => { haptic.tap(); setHow(true); }, position: "bottom" as const }), []);
  useBottomButtons(start, more, !how);
  return (
    <div className={s.page}>
      <div className={s.grid} aria-hidden>
        {colors.map((row, r) => (
          <div key={r} className={`${s.gridRow} ${r % 2 ? s.rev : ""}`} style={{ top: 12 + r * 74, left: r % 2 ? 3 - 518 : -34 }}>
            {[...row, ...row].map((c, i) => <span key={i} style={{ background: c }} />)}
          </div>
        ))}
      </div>
      <span className={s.fadeBottom} /><span className={s.fadeTop} />
      <TelegramChrome mode="close" />
      {/* Figma: «Стикер орны (duck TGS)» 131,226 150×150 — жұмыртқадан шыққан балапан */}
      <Sticker name="egg" size={150} className={s.sticker} />
      <h1 className={s.h1}>Күнделікті шығыныңды үнемге айналдыр</h1>
      <p className={`t-sub2 ${s.lead}`}>
        <span>Кофе,</span><span>тағам,</span><span>шаштараз:</span>
        <span className={s.nogap}><b className={s.blue}>пакетті алдын ала ал</b>,</span><span>мекемеде</span>
        <b className={s.green}>сканерлеп</b><span>қолдан</span>
      </p>
      <div className={s.perks}>
        {perks.map(([bg, t, sub], i) => (
          <div key={t} className={s.perk} style={{ ["--i" as string]: i }}>
            <span className={s.slot} style={{ background: bg }} />
            <div><p className="t-sub2 w-600">{t}</p><p className={`t-cap1 ${s.perkSub}`}>{sub}</p></div>
          </div>
        ))}
      </div>
      {!inTelegram && <>
        <button className={`${s.btn} ${s.main}`} onClick={start.onClick}>Бастау</button>
        <button className={`${s.btn} ${s.second}`} onClick={more.onClick}>Қалай жұмыс істейді?</button>
      </>}
      {how && <HowSheet onClose={() => setHow(false)} />}
    </div>
  );
}

function Step({ title, sub, children, button, onNext }: { title: string; sub: string; children: ReactNode; button: string; onNext: () => void }) {
  const go = useGo();
  // Figma-да бұл қадамдарда «Жабу» тұр: Telegram-да нативті жабу батырмасы қалады, артқа қайту жоқ
  const back = useCallback(() => go(-1, "back"), [go]);
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={back} />
      <div className={s.step}>
        <div className="rise"><h1 className={s.stepTitle}>{title}</h1><p className={`t-sub1 ${s.stepSub}`}>{sub}</p></div>
        {children}
      </div>
      <MainBar text={button} onClick={onNext} />
    </div>
  );
}

function Choice({ title, sub, on, dim, onClick }: { title: string; sub?: string; on: boolean; dim?: boolean; onClick: () => void }) {
  return (
    <button className={`${s.row} ${sub ? s.rowTall : ""}`} onClick={onClick}>
      <span className={`${s.rowText} ${dim ? s.dim : ""}`}><span>{title}</span>{sub && <small className="t-cap1">{sub}</small>}</span>
      <span className={`${s.radio} ${on ? s.radioOn : ""}`} />
    </button>
  );
}

export function WelcomeLang() {
  const go = useGo();
  const st = useSettings();
  const next = useCallback(() => go("/welcome/city"), [go]);
  return (
    <Step title="Тілді таңда" sub="Кейін профильде өзгертуге болады" button="Жалғастыру" onNext={next}>
      <div className={`${s.group} rise`} style={{ ["--i" as string]: 1 }}>
        <Choice title="Қазақша" on={st.lang !== "ru"} onClick={() => { haptic.select(); setSettings({ lang: "kk" }); }} />
        {/* Орыс тілі кейін қосылады */}
        <Choice title="Русский" on={false} onClick={() => { haptic.tap(); nativeAlert("Орыс тілі жуырда қосылады."); }} />
      </div>
    </Step>
  );
}

export function WelcomeCity() {
  const go = useGo();
  const next = useCallback(() => go("/welcome/terms"), [go]);
  const soon = () => { haptic.tap(); nativeAlert("Бұл қала жуырда ашылады."); };
  return (
    <Step title="Қала таңда" sub="Ұсыныстар таңдалған қала бойынша көрсетіледі" button="Жалғастыру" onNext={next}>
      <div className={`${s.group} rise`} style={{ ["--i" as string]: 1 }}>
        <Choice title="Қарағанды" on onClick={() => haptic.select()} />
        <Choice title="Астана" sub="жуырда" dim on={false} onClick={soon} />
        <Choice title="Алматы" sub="жуырда" dim on={false} onClick={soon} />
      </div>
      <div className={`${s.quote} infoBox rise`} style={{ ["--i" as string]: 2 }}><span className={s.bar} /><p className="t-sub2">Басқа қалалар ашылғанда хабарлаймыз.</p><span className={s.mark} aria-hidden>”</span></div>
    </Step>
  );
}

const docs = [["Қолдану шарттары", "terms"], ["Құпиялылық саясаты", "privacy"], ["Көшіру ережесі", "carry"]];
export function WelcomeTerms() {
  const go = useGo();
  const [agree, setAgree] = useState(false);
  const [bad, setBad] = useState(0);
  const next = useCallback(() => {
    if (!agree) { haptic.error(); setBad((n) => n + 1); return; }
    haptic.success(); finishOnboarding(); go("/", "fade", { replace: true });
  }, [agree, go]);
  return (
    <Step title="Бастау алдында" sub="Шарттармен танысып, келіс" button="Келісемін және бастау" onNext={next}>
      <div className={`${s.group} rise`} style={{ ["--i" as string]: 1 }}>
        {docs.map(([t, id]) => <button key={id} className={s.row} onClick={() => go(id === "carry" ? "/rules/carry" : "/welcome/doc/" + id)}><span className={s.rowText}><span>{t}</span></span><img src={arrow} width={18} height={18} alt="" /></button>)}
      </div>
      <button key={bad} className={`${s.agree} ${bad && !agree ? s.shake : ""} rise`} style={{ ["--i" as string]: 2 }} onClick={() => { haptic.select(); setAgree(!agree); }} role="checkbox" aria-checked={agree}>
        <span className={`${s.box} ${agree ? s.boxOn : ""}`}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7.33325 12.3333L10.3333 15.3333L16.6666 8.66663" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span>Шарттармен келісемін</span>
      </button>
    </Step>
  );
}
