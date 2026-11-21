// Figma «10 · Сканер және QR-төлем» күйлері: «Төлем өтпеді» 13906:8206, «Растау күтілуде» 13906:8227,
// «Қауіпсіздік шектеуі» 13907:8013, «Сома сәйкес емес» 13907:8035, «Мекеме серіктес емес» 13907:8059,
// «Белсенді пакет жоқ» 13907:8080, «QR емес код» 13907:8101, «Камераға рұқсат жоқ» 13941:8010,
// «Интернет жоқ» 13941:8031, «QR мерзімі өтті» 13941:8052, «QR бұрын төленген» 13941:8073,
// «Камера жоқ (desktop)» 13941:8094, «PIN орнат: кіріспе» 13941:8113, «Жеке басты растау: кіріспе» 13918:8246.
// Стикерлер — Figma «21 · Стикер кітапханасы» (14025:14443) бойынша.
// Өлшемдер — UI kit шкаласы (тақырып 24/30, мәтін 17/22, ескертпе 15/20) және 4/8px тор.
// Демо: сканер мекенжайына ?scan=<күй> қосылса, QR оқылғаннан кейін сол күй ашылады.
import { useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fmt, unitPrice } from "../mocks/offers";
import { useGo } from "../nav";
import { getPack, offerOf } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import s from "./PayResult.module.css";

export const scanStates = ["fail", "pending", "limit", "amount", "notpartner", "nopack", "notqr", "nocam", "offline", "expired", "paidbefore", "desktop", "pinintro", "kyc", "othervenue", "closed", "planonly", "otherbranch"] as const;
export type ScanKind = (typeof scanStates)[number];
/** QR оқылған бойда белгілі болатын күйлер (төлемге дейін). Қалғаны төлемнен кейін шығады. */
export const scanEarly: ScanKind[] = ["closed", "othervenue", "amount", "notpartner", "nopack", "notqr", "nocam", "offline", "expired", "paidbefore", "desktop", "pinintro", "kyc", "otherbranch"];

interface Copy { sticker: StickerName; title: string; text: string; note?: string; left?: string; main: string }
const copy: Record<ScanKind, Copy> = {
  fail: { sticker: "cry", title: "Растау өтпеді", text: "Бірлік жұмсалған жоқ. Байланысты тексеріп, қайта сканерле немесе кассирге айт.", left: "Көмек", main: "Қайта көру" },
  pending: { sticker: "wait", title: "Төлем растауы күтілуде", text: "Банк жауабын күтіп жатырмыз. Нәтиже Пакеттерімде көрінеді.", note: "Қайта төлеме: жауап келмесе, бірлік автоматты түрде қайтарылады.", main: "Пакеттерге өту" },
  limit: { sticker: "stop", title: "Төлем уақытша шектелген", text: "Қысқа уақытта тым көп әрекет болды. 10 минуттан кейін қайта көр.", note: "Бұл сенің ақшаңды қорғау үшін жасалған шара.", main: "Түсінікті" },
  amount: { sticker: "think", title: "Сома пакетке сәйкес емес", text: "Кассадағы сома пакеттің бірлік бағасына еселі емес. Кассирден соманы түзетіп, QR-ды қайта шығаруын сұра.", left: "Көмек", main: "Қайта сканерлеу" },
  notpartner: { sticker: "stop", title: "Бұл мекеме Squirrel серіктесі емес", text: "Бұл төлем QR-ына Squirrel пакетімен төлеу мүмкін емес.", left: "Мекеме ұсыну", main: "Түсінікті" },
  nopack: { sticker: "empty", title: "Бұл мекемеде белсенді пакетің жоқ", text: "Пакет сатып алсаң, келесі жолы төлей аласың.", main: "Ұсыныстарды көру" },
  notqr: { sticker: "search", title: "Бұл төлем QR-ы емес", text: "Кассадағы терминал экранындағы төлем QR-ын сканерле.", main: "Қайта сканерлеу" },
  nocam: { sticker: "phone", title: "Камераға рұқсат жоқ", text: "Сканер үшін Telegram баптауында Squirrel камерасына рұқсат бер.", left: "Код енгізу", main: "Қайта көру" },
  offline: { sticker: "offline", title: "Интернет жоқ", text: "Төлем үшін желі керек. Қосылып, қайта сканерле.", main: "Қайта сканерлеу" },
  expired: { sticker: "sleep", title: "QR мерзімі өтті", text: "Кассирден жаңа QR шығаруын сұра.", main: "Қайта сканерлеу" },
  paidbefore: { sticker: "party", title: "Бұл QR бұрын төленген", text: "Төлем жасалған. Қолдану тарихынан көруге болады.", left: "Тарихқа өту", main: "Түсінікті" },
  desktop: { sticker: "phone", title: "Сканерді телефонда аш", text: "Компьютерде камера қолжетімсіз. Squirrel қолданбасын телефоннан аш.", left: "Код енгізу", main: "Түсінікті" },
  pinintro: { sticker: "lock", title: "Төлем үшін PIN орнат", text: "PIN әр төлемді растайды. Саусақ ізін де қосуға болады.", main: "PIN орнату" },
  // Патша (2026-11-17): басқа мекеменің QR-ы — сол мекемеде пакет болмаса
  // Figma «07 · Филиалдар»: жұмыс уақытынан тыс не уақытша жабық филиалда QR төлем қабылданбайды
  closed: { sticker: "sleep", title: "Мекеме қазір жабық", text: "Бұл филиал қазір төлем қабылдамайды. Бірлік жұмсалған жоқ — жұмыс уақытында қайта сканерле.", main: "Түсінікті" },
  planonly: { sticker: "clock", title: "Бұл пакет тек жоспар бойынша", text: "Мекеме бұл ұсынысты тек алдын ала жоспар бойынша қабылдайды. Пакет бетінде «Қолдану» → күн мен уақытты таңда.", main: "Пакеттерге өту" },
  otherbranch: { sticker: "stop", title: "Бұл пакет осы филиалда жүрмейді", text: "Мекеме бұл ұсынысты тек мына филиалдарда қабылдайды. Бірлік жұмсалған жоқ.", main: "Түсінікті" },
  othervenue: { sticker: "stop", title: "Бұл QR басқа мекеменікі", text: "Бұл мекемеде белсенді пакетің жоқ. Пакет таңдаған мекеменің кассасындағы QR-ды сканерле.", main: "Түсінікті" },
  kyc: { sticker: "lock", title: "Төлеу үшін жеке басыңды растау керек", text: "Банк талабы бойынша бір рет. Деректер банкте сақталады.", note: "Бұл қадам тек банк-серіктес талап етсе көрсетіледі.", left: "Кейін", main: "Растау" },
};

export function ScanState() {
  const { kind = "fail" } = useParams();
  const [params] = useSearchParams();
  const k = ((scanStates as readonly string[]).includes(kind) ? kind : "fail") as ScanKind;
  const c = copy[k];
  const go = useGo();
  const packId = params.get("pack") ?? "";
  const pack = getPack(packId);
  const o = pack ? offerOf(pack) : null;
  const home = useCallback(() => go("/", "fade", { replace: true }), [go]);
  const rescan = useCallback(() => go("/scan" + (packId ? "?pack=" + packId : ""), "fade", { replace: true }), [go, packId]);
  const close = useCallback(() => (window.history.length > 1 ? go(-1, "back") : home()), [go, home]);
  useBackButton(close);
  const main = useMemo(() => ({ text: c.main, onClick: () => {
    haptic.medium();
    if (k === "pending" || k === "planonly") go("/packs", "fade", { replace: true });
    else if (k === "nopack") home();
    else if (k === "pinintro") go("/profile/pin/create", "forward", { replace: true });
    else if (k === "kyc") go("/kyc", "forward");
    else if (k === "limit" || k === "notpartner" || k === "paidbefore" || k === "desktop" || k === "otherbranch") close();
    else rescan();
  } }), [c.main, k, go, home, close, rescan]);
  const left = useMemo(() => c.left ? ({ text: c.left, position: "left" as const, onClick: () => {
    haptic.tap();
    if (k === "nocam" || k === "desktop") go("/scan/code", "forward", { replace: true });
    else if (k === "notpartner") go("/profile/venue");
    else if (k === "paidbefore") go("/profile/usage", "forward", { replace: true });
    else if (k === "kyc") close();
    else go("/profile/report");
  } }) : undefined, [c.left, k, go, close]);
  useBottomButtons(main, left);
  const qv = params.get("v");
  const text = k === "othervenue" && qv ? `QR — ${qv} мекемесінікі, ал онда белсенді пакетің жоқ. Пакетің бар мекеменің кассасындағы QR-ды сканерле.` : k === "nopack" && o ? `${o.venue} пакетін сатып алсаң, келесі жолы төлей аласың.` : c.text;
  const price = o ? unitPrice(o) : 1500;

  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={s.body}>
        <Sticker name={c.sticker} size={120} className={s.sticker} />
        <h1 className={s.title}>{c.title}</h1>
        <p className={s.text}>{text}</p>
        {k === "otherbranch" && params.get("b") && (
          <div className={s.kvBox}>
            {params.get("b")!.split("\n").filter(Boolean).map((a) => <p key={a}><b>{a}</b></p>)}
          </div>
        )}
        {k === "amount" && (
          <div className={s.kvBox}>
            <p><span>QR сомасы:</span><b>{fmt(price - 300)}</b></p>
            <p><span>Пакет бағасы:</span><b>{fmt(price)}</b></p>
          </div>
        )}
        {c.note && <p className={`${s.reason} ${s.note} infoBox infoWarn`}>{c.note}<i>”</i></p>}
      </div>
      {!inTelegram && (
        <div className={s.bar}>
          {left && <button className={`${s.btn} ${s.second}`} onClick={left.onClick}>{left.text}</button>}
          <button className={s.btn} onClick={main.onClick}>{main.text}</button>
        </div>
      )}
    </div>
  );
}
