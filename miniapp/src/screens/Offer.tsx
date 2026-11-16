import { toggleFav, toggleRestock, useFavs, usePacks, useRestock, appLink } from "../store";
import { Photo } from "../ui/Photo";
import { kindPic } from "../ui/Emo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { BuySheet, type BuyStep } from "../ui/BuySheet";
import { UseSheet } from "../ui/UseSheet";
import { detailsOf, discount, findOffer, fmt, isEnded, saving, unitPrice, type OfferDetails, type OfferKind } from "../mocks/offers";
import { galleryOf } from "../mocks/photos";
import { venues } from "../mocks/venues";
import { HowSheet } from "../ui/HowSheet";
import { LinkSheet, type LinkRow } from "../ui/LinkSheet";
import { askWriteAccess, haptic, inTelegram, nativeAlert, nativePick, openChat, openExternal, useBackButton, useBottomButtons } from "../telegram";
import { ActionSheet } from "../ui/ActionSheet";
import { TelegramChrome } from "../ui/TelegramChrome";
import heroBurger from "../assets/icons/heroBurger.svg";
import share from "../assets/icons/share.svg";
import heartFill from "../assets/icons/heartFill26.svg";
import heartLine from "../assets/icons/heart.svg";
import expand from "../assets/icons/expand.svg";
import s from "./Offer.module.css";

const Segs = ({ list }: { list: OfferDetails["includes"] }) => <>{list.map((x, i) => typeof x === "string" ? <span key={i}>{x}</span> : "g" in x ? <span key={i} className={s.hlGreen}>{x.g}</span> : <span key={i} className={s.hlBlue}>{x.b}</span>)}</>;

/** Сырғытылатын фото галерея: нүктелері қай суретте тұрғаныңды көрсетеді. */
function Gallery({ photos, fallback, kind, onIndex }: { photos: string[]; fallback: string; kind?: OfferKind; onIndex?: (i: number) => void }) {
  const [at, setAt] = useState(0);
  const [bad, setBad] = useState<Record<number, true>>({});
  return (
    <>
      <div className={s.gallery} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== at) { setAt(i); haptic.select(); onIndex?.(i); } }}>
        {photos.map((src, i) => (
          <div key={src} className={s.slide}>
            {bad[i] ? <img src={fallback} className={s.heroIcon} width={180} height={180} alt="" /> : <Photo src={src} kind={kind} className={s.photoImg} alt="" loading={i ? "lazy" : "eager"} onError={() => setBad((b) => ({ ...b, [i]: true }))} />}
          </div>
        ))}
      </div>
      {photos.length > 1 && <div className={s.dots}>{photos.map((src, i) => <span key={src} className={i === at ? s.dotOn : ""} />)}</div>}
    </>
  );
}

export function OfferPage() {
  const { id } = useParams();
  return <OfferView key={id} id={id} />;
}

function OfferView({ id }: { id?: string }) {
  const go = useGo();
  const base = findOffer(id);
  // Пакет көлемі таңдалса, атауы, бағасы мен жеңілдігі сол көлемге ауысады
  const [size, setSize] = useState(0);
  const offer = useMemo(() => { const z = base.sizes?.[size]; return z ? { ...base, ...z, title: base.title.replace(/· \d+ /, `· ${z.units} `) } : base; }, [base, size]);
  const fav = useFavs().includes(offer.id);
  const ended = isEnded(base.id);
  const pack = usePacks().find((p) => p.offerId === base.id && p.left > 0 && !p.expired);
  const waiting = useRestock().includes(base.id);
  const venue = venues.find((v) => v.name === base.venue);
  const [sheet, setSheet] = useState<"route" | "contact" | "how" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 392); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  // Патша, 2026-11-16: фото 412×412 (1:1). Беттің жоғарғы шетінде төмен тартқанда фото созылады (Telegram профиліндегідей,
  // бұлдыратусыз), жібергенде серпіліп орнына қайтады. Көлденең сырғыту (галерея) созуды қоздырмайды.
  const [pull, setPull] = useState(0);
  const [springing, setSpringing] = useState(false);
  useEffect(() => {
    let st: { x: number; y: number; dir: "v" | "h" | null } | null = null; let cur = 0;
    const start = (e: TouchEvent) => { if (window.scrollY > 0) { st = null; return; } const t = e.touches[0]; st = { x: t.clientX, y: t.clientY, dir: null }; setSpringing(false); };
    const move = (e: TouchEvent) => {
      if (!st) return; const t = e.touches[0]; const dx = t.clientX - st.x, dy = t.clientY - st.y;
      if (st.dir === null && Math.abs(dx) + Math.abs(dy) > 8) st.dir = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (st.dir !== "v" || window.scrollY > 0) return;
      const next = dy > 0 ? Math.min(160, dy * 0.5) : 0;
      if (next > 0 && e.cancelable) e.preventDefault();
      if ((cur < 120) !== (next < 120) && next >= 120) haptic.select();
      cur = next; setPull(next);
    };
    const end = () => { if (!st) return; st = null; if (cur > 0) { setSpringing(true); setPull(0); cur = 0; } };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end); window.addEventListener("touchcancel", end);
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end); };
  }, []);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const startStep = (loc.state as { buy?: BuyStep } | null)?.buy;
  const [buying, setBuying] = useState(Boolean(startStep));
  const [using, setUsing] = useState(false);
  const [choose, setChoose] = useState(false);
  const { loading } = useMock("offer:" + offer.id, offer, 450);
  const d = detailsOf(base);
  const photos = useMemo(() => galleryOf(base.id, base.kind), [base.id, base.kind]);
  const shareIt = () => { haptic.tap(); const url = "https://t.me/share/url?url=" + encodeURIComponent(appLink("offer", offer.id)) + "&text=" + encodeURIComponent(`${offer.title} — ${offer.venue}, ${fmt(offer.price)}`); if (inTelegram) openChat(url.replace("https://t.me/", "")); else window.open(url, "_blank", "noopener"); };

  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back, !buying && !using);
  const pay = useMemo(() => ({ text: "Төлеу", shine: true, onClick: () => { haptic.medium(); setBuying(true); } }), []);
  const gift = useMemo(() => ({ text: "Сыйлау", onClick: () => go("/gift/" + offer.id, "up") }), [go, offer.id]);
  const closeSheet = useCallback(() => setBuying(false), []);
  const paid = useCallback(() => go("/success/" + offer.id, "up", { replace: true }), [go, offer.id]);
  // Сатып алынған пакетте: «Тағы алу» → нативті таңдау: өзіме қайта алу немесе досыма сыйлау
  const again = useMemo(() => ({ text: "Тағы алу", onClick: async () => {
    haptic.tap();
    const id = await nativePick("Тағы алу", "Пакетті өзіңе қайта аласың ба, әлде досыңа сыйлайсың ба?", [{ id: "buy", text: "Қайта алу" }, { id: "gift", text: "Сыйлау" }, { id: "", text: "Бас тарту" }], "ask");
    if (id === "buy") { haptic.medium(); setBuying(true); }
    else if (id === "gift") { haptic.medium(); go("/gift/" + offer.id, "up"); }
    else if (id === "ask") setChoose(true);
  } }), [go, offer.id]);
  const use = useMemo(() => ({ text: "Қолдану", shine: true, onClick: () => { haptic.medium(); setUsing(true); } }), []);
  const notify = useMemo(() => ({ text: waiting ? "Хабарланады" : "Хабарла", onClick: async () => { if (waiting) return toggleRestock(base.id); if (await askWriteAccess()) { haptic.success(); toggleRestock(base.id); } } }), [waiting, base.id]);
  // «Қолжетімді» — Сыйлау + Төлеу; «Белсенді пакет» — Тағы алу + Қолдану (сканерлеу НЕМЕСЕ тапсырыс); «Аяқталған» — Хабарла
  const mainBtn = ended ? notify : pack ? use : pay;
  const secondBtn = ended ? undefined : pack ? again : gift;
  const caption = ended ? "Бұл ұсыныс аяқталды" : pack ? `${pack.left} / ${pack.total} қалды · мерзімі ${pack.daysLeft} күн` : "";
  useBottomButtons(mainBtn, secondBtn, !buying && !sheet && !using && !choose);
  const toVenue = () => go("/venue/" + (venue?.id ?? "damdi"));
  const handle = "@" + base.venue.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/ä/g, "a");
  const routeRows: LinkRow[] = [{ glyph: "pin", tint: "#31d158", title: "2ГИС", sub: `${base.venue} мекенжайын 2ГИС-те аш`, onClick: () => openExternal("https://2gis.kz/karaganda/search/" + encodeURIComponent(base.venue)) }];
  const contactRows: LinkRow[] = [
    { emoji: "✈️", title: "Telegram-да жазу", sub: handle, onClick: () => openChat(handle.slice(1)) },
    { emoji: "📞", title: "Қоңырау шалу", sub: "+7 700 000 00 00", onClick: () => { window.location.href = "tel:+77000000000"; } },
  ];

  return (
    <div className={`${s.page} ${caption ? s.pageTall : ""}`}>
      <div className={`${s.topBar} ${scrolled ? s.topBarOn : ""}`}><p className={`pageTitle ${s.barTitle}`}>{offer.title}</p></div>
      <TelegramChrome mode="back" onBack={back} />
      <div className={`${s.photo} ${ended ? s.photoEnded : ""} ${springing ? s.spring : ""}`} style={{ viewTransitionName: "offer-photo", height: 412 + pull }} onTransitionEnd={() => setSpringing(false)}>
        <Gallery photos={photos} fallback={kindPic[offer.kind]} kind={offer.kind} />
      </div>

      {loading ? <OfferSkeleton /> : (
      <div className={`${s.content} ${s.contentIn}`}>
        <section className={`${s.head} ${s.blk}`}>
          {/* Патша, 2026-11-16: бөлісу мен таңдаулы фото үстінен атаудың оң жағына, мөлдір фонсыз (Krisha үлгісі) */}
          <div className={s.titleRow}>
            <h1 className={s.h1}>{offer.title}</h1>
            <div className={s.titleActs}>
              <button className={s.act} aria-label="Бөлісу" onClick={shareIt}><span className={s.ico} style={{ maskImage: `url("${share}")`, WebkitMaskImage: `url("${share}")` }} /></button>
              <button className={s.act} aria-label="Таңдаулы" onClick={() => { haptic.medium(); toggleFav(offer.id); }}>
                {fav ? <img src={heartFill} width={26} height={26} alt="" key="on" className={s.pop} /> : <span key="off" className={`${s.ico} ${s.pop}`} style={{ maskImage: `url("${heartLine}")`, WebkitMaskImage: `url("${heartLine}")` }} />}
              </button>
            </div>
          </div>
          <p className={s.venueLine}>
            <button className={`${s.link} ${s.venueLink}`} onClick={toVenue}>{offer.venue}<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <span className={s.muted}>{`·  ★ ${String(offer.rating).replace(".", ",")} (${offer.ratingCount})  ·  ${offer.distance}`}</span>
          </p>
          <div className={s.priceRow}>
            <div>
              <p className={`${s.priceLine} ${ended ? s.dim : ""}`}><span key={offer.price} className={s.swap}>{fmt(offer.price)}</span><span className={s.discount}>▼ {discount(offer)}%</span></p>
              <p className={s.old}>Бөлек: <s>{fmt(offer.oldPrice)}</s></p>
            </div>
            <div className={s.badges} style={ended ? { visibility: "hidden" } : undefined}>
              <span className={`${s.badge} ${s.orange}`}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
              <span className={`${s.badge} ${s.green}`}>{fmt(saving(offer))} үнем</span>
            </div>
          </div>
          {base.sizes && (
            <div className={`${s.sizeRow} ${s.sizesIn}`} role="radiogroup" aria-label="Пакет көлемі">
              {base.sizes.map((z, i) => (
                <button key={z.units} role="radio" aria-checked={size === i} className={`${s.size} ${size === i ? s.sizeOn : ""}`} onClick={() => { if (size !== i) { haptic.select(); setSize(i); } }}>
                  <b>{z.units} дана</b><small>{fmt(Math.round(z.price / z.units))} / дана</small>
                </button>
              ))}
            </div>
          )}
        </section>


        <section className={`${s.block} ${s.blk}`}>
        <h2 className={s.blockTitle}>Шарттары</h2>
        <dl className={s.params}>
          <div><dt>Бірлік</dt><dd>{offer.units} {offer.unitWord}, әрқайсысы бөлек</dd></div>
          <div><dt>Мерзімі</dt><dd>{d.days ?? 30} күн, сатып алған сәттен</dd></div>
          {d.duration && <div><dt>Ұзақтығы</dt><dd>{d.duration}</dd></div>}
          {d.service ? <div><dt>Қызмет</dt><dd>{d.service}</dd></div> : <div><dt>Алу</dt><dd>{d.take}</dd></div>}
          <div><dt>Қолдану</dt><dd>{d.use}</dd></div>
        </dl>
        </section>

        <section className={`${s.block} ${s.blk}`}>
          <h2 className={s.blockTitle}>Пакетке не кіреді</h2>
          <ul className={s.bullets}>{d.includes.map((x, i) => <li key={i}><Segs list={[x]} /></li>)}</ul>
        </section>

        <section className={`${s.block} ${s.blk}`} style={{ position: "relative" }}>
          <h2 className={s.blockTitle}>Сипаттама</h2>
          <button className={`${s.quote} infoBox ${open ? s.quoteOpen : ""}`} onClick={() => { haptic.tap(); setOpen(!open); }}>
            <span className={s.quoteBar} />
            <span className={s.quoteText}><Segs list={d.about} /></span>
            {!open && <span className={s.fade} />}
            <img src={expand} className={s.expand} width={22} height={22} alt="" />
          </button>
        </section>

        <section className={`${s.blk} ${s.rules}`}>
          <button className={s.rule} onClick={() => { haptic.tap(); setSheet("how"); }}><span>Қалай қолданамын?</span><i className={s.chev} /></button>
          {offer.kind === "hair" && <button className={s.rule} onClick={() => { haptic.tap(); nativeAlert("Жазылуға 2 сағат қалғанға дейін уақытты тегін ауыстырып не бас тарта аласың. Кейін бас тартсаң не келмесең, пакеттен бір рет жұмсалады."); }}><span>Жазылу және бас тарту</span><i className={s.chev} /></button>}
          <button className={s.rule} onClick={() => { haptic.tap(); go("/rules/carry"); }}><span>Мерзімі және көшіру</span><span className={s.ruleHint}>қайта төлесе</span><i className={s.chev} /></button>
          <button className={s.rule} onClick={() => { haptic.tap(); go("/profile/faq"); }}><span>Қайтару және мәселелер</span><i className={s.chev} /></button>
        </section>

        <section className={`${s.block} ${s.blk}`}>
          <h2 className={s.blockTitle}>Мекеме</h2>
          <div className={s.inner}>
            <button className={s.venue} onClick={toVenue}>
              <span className={s.venueAvatar}>{offer.venue.slice(0, 1)}</span>
              <span className={s.venueText}>
                <span className={s.venueName}>{offer.venue}</span>
                <span className={s.venueAddr}>{offer.address}</span>
              </span>
              <i className={s.chev} />
            </button>
            <p className={s.open}><span className={s.openDot} />{offer.hours}</p>
            <div className={s.actions}>
              <button className={s.chipBtn} onClick={() => { haptic.tap(); setSheet("route"); }}>Бағыт</button>
              <button className={s.chipBtn} onClick={() => { haptic.tap(); setSheet("contact"); }}>Байланыс</button>
            </div>
          </div>
        </section>

        <section className={`${s.block} ${s.blk}`}>
          <h2 className={s.blockTitle}>Пікірлер · {offer.ratingCount}</h2>
          <div className={s.inner}>
            <div className={s.score}>
              <b>{String(offer.rating).replace(".", ",")}</b>
              <span><span className={s.stars}>★★★★★</span><span className={s.venueAddr}>{offer.ratingCount} бағалау</span></span>
            </div>
            {d.reviews.map((r) => (
              <div key={r.name} className={s.review}>
                <span className={s.revAvatar}>{r.name.slice(0, 1)}</span>
                <div><p className={s.revHead}><b>{r.name}</b><span className={s.stars}>★★★★★</span></p><p className={s.revText}>{r.text}</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>
      )}

      {choose && <ActionSheet title="Тағы алу" actions={[{ id: "buy", text: "Қайта алу" }, { id: "gift", text: "Сыйлау" }]} onPick={(id) => { setChoose(false); if (id === "buy") { haptic.medium(); setBuying(true); } else if (id === "gift") { haptic.medium(); go("/gift/" + offer.id, "up"); } }} onClose={() => setChoose(false)} />}
      {using && pack && <UseSheet pack={pack} onClose={() => setUsing(false)} />}
      {buying && <BuySheet offer={offer} onClose={closeSheet} onPaid={paid} start={startStep} />}
      {sheet === "how" && <HowSheet onClose={() => setSheet(null)} />}
      {sheet === "route" && <LinkSheet title="Бағыт" rows={routeRows} onClose={() => setSheet(null)} />}
      {sheet === "contact" && <LinkSheet title="Байланыс" rows={contactRows} onClose={() => setSheet(null)} />}
      {!inTelegram && (
        <div className={`${s.bar} ${caption ? s.barTall : ""}`}>
          {caption && <p className={`t-cap1 ${s.caption}`}>{caption}</p>}
          {secondBtn && <button className={`t-text w-600 ${s.btn} ${s.secondary}`} onClick={secondBtn.onClick}>{secondBtn.text}</button>}
          <button key={mainBtn.text} className={`t-text w-600 ${s.btn} ${s.main} ${"shine" in mainBtn && mainBtn.shine ? s.shine : ""} ${ended && waiting ? s.mainDone : ""}`} onClick={mainBtn.onClick}>{mainBtn.text}</button>
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
