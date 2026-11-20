import { getLang, kk } from "../i18n";
import { winLabel } from "../offpeak";
import { toggleFav, toggleRestock, useFavs, usePacks, useRestock, appLink } from "../store";
import { Rich } from "../ui/Rich";
import { Photo } from "../ui/Photo";
import { kindPic } from "../ui/Emo";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { BuySheet, type BuyStep } from "../ui/BuySheet";
import { UseSheet } from "../ui/UseSheet";
import { detailsOf, discount, findOffer, fmt, hasSampleIncludes, isEnded, isSoldOut, portionText, saving, unitPrice, type OfferDetails, type OfferKind } from "../mocks/offers";
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
/** Сипаттаманы жолдарға бөледі: «• » деп басталған жол — тізім (екінші жолы шегініспен), қалғаны — абзац. */
function Lines({ list }: { list: OfferDetails["about"] }) {
  const lines: OfferDetails["about"][] = [[]];
  for (const x of list) {
    if (typeof x !== "string") { lines[lines.length - 1].push(x); continue; }
    x.split("\n").forEach((part, i) => { if (i) lines.push([]); if (part) lines[lines.length - 1].push(part); });
  }
  return <>{lines.map((l, i) => {
    const bullet = typeof l[0] === "string" && l[0].startsWith("• ");
    const body = bullet ? [(l[0] as string).slice(2), ...l.slice(1)] : l;
    return <span key={i} className={bullet ? s.li : s.para}>{bullet && <i className={s.dot}>•</i>}<Segs list={body} /></span>;
  })}</>;
}

/** Сипаттама: мәтін блоктың ішінде екі жағынан бірдей шегініспен тұрады; 4 жолдан ұзын болса ғана жиылады. */
function About({ list, text, open, onToggle }: { list: OfferDetails["about"]; text?: string; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [long, setLong] = useState(true);
  useLayoutEffect(() => { const el = ref.current; if (el) setLong(el.scrollHeight > 90); }, [list, text]);
  // Мекеме өзі жазған сипаттама бар болса — сол (клиент тілінде), әйтпесе санат үлгісі
  const body = text ? <Rich text={text} /> : <Lines list={list} />;
  if (!long) return <div className={`${s.quote} ${s.quoteShort} infoBox`}><span ref={ref} className={s.quoteText}>{body}</span></div>;
  return (
    <button className={`${s.quote} infoBox ${open ? s.quoteOpen : ""}`} onClick={onToggle} aria-expanded={open}>
      <span ref={ref} className={s.quoteText}>{body}</span>
      {!open && <span className={s.fade} />}
      <img src={expand} className={s.expand} width={22} height={22} alt="" />
    </button>
  );
}

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

/** «Аптасына 1 рет донер алсаң — бөлек 8 000 ₸ төлер едің»: пакетті әдеттегі жиілікке айналдырады (мерзім ішінде біркелкі қолданса) */
function habitText(units: number, days: number, unitWord: string, old: number) {
  const perWeek = (units * 7) / days;
  const freq = Math.round(perWeek) >= 1 ? `Аптасына ${Math.round(perWeek)} рет` : `Айына ${Math.max(1, Math.round((units * 30) / days))} рет`;
  return `${freq} ${unitWord} алсаң, бөлек ${fmt(old)} төлер едің. Пакетпен:`;
}

/** «2026-11-30» → «30 қарашаға» (барыс септігі «дейін» алдында) */
const MON_DAT = [kk("қаңтарға"), kk("ақпанға"), kk("наурызға"), kk("сәуірге"), kk("мамырға"), kk("маусымға"), kk("шілдеге"), kk("тамызға"), kk("қыркүйекке"), kk("қазанға"), kk("қарашаға"), kk("желтоқсанға")];
const MON_RU_GEN = [kk("января"), kk("февраля"), kk("марта"), kk("апреля"), kk("мая"), kk("июня"), kk("июля"), kk("августа"), kk("сентября"), kk("октября"), kk("ноября"), kk("декабря")];
const saleDate = (d: string) => `${Number(d.slice(8, 10))} ${(getLang() === "ru" ? MON_RU_GEN : MON_DAT)[Number(d.slice(5, 7)) - 1]}`;

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
  // Айлық лимит таусылды: сатып алу жабық, «Хабарла» — келесі айда не лимит көбейгенде бот хабарлайды
  const soldOut = !ended && isSoldOut(base);
  const lim = base.limit;
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
  // Сыйлау: таңдалған дана нұсқасымен (Патша, 2026-11-18). Пакеті бар адамда таңдау жасырын — негізгі көлем.
  const giftTo = `/gift/${offer.id}${!pack && offer.units !== base.units ? `?units=${offer.units}` : ""}`;
  const gift = useMemo(() => ({ text: "Сыйлау", onClick: () => go(giftTo, "up") }), [go, giftTo]);
  const closeSheet = useCallback(() => setBuying(false), []);
  const paid = useCallback(() => go("/success/" + offer.id, "up", { replace: true }), [go, offer.id]);
  // Сатып алынған пакетте: «Тағы алу» → нативті таңдау: өзіме қайта алу немесе досыма сыйлау
  const again = useMemo(() => ({ text: "Тағы алу", onClick: async () => {
    haptic.tap();
    const id = await nativePick("Тағы алу", "Пакетті өзіңе қайта аласың ба, әлде досыңа сыйлайсың ба?", [{ id: "buy", text: "Қайта алу" }, { id: "gift", text: "Сыйлау" }, { id: "", text: "Бас тарту" }], "ask");
    if (id === "buy") { haptic.medium(); setBuying(true); }
    else if (id === "gift") { haptic.medium(); go(giftTo, "up"); }
    else if (id === "ask") setChoose(true);
  } }), [go, offer.id]);
  const use = useMemo(() => ({ text: "Қолдану", shine: true, onClick: () => { haptic.medium(); setUsing(true); } }), []);
  const notify = useMemo(() => ({ text: waiting ? "Хабарланады" : "Хабарла", onClick: async () => { if (waiting) return toggleRestock(base.id); if (await askWriteAccess()) { haptic.success(); toggleRestock(base.id); } } }), [waiting, base.id]);
  // «Қолжетімді» — Сыйлау + Төлеу; «Белсенді пакет» — Тағы алу + Қолдану (сканерлеу НЕМЕСЕ тапсырыс); «Аяқталған» — Хабарла
  // Пакеті бар адам лимит таусылса да өз пакетін қолдана береді
  const mainBtn = ended || (soldOut && !pack) ? notify : pack ? use : pay;
  const secondBtn = ended || soldOut ? undefined : pack ? again : gift;
  const caption = ended ? "Бұл ұсыныс аяқталды" : pack ? `${pack.left} / ${pack.total} қалды · мерзімі ${pack.daysLeft} күн` : soldOut ? "Осы айдың пакеттері таусылды · келесі айдың 1-інде ашылады" : "";
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
      <div className={`${s.topBar} ${scrolled ? s.topBarOn : ""}`}><p className={`pageTitle ${s.barTitle}`}>{base.packName ?? offer.title}</p></div>
      <TelegramChrome mode="back" onBack={back} />
      <div className={`${s.photo} ${ended ? s.photoEnded : ""} ${springing ? s.spring : ""}`} style={{ viewTransitionName: "offer-photo", height: 412 + pull }} onTransitionEnd={() => setSpringing(false)}>
        <Gallery photos={photos} fallback={kindPic[offer.kind]} kind={offer.kind} />
      </div>

      {loading ? <OfferSkeleton /> : (
      <div className={`${s.content} ${s.contentIn}`}>
        <section className={`${s.head} ${s.blk}`}>
          {/* Патша, 2026-11-16: бөлісу мен таңдаулы фото үстінен атаудың оң жағына, мөлдір фонсыз (Krisha үлгісі) */}
          <div className={s.titleRow}>
            <h1 className={s.h1}>{base.packName ?? offer.title}</h1>
            <div className={s.titleActs}>
              <button className={s.act} aria-label="Бөлісу" onClick={shareIt}><span className={s.ico} style={{ maskImage: `url("${share}")`, WebkitMaskImage: `url("${share}")` }} /></button>
              <button className={s.act} aria-label="Таңдаулы" onClick={() => { haptic.medium(); toggleFav(offer.id); }}>
                {fav ? <img src={heartFill} width={32} height={32} alt="" key="on" className={s.pop} /> : <span key="off" className={`${s.ico} ${s.pop}`} style={{ maskImage: `url("${heartLine}")`, WebkitMaskImage: `url("${heartLine}")` }} />}
              </button>
            </div>
          </div>
          {/* Пакет атауы берілсе — тауар атауы астында (Патша, 2026-11-18) */}
          {base.packName && <p className={s.productLine}>{offer.title}</p>}
          <p className={s.venueLine}>
            <button className={`${s.link} ${s.venueLink}`} onClick={toVenue}>{offer.venue}<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <span className={s.muted}>{`·  ★ ${String(offer.rating).replace(".", ",")} (${offer.ratingCount})  ·  ${offer.distance}`}</span>
          </p>
          {venue?.trust != null && <p className={s.trust}><span aria-hidden>✓</span>{`Сенімді мекеме · ${venue.trust}% қызмет шағымсыз`}</p>}
          {/* Бағадан бұрын контекст (Хормози): клиент әдетте қанша төлейтінін көрсетіп, сосын пакет бағасы */}
          {!ended && <p className={s.context}>{habitText(offer.units, d.days ?? 30, offer.unitWord, offer.oldPrice)}</p>}
          <div className={s.priceRow}>
            <div>
              <p className={`${s.priceLine} ${ended ? s.dim : ""}`}><span key={offer.price} className={s.swap}>{fmt(offer.price)}</span></p>
              <p className={s.old}>Бөлек: <s>{fmt(offer.oldPrice)}</s></p>
            </div>
            <div className={s.badges} style={ended ? { visibility: "hidden" } : undefined}>
              {/* Squirrel.: бір жасыл белгі (жеңілдік + үнем) және дана бағасы жай мәтін — бағамен таласпайды */}
              <span className={`${s.badge} ${s.green}`}><b>▼ {discount(offer)}%</b>{` · ${fmt(saving(offer))} үнем`}</span>
              <span className={s.unitText}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
            </div>
          </div>
          {/* Сату лимиті (Патша, 2026-11-18): қалған орын және бір адамға шек */}
          {!ended && lim && (lim.monthly != null || lim.perUser != null) && (
            <div className={s.limitRow}>
              {lim.monthly != null && <span className={`${s.limitBadge} ${(lim.left ?? 0) <= 10 ? s.limitHot : ""}`}>{soldOut ? `Осы айға таусылды · ${lim.monthly} пакет` : `Қалды ${lim.left} / ${lim.monthly} · осы айға`}</span>}
              {lim.perUser != null && <span className={s.limitNote}>{`Бір адамға айына ${lim.perUser} пакет`}</span>}
            </div>
          )}
          {/* Дана нұсқасы тек әлі сатып алмаған адамға (Патша, 2026-11-18): пакеті барда — көрсетілмейді */}
          {base.sizes && !pack && (
            <div className={`${s.sizeRow} ${s.sizesIn}`} role="radiogroup" aria-label="Пакет көлемі">
              {base.sizes.map((z, i) => (
                <button key={z.units} role="radio" aria-checked={size === i} className={`${s.size} ${size === i ? s.sizeOn : ""}`} onClick={() => { if (size !== i) { haptic.select(); setSize(i); } }}>
                  {base.sizes!.length >= 3 && i === Math.floor(base.sizes!.length / 2) && <span className={s.sizeTag}>Ұсынамыз</span>}
                  <b>{`${z.units} дана`}</b><small>{`${fmt(Math.round(z.price / z.units))} / дана`}</small>
                </button>
              ))}
            </div>
          )}
        </section>


        {/* Medeo кепілдігі (Патша, 2026-11-18): тәуекел клиентте емес — бар ережелерді бір жерде, бағаның жанында ашық айтамыз */}
        {!ended && (
          <section className={`${s.block} ${s.blk} ${s.guarantee}`}>
            <h2 className={s.blockTitle}><span className={s.shield} aria-hidden>✓</span>Medeo кепілдігі</h2>
            <ul className={s.gList}>
              <li><b>Ақшаң күймейді.</b> Мерзімінде қолданылмаған бірліктің құны Medeo бонусы болып қайтады — 12 ай жарамды.</li>
              <li><b>Ойыңнан айнысаң.</b> Бір бірлік те қолданбасаң, 14 күн ішінде ақшаның бәрі қайтарылады.</li>
              <li><b>Мекеме кінәлі болса.</b> Жабылып қалса не қабылдамаса, пайдаланылмаған бірліктердің ақшасы толық қайтарылады.</li>
              <li><b>Ұмытып кетпейсің.</b> Мерзімі бітерден 3 күн бұрын бот еске салады.</li>
            </ul>
            <button className={s.gLink} onClick={() => { haptic.tap(); go("/legal/refund"); }}>Қайтару ережесі</button>
          </section>
        )}

        {/* Мекеменің өз еркімен (Патша, 2026-11-19): пакетке қоса сыйлық және пакет иесінің артықшылығы */}
        {!ended && (base.bonus || base.perk) && (
          <section className={`${s.block} ${s.blk}`}>
            <h2 className={s.blockTitle}>Мекемеден қосымша</h2>
            <dl className={s.params}>
              {base.bonus && <div><dt>Пакетке қоса</dt><dd>{base.bonus}</dd></div>}
              {base.perk && <div><dt>Пакет иесіне</dt><dd>{base.perk}</dd></div>}
            </dl>
          </section>
        )}

        <section className={`${s.block} ${s.blk}`}>
        <h2 className={s.blockTitle}>Шарттары</h2>
        <dl className={s.params}>
          <div><dt>Бірлік</dt><dd>{`${offer.units} ${offer.unitWord}, әрқайсысы бөлек`}</dd></div>
          {base.portion && <div><dt>{base.kind === "hair" ? "Ұзақтығы" : "Порция"}</dt><dd>{base.kind === "hair" ? portionText(base.portion) : `${portionText(base.portion)}, бір ${offer.unitWord}`}</dd></div>}
          <div><dt>Мерзімі</dt><dd>{`${d.days ?? 30} күн, сатып алған сәттен`}</dd></div>
          {base.saleUntil && !ended && <div><dt>Сатылым</dt><dd>{`${saleDate(base.saleUntil)} дейін сатылады`}</dd></div>}
          {d.duration && !(base.kind === "hair" && base.portion) && <div><dt>Ұзақтығы</dt><dd>{d.duration}</dd></div>}
          {d.service ? <div><dt>Қызмет</dt><dd>{d.service}</dd></div> : <div><dt>Алу</dt><dd>{d.take}</dd></div>}
          <div><dt>Қолдану тәсілі</dt><dd>{base.planOnly ? "Тек алдын ала жоспар бойынша: әр келуге күн мен уақыт таңдайсың" : d.use}</dd></div>
          {base.offPeak && <div><dt>Бос сағат</dt><dd>{`Мекеменің бос уақытында келсең — тағы −${base.offPeak.pct}%: ${winLabel(base.offPeak)}. Сатып алғанда таңдайсың.`}</dd></div>}
        </dl>
        </section>

        {/* Құрамы — мекеме өзі жазады (Патша, 2026-11-18). Жоқ болса — тек үлгі ұсыныстарда бұрынғы тізім */}
        {base.composition ? (
          <section className={`${s.block} ${s.blk}`}>
            <h2 className={s.blockTitle}>{base.kind === "hair" ? "Қызметке не кіреді" : "Құрамы"}</h2>
            <p className={s.composition}>{base.composition}</p>
          </section>
        ) : hasSampleIncludes(base.id) && (
          <section className={`${s.block} ${s.blk}`}>
            <h2 className={s.blockTitle}>Пакетке не кіреді</h2>
            <ul className={s.bullets}>{d.includes.map((x, i) => <li key={i}><Segs list={[x]} /></li>)}</ul>
          </section>
        )}

        <section className={`${s.block} ${s.blk}`} style={{ position: "relative" }}>
          <h2 className={s.blockTitle}>Сипаттама</h2>
          <About list={d.about} text={base.about} open={open} onToggle={() => { haptic.tap(); setOpen(!open); }} />
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
          <h2 className={s.blockTitle}>{`Пікірлер · ${offer.ratingCount}`}</h2>
          <div className={s.inner}>
            <div className={s.score}>
              <b>{String(offer.rating).replace(".", ",")}</b>
              <span><span className={s.stars}>★★★★★</span><span className={s.venueAddr}>{`${offer.ratingCount} бағалау`}</span></span>
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
          <button key={mainBtn.text} className={`t-text w-600 ${s.btn} ${s.main} ${"shine" in mainBtn && mainBtn.shine ? s.shine : ""} ${(ended || soldOut) && waiting ? s.mainDone : ""}`} onClick={mainBtn.onClick}>{mainBtn.text}</button>
        </div>
      )}
    </div>
  );
}

function OfferSkeleton() {
  // Жүктелу кезіндегі қаңқа нақты беттің блоктарымен бірдей (Патша, 2026-11-16: «артық тіктөртбұрыш секіріп кетеді»)
  const bar = (w: number | string, h: number, r = 6) => <span className="sk" style={{ display: "block", width: w, height: h, borderRadius: r }} />;
  return (
    <div className={s.content} aria-busy>
      <section className={`${s.head} ${s.blk}`} style={{ gap: 12 }}>
        {bar(260, 30, 8)}
        {bar(180, 20)}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{bar(150, 40, 8)}<div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>{bar(120, 32, 8)}{bar(104, 32, 8)}</div></div>
        <div style={{ display: "flex", gap: 8 }}>{bar("33%", 64, 8)}{bar("33%", 64, 8)}{bar("33%", 64, 8)}</div>
      </section>
      <section className={s.blk} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bar(140, 24)}
        {[300, 260, 280, 220].map((w) => <div key={w}>{bar(w, 20)}</div>)}
      </section>
    </div>
  );
}
