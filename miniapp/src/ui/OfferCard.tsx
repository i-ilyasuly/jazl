import { Link, useViewTransitionState } from "react-router-dom";
import { setDir } from "../nav";
import { useState } from "react";
import { discount, fmt, saving, unitPrice, type Offer } from "../mocks/offers";
import { haptic } from "../telegram";
import heartFill from "../assets/icons/heartFill.svg";
import heart from "../assets/icons/heart.svg";
import group from "../assets/icons/group.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import s from "./OfferCard.module.css";

const kindIcon = { food: burger, coffee: burger, hair: scissors };

export function OfferCard({ offer }: { offer: Offer }) {
  const [fav, setFav] = useState(offer.favorite);
  const to = `/offer/${offer.id}`;
  const moving = useViewTransitionState(to);
  return (
    <Link to={to} viewTransition className={s.card} onClick={() => { haptic.tap(); setDir("forward"); }}>
      <p className={`t-headline ${s.title}`}>{offer.title}</p>
      <p className={`t-sub2 ${s.venue}`}>{offer.venue} · {offer.distance}</p>
      <span className={`t-cap1 ${s.discount}`}>▼ {discount(offer)}%</span>
      <button
        className={s.fav}
        aria-label={fav ? "Таңдаулыдан алу" : "Таңдаулыға қосу"}
        onClick={(e) => { e.preventDefault(); haptic.tap(); setFav(!fav); }}
      >
        <img src={fav ? heartFill : heart} width={28} height={28} alt="" key={String(fav)} className={fav ? s.pop : undefined} />
      </button>
      <div className={s.thumb} style={{ viewTransitionName: moving ? "offer-photo" : "none" }}>
        {offer.photo ? <img src={offer.photo} className={s.photo} alt="" /> : <img src={kindIcon[offer.kind]} className={s.thumbIcon} width={48} height={48} alt="" />}
        <span className={s.buyers}>
          <img src={group} width={14} height={14} alt="" />
          <span className="t-cap1 w-700">{offer.buyers}</span>
        </span>
        {offer.deadline && <span className={`t-cap1 ${s.deadline}`}>{offer.deadline}</span>}
      </div>
      <p className={s.price}>{fmt(offer.price)}</p>
      <span className={`t-cap1 ${s.unit}`}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
      <span className={`t-cap1 ${s.saving}`}>{fmt(saving(offer))} үнем</span>
    </Link>
  );
}
