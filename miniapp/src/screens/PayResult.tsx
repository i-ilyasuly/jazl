// Figma «07 · Сатып алу және төлем»: «Төлем өтпеді» 13940:8117, «Kaspi шоты мерзімі өтті» 13940:8143, «Ұсыныс тоқтатылды» 13940:8165.
import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { findOffer } from "../mocks/offers";
import { useGo } from "../nav";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import s from "./PayResult.module.css";

type Kind = "fail" | "expired" | "stopped";
const copy: Record<Kind, { sticker: StickerName; title: string; text: string; reason?: string; left: string; main: string }> = {
  fail: { sticker: "cry", title: "Төлем өтпеді", text: "Картадан ақша шешілген жоқ. Басқа тәсілмен төлеп көр.", reason: "Себебі: карта лимиті асып кетті.", left: "Тәсілді өзгерту", main: "Қайта көру" },
  expired: { sticker: "sleep", title: "Kaspi шотының мерзімі өтті", text: "Шот-фактура уақытша ғана жарамды. Жаңа шот жібереміз.", left: "Жабу", main: "Жаңа шот жіберу" },
  stopped: { sticker: "stop", title: "Ұсыныс уақытша тоқтатылған", text: "Мекеме бұл ұсынысты қазір сатпайды. Басқа ұсыныстарды қарап көр.", left: "Жабу", main: "Ұсыныстарды көру" },
};

export function PayResult() {
  const { kind = "fail", id = "" } = useParams();
  const k = (kind in copy ? kind : "fail") as Kind;
  const c = copy[k];
  const go = useGo();
  const offer = findOffer(id);
  const toOffer = useCallback((buy?: string) => go("/offer/" + offer.id, "back", { replace: true, state: buy ? { buy } : undefined }), [go, offer.id]);
  const close = useCallback(() => toOffer(), [toOffer]);
  useBackButton(close);
  const main = useMemo(() => ({ text: c.main, onClick: () => {
    haptic.medium();
    if (k === "fail") toOffer("sum"); else if (k === "expired") toOffer("wait"); else go("/", "fade", { replace: true });
  } }), [c.main, k, toOffer, go]);
  const left = useMemo(() => ({ text: c.left, position: "left" as const, onClick: () => { if (k === "fail") { haptic.tap(); toOffer("method"); } else { haptic.soft(); close(); } } }), [c.left, k, toOffer, close]);
  useBottomButtons(main, left);

  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={s.body}>
        <Sticker name={c.sticker} size={132} className={s.sticker} />
        <h1 className={s.title}>{c.title}</h1>
        <p className={s.text}>{c.text}</p>
        {c.reason && <p className={s.reason}>{c.reason}<i>”</i></p>}
      </div>
      {!inTelegram && (
        <div className={s.bar}>
          <button className={`${s.btn} ${s.second}`} onClick={left.onClick}>{left.text}</button>
          <button className={s.btn} onClick={main.onClick}>{main.text}</button>
        </div>
      )}
    </div>
  );
}
