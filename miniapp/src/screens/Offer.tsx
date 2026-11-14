import { toggleFav, toggleRestock, useFavs, usePacks, useRestock } from "../store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { BuySheet } from "../ui/BuySheet";
import { discount, findOffer, fmt, isEnded, saving, unitPrice } from "../mocks/offers";
import { venues } from "../mocks/venues";
import { HowSheet } from "../ui/HowSheet";
import { LinkSheet, type LinkRow } from "../ui/LinkSheet";
import { askWriteAccess, haptic, inTelegram, openChat, openExternal, useBackButton, useBottomButtons } from "../telegram";
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
  return <OfferView key={id} id={id} />;
}

function OfferView({ id }: { id?: string }) {
  const go = useGo();
  const base = findOffer(id);
  // Пакет көлемі таңдалса, атауы, бағасы мен жеңілдігі сол көлемге ауысады
  const [size, setSize] = useState(0);
  const [broken, setBroken] = useState(false);
  const offer = useMemo(() => { const z = base.sizes?.[size]; return z ? { ...base, ...z, title: base.title.replace(/· \d+ /, `· ${z.units} `) } : base; }, [base, size]);
  const fav = useFavs().includes(offer.id);
  const ended = isEnded(base.id);
  const pack = usePacks().find((p) => p.offerId === base.id && p.left > 0);
  const waiting = useRestock().includes(base.id);
  const venue = venues.find((v) => v.name === base.venue);
  const [sheet, setSheet] = useState<"route" | "contact" | "how" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 330); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const { loading } = useMock("offer:" + offer.id, offer, 450);

  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !buying);
  const pay = useMemo(() => ({ text: "Төлеу", onClick: () => { haptic.tap(); setBuying(true); } }), []);
  const gift = useMemo(() => ({ text: "Сыйлау", onClick: () => go("/gift/" + offer.id, "up") }), [go, offer.id]);
  const closeSheet = useCallback(() => setBuying(false), []);
  const paid = useCallback(() => go("/success/" + offer.id, "up", { replace: true }), [go, offer.id]);
  const again = useMemo(() => ({ text: "Тағы алу", onClick: () => { haptic.tap(); setBuying(true); } }), []);
  const scan = useMemo(() => ({ text: "Сканерлеу", onClick: () => go("/scan", "up") }), [go]);
  const notify = useMemo(() => ({ text: waiting ? "Хабарланады" : "Хабарла", onClick: async () => { if (waiting) return toggleRestock(base.id); if (await askWriteAccess()) { haptic.success(); toggleRestock(base.id); } } }), [waiting, base.id]);
  // Figma: «Қолжетімді» — Сыйлау + Төлеу; «Белсенді пакет» — Тағы алу + Сканерлеу; «Аяқталған» — Хабарла
  const mainBtn = ended ? notify : pack ? scan : pay;
  const secondBtn = ended ? undefined : pack ? again : gift;
  const caption = ended ? "Бұл ұсыныс аяқталды" : pack ? `${pack.left} / ${pack.total} қалды · мерзімі ${pack.daysLeft} күн` : "";
  useBottomButtons(mainBtn, secondBtn, !buying && !sheet);
  const toVenue = () => go("/venue/" + (venue?.id ?? "damdi"));
  const handle = "@" + base.venue.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/ä/g, "a");
  const routeRows: LinkRow[] = [{ emoji: "🗺", title: "2ГИС", sub: `${base.venue} мекенжайын 2ГИС-те аш`, onClick: () => openExternal("https://2gis.kz/karaganda/search/" + encodeURIComponent(base.venue)) }];
  const contactRows: LinkRow[] = [
    { emoji: "✈️", title: "Telegram-да жазу", sub: handle, onClick: () => openChat(handle.slice(1)) },
    { emoji: "📞", title: "Қоңырау шалу", sub: "+7 700 000 00 00", onClick: () => { window.location.href = "tel:+77000000000"; } },
  ];

  return (
    <div className={`${s.page} ${caption ? s.pageTall : ""}`}>
      <div className={`${s.topBar} ${scrolled ? s.topBarOn : ""}`} />
      <TelegramChrome mode="back" onBack={back} />
      <div className={`${s.photo} ${ended ? s.photoEnded : ""}`} style={{ viewTransitionName: "offer-photo" }}>
        {offer.photo && !broken ? <img src={offer.photo} className={s.photoImg} alt="" onError={() => setBroken(true)} /> : <img src={heroBurger} className={s.heroIcon} width={120} height={120} alt="" />}
        <img src={pagination} className={s.dots} width={80} height={16} alt="" />
        <button className={`${s.round} ${s.share}`} aria-label="Бөлісу" onClick={() => haptic.tap()}><img src={share} width={24} height={24} alt="" /></button>
        <button className={`${s.round} ${s.fav}`} aria-label="Таңдаулы" onClick={() => { haptic.tap(); toggleFav(offer.id); }}>
          <img src={fav ? heartFill : heartLine} width={26} height={26} alt="" key={String(fav)} className={s.pop} />
        </button>
      </div>

      {loading ? <OfferSkeleton /> : (
      <div className={`${s.content} ${s.contentIn}`}>
        <section className={s.head}>
          <h1 className="t-title3">{offer.title}</h1>
          <div className={s.priceRow}>
            <div>
              <p className={`t-large-title ${s.priceLine} ${ended ? s.dim : ""}`}><span key={offer.price} className={s.swap}>{fmt(offer.price)}</span><span className={`t-cap1 ${s.discount}`}>▼ {discount(offer)}%</span></p>
              <p className={`t-sub2 ${s.muted}`}>Бөлек: <s>{fmt(offer.oldPrice)}</s></p>
            </div>
            <div className={s.badges} style={ended ? { visibility: "hidden" } : undefined}>
              <span className={`t-cap1 ${s.badge} ${s.orange}`}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
              <span className={`t-cap1 ${s.badge} ${s.green}`}>{fmt(saving(offer))} үнем</span>
            </div>
          </div>
          <p className={`t-sub2 ${s.venueLine}`}>
            <button className={`w-600 ${s.link}`} onClick={toVenue}>{offer.venue}</button>
            <span className={s.muted}>{`•  ★ ${String(offer.rating).replace(".", ",")} (${offer.ratingCount})  •  ${offer.distance}`}</span>
          </p>
        </section>

        {base.sizes && (
          <section className={s.sizes}>
            <h2 className={`t-sub2 w-600 ${s.blockTitle}`}>Пакет көлемі</h2>
            <div className={s.sizeRow}>
              {base.sizes.map((z, i) => (
                <button key={z.units} className={`${s.size} ${size === i ? s.sizeOn : ""}`} onClick={() => { if (size !== i) { haptic.select(); setSize(i); } }}>
                  <b className="t-sub2 w-600">{z.units} дана</b><small className="t-cap1">{fmt(Math.round(z.price / z.units))} / дана</small>
                </button>
              ))}
            </div>
          </section>
        )}

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
          <button className={`t-sub1 ${s.rule}`} onClick={() => { haptic.tap(); setSheet("how"); }}><span>Қалай қолданамын?</span></button>
          <hr className={s.sep} />
          <button className={`t-sub1 ${s.rule}`} onClick={() => haptic.tap()}><span>Мерзімі және көшіру</span><span className={`t-sub2 ${s.muted}`}>қайта төлесе</span></button>
          <hr className={s.sep} />
          <button className={`t-sub1 ${s.rule}`} onClick={() => haptic.tap()}><span>Қайтару және мәселелер</span></button>
        </section>

        <hr className={s.sep} />

        <section className={s.block10}>
          <h2 className={`t-sub2 w-700 ${s.blockTitle}`}>Мекеме</h2>
          <button className={s.venue} onClick={toVenue}>
            <span className={s.venueAvatar} />
            <span className={s.venueText}>
              <span className={`t-sub1 w-600 ${s.link}`}>{offer.venue}</span>
              <span className={`t-cap1 ${s.muted}`}>{offer.address}</span>
            </span>
          </button>
          <p className={`t-sub2 ${s.open}`}><span className={s.openDot} />{offer.hours}</p>
          <div className={s.actions}>
            <button className={`t-sub2 w-600 ${s.chipBtn}`} onClick={() => { haptic.tap(); setSheet("route"); }}>Бағыт</button>
            <button className={`t-sub2 w-600 ${s.chipBtn}`} onClick={() => { haptic.tap(); setSheet("contact"); }}>Байланыс</button>
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
      )}

      {buying && <BuySheet offer={offer} onClose={closeSheet} onPaid={paid} />}
      {sheet === "how" && <HowSheet onClose={() => setSheet(null)} />}
      {sheet === "route" && <LinkSheet title="Бағыт" rows={routeRows} onClose={() => setSheet(null)} />}
      {sheet === "contact" && <LinkSheet title="Байланыс" rows={contactRows} onClose={() => setSheet(null)} />}
      {!inTelegram && (
        <div className={`${s.bar} ${caption ? s.barTall : ""}`}>
          {caption && <p className={`t-cap1 ${s.caption}`}>{caption}</p>}
          {secondBtn && <button className={`t-sub1 w-600 ${s.btn} ${s.secondary}`} onClick={secondBtn.onClick}>{secondBtn.text}</button>}
          <button key={mainBtn.text} className={`t-sub1 w-600 ${s.btn} ${s.main} ${ended && waiting ? s.mainDone : ""}`} onClick={mainBtn.onClick}>{mainBtn.text}</button>
        </div>
      )}
    </div>
  );
}

function OfferSkeleton() {
  const bar = (w: number, h: number, r = 6) => <span className="sk" style={{ display: "block", width: w, height: h, borderRadius: r }} />;
  return (
    <div className={s.content} aria-busy>
      {bar(230, 22)}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{bar(150, 38, 8)}<div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{bar(120, 28, 14)}{bar(104, 28, 14)}</div></div>
      {bar(250, 18)}
      {[300, 280, 180, 320].map((w) => <div key={w}>{bar(w, 18)}</div>)}
      {bar(380, 1, 0)}
      {bar(140, 18)}
      {bar(380, 120, 8)}
    </div>
  );
}
