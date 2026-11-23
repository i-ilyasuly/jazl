import { getLang, kk } from "../i18n";
import { routeRows as routeRowsOf } from "../ui/route";
import { winLabel } from "../offpeak";
import { toggleFav, toggleRestock, useFavs, usePacks, useRestock, appLink } from "../store";
import { Rich } from "../ui/Rich";
import { Photo } from "../ui/Photo";
import { kindPic } from "../ui/Emo";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { track } from "../track";
import { useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { BuySheet, type BuyStep } from "../ui/BuySheet";
import { UseSheet } from "../ui/UseSheet";
import { detailsOf, discount, findOffer, fmt, hasSampleIncludes, isEnded, isSoldOut, portionText, saving, unitPrice, type OfferDetails, type OfferKind } from "../mocks/offers";
import { galleryOf } from "../mocks/photos";
import { Sticker } from "../ui/Sticker";
import { lngLat, venues } from "../mocks/venues";
import { HowSheet } from "../ui/HowSheet";
import { LinkSheet, type LinkRow } from "../ui/LinkSheet";
import { askWriteAccess, haptic, inTelegram, nativeAlert, nativePick, openChat, openExternal, useBackButton, useBottomButtons } from "../telegram";
import { ActionSheet } from "../ui/ActionSheet";
import { TelegramChrome } from "../ui/TelegramChrome";
import heroBurger from "../assets/icons/heroBurger.svg";
import share from "../assets/icons/share.svg";
import heartFill from "../assets/icons/heartFill26.svg";
import { Money } from "../ui/Money";
import heartLine from "../assets/icons/heart.svg";
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
  useLayoutEffect(() => { const el = ref.current; if (el) setLong(el.scrollHeight > el.clientHeight + 2); }, [list, text]);
  // Мекеме өзі жазған сипаттама бар болса — сол (клиент тілінде), әйтпесе санат үлгісі
  const body = text ? <Rich text={text} /> : <Lines list={list} />;
  // Squirrel. (13): ішкі көк қорап жоқ — жай мәтін, ұзын болса астында «Толығырақ» сілтемесі
  if (!long) return <div className={s.about}><span ref={ref} className={s.aboutText}>{body}</span></div>;
  return (
    <div className={`${s.about} ${open ? s.aboutOpen : ""}`} role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
      <span ref={ref} className={s.aboutText}>{body}</span>
      <span className={s.more}>{open ? "Жасыру" : "Толығырақ"}</span>
    </div>
  );
}

/** Ашылмалы тармақ: тақырып + қысқа түсініктеме көрінеді, толық мәтін басқанда тегіс ашылады */
function Fold({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <div className={`${s.fold} ${on ? s.foldOn : ""}`}>
      <button className={s.foldHead} aria-expanded={on} onClick={() => { haptic.tap(); setOn(!on); }}>
        <span className={s.foldText}><span className={s.foldTitle}>{title}</span>{sub && <span className={s.foldSub}>{sub}</span>}</span>
        <i className={s.foldChev} aria-hidden />
      </button>
      <div className={s.foldBody}><div className={s.foldInner}>{children}</div></div>
    </div>
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
  // Пилот воронкасы: ұсынысты көрді, «Сатып алу» парағын ашты (Патша, 2026-11-21)
  useEffect(() => { if (id) track("view", id); }, [id]);
  useEffect(() => { if (buying && id) track("buy_start", id); }, [buying, id]);
  const [using, setUsing] = useState(false);
  const [choose, setChoose] = useState(false);
  const { loading } = useMock("offer:" + offer.id, offer, 450);
  const d = detailsOf(base);
  const photos = useMemo(() => galleryOf(base.id, base.kind), [base.id, base.kind]);
  const shareIt = () => { haptic.tap(); track("share", offer.id); const url = "https://t.me/share/url?url=" + encodeURIComponent(appLink("offer", offer.id)) + "&text=" + encodeURIComponent(`${offer.title} — ${offer.venue}, ${fmt(offer.price)}`); if (inTelegram) openChat(url.replace("https://t.me/", "")); else window.open(url, "_blank", "noopener"); };

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
  const routeRows: LinkRow[] = routeRowsOf(base.venue, base.address || base.venue, venue ? lngLat(venue) : undefined); // 2ГИС + Google Maps (Патша, 2026-11-21)
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
        {ended && <span className={s.endedDuck}><Sticker name="sad" size={150} /></span>}
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
            <span className={s.muted}>{"·  "}<svg className={s.starIco} width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="m12 2.8 2.8 5.7 6.3.9-4.5 4.4 1 6.3L12 17.1l-5.6 3 1-6.3L2.9 9.4l6.3-.9z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>{` ${String(offer.rating).replace(".", ",")} (${offer.ratingCount})  ·  ${offer.distance}`}</span>
          </p>
          {venue?.trust != null && <p className={s.trust}><span aria-hidden>✓</span>{`Сенімді мекеме · ${venue.trust}% қызмет шағымсыз`}</p>}
          {/* Бағадан бұрын контекст (Хормози): клиент әдетте қанша төлейтінін көрсетіп, сосын пакет бағасы */}
          <div className={s.priceRow}>
            <div>
              {/* UX 5 (Патша, 2026-11-23): негізгі баға мен ескі баға бір қатарда; мерзімі — оқылатын өлшемде */}
              <p className={`${s.priceLine} ${ended ? s.dim : ""}`}><span key={offer.price} className={s.swap}><Money n={offer.price} /></span><s className={s.oldInline}><Money n={offer.oldPrice} /></s></p>
              {!ended && <p className={s.validity}>{`${d.days ?? 30} күн жарамды`}</p>}
            </div>
            <div className={s.badges} style={ended ? { visibility: "hidden" } : undefined}>
              {/* Жасыл белгі (жеңілдік) және дана бағасы сұр капсулада — бағамен таласпайды */}
              <span className={`${s.badge} ${s.green}`}><b>▼ {discount(offer)}%</b></span>
              <span className={s.unitPill}>{fmt(unitPrice(offer))} / {offer.unitWord}</span>
              {/* Патша (2026-11-21): әлеуметтік дәлел — дана бағасының астында */}
              {offer.buyers > 0 && <span className={s.buyersLine}><span className={s.buyersIco} aria-hidden />{`${offer.buyers} адам алды`}</span>}
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


        {/* UX 3, 6 (Патша, 2026-11-23): «Құрамы», «Мекемеден қосымша» және «Шарттары» — бір карточка, бір жолдық бөлек карточкалар жоқ.
            Мерзімі мұнда қайталанбайды: ол бағаның астында тұр. */}
        <section className={`${s.block} ${s.blk}`}>
          <h2 className={s.blockTitle}>Пакет шарттары</h2>
          {base.composition ? <p className={s.composition}>{base.composition}</p>
            : hasSampleIncludes(base.id) && <ul className={s.bullets}>{d.includes.map((x, i) => <li key={i}><Segs list={[x]} /></li>)}</ul>}
          <dl className={`${s.params} ${base.composition || hasSampleIncludes(base.id) ? s.paramsSep : ""}`}>
            <div><dt>Бірлік</dt><dd>{`${offer.units} ${offer.unitWord}, әрқайсысы бөлек`}</dd></div>
            {base.portion && <div><dt>{base.kind === "hair" ? "Ұзақтығы" : "Порция"}</dt><dd>{base.kind === "hair" ? portionText(base.portion) : `${portionText(base.portion)}, бір ${offer.unitWord}`}</dd></div>}
            {d.duration && !(base.kind === "hair" && base.portion) && <div><dt>Ұзақтығы</dt><dd>{d.duration}</dd></div>}
            {d.service ? <div><dt>Қызмет</dt><dd>{d.service}</dd></div> : <div><dt>Алу</dt><dd>{d.take}</dd></div>}
            <div><dt>Қолдану</dt><dd>{base.planOnly ? "Тек алдын ала жоспар бойынша: әр келуге күн мен уақыт таңдайсың" : d.use}</dd></div>
            {!ended && base.bonus && <div><dt>Пакетке қоса</dt><dd>{base.bonus}</dd></div>}
            {!ended && base.perk && <div><dt>Пакет иесіне</dt><dd>{base.perk}</dd></div>}
            {base.offPeak && <div><dt>Бос сағат</dt><dd>{`Мекеменің бос уақытында келсең — тағы −${base.offPeak.pct}%: ${winLabel(base.offPeak)}. Сатып алғанда таңдайсың.`}</dd></div>}
            {base.saleUntil && !ended && <div><dt>Сатылым</dt><dd>{`${saleDate(base.saleUntil)} дейін сатылады`}</dd></div>}
          </dl>
        </section>

        <section className={`${s.block} ${s.blk}`} style={{ position: "relative" }}>
          <h2 className={s.blockTitle}>Сипаттама</h2>
          <About list={d.about} text={base.about} open={open} onToggle={() => { haptic.tap(); setOpen(!open); }} />
        </section>

        {/* UX 3 (Патша, 2026-11-23): кепілдік пен ережелер бір блокта; қысқа тақырыптар көрінеді, толығы — ашылмалы тізімде */}
        <section className={`${s.blk} ${s.rules}`}>
          <h2 className={`${s.blockTitle} ${s.rulesTitle}`}>Squirrel кепілдігі</h2>
          <Fold title="Ақшаң күймейді" sub="Қолданылмаған бірлік бонус болып қайтады">
            <p>Мерзімінде қолданылмаған бірліктің құны Squirrel бонусы болып қайтады — 12 ай жарамды. Мерзімі бітерден 3 күн бұрын бот еске салады.</p>
            <button className={s.gLink} onClick={() => { haptic.tap(); go("/rules/carry"); }}>Мерзімі және көшіру ережесі</button>
          </Fold>
          <Fold title="Ақшаны қайтару" sub="14 күн ішінде не мекеме кінәлі болса">
            <p><b>Ойыңнан айнысаң.</b> Бір бірлік те қолданбасаң, 14 күн ішінде ақшаның бәрі қайтарылады.</p>
            <p><b>Мекеме кінәлі болса.</b> Жабылып қалса не қабылдамаса, пайдаланылмаған бірліктердің ақшасы толық қайтарылады.</p>
            <span className={s.foldLinks}>
              <button className={s.gLink} onClick={() => { haptic.tap(); go("/legal/refund"); }}>Қайтару ережесі</button>
              <button className={s.gLink} onClick={() => { haptic.tap(); go("/profile/faq"); }}>Сұрақтар мен мәселелер</button>
            </span>
          </Fold>
          {offer.kind === "hair" && <Fold title="Жазылу және бас тарту" sub="2 сағат қалғанға дейін тегін">
            <p>Жазылуға 2 сағат қалғанға дейін уақытты тегін ауыстырып не бас тарта аласың. Кейін бас тартсаң не келмесең, пакеттен бір рет жұмсалады.</p>
          </Fold>}
          <button className={s.rule} onClick={() => { haptic.tap(); setSheet("how"); }}><span>Қалай қолданамын?</span><i className={s.chev} /></button>
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
              {/* UX 7: екінші дәрежелі — сұр фон, қара мәтін, иконка; негізгі «Төлеу / Тағы алу» батырмасымен шатаспайды */}
              <button className={s.chipBtn} onClick={() => { haptic.tap(); setSheet("route"); }}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.5 1.5 6.6c.2.8 1.3.9 1.6.1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>Бағыт</button>
              <button className={s.chipBtn} onClick={() => { haptic.tap(); setSheet("contact"); }}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M6.6 3.5h2.6l1.4 4.1-2 1.5a12 12 0 0 0 6.3 6.3l1.5-2 4.1 1.4v2.6c0 1-.8 1.8-1.8 1.8A16.9 16.9 0 0 1 4.8 5.3c0-1 .8-1.8 1.8-1.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>Байланыс</button>
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
