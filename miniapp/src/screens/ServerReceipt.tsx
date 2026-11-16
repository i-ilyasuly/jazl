// B2 · Чек беті (Патша, 2026-11-17: «байсалды әрі өте әдемі»). PDF нұсқасымен бір дизайн:
// көк бас (бренд, мекеме, нөмір) → тесікті қағаз → сома мен мәртебе → нүктелі жолдар → жасыл үнем жолағы →
// «билет» кесігі → тексеру QR-ы. Төменде «Чекті жүктеу (PDF)». Ішкі бөлік (комиссия т.б.) мұнда келмейді.
// Маршруттар: /receipt/srv/:id және /receipt/no/:no (чектегі QR → t.me/<бот>?startapp=rc_<нөмір>).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../api";
import { fmt } from "../mocks/offers";
import { useGo } from "../nav";
import { downloadFile, haptic, inTelegram, openExternal, saveFile, useBackButton, useBottomButtons } from "../telegram";
import { CopyCode } from "../ui/CopyCode";
import { TelegramChrome } from "../ui/TelegramChrome";
import s from "./ServerReceipt.module.css";

interface Rc {
  id: string; no: string; total: number; status: string; title: string; dateLocal: string; verifyUrl: string;
  seller: { name: string; address: string | null; bin: string | null };
  item: { title: string; units: number; unitName: string; pricePerUnit: number; regularPricePerUnit: number; regularTotal: number; saving: number; discountPct: number };
  payment: { label: string; ref: string; mode: string };
  pack: { validFrom: string; validUntil: string; validDays: number; howToUse: string };
}

const Row = ({ k, v, mono, copy }: { k: string; v: string; mono?: boolean; copy?: boolean }) => (
  <div className={s.row}>
    <span className={s.k}>{k}</span><i className={s.dots} />
    {copy ? <CopyCode code={v} className={`${s.v} ${s.copy} mono`}>{v}</CopyCode> : <b className={`${s.v} ${mono ? "mono" : ""}`}>{v}</b>}
  </div>
);

export function ServerReceipt() {
  const { id, no } = useParams();
  const go = useGo();
  const [rc, setRc] = useState<Rc | null>(null);
  const [err, setErr] = useState(false);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ receipt: Rc }>(no ? "/v1/receipts/no/" + no : "/v1/receipts/" + id).then((j) => setRc(j.receipt)).catch(() => setErr(true));
  }, [id, no]);
  useEffect(() => { if (rc) void QRCode.toString(rc.verifyUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111a26", light: "#0000" } }).then(setQr); }, [rc]);
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  const download = useCallback(async () => {
    if (!rc || busy) return;
    haptic.tap(); setBusy(true);
    try {
      const l = await api<{ url: string; fileName: string }>(`/v1/receipts/${rc.id}/link`, { method: "POST" });
      const r = await downloadFile(l.url, l.fileName);
      if (r === null) { if (inTelegram) openExternal(l.url); else saveFile(l.url, l.fileName); }
      if (r !== false) haptic.success();
    } catch { haptic.error(); } finally { setBusy(false); }
  }, [rc, busy]);
  const main = useMemo(() => ({ text: busy ? "Дайындалуда…" : "Чекті жүктеу · PDF", onClick: () => { void download(); } }), [busy, download]);
  useBottomButtons(main, undefined, Boolean(rc));

  if (err || !rc) return (
    <div className={s.page}><TelegramChrome mode="back" onBack={back} /><p className={`t-sub2 ${s.state}`}>{err ? "Чекті жүктеу мүмкін болмады" : "Жүктелуде…"}</p></div>
  );
  const i = rc.item;
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} onDark />
      <header className={s.head}>
        <div className={s.brandRow}><b className={s.brand}>Jazl+</b><span className={s.tag}>ЭЛЕКТРОНДЫҚ ЧЕК</span></div>
        <h1 className={s.venue}>{rc.seller.name}</h1>
        {rc.seller.address && <p className={s.addr}>{rc.seller.address}</p>}
        <p className={`${s.meta} mono`}>{rc.no} · {rc.dateLocal}</p>
      </header>
      <article className={s.paper}>
        <span className={s.perf} aria-hidden />
        <p className={s.title}>{rc.title}</p>
        <p className={s.total}>{fmt(rc.total)}</p>
        <span className={s.status}>{rc.status}</span>

        <h2 className={s.sec}>Сатып алынды</h2>
        <Row k="Пакет" v={i.title} />
        <Row k="Көлемі" v={`${i.units} ${i.unitName}`} />
        <Row k="1 бірлік бағасы" v={fmt(i.pricePerUnit)} />
        <Row k="Бөлек алғанда" v={`${fmt(i.regularPricePerUnit)} / ${i.unitName}`} />
        <Row k="Бөлек алғандағы сомасы" v={fmt(i.regularTotal)} />
        <div className={s.save}><span>Сіздің үнеміңіз</span><b>{fmt(i.saving)} · {i.discountPct}%</b></div>

        <h2 className={s.sec}>Мекеме</h2>
        <Row k="Атауы" v={rc.seller.name} />
        {rc.seller.address && <Row k="Мекенжайы" v={rc.seller.address} />}
        {rc.seller.bin && <Row k="БСН" v={rc.seller.bin} mono />}

        <h2 className={s.sec}>Төлем</h2>
        <Row k="Тәсілі" v={rc.payment.label} />
        <Row k="Уақыты" v={rc.dateLocal} />
        <Row k="Чек №" v={rc.no} copy />
        <Row k="Транзакция" v={rc.payment.ref.slice(0, 18)} copy />

        <h2 className={s.sec}>Пакет мерзімі</h2>
        <Row k="Басталды" v={rc.pack.validFrom} />
        <Row k="Аяқталады" v={rc.pack.validUntil} />
        <Row k="Мерзімі" v={`${rc.pack.validDays} күн`} />

        <div className={s.cut} aria-hidden />
        <div className={s.verify}>
          <span className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
          <span className={s.vText}><b>Чекті тексеру</b><small>QR-ды Telegram камерасымен сканерлесеңіз, чектің түпнұсқасы Jazl+ ботында ашылады.</small><em className="mono">{rc.no}</em></span>
        </div>
        {rc.payment.mode === "test" && <p className={s.test}>Сынақ төлемі — ақша алынған жоқ</p>}
        <p className={s.legal}>{rc.pack.howToUse}. Jazl+ — агент: пакет мекемеден Jazl+ сервисі арқылы алынды. Бұл — электрондық түбіртек; фискалдық чекті мекеме не төлем жүйесі береді.</p>
      </article>
      {!inTelegram && <div className={s.bar}><button className={s.btn} onClick={() => void download()}>{main.text}</button></div>}
    </div>
  );
}
