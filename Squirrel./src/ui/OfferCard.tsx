import { useState } from "react";
import { Photo } from "./Photo";
import { kindPic } from "./Emo";
import { Link, useViewTransitionState } from "react-router-dom";
import { setDir } from "../nav";
import { toggleFav, toggleRestock, useFavs, useRestock } from "../store";
import bell from "../assets/icons/favBell.svg";
import { discount, fmt, isSoldOut, saving, unitPrice, type Offer } from "../mocks/offers";
import { askWriteAccess, haptic } from "../telegram";
import heartFill from "../assets/icons/heartFill.svg";
import heart from "../assets/icons/heart.svg";
import group from "../assets/icons/group.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import cup from "../assets/icons/catCup.svg";
import s from "./OfferCard.module.css";

const kindIcon = { food: burger, coffee: cup, hair: scissors };

export function OfferCard({ offer, ended: endedProp }: { offer: Offer; ended?: boolean }) {
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
  return (
    <Link to={to} viewTransition className={`${s.card} ${ended ? s.ended : ""} ${!ended && offer.promo ? s[offer.promo] : ""}`} onClick={() => { haptic.tap(); setDir("forward"); }}>
      {/* Мекеме берген пакет атауы басты орында, тауар атауы астында (Патша, 2026-11-18). Ақылы жарнама адал белгіленеді. */}
      <p className={s.title}>{offer.packName ?? offer.title}</p>
      <p className={s.venue}>{!ended && offer.promo && <span className={`${s.promoTag} ${s["tag_" + offer.promo]}`}>{offer.promo === "hot" ? "Ыстық" : "ТОП"}</span>}{[offer.packName ? offer.title : null, offer.venue, offer.packName ? null : offer.distance, !ended && offer.promo ? "Жарнама" : null].filter(Boolean).join(" · ")}</p>
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
      </div>
      {/* Бірнеше көлем болса — ең арзан көлемнің бағасы «-дан» деп (Патша, 2026-11-18) */}
      {/* Squirrel.: бағаның үстінде — жеңілдіксіз бағасы, көмескі әрі сызылған */}
      {!ended && <s className={s.oldPrice}>{fmt(offer.sizes && offer.sizes.length > 1 ? [...offer.sizes].sort((a, b) => a.price - b.price)[0].oldPrice : offer.oldPrice)}</s>}
      <p className={s.price}>{offer.sizes && offer.sizes.length > 1 ? `${fmt(Math.min(...offer.sizes.map((x) => x.price)))}-дан` : fmt(offer.price)}</p>
      {ended ? <>
        <span className={`t-cap1 ${s.over}`}>{soldOut ? "Таусылды" : "Аяқталды"}</span>
        <button className={`t-sub2 w-600 ${s.notify} ${waiting ? s.waiting : ""}`} onClick={(e) => { e.preventDefault(); void notify(); }}>
          <img src={bell} width={20} height={20} alt="" className={waiting ? s.ring : undefined} />{waiting ? "Қосылды" : "Хабарла"}
        </button>
      </> : <>
        {/* Squirrel.: үш түрлі түсті белгінің орнына — бір жасыл белгі (жеңілдік + үнем), дана бағасы жай мәтін */}
        <span className={s.unit}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
        <span className={s.saving}><b>▼ {discount(offer)}%</b></span>
      </>}
    </Link>
  );
}
