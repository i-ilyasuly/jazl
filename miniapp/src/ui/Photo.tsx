// Сыртқы фото: жүктелгенше орнында суреттің негізгі түсі (бэкендте — фото жүктелгенде есептелетін photoColor,
// қазір — түріне қарай жуық түс) және жұмсақ жылтыр тұрады; жүктелгенде бір рет біртіндеп ашылады.
// Бір рет жүктелген фото қайта көрсетілгенде бірден тұрады (анимация қайталанбайды — Патша, 04/28).
import { useState, type ImgHTMLAttributes } from "react";
import type { OfferKind } from "../mocks/offers";
import s from "./Photo.module.css";

const loaded = new Set<string>();
/** Түрге қарай фотоның жуық негізгі түсі (күндіз / түнде) */
const tone: Record<OfferKind, [string, string]> = { food: ["#efdcc6", "#3a3128"], coffee: ["#e6d8c9", "#352d26"], hair: ["#dfe3ea", "#2b313b"] };

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string; kind?: OfferKind; color?: string };
export function Photo({ src, kind, color, className, onLoad, style, ...rest }: Props) {
  const [ok, setOk] = useState(() => loaded.has(src));
  const dark = document.documentElement.dataset.theme === "dark";
  const bg = color ?? (kind ? tone[kind][dark ? 1 : 0] : undefined);
  return (
    <span className={`${s.box} ${ok ? s.ok : ""}`} style={bg ? { ["--ph" as string]: bg } : undefined}>
      <img {...rest} src={src} className={`${className ?? ""} ${s.img}`} style={style}
        ref={(el) => { if (el && !ok && el.complete && el.naturalWidth) { loaded.add(src); setOk(true); } }}
        onLoad={(e) => { loaded.add(src); setOk(true); onLoad?.(e); }} />
    </span>
  );
}
