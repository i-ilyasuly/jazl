// Басты беттегі жарнамалық виджет: Telegram Wallet-тегі «Доход на SOL» сияқты сырғытылатын градиентті баннерлер.
import { useRef, useState } from "react";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import coins from "../assets/tiles/b_coins.webp";
import gift from "../assets/tiles/b_gift.webp";
import pin from "../assets/tiles/b_pin.webp";
import s from "./Promo.module.css";

const items = [
  { id: "save", title: "Пакетпен 30%-ға\nдейін үнемде", link: "Ұсыныстарды көру", img: coins, cls: s.violet, to: "#offers" },
  { id: "gift", title: "Досыңа пакет\nсыйла", link: "Сыйлық жіберу", img: gift, cls: s.teal, to: "/profile/gifts" },
  { id: "map", title: "Жаныңдағы мекемелер\nкартада", link: "Картаны ашу", img: pin, cls: s.blue, to: "/map" },
];

export function Promo() {
  const go = useGo();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = () => { const el = ref.current; if (!el) return; const i = Math.round(el.scrollLeft / (el.clientWidth - 24)); if (i !== at) { setAt(i); haptic.select(); } };
  const open = (to: string) => {
    haptic.tap();
    if (to.startsWith("#")) document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    else go(to);
  };
  return (
    <section className={`${s.wrap} rise`} style={{ ["--i" as string]: 0 }}>
      <div ref={ref} className={s.track} onScroll={onScroll}>
        {items.map((x) => (
          <button key={x.id} className={`${s.card} ${x.cls}`} onClick={() => open(x.to)}>
            <span className={s.title}>{x.title}</span>
            <span className={s.link}>{x.link} ›</span>
            <img src={x.img} className={s.art} alt="" decoding="sync" draggable={false} />
            <i className={s.spark} /><i className={`${s.spark} ${s.spark2}`} />
          </button>
        ))}
      </div>
      <div className={s.dots}>{items.map((x, i) => <span key={x.id} className={i === at ? s.on : ""} />)}</div>
    </section>
  );
}
