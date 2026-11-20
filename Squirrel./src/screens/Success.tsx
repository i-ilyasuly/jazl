// Figma: «Сатып алу / Сәтті / Light» (13886:25101)
import { pickRoute } from "../ui/route";
import { kindPic } from "../ui/Emo";
import type { OfferKind } from "../mocks/offers";
import { useCallback, useMemo } from "react";
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
  if (!pack) return null;
  const o = offerOf(pack);
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
