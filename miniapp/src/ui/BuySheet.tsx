// Figma «07 · Сатып алу және төлем»: «Сатып алу парағы» 13886:23425, «Төлем тәсілі / Тізім» 13886:23847,
// «Kaspi Pay нөмірі» 13886:24239, «Kaspi растауын күту» 13886:24623, «Баға өзгерді» 13940:8187.
// Бір парақтың ішінде қадамдар ауысады; төменгі батырмалар — Telegram-ның нативті MainButton/SecondaryButton.
import { Emo, kindPic } from "./Emo";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, saving, type Offer } from "../mocks/offers";
import { useGo } from "../nav";
import { setDefaultMethod, setKaspiPhone, useDefaultMethod, useKaspiPhone, useMethods } from "../store";
import { askPhone, haptic, inTelegram, openExternal, tg, useBackButton, useBottomButtons } from "../telegram";
import burger from "../assets/icons/sheetBurger.svg";
import chev from "../assets/icons/chevRight.svg";
import check from "../assets/icons/checkWhite.svg";
import s from "./BuySheet.module.css";

export type BuyStep = "sum" | "method" | "kaspi" | "wait" | "price";
type Btn = { text: string; onClick: () => void; shine?: boolean; position?: "left" };

/** Демо: ?pay=fail | expired | stopped | price — қате күйлерін көрсету үшін. */
const demo = () => (window.location.hash.match(/[?&]pay=(\w+)/)?.[1] ?? "");

// +7 (701) 234 56 78 пішімі
const digits = (v: string) => {
  let r = v.replace(/\D/g, "");
  if (v.trim().startsWith("+7")) r = r.slice(1);
  else if (r.length === 11 && /^[78]/.test(r)) r = r.slice(1);
  return "7" + r.slice(0, 10);
};
const mask = (d: string) => {
  const x = d.slice(1);
  let r = "+7";
  if (x.length) r += " (" + x.slice(0, 3);
  if (x.length >= 3) r += ")";
  if (x.length > 3) r += " " + x.slice(3, 6);
  if (x.length > 6) r += " " + x.slice(6, 8);
  if (x.length > 8) r += " " + x.slice(8, 10);
  return r;
};

export function BuySheet({ offer, onClose, onPaid, start = "sum" }: { offer: Offer; onClose: () => void; onPaid: () => void; start?: BuyStep }) {
  const go = useGo();
  const methods = useMethods();
  const def = useDefaultMethod();
  const saved = useKaspiPhone();
  const [step, setStep] = useState<BuyStep>(start);
  const [method, setMethod] = useState(def);
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [phone, setPhone] = useState(saved || "7");
  const [keep, setKeep] = useState(true);
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);
  const m = methods.find((x) => x.id === method) ?? methods[0];
  const newPrice = Math.round(offer.price * 1.08 / 100) * 100;
  const price = step === "price" ? newPrice : offer.price;

  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  const back = useMemo(() => () => {
    if ((step === "method" || step === "kaspi") && start === "sum") { haptic.soft(); setStep("sum"); return; }
    close();
  }, [step, close, start]);
  useBackButton(back);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const fail = (kind: "fail" | "expired" | "stopped") => go(`/pay/${kind}/${offer.id}`, "up", { replace: true });
  const finish = () => {
    setBusy(true);
    tg?.MainButton?.showProgress?.(false);
    const t = window.setTimeout(() => {
      tg?.MainButton?.hideProgress?.(); setBusy(false);
      const d = demo();
      if (d === "fail" || d === "stopped") { haptic.error(); fail(d); return; }
      haptic.success(); onPaid();
    }, 1100);
    timers.current.push(t);
  };
  // Kaspi: шот жіберілді → қосымшада растау → пакет қосылады (демо: қадамдар өздігінен жылжиды)
  const startWait = () => {
    setStep("wait"); setStage(0);
    if (demo() === "expired") { timers.current.push(window.setTimeout(() => { haptic.warning(); fail("expired"); }, 2600)); return; }
    timers.current.push(window.setTimeout(() => { haptic.select(); setStage(1); }, 2200));
    timers.current.push(window.setTimeout(() => { haptic.select(); setStage(2); }, 4200));
    timers.current.push(window.setTimeout(() => { haptic.success(); onPaid(); }, 5600));
  };
  // Сырттан бірден «күту» қадамымен ашылса (Kaspi нөмірі сақталған) — шот жіберілді деп бастаймыз
  useEffect(() => { if (start === "wait") startWait(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pay = () => {
    if (!agree || busy) return;
    haptic.medium();
    if (demo() === "price" && step === "sum") { haptic.warning(); setStep("price"); return; }
    if (m?.id === "kaspi") { if (saved) startWait(); else setStep("kaspi"); return; }
    finish();
  };
  const sendBill = () => {
    if (phone.length < 11) { haptic.error(); return; }
    haptic.medium();
    if (keep) setKaspiPhone(phone);
    startWait();
  };

  const main: Btn = useMemo(() => {
    // Тек тәсіл таңдау үшін ашылса (мысалы, «Қайта алу» бетінен) — «Дайын» парақты жабады
    if (step === "method") return { text: "Дайын", onClick: () => { haptic.medium(); setDefaultMethod(method); if (start === "method") close(); else setStep("sum"); } };
    if (step === "kaspi") return { text: "Шот жіберу", onClick: sendBill };
    if (step === "wait") return { text: "Kaspi.kz ашу", onClick: () => { haptic.medium(); openExternal("https://kaspi.kz/"); } };
    if (step === "price") return { text: `Төлеу · ${fmt(newPrice)}`, shine: true, onClick: () => { haptic.medium(); if (m?.id === "kaspi") startWait(); else finish(); } };
    return { text: `Төлеу · ${fmt(offer.price)}`, shine: true, onClick: pay };
  }, [step, method, phone, keep, agree, busy, m?.id, saved, offer.price, newPrice, start, close]); // eslint-disable-line react-hooks/exhaustive-deps
  const second: Btn | undefined = useMemo(() => (step === "wait" || step === "price" ? { text: "Бас тарту", position: "left", onClick: close } : undefined), [step, close]);
  useBottomButtons(main, second);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={step === "wait" ? undefined : close} />
      <div className={s.sheet} role="dialog" aria-label="Төлем" key={step}>
        <span className={s.grabber} />

        {step === "sum" && <>
          <h2 className={s.title}>Төлем</h2>
          <div className={s.item}>
            <span className={s.icon}><img src={kindPic[offer.kind]} width={44} height={44} alt="" style={{ objectFit: "contain" }} /></span>
            <span className={s.itemText}>
              <span className={s.itemTitle}>{offer.title}</span>
              <span className={s.itemSub}>{`${offer.venue}  •  30 күн`}</span>
            </span>
          </div>
          <hr className={s.sep} />
          <div className={`${s.row} ${s.muted}`}><span>Бөлек баға</span><s className="w-600">{fmt(offer.oldPrice)}</s></div>
          <div className={s.row}><span className={s.muted}>Үнем</span><span className={`w-600 ${s.green}`}>−{fmt(saving(offer))}</span></div>
          <div className={s.row}><span>Жиыны</span><span className={s.total}>{fmt(offer.price)}</span></div>
          <hr className={s.sep} />
          <button className={s.row} onClick={() => { haptic.tap(); setStep("method"); }}>
            <span className={s.muted}>Төлем тәсілі</span>
            <span className={s.method}><span className={`w-600 ${s.link}`}>{m?.title ?? "Kaspi Pay"}</span><img src={chev} width={20} height={20} alt="" /></span>
          </button>
          <button className={s.agree} onClick={() => { haptic.select(); setAgree(!agree); }} aria-pressed={agree}>
            <span className={`${s.box} ${agree ? s.boxOn : ""}`}>{agree && <img src={check} width={16} height={16} alt="" />}</span>
            <span className={s.agreeText}>Пайдалану <b>шарттарымен</b> және <b>қайтару ережелерімен</b> келісемін</span>
          </button>
        </>}

        {step === "method" && <>
          <h2 className={s.title}>Төлем тәсілі</h2>
          <div className={s.list}>
            {methods.map((x) => (
              <button key={x.id} className={`${s.opt} ${method === x.id ? s.optOn : ""}`} onClick={() => { if (method !== x.id) { haptic.select(); setMethod(x.id); } }}>
                <span className={s.optIcon}><Emo e={x.emoji} size={30} /></span>
                <span className={s.itemText}><span className={s.itemTitle}>{x.title}</span><span className={s.itemSub}>{x.card ? `Қосылған карта · ${x.sub.replace(/.*(\d\d\/\d\d).*/, "$1")}` : x.sub}</span></span>
                <span className={`${s.radio} ${method === x.id ? s.radioOn : ""}`} />
              </button>
            ))}
            <button className={s.opt} onClick={() => { haptic.tap(); go("/profile/card-add"); }}>
              <span className={`${s.optIcon} ${s.plus}`}>+</span>
              <span className={`w-600 ${s.link} ${s.addText}`}>Карта қосу</span>
            </button>
          </div>
        </>}

        {step === "kaspi" && <>
          <div className={s.kaspiHead}><span className={s.optIcon}><Emo e="🏦" size={30} /></span><h2 className={s.title}>Kaspi Pay</h2></div>
          <p className={s.lead}>Шот жіберілетін, Kaspi.kz-ке тіркелген нөмірді көрсет</p>
          <label className={s.field}>
            <span className={s.fieldLabel}>Kaspi.kz нөмірі</span>
            <input className={s.input} inputMode="tel" autoComplete="tel" value={mask(phone)} onChange={(e) => setPhone(digits(e.target.value))} />
          </label>
          {inTelegram && <button className={`w-600 ${s.link} ${s.fromTg}`} onClick={async () => { haptic.tap(); const p = await askPhone(); if (p) { haptic.success(); setPhone(digits(p)); } }}>Telegram нөмірін қою</button>}
          <p className={s.hint}>• Шот Kaspi.kz қосымшасына келеді, төлемді сол жерде растайсың.</p>
          <button className={s.agree} onClick={() => { haptic.select(); setKeep(!keep); }} aria-pressed={keep}>
            <span className={`${s.box} ${keep ? s.boxOn : ""}`}>{keep && <img src={check} width={16} height={16} alt="" />}</span>
            <span className={s.keepText}>Нөмірді келесі төлемдер үшін сақта</span>
          </button>
        </>}

        {step === "wait" && <>
          <span className={s.ring} />
          <h2 className={`${s.title} ${s.center}`}>Kaspi.kz қосымшасын аш</h2>
          <p className={`${s.lead} ${s.center}`}>{fmt(price)} шоты {mask(phone || saved)} нөміріне жіберілді</p>
          <hr className={s.sep} />
          <ol className={s.steps}>
            {["Kaspi.kz қосымшасына шот келді", "Төлемді растаңыз", "Пакет автоматты түрде қосылады"].map((t, i) => (
              <li key={t} className={i < stage ? s.done : i === stage ? s.now : ""}><span>{i < stage ? "✓" : i + 1}</span>{t}</li>
            ))}
          </ol>
          <p className={`${s.hint} ${s.center}`}>Төлемді растағаннан кейін осында ораласың</p>
        </>}

        {step === "price" && <>
          <h2 className={s.title}>Баға өзгерді</h2>
          <div className={s.row}><span className={s.muted}>Бұрынғы баға</span><span className="w-600">{fmt(offer.price)}</span></div>
          <div className={s.row}><span className={s.muted}>Жаңа баға</span><span className={s.method}><span className={s.up}>▲ {Math.round((newPrice / offer.price - 1) * 100)}%</span><span className="w-600">{fmt(newPrice)}</span></span></div>
          <p className={`${s.warn} infoBox infoWarn`}>Мекеме бағаны жаңартты. Төлемге дейін тексеріп ал.<i>”</i></p>
        </>}

        {!inTelegram && (
          <div className={s.bar}>
            {second && <button className={`${s.pay} ${s.second}`} onClick={second.onClick}>{second.text}</button>}
            <button className={`${s.pay} ${main.shine ? s.shine : ""}`} disabled={(step === "sum" && !agree) || busy} onClick={main.onClick}>
              {busy ? <span className={s.spinner} /> : main.text}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
