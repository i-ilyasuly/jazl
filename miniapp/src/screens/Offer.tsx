import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { discount, fmt, offers, saving, unitPrice } from "../mocks/offers";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { TelegramChrome } from "../ui/TelegramChrome";
import heroBurger from "../assets/icons/heroBurger.svg";
import pagination from "../assets/icons/pagination.svg";
import share from "../assets/icons/share.svg";
import heartFill from "../assets/icons/heartFill26.svg";
import heartLine from "../assets/icons/heart.svg";
import expand from "../assets/icons/expand.svg";
import s from "./Offer.module.css";

const G = ({ children }: { children: string }) => <span className={s.hlGreen}>{children}</span>;
const B = ({ children }: { children: string }) => <span className={s.hlBlue}>{children}</span>;

export function OfferPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const offer = offers.find((o) => o.id === id) ?? offers[0];
  const [fav, setFav] = useState(offer.favorite);
  const [open, setOpen] = useState(false);

  const back = useCallback(() => nav(-1), [nav]);
  useBackButton(back);
  const pay = useMemo(() => ({ text: "Төлеу", onClick: () => { haptic.tap(); nav("/buy/" + offer.id); } }), [nav, offer.id]);
  const gift = useMemo(() => ({ text: "Сыйлау", onClick: () => { haptic.tap(); nav("/gift/" + offer.id); } }), [nav, offer.id]);
  useBottomButtons(pay, gift);

  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.photo}>
        {offer.photo ? <img src={offer.photo} className={s.photoImg} alt="" /> : <img src={heroBurger} className={s.heroIcon} width={120} height={120} alt="" />}
        <img src={pagination} className={s.dots} width={80} height={16} alt="" />
        <button className={`${s.round} ${s.share}`} aria-label="Бөлісу" onClick={() => haptic.tap()}><img src={share} width={24} height={24} alt="" /></button>
        <button className={`${s.round} ${s.fav}`} aria-label="Таңдаулы" onClick={() => { haptic.tap(); setFav(!fav); }}>
          <img src={fav ? heartFill : heartLine} width={26} height={26} alt="" key={String(fav)} className={s.pop} />
        </button>
      </div>

      <div className={s.content}>
        <section className={s.head}>
          <h1 className="t-title3">{offer.title}</h1>
          <div className={s.priceRow}>
            <div>
              <p className="t-large-title">{fmt(offer.price)}</p>
              <p className={`t-sub2 ${s.muted}`}>Бөлек: <s>{fmt(offer.oldPrice)}</s></p>
            </div>
            <span className={`t-cap1 ${s.discount}`}>▼ {discount(offer)}%</span>
            <div className={s.badges}>
              <span className={`t-cap1 ${s.badge} ${s.orange}`}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
              <span className={`t-cap1 ${s.badge} ${s.green}`}>{fmt(saving(offer))} үнем</span>
            </div>
          </div>
          <p className={`t-sub2 ${s.venueLine}`}>
            <button className={`w-600 ${s.link}`} onClick={() => haptic.tap()}>{offer.venue}</button>
            <span className={s.muted}>{`•  ★ ${String(offer.rating).replace(".", ",")} (${offer.ratingCount})  •  ${offer.distance}`}</span>
          </p>
        </section>

        <dl className={`t-sub2 ${s.params}`}>
          <div><dt>Бірлік</dt><dd>{offer.units} дана, 1 бірлік = 1 {offer.unitWord}</dd></div>
          <div><dt>Мерзімі</dt><dd>30 күн, сатып алған сәттен</dd></div>
          <div><dt>Алу</dt><dd>мекемеде</dd></div>
          <div><dt>Қолдану</dt><dd>Сканерлеп немесе тапсырыс беріп</dd></div>
        </dl>

        <hr className={s.sep} />

        <section className={s.block8}>
          <h2 className={`t-sub2 w-700 ${s.blockTitle}`}>Пакетке не кіреді</h2>
          <ul className={`t-sub2 ${s.bullets}`}>
            <li>Лаваш, тауық еті, көкөніс, үй соусы</li>
            <li><G>Қаптама бағаға кіреді</G></li>
            <li>Сусын мен қосымша ет кірмейді</li>
          </ul>
        </section>

        <section className={s.block10} style={{ position: "relative" }}>
          <h2 className={`t-sub2 w-700 ${s.blockTitle}`}>Сипаттама</h2>
          <button className={`${s.quote} ${open ? s.quoteOpen : ""}`} onClick={() => { haptic.tap(); setOpen(!open); }}>
            <span className={s.quoteBar} />
            <span className={`t-sub2 ${s.quoteText}`}>
              <G>Жаңа піскен лаваш</G> мен үй соусы: ыстық донер 4 дана үшін. Әр бірлікті бөлек күндері алуға болады. Сусын <B>қосылмайды</B>, бірақ кола 0,5 л үшін −20% беріледі.
            </span>
            {!open && <span className={s.fade} />}
            <img src={expand} className={s.expand} width={22} height={22} alt="" />
          </button>
          <span className={s.quoteMark} aria-hidden>”</span>
        </section>

        <hr className={s.sep} />

        <section className={s.rules}>
          <button className={`t-sub1 ${s.rule}`} onClick={() => haptic.tap()}><span>Қалай қолданамын?</span></button>
          <hr className={s.sep} />
          <button className={`t-sub1 ${s.rule}`} onClick={() => haptic.tap()}><span>Мерзімі және көшіру</span><span className={`t-sub2 ${s.muted}`}>қайта төлесе</span></button>
          <hr className={s.sep} />
          <button className={`t-sub1 ${s.rule}`} onClick={() => haptic.tap()}><span>Қайтару және мәселелер</span></button>
        </section>

        <hr className={s.sep} />

        <section className={s.block10}>
          <h2 className={`t-sub2 w-700 ${s.blockTitle}`}>Мекеме</h2>
          <button className={s.venue} onClick={() => haptic.tap()}>
            <span className={s.venueAvatar} />
            <span className={s.venueText}>
              <span className={`t-sub1 w-600 ${s.link}`}>{offer.venue}</span>
              <span className={`t-cap1 ${s.muted}`}>{offer.address}</span>
            </span>
          </button>
          <p className={`t-sub2 ${s.open}`}><span className={s.openDot} />{offer.hours}</p>
          <div className={s.actions}>
            <button className={`t-sub2 w-600 ${s.chipBtn}`} onClick={() => haptic.tap()}>Бағыт</button>
            <button className={`t-sub2 w-600 ${s.chipBtn}`} onClick={() => haptic.tap()}>Байланыс</button>
          </div>
        </section>

        <hr className={s.sep} />

        <section className={`t-sub2 ${s.block10}`}>
          <h2 className={`t-sub2 w-700 ${s.blockTitle}`}>Пікірлер · {offer.ratingCount}</h2>
          <p className="w-600" style={{ whiteSpace: "pre", color: "var(--text-strong)" }}>{`★ ${String(offer.rating).replace(".", ",")}  •  ${offer.ratingCount} бағалау`}</p>
          <div className={s.review}><p className={`w-600 ${s.muted}`} style={{ whiteSpace: "pre" }}>{`Айгерім  •  ★ 5`}</p><p>Донер ыстық әрі үлкен, төлем бірден өтті.</p></div>
          <div className={s.review}><p className={`w-600 ${s.muted}`} style={{ whiteSpace: "pre" }}>{`Ерлан  •  ★ 5`}</p><p>Жақсы баға, кезек аз болды.</p></div>
        </section>
      </div>

      {!inTelegram && (
        <div className={s.bar}>
          <button className={`t-sub1 w-600 ${s.btn} ${s.secondary}`} onClick={gift.onClick}>Сыйлау</button>
          <button className={`t-sub1 w-600 ${s.btn} ${s.main}`} onClick={pay.onClick}>Төлеу</button>
        </div>
      )}
    </div>
  );
}
