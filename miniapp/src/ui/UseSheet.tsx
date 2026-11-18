// Figma «Қолдану: таңдау парағы» 13918:7998 және «Шаштараз: қолдану таңдау парағы» 14044:12876.
// Сатып алынған пакетті екі жолмен қолданады: мекемеде кассаның QR-ын сканерлеу немесе үйден тапсырыс беру/жазылу.
// Екі жағдайда да ақша төленбейді — пакеттен бір бірлік шегеріледі (пакет сатып алғанда төленген).
import { Tile } from "./Tile";
import { useEffect, useMemo, useState } from "react";
import { useGo } from "../nav";
import { offerOf, type Pack } from "../store";
import { haptic, inTelegram, useBackButton, useBottomButtons } from "../telegram";
import { startScan } from "../scanFlow";
import s from "./UseSheet.module.css";

type Way = "plan" | "scan" | "order";

export function UseSheet({ pack, onClose }: { pack: Pack; onClose: () => void }) {
  const go = useGo();
  const o = offerOf(pack);
  const hair = o.kind === "hair";
  const [way, setWay] = useState<Way>("plan");
  const [closing, setClosing] = useState(false);
  const close = useMemo(() => () => { haptic.soft(); setClosing(true); setTimeout(onClose, 220); }, [onClose]);
  useBackButton(close);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  // Патша (2026-11-16): тамақ пен кофеге де жоспарлау — күнтізбеден күн мен уақыт; үш жол: Жоспарлау · Тапсырыс · Сканер.
  const opts: { id: Way; icon: string; title: string; sub: string }[] = hair
    ? [{ id: "plan", icon: "📅", title: "Жазылу", sub: "Күн мен уақытты күнтізбеден таңда" },
       { id: "scan", icon: "▦", title: "Сканер", sub: "Мекемеге келдің: кассирдің QR-ын сканерле" }]
    : [{ id: "plan", icon: "📅", title: "Жоспарлау", sub: "Күн мен уақытты таңда — мекеме дәл сол уақытқа дайындайды" },
       { id: "order", icon: "🛍️", title: "Тапсырыс", sub: "Қазір: дайын болғанда барып аласың не курьер жібересің" },
       { id: "scan", icon: "▦", title: "Сканер", sub: "Мекемедесің: кассаның QR-ын сканерле" }];
  const next = useMemo(() => ({ text: "Жалғастыру", shine: true, onClick: () => {
    haptic.medium();
    if (way === "scan") { onClose(); startScan(go, pack.id); } // PIN (қосулы болса) → нативті сканер → төлем
    else if (way === "plan") go("/book/" + pack.id, "forward");
    else go("/order/" + pack.id, "forward");
  } }), [way, go, pack.id, onClose]);
  const cancel = useMemo(() => ({ text: "Бас тарту", position: "left" as const, onClick: close }), [close]);
  useBottomButtons(next, cancel);

  return (
    <div className={`${s.root} ${closing ? s.closing : ""}`}>
      <div className={s.scrim} onClick={close} />
      <div className={s.sheet} role="dialog" aria-label="Қолдану">
        <span className={s.grabber} />
        <h2 className={s.title}>{hair ? "Қалай қолданасың?" : "Қолдану"}</h2>
        <p className={s.sub}>{`${o.title.split(" · ")[0]} · ${o.venue} • қалды ${pack.left} / ${pack.total}`}</p>
        <div className={s.list}>
          {opts.map((x) => (
            <button key={x.id} className={`${s.opt} ${way === x.id ? s.on : ""}`} onClick={() => { if (way !== x.id) { haptic.select(); setWay(x.id); } }}>
              <Tile e={x.icon} size={44} />
              <span className={s.text}><b>{x.title}</b><small>{x.sub}</small></span>
              <span className={s.radio} />
            </button>
          ))}
        </div>
        <p className={s.note}>{`${hair ? "Екі" : "Үш"} жағдайда да ақша төленбейді: пакеттен бір бірлік шегеріледі.`}</p>
        {!inTelegram && (
          <div className={s.bar}>
            <button className={`${s.btn} ${s.second}`} onClick={cancel.onClick}>{cancel.text}</button>
            <button className={`${s.btn} ${s.shine}`} onClick={next.onClick}>{next.text}</button>
          </div>
        )}
      </div>
    </div>
  );
}
