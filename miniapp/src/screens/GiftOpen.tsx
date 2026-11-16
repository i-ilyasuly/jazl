// Figma «13 · Сыйлау / Сыйлық сілтемесі»: «Қабылдау» 13886:34238, «Аноним жіберуші» 13886:34312, «Қабылданды» 13886:34392,
// «Мерзімі өтті» 13886:34508, «Бұрын қабылданған» 13886:34546, «Болдырылмады» 13886:34584, «Өз сыйлығың» 13886:34622.
// Демо: ?state=anon | expired | taken | cancelled | own. Telegram-да сілтеме startapp=gift_<id> арқылы келеді (main.tsx).
import { Emo } from "../ui/Emo";
import { useCallback, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { findOffer } from "../mocks/offers";
import { useGo } from "../nav";
import { acceptGift, getPack, offerOf, useGifts, usePacks } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { Sticker, type StickerName } from "../ui/Sticker";
import { TelegramChrome } from "../ui/TelegramChrome";
import { ResultScreen } from "./Success";
import { shareGift } from "./GiftSend";
import s from "./GiftOpen.module.css";

type Bad = "expired" | "taken" | "cancelled" | "own";
const BAD: Record<Bad, { sticker: StickerName; title: string; text: string; btn: string }> = {
  expired: { sticker: "sleep", title: "Сыйлықтың мерзімі өтті", text: "Қабылдау мерзімі бітті. Пакет жіберушіге қайтарылды.", btn: "Ұсыныстарды көру" },
  taken: { sticker: "party", title: "Сыйлық бұрын қабылданған", text: "Бұл сыйлықты басқа адам алып қойған.", btn: "Ұсыныстарды көру" },
  cancelled: { sticker: "stop", title: "Жіберуші сыйлықты болдырмады", text: "Бұл сыйлық енді жарамсыз.", btn: "Ұсыныстарды көру" },
  own: { sticker: "hello", title: "Бұл сенің өз сыйлығың", text: "Сыйлықты өзіңе қабылдай алмайсың. Сілтемені досыңа жібер.", btn: "Сілтемені жіберу" },
};
const demo = () => window.location.hash.match(/[?&]state=(\w+)/)?.[1] ?? "";

export function GiftOpen() {
  const { id } = useParams();
  const go = useGo();
  const gifts = useGifts();
  const g = gifts.find((x) => x.id === id) ?? gifts.find((x) => x.status === "open") ?? gifts[0];
  const d = demo();
  const anon = d === "anon" || Boolean(g.anon);
  const bad: Bad | null = d in BAD ? (d as Bad)
    : g.dir === "sent" ? "own" : g.status === "expired" ? "expired" : g.status === "cancelled" ? "cancelled" : g.status === "ok" ? "taken" : null;
  const o = findOffer(g.offerId);
  const close = useCallback(() => go("/", "fade", { replace: true }), [go]);
  useBackButton(close);
  const take = useCallback(() => {
    const pid = acceptGift(g.id);
    if (!pid) { haptic.error(); return; }
    haptic.success(); go("/gift/done/" + pid, "fade", { replace: true, state: { from: anon ? "Аноним" : g.name } });
  }, [g.id, g.name, anon, go]);
  const main = useMemo(() => {
    if (!bad) return { text: "Сыйлықты алу", shine: true, onClick: take };
    if (bad === "own") return { text: BAD.own.btn, onClick: () => { haptic.medium(); shareGift(g.id, g.pack); } };
    return { text: BAD[bad].btn, onClick: () => go("/", "fade", { replace: true }) };
  }, [bad, take, g.id, g.pack, go]);
  useBottomButtons(main);

  return (
    <div className={s.page}>
      <TelegramChrome mode="close" onBack={close} />
      {bad ? (
        <div className={s.center}>
          <Sticker name={BAD[bad].sticker} size={120} />
          <h1 className="t-title2 w-700">{BAD[bad].title}</h1>
          <p className={`t-sub2 ${s.muted}`}>{BAD[bad].text}</p>
        </div>
      ) : (
        <div className={s.col}>
          <div className={s.hero}>
            <Sticker name="gift" size={112} />
            <h1 className="t-title2 w-700">Саған сыйлық!</h1>
            <p className={`t-sub2 ${s.muted}`}>{anon ? "Жіберуші өз атын жасырды" : `${g.name} сыйлады`}</p>
          </div>
          {g.msg && <div className={`${s.quote} infoBox rise`}><p className="t-sub2">{g.msg}</p><i aria-hidden>”</i></div>}
          <section className={`${s.card} rise`} style={{ ["--i" as string]: 1 }}>
            <div className={s.row}>
              <span className={s.emoji}><Emo e={g.emoji} size={28} /></span>
              <span className={s.text}><span className="t-text w-600">{o.title}</span><span className={`t-sub2 ${s.muted}`}>{o.venue} • 30 күн</span></span>
            </div>
            {anon && <div className={s.kv}><span className={s.muted}>Жіберуші</span><span className="w-600">Аноним</span></div>}
            <div className={s.kv}><span className={s.muted}>Қабылдау мерзімі</span><span className="w-600">5 күн қалды</span></div>
          </section>
          <p className={`t-sub2 ${s.note} rise`} style={{ ["--i" as string]: 2 }}>Сыйлықты басқа мекемеге ауыстыру мүмкін емес.</p>
        </div>
      )}
      {!inTelegram && <div className={s.bar}><button className={`${s.btn} ${main.shine ? s.shine : ""}`} onClick={main.onClick}>{main.text}</button></div>}
    </div>
  );
}

/** Figma «Сыйлық сілтемесі / Қабылданды» 13886:34392 — жасыл белгінің орнында балапан стикері (9-ереже). */
export function GiftDone() {
  const { id } = useParams();
  usePacks();
  const go = useGo();
  const pack = getPack(id);
  const toPacks = useCallback(() => go("/packs", "fade", { replace: true }), [go]);
  const close = useCallback(() => go("/", "fade", { replace: true }), [go]);
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (!pack) return null;
  const o = offerOf(pack);
  return (
    <ResultScreen
      title="Сыйлық қабылданды" paid={from ? `${from} сыйлады` : "Сыйлық сенікі"}
      cardTitle={o.title} cardSub={`${o.venue} · ${o.distance}`} kind={o.kind}
      total={pack.total} used={0} counter={`${pack.left} / ${pack.total} · 30 күн`}
      next="Сыйлық Пакеттерімде көрінеді"
      main={{ text: "Пакеттерге өту", onClick: toPacks }} secondary={{ text: "Жабу", onClick: close }} onClose={close}
    />
  );
}
