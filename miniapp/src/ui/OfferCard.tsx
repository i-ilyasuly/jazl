import { useState } from "react";
import { kindPic } from "./Emo";
import { Link, useViewTransitionState } from "react-router-dom";
import { setDir } from "../nav";
import { toggleFav, toggleRestock, useFavs, useRestock } from "../store";
import bell from "../assets/icons/favBell.svg";
import { discount, fmt, saving, unitPrice, type Offer } from "../mocks/offers";
import { askWriteAccess, haptic } from "../telegram";
import heartFill from "../assets/icons/heartFill.svg";
import heart from "../assets/icons/heart.svg";
import group from "../assets/icons/group.svg";
import burger from "../assets/icons/offerBurger.svg";
import scissors from "../assets/icons/offerScissors.svg";
import cup from "../assets/icons/catCup.svg";
import s from "./OfferCard.module.css";

const kindIcon = { food: burger, coffee: cup, hair: scissors };

export function OfferCard({ offer, ended }: { offer: Offer; ended?: boolean }) {
  const [broken, setBroken] = useState(false);
  const fav = useFavs().includes(offer.id);
  const waiting = useRestock().includes(offer.id);
  const notify = async () => { if (waiting) return toggleRestock(offer.id); if (await askWriteAccess()) { haptic.success(); toggleRestock(offer.id); } };
  const to = `/offer/${offer.id}`;
  const moving = useViewTransitionState(to);
  return (
    <Link to={to} viewTransition className={`${s.card} ${ended ? s.ended : ""} ${!ended && offer.promo ? s[offer.promo] : ""}`} onClick={() => { haptic.tap(); setDir("forward"); }}>
      <p className={s.title}>{offer.title}</p>
      <p className={s.venue}>{offer.venue} · {offer.distance}</p>
      {!ended && <span className={s.discount}>▼ {discount(offer)}%</span>}
      <button
        className={s.fav}
        aria-label={fav ? "Таңдаулыдан алу" : "Таңдаулыға қосу"}
        onClick={(e) => { e.preventDefault(); haptic.medium(); toggleFav(offer.id); }}
      >
        <img src={fav ? heartFill : heart} width={28} height={28} alt="" key={String(fav)} className={fav ? s.pop : undefined} />
      </button>
      <div className={s.thumb} style={{ viewTransitionName: moving ? "offer-photo" : "none" }}>
        {offer.photo && !broken ? <img src={offer.photo.replace(/([?&])w=\d+/, "$1w=480")} className={s.photo} alt="" loading="lazy" decoding="async" width={176} height={116} onError={() => setBroken(true)} /> : <img src={kindPic[offer.kind]} className={s.thumbIcon} width={96} height={96} alt="" />}
        <span className={s.buyers}>
          <img src={group} width={14} height={14} alt="" />
          <span className="t-cap1 w-700">{offer.buyers}</span>
        </span>
        {offer.deadline && <span className={`t-cap1 ${s.deadline}`}>{offer.deadline}</span>}
      </div>
      <p className={s.price}>{fmt(offer.price)}</p>
      {ended ? <>
        <span className={`t-cap1 ${s.over}`}>Аяқталды</span>
        <button className={`t-sub2 w-600 ${s.notify} ${waiting ? s.waiting : ""}`} onClick={(e) => { e.preventDefault(); void notify(); }}>
          <img src={bell} width={20} height={20} alt="" className={waiting ? s.ring : undefined} />{waiting ? "Қосылды" : "Хабарла"}
        </button>
      </> : <>
        <span className={s.unit}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
        <span className={s.saving}>{fmt(saving(offer))} үнем</span>
      </>}
    </Link>
  );
}
