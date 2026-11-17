// Figma «05 · Кассир»: Клиенттің пакетін таңда (14015:7998), Қосымша баға теру (14015:8108), Төлем QR (14015:8259),
// Төлем өтті (14015:8306), QR мерзімі өтті (14015:8971).
// Жазба «Кассир қалай жұмыс істейді»: кассир соманы термейді — пакетті таңдайды, QR дана бағасын көрсетеді; қосымша тауар пакеттен
// алынбайды, клиент оны кассада бөлек төлейді. QR суреті әр 30 с жаңарады (Патшаның ережесі), сеанс 2 минут жарамды, астында 6 таңбалы код.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { useGo } from "../nav";
import { haptic, nativePick } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { dayMonth, err, hm, money, useCurrent, V, type Paid, type QrState, type VOffer } from "./api";
import { Buttons, Note, OfferPic, Sheet, Sk, VPage } from "./ui";
import s from "./V.module.css";

interface Draft { branchId: string; offer: VOffer; units: number; extras: { amount: number; qty: number }[] }
let draft: Draft | null = null; // «Пакетті өзгерту» / «Жаңа QR» үшін соңғы таңдау
const extraSum = (d: Draft) => d.extras.reduce((a, x) => a + x.amount * x.qty, 0);

export function VPay() {
  const go = useGo();
  const me = useCurrent();
  const [offers, setOffers] = useState<VOffer[] | null>(null);
  const [branch, setBranch] = useState(draft?.branchId ?? me?.branchId ?? me?.branches[0]?.id ?? "");
  const [offerId, setOfferId] = useState(draft?.offer.id ?? "");
  const [units, setUnits] = useState(draft?.units ?? 1);
  const [extras, setExtras] = useState(draft?.extras ?? []);
  const [keypad, setKeypad] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) V.offers(me.venue.id).then((l) => { const act = l.filter((o) => o.status === "active"); setOffers(act); setOfferId((x) => x || act[0]?.id || ""); }).catch(() => setOffers([])); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!branch && me?.branches[0]) setBranch(me.branches[0].id); }, [me, branch]);
  const offer = offers?.find((o) => o.id === offerId);
  const fromPack = offer ? offer.unitPrice * units : 0;
  const cash = extras.reduce((a, x) => a + x.amount * x.qty, 0);

  const make = useCallback(async () => {
    if (!offer || !branch || busy) return;
    setBusy(true); haptic.medium();
    const d: Draft = { branchId: branch, offer, units, extras: extras.filter((x) => x.qty > 0) };
    try { const ss = await V.qr(branch, offer.id, units, extraSum(d)); draft = d; go(`/v/pay/qr/${ss.id}`, "forward"); }
    catch (e) { haptic.error(); await nativePick("QR шықпады", err(e) === "network" ? "Желі жоқ. Қайталап көріңіз." : "Қайталап көріңіз.", [{ id: "ok", text: "Жақсы" }], "ok"); }
    finally { setBusy(false); }
  }, [offer, branch, units, extras, busy, go]);

  async function pickBranch() {
    if (!me || me.branchId || me.branches.length < 2) return;
    const id = await nativePick("Филиал", "Қай филиалда төлем қабылдайсың?", me.branches.slice(0, 3).map((b) => ({ id: b.id, text: b.address })), "");
    if (id) { haptic.select(); setBranch(id); }
  }
  const addr = me?.branches.find((b) => b.id === branch)?.address ?? "";
  return (
    <VPage back>
      <button className={s.pin} onClick={() => void pickBranch()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#229af0" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
        {addr || "Филиал"}{me && !me.branchId && me.branches.length > 1 && <i className={s.chev} style={{ color: "var(--text-secondary)" }} />}
      </button>
      <h1 className={s.lead} style={{ fontSize: 20, lineHeight: "25px", margin: "4px 0 -2px" }}>Клиенттің пакетін таңда</h1>
      {offers === null ? <><Sk h={72} /><Sk h={72} /></> : offers.length === 0 ? <Note tone="warn">Белсенді ұсыныс жоқ. Иесі «Ұсыныстар» бөлімінде ұсынысты қосуы керек.</Note>
        : offers.map((o) => (
          <button key={o.id} className={`${s.offer} ${o.id === offerId ? s.offerOn : ""}`} onClick={() => { haptic.select(); setOfferId(o.id); setUnits(1); }}>
            <span className={s.offerPic}><OfferPic kind={o.kind} size={30} /></span>
            <span className={s.rowText}><span className={s.offerName}>{o.title}</span><span className={s.offerSub}>Бірлік {money(o.unitPrice)}</span></span>
            <span className={`${s.check} ${o.id === offerId ? s.checkOn : ""}`} />
          </button>
        ))}

      <div className={s.card}>
        <div className={s.stepRow}>
          <span className={s.rowText}><span className={s.rowTitle}>Қанша бірлік</span><span className={s.rowSub} style={{ whiteSpace: "normal" }}>Клиент бірнеше бірлікті бірден алуы мүмкін</span></span>
          <Stepper value={units} min={1} max={20} onChange={setUnits} />
        </div>
      </div>

      <h2 className={s.blueHead}>Қосымша (пакеттен алынбайды)</h2>
      <div className={s.card}>
        {extras.map((x, i) => (
          <div key={i} className={s.stepRow}>
            <span className={s.rowText}><span className={s.rowTitle}>Басқа баға</span><span className={s.rowSub}>{money(x.amount)}</span></span>
            <Stepper value={x.qty} min={0} max={20} onChange={(q) => setExtras((l) => l.map((y, k) => (k === i ? { ...y, qty: q } : y)).filter((y) => y.qty > 0))} />
          </div>
        ))}
        <div className={s.stepRow}>
          <span className={s.rowText}><span className={s.rowTitle}>+ Басқа баға</span><span className={s.rowSub}>Қолмен енгізу</span></span>
          <div className={s.stepper}><button className={s.stepBtn} disabled aria-label="Азайту">−</button><span className={s.stepVal}>0</span><button className={s.stepBtn} onClick={() => { haptic.tap(); setKeypad(true); }} aria-label="Қосу">+</button></div>
        </div>
      </div>

      <div className={s.sum}>
        <div className={s.kv}><span>Пакеттен төленеді</span><b className={s.blue}>{money(fromPack)}</b></div>
        {cash > 0 && <div className={s.kv}><span>Клиент кассада төлейді</span><b>{money(cash)}</b></div>}
      </div>
      <Buttons main={{ text: busy ? "QR жасалуда…" : `QR шығару · ${money(fromPack)}`, onClick: () => void make(), disabled: !offer || busy, shine: true }} />
      {keypad && <ExtraPad onClose={() => setKeypad(false)} onDone={(a) => { setKeypad(false); if (a > 0) setExtras((l) => [...l, { amount: a, qty: 1 }]); }} />}
    </VPage>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className={s.stepper}>
      <button className={s.stepBtn} disabled={value <= min} onClick={() => { haptic.select(); onChange(Math.max(min, value - 1)); }} aria-label="Азайту">−</button>
      <span className={s.stepVal}>{value}</span>
      <button className={s.stepBtn} disabled={value >= max} onClick={() => { haptic.select(); onChange(Math.min(max, value + 1)); }} aria-label="Көбейту">+</button>
    </div>
  );
}

/** Figma «Қосымша баға теру»: 700 ₸ үлкен сан, 3×4 пернетақта, сары ескерту. */
function ExtraPad({ onClose, onDone }: { onClose: () => void; onDone: (amount: number) => void }) {
  const [v, setV] = useState("");
  const press = (k: string) => { haptic.select(); setV((x) => (k === "del" ? x.slice(0, -1) : k === "," ? x : (x + k).replace(/^0+/, "").slice(0, 7))); };
  const amount = Number(v || 0);
  return (
    <Sheet title="Қосымша тауар бағасы" onClose={onClose} grab={false}>
      <div className={s.card} style={{ padding: "12px 16px", textAlign: "center" }}>
        <span className={s.rowSub}>Тауар атауы (міндетті емес)</span>
        <div className={s.big} style={{ fontSize: 32, lineHeight: "40px", color: "var(--text-strong)" }}>{amount.toLocaleString("ru-RU")} ₸</div>
      </div>
      <div className={s.keys}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"].map((k) => (
          <button key={k} className={s.key} onClick={() => press(k)} aria-label={k === "del" ? "Өшіру" : k}>{k === "del" ? "⌫" : k}</button>
        ))}
      </div>
      <Note tone="warn">Бұл сома клиенттің пакет балансынан алынбайды. Клиент қолма-қол немесе басқа банк арқылы төлейді.</Note>
      <Buttons main={{ text: amount ? `Қосу · ${money(amount)}` : "Қосу", onClick: () => onDone(amount), disabled: !amount }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

/** Төлем QR: сурет әр 30 с жаңарады, сеанс 2 минут; клиент төлесе — «Төлем өтті», мерзімі өтсе — «QR мерзімі өтті». */
export function VQr() {
  const go = useGo();
  const { id = "" } = useParams();
  const [st, setSt] = useState<QrState | null>(null);
  const [svg, setSvg] = useState("");
  const [now, setNow] = useState(Date.now());
  const shownExp = useRef(0); // көрсетіліп тұрған QR суретінің мерзімі: 5 с қалғанда ғана жаңасымен ауыстырамыз (әр 2 с жыпылықтамау үшін)
  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const r = await V.qrState(id); if (dead) return;
        setSt(r);
        if (r.status === "paid") { haptic.success(); go(`/v/pay/done/${id}`, "forward", { replace: true, state: r.paid }); }
        if (r.status === "waiting" && Date.now() / 1000 > shownExp.current - 5) {
          shownExp.current = r.exp;
          setSvg(await QRCode.toString(r.payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111a26", light: "#ffffff" } }));
        }
      } catch { /* желі — келесі айналым */ }
    };
    void poll();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void poll(); }, 2000);
    const c = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { dead = true; clearInterval(t); clearInterval(c); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(async () => { haptic.soft(); await V.qrCancel(id).catch(() => null); go("/v/cashier", "back", { replace: true }); }, [id, go]);
  const change = useCallback(async () => { haptic.tap(); await V.qrCancel(id).catch(() => null); go("/v/pay", "back", { replace: true }); }, [id, go]);
  const again = useCallback(async () => {
    if (!draft) return go("/v/pay", "back", { replace: true });
    haptic.medium();
    try { const ss = await V.qr(draft.branchId, draft.offer.id, draft.units, extraSum(draft)); go(`/v/pay/qr/${ss.id}`, "fade", { replace: true }); } catch { haptic.error(); }
  }, [go]);

  const expired = st?.status === "expired" || (st?.status === "waiting" && new Date(st.expiresAt).getTime() <= now);
  if (expired) return (
    <VPage>
      <div className={s.state}><Sticker name="sleep" size={140} /><h2 className={s.stateTitle}>QR мерзімі өтті</h2><p className={s.stateText}>Қауіпсіздік үшін QR 2 минуттан кейін өшеді. Жаңасын шығар.</p></div>
      <Buttons main={{ text: "Жаңа QR", onClick: () => void again() }} second={{ text: "Бас тарту", onClick: () => go("/v/cashier", "back", { replace: true }) }} />
    </VPage>
  );
  const left = st?.status === "waiting" ? Math.max(0, Math.round((new Date(st.expiresAt).getTime() - now) / 1000)) : 120;
  const w = st?.status === "waiting" ? st : null; // сеанс деректері серверден (бет қайта ашылса да)
  const extra = w ? w.extra : draft ? extraSum(draft) : 0;
  return (
    <VPage title="Төлем QR" back>
      <div className={s.amount}>{w?.amount != null ? money(w.amount) : <Sk w={140} h={36} />}</div>
      {w?.title && <p className={`${s.muted} ${s.amountSub}`}>{w.title} × {w.units} • пакеттен</p>}
      <div className={s.qrCard}>
        <span className={`${s.qrImg} ${svg ? "" : s.qrFade}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <span className={s.valid}><i className={s.clock} />Жарамдылығы {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>
        <span className={`${s.bar} ${left < 30 ? s.low : ""}`}><i style={{ width: `${(left / 120) * 100}%` }} /></span>
      </div>
      {st?.status === "waiting" && <div className={s.code}><span>Код</span><b>{st.code.slice(0, 3)} {st.code.slice(3)}</b></div>}
      <p className={`t-cap1 ${s.muted} ${s.center}`} style={{ marginTop: -6 }}>Сканер істемесе, клиент осы кодты енгізеді</p>
      {extra > 0 && <span className={s.extraPill}>Қосымша {money(extra)}: кассада төленеді</span>}
      <span className={s.wait}><span className={s.dots}><i /><i /><i /></span>Клиент төлемін күтеміз</span>
      <Note>Клиент Jazl+ қолданбасындағы сканермен осы QR-ды оқысын.</Note>
      <Buttons main={{ text: "Пакетті өзгерту", onClick: () => void change() }} second={{ text: "Бас тарту", onClick: () => void cancel() }} />
    </VPage>
  );
}

export function VPaid() {
  const go = useGo();
  const { id = "" } = useParams();
  const loc = useLocation();
  const [p, setP] = useState<Paid | null>((loc.state as Paid | null) ?? null);
  useEffect(() => { if (!p) V.qrState(id).then((r) => { if (r.status === "paid") setP(r.paid); }).catch(() => null); }, [id, p]);
  const next = useCallback(() => { draft = null; haptic.medium(); go("/v/pay", "forward", { replace: true }); }, [go]);
  const receipt = useCallback(() => { if (p?.receiptId) go(`/receipt/srv/${p.receiptId}`); }, [p, go]);
  return (
    <VPage>
      <div className={s.result}>
        <Sticker name="party" size={120} />
        <h1 className={s.resultTitle}>Төлем өтті</h1>
        <span className={s.resultSum}>{p ? "+" + money(p.venueAmount) : <Sk w={140} h={36} />}</span>
        <p className={`t-sub2 ${s.muted}`}>Ақша сол сәтте мекеме шотына бөлінді</p>
      </div>
      {p && (
        <div className={s.card}>
          <div className={s.kv}><span>Клиент</span><b>{p.customer}</b></div>
          <div className={s.kv}><span>Пакет</span><b>{p.title} × {p.units}</b></div>
          <div className={s.kv}><span>Пакет күйі</span><span className={s.tag}>{p.left} / {p.total} бірлік қалды</span></div>
          {p.extra > 0 && <div className={s.kv}><span>Қосымша</span><b>{money(p.extra)} • кассада төленеді</b></div>}
          <div className={s.kv}><span>Уақыты</span><b>{dayMonth(p.at)}, {hm(p.at)}</b></div>
          {p.ref && <div className={s.kv}><span>Банк референсі</span><b>{p.ref}</b></div>}
        </div>
      )}
      <Buttons main={{ text: "Жаңа төлем", onClick: next, shine: true }} second={{ text: "Чек", onClick: receipt }} />
    </VPage>
  );
}
