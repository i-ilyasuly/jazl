// Figma «11 · Қайта алу және мерзімін ұзарту»: «Қайта алу / Бірліктер көшеді» 13886:31503,
// «Мерзімі өткен» 13886:31655, «Баға өзгерді» 13886:31773, «Сәтті» 13886:31931, «Көшіру ережесі» 13918:8306.
// Өлшемдер — UI kit шкаласы (17/22, 15/20, 13/16) және 4/8px тор (шет 16, жол 48/68, бұрыш 12/20).
import { checkoutCard } from "../pay/checkout";
import { kindPic } from "../ui/Emo";
import { useCallback, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { CARRY_DAYS, carryOf, getPack, offerOf, packState, rebuyPack, untilText, usePacks } from "../store";
import { inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import { usePayFlow } from "../ui/usePayFlow";
import { ResultScreen } from "./Success";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import chev from "../assets/icons/chevRight.svg";
import s from "./Rebuy.module.css";

const priceDemo = () => /[?&]pay=price/.test(window.location.hash);

export function Rebuy() {
  const { id } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const flow = usePayFlow();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !flow.sheetOpen);

  const o = pack ? offerOf(pack) : null;
  const changed = priceDemo();
  const price = o ? (changed ? Math.round(o.price * 1.08 / 100) * 100 : o.price) : 0;
  const payOffer = useMemo(() => (o ? { ...o, price } : null), [o, price]);
  const pay = useCallback(() => {
    if (!pack || !payOffer) return;
    // Карта + серверде пакет бар → нақты төлем (ескі пакеттің қалғаны серверде көшеді); әйтпесе — бұрынғы жол
    flow.pay(payOffer, (r) => {
      const nid = rebuyPack(pack.id, price, flow.method?.title, r?.pack);
      if (nid) go("/rebuy/done/" + nid, "fade", { replace: true, state: { paid: price } });
    }, pack.serverId ? (card) => checkoutCard(o!.id, card, { fromPackId: pack.serverId, methodLabel: flow.method?.title }) : undefined);
  }, [pack, payOffer, price, flow, go]);
  const main = useMemo(() => ({ text: `Төлеу · ${fmt(price)}`, shine: true, onClick: pay }), [price, pay]);
  useBottomButtons(main, undefined, Boolean(pack) && !flow.sheetOpen);
  if (!pack || !o) return null;

  const state = packState(pack);
  const carry = carryOf(pack);
  const late = state === "expired" && carry === 0 && pack.left > 0;
  const w = o.unitWord;
  const sub = state === "expired" ? `${pack.left} бірлік пайдаланылмады • мерзімі өтті`
    : state === "used" ? "Толық пайдаланылды" : `Қалды: ${pack.left} бірлік • ${pack.daysLeft} күн қалды`;
  const up = Math.round((price / o.price - 1) * 100);

  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <h1 className="pageTitle">Қайта алу</h1>
      <div className={s.col}>
        {changed && (
          <div className={`${s.note} ${s.warn} infoBox infoWarn rise`}>
            <p className={s.noteTitle}>Баға өзгерді: {fmt(o.price).replace(" ₸", "")} → {fmt(price)}</p>
            <p className={s.noteSub}>Мекеме бағаны жаңартты. Төлемге дейін тексеріп ал.</p>
            <i aria-hidden>”</i>
          </div>
        )}

        <section className={`${s.card} rise`} style={{ ["--i" as string]: 1 }}>
          <h2 className={`t-sub2 w-600 ${s.head}`}>Қазіргі пакет</h2>
          <div className={s.pack}>
            <span className={s.thumb}><img src={kindPic[o.kind]} width={40} height={40} alt="" style={{ objectFit: "contain" }} /></span>
            <span className={s.packText}><span className="t-text">{o.title}</span><span className={`t-cap1 ${s.muted}`}>{sub}</span></span>
          </div>
        </section>

        {carry > 0 && (
          <div className={`${s.note} infoBox infoOk rise`} style={{ ["--i" as string]: 2 }}>
            <p>Қалған <b>{carry} бірлік</b> жаңа пакетке <b>қосылады</b>, мерзімі де жаңарады.</p>
            <i aria-hidden>”</i>
          </div>
        )}
        {late && (
          <div className={`${s.note} ${s.warn} infoBox infoWarn rise`} style={{ ["--i" as string]: 2 }}>
            <p>Бұрынғы пакеттің мерзімі өткеніне {CARRY_DAYS} күннен асты, сондықтан пайдаланылмаған {pack.left} бірлік жаңа пакетке көшпейді.</p>
            <button className={s.noteLink} onClick={() => go("/rules/carry")}>Көшіру ережесі туралы толығырақ</button>
            <i aria-hidden>”</i>
          </div>
        )}

        <section className={`${s.card} rise`} style={{ ["--i" as string]: 3 }}>
          <h2 className={`t-sub2 w-600 ${s.head}`}>Жаңа пакет</h2>
          <div className={s.kv}><span className={s.muted}>Жаңа пакет</span><span className="w-600">{o.units} {w}</span></div>
          {carry > 0 && <div className={s.kv}><span className={s.muted}>Көшетін бірлік</span><span className={`w-600 ${s.green}`}>+{carry} {w}</span></div>}
          <div className={s.kv}><span className={s.muted}>Барлығы</span><span className="w-600">{o.units + carry} {w}</span></div>
          <div className={s.kv}><span className={s.muted}>Жаңа мерзім</span><span className="w-600">{untilText(new Date(Date.now() + 30 * 864e5))}</span></div>
        </section>

        <section className={`${s.card} rise`} style={{ ["--i" as string]: 4 }}>
          <div className={s.kv}><span className={s.muted}>Бағасы</span><span className={s.price}>{changed && <span className={s.up}>▲ {up}%</span>}<span className="w-600">{fmt(price)}</span></span></div>
          <button className={`${s.kv} ${s.tap}`} onClick={() => payOffer && flow.pickMethod(payOffer)}>
            <span>Төлем тәсілі</span>
            <span className={s.price}><span className={s.muted}>{flow.method?.title ?? "Kaspi Pay"}</span><img src={chev} width={18} height={18} alt="" /></span>
          </button>
        </section>
      </div>

      {!inTelegram && (
        <div className={s.bar}>
          <button className={`${s.btn} ${s.shine}`} disabled={flow.busy} onClick={pay}>{flow.busy ? <span className={s.spinner} /> : main.text}</button>
        </div>
      )}
      {flow.node}
    </div>
  );
}

/** Figma «Қайта алу / Сәтті» 13886:31931 — жасыл белгінің орнында балапан стикері (ереже 9). */
export function RebuyDone() {
  const { id } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const paidState = (useLocation().state as { paid?: number } | null)?.paid;
  const toPacks = useCallback(() => go("/packs", "fade", { replace: true }), [go]);
  const close = useCallback(() => go("/pack/" + id, "fade", { replace: true }), [go, id]);
  if (!pack) return null;
  const o = offerOf(pack);
  const paid = paidState ?? o.price;
  return (
    <ResultScreen
      title="Пакет қайта алынды" paid={`Төлем қабылданды · ${fmt(paid)}`}
      cardTitle={o.title} cardSub={`${o.venue} · ${o.distance}`} kind={o.kind}
      total={pack.total} used={0} counter={`${pack.left} / ${pack.total} · 30 күн`}
      next={pack.carried ? "Қалған бірлік жаңа пакетке қосылды" : "Келесі қадам: мекемеде «Medeo бойынша» деп айт"}
      main={{ text: "Пакеттерге өту", onClick: toPacks }} secondary={{ text: "Жабу", onClick: close }} onClose={close}
    />
  );
}

/** Figma «Көшіру ережесі» 13918:8306 */
export function CarryRules() {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const main = useMemo(() => ({ text: "Түсінікті", onClick: back }), [back]);
  useBottomButtons(main);
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <h1 className="pageTitle">Көшіру ережесі</h1>
      <div className={s.col}>
        <section className={`${s.card} ${s.rules} rise`}>
          <h2 className="t-title3">Қалған бірліктер қашан көшеді</h2>
          <ul>
            <li>Пакеттің мерзімі өтпей тұрып қайта алсаң, қалған бірліктер жаңа пакетке қосылады.</li>
            <li>Көшкен бірлік жаңа пакеттің мерзімімен бірге жаңарады.</li>
            <li>Қайта алу бағасы мекеменің ағымдағы бағасымен жүргізіледі.</li>
          </ul>
        </section>
        <section className={`${s.card} ${s.rules} rise`} style={{ ["--i" as string]: 1 }}>
          <h2 className="t-title3">Қашан көшпейді</h2>
          <ul>
            <li>Мерзімі өткеннен кейін де {CARRY_DAYS} күн ішінде қайта алсаң, қалған бірліктер көшеді.</li>
            <li>{CARRY_DAYS} күннен кейін пайдаланылмаған бірліктер жойылады, ақшасы қайтарылмайды.</li>
            <li>Мерзімін өткізбеу үшін тегін ұзартуды қолдануға болады, егер мекеме рұқсат етсе.</li>
          </ul>
        </section>
        <div className={`${s.note} ${s.info} infoBox rise`} style={{ ["--i" as string]: 2 }}>
          <p>Нақты шарттар мекеменің ұсыныс бетінде көрсетіледі.</p>
          <i aria-hidden>”</i>
        </div>
      </div>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={back}>Түсінікті</button></div>}
    </div>
  );
}
