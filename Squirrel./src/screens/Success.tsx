// Figma: «Сатып алу / Сәтті / Light» (13886:25101)
import { pickRoute } from "../ui/route";
import { kindPic } from "../ui/Emo";
import type { OfferKind } from "../mocks/offers";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { buyPack, getPack, offerOf, usePacks } from "../store";
import { useEffect, useRef } from "react";
import { findOffer, fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { inTelegram, openExternal, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { Timeline } from "../ui/Timeline";
import burger from "../assets/icons/cardBurger.svg";
import { Sticker } from "../ui/Sticker";
import s from "./Success.module.css";

interface ResultProps {
  title: string; paid: string; cardTitle: string; cardSub: string; kind?: OfferKind;
  total: number; used: number; counter: string; next: string;
  main: { text: string; onClick: () => void }; secondary: { text: string; onClick: () => void };
  onClose: () => void;
}

export function ResultScreen(p: ResultProps) {
  const main = useMemo(() => p.main, [p.main.text, p.main.onClick]); // eslint-disable-line
  const secondary = useMemo(() => ({ ...p.secondary, position: "bottom" as const }), [p.secondary.text, p.secondary.onClick]); // eslint-disable-line
  useBottomButtons(main, secondary);
  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={p.onClose} />
      <h1 className={s.title}>{p.title}</h1>
      {/* Жасыл белгінің орнында — қуанған балапан (анимациялық стикер) */}
      <Sticker name="party" size={150} className={s.sticker} />
      <p className={`t-sub2 ${s.paid}`}>{p.paid}</p>
      <div className={s.card}>
        <div className={s.head}>
          <span className={s.icon}><img src={kindPic[p.kind ?? "food"]} width={44} height={44} alt="" style={{ objectFit: "contain" }} /></span>
          <span className={s.headText}>
            <span className="t-headline">{p.cardTitle}</span>
            <span className={`t-sub2 ${s.muted}`}>{p.cardSub}</span>
          </span>
        </div>
        <Timeline total={p.total} used={p.used} />
        <p className="t-sub2 w-600">{p.counter}</p>
        <div className={s.next}>
          <span className={s.emoji} />
          <span className={`t-sub2 w-600 ${s.nextText}`}>{p.next}</span>
        </div>
      </div>
      {!inTelegram && (
        <>
          <button className={`${s.btn} ${s.main}`} onClick={p.main.onClick}>{p.main.text}</button>
          <button className={`${s.btn} ${s.secondary}`} onClick={p.secondary.onClick}>{p.secondary.text}</button>
        </>
      )}
    </div>
  );
}

export function Success() {
  const { id } = useParams();
  const offer = findOffer(id);
  const go = useGo();
  const done = useRef(false);
  const packId = useRef<string | null>(null);
  useEffect(() => { if (!done.current) { done.current = true; packId.current = buyPack(offer.id); } }, [offer.id]);
  const close = useCallback(() => go("/", "fade", { replace: true }), [go]);
  // «Алғашқы жеңіс» (Патша, 2026-11-18): сатып алған сәтте бірінші қолдануға бір қадам — пакет бетіне (Қолдану / Жоспарлау) және мекемеге бағыт
  const plan = offer.kind === "hair" || Boolean(offer.planOnly);
  const useNow = useCallback(() => go(packId.current ? `/pack/${packId.current}` : "/packs", "forward", { replace: true }), [go]);
  const route = useCallback(() => { void pickRoute(offer.address || offer.venue); }, [offer.address, offer.venue]);
  const where = offer.address ? offer.address.replace(/^Қарағанды,\s*/, "") : offer.venue;
  return (
    <ResultScreen
      title="Пакет сатып алынды" paid={`Төлем қабылданды · ${fmt(offer.price)}`}
      cardTitle={offer.packName ?? offer.title} cardSub={`${offer.venue} · ${offer.distance}`} kind={offer.kind}
      total={offer.units} used={0} counter={`${offer.units} / ${offer.units} · 30 күн`}
      next={plan ? `Алғашқы келуіңді қазір жоспарла — ${where}` : `Алғашқысын бүгін-ақ ал: ${where}. Кассада «Medeo» деп айтып, QR-ды сканерле`}
      main={{ text: plan ? "Уақыт таңдау" : "Қазір қолдану", onClick: useNow }} secondary={{ text: "Бағыт", onClick: route }} onClose={close}
    />
  );
}

export function Paid() {
  const { id } = useParams();
  const units = Math.max(1, Number(new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("u") ?? 1));
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const toPacks = useCallback(() => go("/packs", "fade", { replace: true }), [go]);
  const receipt = useCallback(() => go("/receipt/use/" + id, "forward"), [go, id]);
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const until = q.get("until");
  if (!pack) return null;
  const o = offerOf(pack);
  // Мекеме жапсырмасымен қолданылды: кассир клиенттің экранына қарап растайды (Патша, 2026-11-22)
  if (until) return <LiveUse at={q.get("at") ?? new Date().toISOString()} until={until} units={units} title={o.title} word={o.unitWord} venue={o.venue} address={o.address} left={pack.left} total={pack.total} onDone={toPacks} onReceipt={receipt} />;
  return (
    <ResultScreen
      title="Қолданылды" paid={`${units} ${o.unitWord} пакетіңнен жұмсалды • ${o.venue}`}
      cardTitle={o.title} cardSub={o.address || o.venue} kind={o.kind}
      total={pack.total} used={pack.total - pack.left} counter={`${pack.left} / ${pack.total} қалды`}
      next={o.kind === "hair" ? "Шеберге айт: «Medeo бойынша»" : "Кассирге айт: «Medeo бойынша» — тапсырысыңды ал"}
      main={{ text: "Дайын", onClick: toPacks }} secondary={{ text: "Чекті көру", onClick: receipt }} onClose={toPacks}
    />
  );
}

const hms = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Almaty" });
/** Тірі растау экраны (жапсырма QR-ы): кассирсіз — кассир экранға қарап сенеді. Скриншоттан айыру үшін:
 *  секундпен жүріп тұрған сағат, қимылдап тұрған стикер мен жыпылықтаған нүкте; 5 минуттан кейін экран сұр болады. */
function LiveUse(p: { at: string; until: string; units: number; title: string; word: string; venue: string; address?: string; left: number; total: number; onDone: () => void; onReceipt: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const end = new Date(p.until).getTime();
  const leftMs = Math.max(0, end - now.getTime());
  const old = leftMs === 0;
  const span = Math.max(1, end - new Date(p.at).getTime());
  const main = useMemo(() => ({ text: "Дайын", onClick: p.onDone }), [p.onDone]);
  const sec = useMemo(() => ({ text: "Чекті көру", onClick: p.onReceipt, position: "bottom" as const }), [p.onReceipt]);
  useBottomButtons(main, sec);
  const mm = Math.floor(leftMs / 60000), ss = Math.floor((leftMs % 60000) / 1000);
  return (
    <div className={s.livePage}>
      <TelegramChrome mode="close" onBack={p.onDone} />
      <div className={`${s.live} ${old ? s.liveOld : ""}`} role="status" aria-live="polite">
        <span className={s.livePill}><i className={s.liveDot} />{old ? "Ескірді" : "Төленді · кассирге көрсетіңіз"}</span>
        {!old && <Sticker name="party" size={96} className={s.liveSticker} />}
        <b className={s.liveUnits}>{`${p.units} × ${p.title}`}</b>
        <span className={s.liveVenue}>{p.venue}{p.address ? ` · ${p.address}` : ""}</span>
        <span className={`mono ${s.liveClock}`}>{hms(now)}</span>
        <span className={s.liveAt}>{`Қолданылды: ${hms(new Date(p.at))}`}</span>
        <span className={s.liveBar}><i style={{ width: `${(leftMs / span) * 100}%` }} /></span>
        <span className={s.liveLeft}>{old ? "Бұл растау енді жарамсыз" : `Экран жарамды: ${mm}:${String(ss).padStart(2, "0")}`}</span>
      </div>
      <p className={`t-sub2 ${s.liveNote}`}>{`Пакетте қалды: ${p.left} / ${p.total} ${p.word}. Кассир уақыттың жүріп тұрғанын және мекеме атауын көреді — бұл скриншот емес екенінің белгісі.`}</p>
    </div>
  );
}
