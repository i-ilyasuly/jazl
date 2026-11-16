// Figma «20 · Тапсырыс»: «Тапсырыс жіберілді» 13914:8066, «Тапсырыс беті» 13914:8187, «Тапсырыс мекемеге жетпеді» 13914:8166,
// «Мекеме қабылдамайды» 13918:9091, «Бірлік жоқ» 13918:9112; «23»: «Мекеме жабық» 14043:12864.
import { useCallback, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useGo } from "../nav";
import { CopyCode } from "../ui/CopyCode";
import { failOrder, getOrder, getPack, offerOf, useOrders } from "../store";
import { venues } from "../mocks/venues";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "../ui/Sticker";
import { SubPage } from "../ui/SubPage";
import { TelegramChrome } from "../ui/TelegramChrome";
import p from "./PayResult.module.css";
import s from "./OrderResult.module.css";

type Btn = { text: string; onClick: () => void; position?: "left" };
function Bar({ left, main }: { left?: Btn; main: Btn }) {
  if (inTelegram) return null;
  return <div className={p.bar}>{left && <button className={`${p.btn} ${p.second}`} onClick={left.onClick}>{left.text}</button>}<button className={p.btn} onClick={main.onClick}>{main.text}</button></div>;
}

/** Код пен уақыт карточкасы (жіберілді беті мен тапсырыс бетінде ортақ) */
function OrderCard({ id }: { id: string }) {
  const o = getOrder(id);
  if (!o) return null;
  return (
    <div className={s.card}>
      <div className={s.head}>
        <span className={s.emoji}>{o.emoji}</span>
        <span className={s.text}><b>{o.title}</b><small>{o.venue} • {o.branch}</small></span>
      </div>
      <div className={s.kv}><span>Уақыты</span><b>{o.time}</b></div>
      <CopyCode code={o.code} className={s.codeBox}>
        <span>Кассирге айтатын код · басып көшір</span>
        <b className={s.code}>{o.code.split("").map((c, i) => <i key={i} style={{ ["--i" as string]: i }}>{c}</i>)}</b>
      </CopyCode>
    </div>
  );
}

export function OrderDone() {
  const { id = "" } = useParams();
  useOrders();
  const go = useGo();
  const o = getOrder(id);
  const close = useCallback(() => go("/packs", "fade", { replace: true }), [go]);
  useBackButton(close);
  const main = useMemo(() => ({ text: "Тапсырысты көру", onClick: () => { haptic.tap(); go("/orders/" + id, "forward", { replace: true }); } }), [go, id]);
  const left = useMemo(() => ({ text: "Жабу", position: "left" as const, onClick: () => { haptic.soft(); close(); } }), [close]);
  useBottomButtons(main, left);
  if (!o) return null;
  return (
    <div className={p.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={s.doneBody}>
        <Sticker name="party" size={120} className={p.sticker} />
        <h1 className={p.title}>{o.title.startsWith("Шаш") ? "Жазылу расталды" : "Тапсырыс жіберілді"}</h1>
        <p className={p.text}>№{o.no} • мекеменің тапсырыс жүйесіне түсті</p>
        <OrderCard id={id} />
        <p className={`${s.note} infoBox infoWarn`}>Мекемеге келгенде кассирге «Jazl, тапсырыс {o.no}» және кодты айт. Курьер жалдасаң, ол кодты айтады.<i>”</i></p>
      </div>
      <Bar left={left} main={main} />
    </div>
  );
}

export function OrderView() {
  const { id = "" } = useParams();
  useOrders();
  const go = useGo();
  const o = getOrder(id);
  const help = useMemo(() => ({ text: "Көмек", position: "left" as const, onClick: () => { haptic.tap(); go("/profile/report"); } }), [go]);
  const close = useMemo(() => ({ text: "Жабу", onClick: () => { haptic.soft(); go(-1, "back"); } }), [go]);
  useBottomButtons(close, help);
  return (
    <SubPage title={o ? `Тапсырыс №${o.no}` : "Тапсырыс"} variant="settings">
      {o && <>
        <OrderCard id={id} />
        <div className={s.card}>
          <div className={s.kv}><span>Пакет</span><b>{o.title}</b></div>
          <div className={s.kv}><span>Жіберілді</span><b>{o.created}</b></div>
          <div className={s.kv}><span>Төлем</span><b>пакеттен 1 бірлік</b></div>
          <button className={`${s.kv} ${s.kvBtn}`} onClick={() => { haptic.tap(); go("/receipt/order/" + o.id); }}><span>Чек</span><b className={s.link}>Ашу</b></button>
        </div>
        <p className={`${s.note} infoBox infoWarn`}>Мекемеге тапсырыс жіберілді. Орындалу барысын қолданба көрсетпейді.<i>”</i></p>
      </>}
      <Bar left={help} main={close} />
    </SubPage>
  );
}

type Kind = "fail" | "noaccept" | "nounits" | "closed";
const copy: Record<Kind, { sticker: StickerName; title: string; text: string; note?: string; left: string; main: string }> = {
  fail: { sticker: "cry", title: "Тапсырыс мекемеге жетпеді", text: "Бірлік пакетіңе қайтарылды. Қайта көр немесе мекемеге барып кассирге айт.", left: "Көмек", main: "Қайта көру" },
  noaccept: { sticker: "stop", title: "Бұл мекеме алдын ала тапсырыс қабылдамайды", text: "Мекемеге барып, кассирге «Jazl бойынша» деп айтып, QR-ды сканерле.", left: "Жабу", main: "Сканерлеу" },
  nounits: { sticker: "empty", title: "Тапсырыс беру мүмкін емес", text: "Пакетте бос бірлік қалмады немесе пакеттің мерзімі өтті.", note: "Қайта алсаң, жаңа бірліктер қосылады.", left: "Жабу", main: "Қайта алу" },
  closed: { sticker: "sleep", title: "Қазір тапсырыс қабылданбайды", text: "Мекеме қазір жабық: тапсырыс ертең 10:00-де қайта ашылады. Пакетің сақталады.", left: "Артқа", main: "Мекеме беті" },
};

export function OrderState() {
  const { kind = "fail", packId = "" } = useParams();
  const [q] = useSearchParams();
  const k = (kind in copy ? kind : "fail") as Kind;
  const c = copy[k];
  const go = useGo();
  const pack = getPack(packId);
  const offer = pack ? offerOf(pack) : null;
  // Жетпеген тапсырыстың бірлігін пакетке қайтарамыз
  useEffect(() => { const oid = q.get("o"); if (k === "fail" && oid) failOrder(oid); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => go("/pack/" + packId, "back", { replace: true }), [go, packId]);
  useBackButton(close);
  const main = useMemo(() => ({ text: c.main, onClick: () => {
    haptic.medium();
    if (k === "fail") go("/order/" + packId, "forward", { replace: true });
    else if (k === "noaccept") go("/scan?pack=" + packId, "up", { replace: true });
    else if (k === "nounits") go(packId && getPack(packId) ? "/rebuy/" + packId : "/offer/" + (offer?.id ?? ""), "forward", { replace: true, state: { buy: "sum" } });
    else go("/venue/" + (venues.find((v) => v.name === offer?.venue)?.id ?? ""), "forward", { replace: true });
  } }), [c.main, k, go, packId, offer]);
  const left = useMemo(() => ({ text: c.left, position: "left" as const, onClick: () => { if (k === "fail") { haptic.tap(); go("/profile/report"); } else { haptic.soft(); close(); } } }), [c.left, k, go, close]);
  useBottomButtons(main, left);
  return (
    <div className={p.page}>
      <TelegramChrome mode="close" onBack={close} />
      <div className={p.body}>
        <Sticker name={c.sticker} size={132} className={p.sticker} />
        <h1 className={p.title}>{c.title}</h1>
        <p className={p.text}>{c.text}</p>
        {c.note && <p className={`${p.reason} infoBox infoWarn`}>{c.note}<i>”</i></p>}
      </div>
      <Bar left={left} main={main} />
    </div>
  );
}
