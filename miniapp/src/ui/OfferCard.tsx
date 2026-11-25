import { useEffect, useRef, useState, type ReactNode } from "react";
import { Money } from "./Money";
import { Photo } from "./Photo";
import { kindPic } from "./Emo";
import { Link, useViewTransitionState } from "react-router-dom";
import { setDir } from "../nav";
import { toggleFav, toggleRestock, useFavs, useRestock, useSettings } from "../store";
import { TgEmoji } from "./TgEmoji";
import { badgesOf, type Badge } from "./badges";
import { BadgeIcon } from "./BadgeIcon";
import { InstNums } from "./InstNums";
import { hits } from "../search";

import { discount, fmt, instBadge, isSoldOut, saving, unitPrice, type Offer } from "../mocks/offers";
import { askWriteAccess, haptic } from "../telegram";
import heartFill from "../assets/icons/heartFill.svg";
import heart from "../assets/icons/heart.svg";
import group from "../assets/icons/group.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import cup from "../assets/icons/catCup.svg";
import s from "./OfferCard.module.css";

const kindIcon = { food: burger, coffee: cup, hair: scissors };

/** Іздеуде табылған сөзді ерекшелеу (search.ts → hits) */
function Hl({ text, q }: { text: string; q?: string }) {
  const rs = q ? hits(text, q) : [];
  if (!rs.length) return <>{text}</>;
  const out: ReactNode[] = []; let at = 0;
  rs.forEach(([a, b], i) => { if (a > at) out.push(text.slice(at, a)); out.push(<mark key={i} className={s.hl}>{text.slice(a, b)}</mark>); at = b; });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

export function OfferCard({ offer, ended: endedProp, highlight }: { offer: Offer; ended?: boolean; highlight?: string }) {
  const [broken, setBroken] = useState(false);
  // Айлық лимит таусылса — аяқталған сияқты көрінеді, бірақ «Таусылды» деп (келесі айда не лимит көбейсе қайта ашылады)
  const soldOut = !endedProp && isSoldOut(offer);
  const ended = endedProp || soldOut;
  const left = !ended && offer.limit?.monthly != null ? offer.limit.left ?? 0 : null;
  const fav = useFavs().includes(offer.id);
  const waiting = useRestock().includes(offer.id);
  const notify = async () => { if (waiting) return toggleRestock(offer.id); if (await askWriteAccess()) { haptic.success(); toggleRestock(offer.id); } };
  const to = `/offer/${offer.id}`;
  const moving = useViewTransitionState(to);
  const badges = badgesOf(offer);
  return (
    <Link to={to} viewTransition className={`${s.card} ${ended ? s.ended : ""} ${!ended && offer.promo ? s[offer.promo] : ""}`} onClick={() => { haptic.tap(); setDir("forward"); }}>
      {/* Мекеме берген пакет атауы басты орында, тауар атауы астында (Патша, 2026-11-18). Ақылы жарнама адал белгіленеді. */}
      <p className={`${s.title} ${!ended ? s.titleIcon : ""} ${!ended && instBadge(offer) ? s.titleInst : ""}`}><Hl text={offer.packName ?? offer.title} q={highlight} /></p>
      <p className={s.venue}><Hl q={highlight} text={[offer.packName ? offer.title : null, offer.venue, offer.packName ? null : offer.distance, !ended && offer.promo ? "Жарнама" : null].filter(Boolean).join(" · ")} /></p>
      {/* B нұсқасы (Патша, 2026-11-21): сөзсіз, тек эмодзи — жүрекшенің сол жағында, онымен бірдей өлшемде (Krisha үлгісі) */}
      {/* Патша (2026-11-21): ▼% жеңілдік белгісі — жүрекшенің сол жағында; эмодзи белгілер — астыңғы оң жақта */}
      {/* Жеңілдік пен бөліп төлеу бір бағанда, бірдей енмен — салыстыруға оңай (Патша, 2026-11-24) */}
      {/* Бір сызықта, әрқайсысы өз пішінінде: бөліп төлеу (капсула) жеңілдіктің сол жағында. Атау сыймаса — қысқарады (кейін шешіледі) */}
      {!ended && <span className={s.topPills}>
        {instBadge(offer) && <span className={s.inst}><InstNums months={offer.installment} /></span>}
        <span className={s.discTop}><b>▼ {discount(offer)}%</b></span>
      </span>}
      {!ended && badges.length > 0 && <Badges badges={badges} />}
      <button
        className={s.fav}
        aria-label={fav ? "Таңдаулыдан алу" : "Таңдаулыға қосу"}
        onClick={(e) => { e.preventDefault(); haptic.medium(); toggleFav(offer.id); }}
      >
        <img src={fav ? heartFill : heart} width={28} height={28} alt="" key={String(fav)} className={fav ? s.pop : undefined} />
      </button>
      <div className={s.thumb} style={{ viewTransitionName: moving ? "offer-photo" : "none" }}>
        {offer.photo && !broken ? <Photo src={offer.photo.replace(/([?&])w=\d+/, "$1w=480")} kind={offer.kind} className={s.photo} alt="" loading="lazy" decoding="async" width={176} height={116} onError={() => setBroken(true)} /> : <img src={kindPic[offer.kind]} className={s.thumbIcon} width={96} height={96} alt="" decoding="sync" />}
        <span className={s.buyers}>
          <img src={group} width={14} height={14} alt="" />
          <span className="t-cap1 w-700">{offer.buyers}</span>
        </span>
        {left != null && <span className={`t-cap1 ${s.left} ${left > 10 ? s.leftCalm : ""}`}>{`Қалды ${left} / ${offer.limit!.monthly}`}</span>}
        {offer.deadline && <span className={`t-cap1 ${s.deadline}`}>{offer.deadline}</span>}
        {/* Патша (2026-11-24): суреттің төменгі оң бұрышында ДА — екі орынның бірі кейін алынады */}
        {!ended && instBadge(offer) && <span className={`t-cap1 ${s.instThumb}`}><InstNums months={offer.installment} /></span>}
      </div>
      {/* Бірнеше көлем болса — ең арзан көлемнің бағасы «-дан» деп (Патша, 2026-11-18) */}
      {/* Squirrel.: бағаның үстінде — жеңілдіксіз бағасы, көмескі әрі сызылған */}
      {!ended && <s className={s.oldPrice}><Money n={offer.sizes && offer.sizes.length > 1 ? [...offer.sizes].sort((a, b) => a.price - b.price)[0].oldPrice : offer.oldPrice} /></s>}
      <p className={s.price}>{offer.sizes && offer.sizes.length > 1 ? <Money n={Math.min(...offer.sizes.map((x) => x.price))} suffix="-дан" /> : <Money n={offer.price} />}</p>
      {ended ? <>
        <span className={`t-cap1 ${s.over}`}>{soldOut ? "Таусылды" : "Аяқталды"}</span>
        <button className={`t-sub2 w-600 ${s.notify} ${waiting ? s.waiting : ""}`} onClick={(e) => { e.preventDefault(); void notify(); }}>
          <TgEmoji name="bell" size={22} tilt={-10} play={waiting} />{waiting ? "Қосылды" : "Хабарла"}
        </button>
      </> : <>
        {/* Squirrel.: үш түрлі түсті белгінің орнына — бір жасыл белгі (жеңілдік + үнем), дана бағасы жай мәтін */}
        <span className={s.unit}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
      </>}
    </Link>
  );
}

// Патша (2026-11-21): белгілер кезектесіп ойнайды. Оң жақтан санағанда 2-, 4-, 6-сы бір топ, 1-, 3-, 5-і екінші топ:
// алдымен бір топ ойнайды, біткен соң екіншісі, сосын үзіліс. Жалғыз белгі — ойнап, үзіліс жасайды.
// Қатар экранда көрінбесе — бәрі тоқтайды.
const PHASE = 1400, REST = 3000;
/** Баптаудағы таңдауға қарай: анимациялық эмодзи не дөңгелек иконкалар (Патша, 2026-11-21) */
function Badges({ badges }: { badges: Badge[] }) {
  const icons = useSettings().badgeStyle === "icon";
  if (!icons) return <BadgeRow badges={badges} />;
  return (
    <span className={`${s.badges} ${s.iconStack}`}>
      {/* row-reverse: i = 0 — ең оң жақта; сол жақтағысы үстінде тұрады */}
      {badges.map((b, i) => <span key={b.emo} title={b.label} aria-label={b.label} style={{ zIndex: i + 1 }}><BadgeIcon name={b.emo} size={32} ring /></span>)}
    </span>
  );
}
function BadgeRow({ badges }: { badges: Badge[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tick, setTick] = useState<[number, number]>([0, 0]); // [1-топтың, 2-топтың ойнау саны]
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let t: number | undefined; let seen = false; let step = 0;
    const groups = badges.length > 1 ? 2 : 1;
    const run = () => {
      if (!seen || document.hidden) { t = undefined; return; }
      const g = step % (groups + 1); // 0..groups-1 — топ ойнайды, groups — үзіліс
      if (g < groups) setTick((x) => (g === 0 ? [x[0] + 1, x[1]] : [x[0], x[1] + 1]));
      step++;
      t = window.setTimeout(run, g < groups ? PHASE : REST);
    };
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen && t === undefined) t = window.setTimeout(run, 500);
      if (!seen) { window.clearTimeout(t); t = undefined; step = 0; }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, [badges.length]);
  return (
    <span ref={ref} className={s.badges}>
      {badges.map((b, i) => {
        // row-reverse: i = 0 — ең оң жақтағы (1-ші). 2-, 4-, 6-сы (i тақ) — бірінші топ
        const group = badges.length > 1 && i % 2 === 0 ? 1 : 0;
        return <span key={b.emo} title={b.label} aria-label={b.label}><TgEmoji name={b.emo} size={26} tap play={tick[group]} /></span>;
      })}
    </span>
  );
}
