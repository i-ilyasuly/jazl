// Figma: «Сыйлық / Жіберілген (күтілуде)» 13886:37463, «Алынған (күтілуде)» 13886:37559,
// «Мерзімі өтті» 13886:37625, «Сыйлықты болдырмау: диалог» 13886:37717, «Нәтиже» 13886:37831
import { kk } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useGo } from "../nav";
import { shareGift } from "./GiftSend";
import { setGiftStatus, useGifts } from "../store";
import { haptic, inTelegram, tg } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { MainBar } from "../ui/MainBar";
import { Sticker, type StickerName } from "../ui/Sticker";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import s from "./Gift.module.css";

const months = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const nowKk = () => { const d = new Date(); return `${d.getDate()} ${months[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const MESSAGE = kk("Туған күніңмен! Донер менің атымнан 🎉");

export function Gift() {
  const go = useGo();
  const g = useGifts().find((x) => x.id === useParams().id);
  const [ask, setAsk] = useState(false);
  const [snack, setSnack] = useState(false);
  const back = useCallback(() => go(-1, "back"), [go]);
  useEffect(() => { if (!snack) return; const t = setTimeout(() => setSnack(false), 2600); return () => clearTimeout(t); }, [snack]);
  // Нативті Telegram контакт/чат таңдау терезесі (WebApp.shareMessage не t.me/share)
  const resend = useCallback(() => { if (!g) return; haptic.medium(); void shareGift(g.id, g.pack); }, [g]);
  const again = useCallback(() => go("/packs", "fade"), [go]);
  // Алынған, әлі ашылмаған сыйлық — «Сыйлық сілтемесі / Қабылдау» бетінде ашылады
  if (g?.status === "open") return <Navigate to={"/gift/open/" + g.id} replace />;
  if (!g) return <SubPage title="Сыйлық"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Сыйлық табылмады</p></SubPage>;

  const view: Record<string, { sticker: StickerName; title: string; chip?: string; chipCls?: string; sub?: string }> = {
    wait: { sticker: "wait", title: "Сыйлық күтілуде", chip: "Қабылдауға 5 күн қалды", chipCls: s.orange },
    expired: { sticker: "sleep", title: "Сыйлық қабылданбады", chip: "Мерзімі өтті", chipCls: s.gray },
    cancelled: { sticker: "stop", title: "Сыйлық болдырылмады", chip: "Болдырылмады", chipCls: s.gray },
    // Figma «Жіберушіге хабарлама (бот)» 13886:34660 — бот хабарламасының мазмұны осында да көрінеді
    ok: g.dir === "sent"
      ? { sticker: "party", title: "Сыйлық қабылданды", sub: `${g.name} сыйлығыңды қабылдады!` }
      : { sticker: "love", title: "Сыйлықты қабылдадың", sub: `${g.anon ? "Аноним" : g.name} сыйлады` },
  };
  const v = view[g.status] ?? view.wait;
  const kv = (rows: [string, string, boolean?][]) => rows.map(([k, val, green]) => <div key={k} className={`t-sub2 ${s.kv}`}><span>{k}</span><b className={green ? s.green : ""}>{val}</b></div>);
  return (
    <SubPage title="Сыйлық" top={314}>
      <div className={s.hero}>
        <Sticker key={v.sticker} name={v.sticker} />
        <h2 className={s.title}>{v.title}</h2>
        {v.chip && <span className={`t-cap1 ${s.chip} ${v.chipCls}`}>{v.chip}</span>}
        {v.sub && <p className={`t-sub1 ${s.sub}`}>{v.sub}</p>}
      </div>
      {g.status !== "cancelled" && <div className={`${s.quote} infoBox rise`}><span className={s.bar} /><p className="t-sub2">{g.msg || MESSAGE}</p><span className={s.mark} aria-hidden>”</span></div>}
      {g.status === "wait" ? <>
        <Group i={1}>{kv([["Кімге", g.name], ["Пакет", g.pack], ["Жіберілді", g.sentAt], ["Қабылдау мерзімі", g.until]])}</Group>
        <Group i={2}><button className={s.cancel} onClick={() => { haptic.warning(); setAsk(true); }}>Сыйлықты болдырмау</button></Group>
        <MainBar text="Сілтемені қайта жіберу" onClick={resend} />
      </> : g.status === "ok" ? <>
        <Group i={1}>{kv([[g.dir === "sent" ? "Кімге" : "Кімнен", g.anon && g.dir === "got" ? "Аноним" : g.name], ["Пакет", g.pack], ["Жіберілді", g.sentAt], ["Қабылданды", g.acceptedAt ?? g.sentAt, true]])}</Group>
        <Note>{g.dir === "sent" ? `${g.pack} енді оның Пакеттерінде.` : "Пакет Пакеттерімде: мекемеде сканерлеп не тапсырыс беріп қолданасың."}</Note>
        <MainBar text={g.dir === "sent" ? "Тағы сыйлау" : "Пакеттерді ашу"} onClick={() => go(g.dir === "sent" ? "/gift/" + (g.offerId ?? "doner") : "/packs", g.dir === "sent" ? "up" : "fade")} />
      </> : g.status === "expired" ? <>
        <Group i={1}>{kv([["Кімге", g.name], ["Пакет", g.pack], ["Жіберілді", g.sentAt], ["Қайтарылды", "1 пакет", true]])}</Group>
        <Note>Алушы 7 күн ішінде қабылдамағандықтан, пакет өзіңе қайтарылды.</Note>
        <MainBar text="Қайта сыйлау" onClick={again} />
      </> : <>
        <Group i={1}>{kv([["Кімге", g.name], ["Пакет", g.pack], ["Болдырылды", nowKk()], ["Қайтарылады", "1 пакет", true]])}</Group>
        <Note>Пакет «Пакеттерім» бөліміне қайтарылды. Сілтеме жарамсыз.</Note>
        <MainBar text="Дайын" onClick={back} />
      </>}
      {snack && <div className={`t-sub2 ${s.snack}`}>Сыйлық болдырылмады</div>}
      {ask && <Confirm title="Сыйлықты болдырмау?" text="Пакет «Пакеттерім» бөліміне қайтады. Сілтеме жарамсыз болады." cancel="Жоқ" ok="Болдырмау" danger onClose={() => setAsk(false)}
        onOk={() => { haptic.success(); setGiftStatus(g.id, "cancelled", "Болдырылмады"); setSnack(true); }} />}
    </SubPage>
  );
}
