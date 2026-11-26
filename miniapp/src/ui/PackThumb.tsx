// Пакеттерім мен пакет бетіндегі сурет (Патша, 2026-11-26): ұсыныс карточкасындағы фото, жоқ болса — санат белгішесі
import { useState } from "react";
import type { Offer } from "../mocks/offers";
import { kindPic } from "./Emo";
import { Photo } from "./Photo";

export function PackThumb({ offer, icon = 52 }: { offer: Offer; icon?: number }) {
  const [bad, setBad] = useState(false);
  if (offer.photo && !bad) return <Photo src={offer.photo.replace(/([?&])w=\d+/, "$1w=200")} kind={offer.kind} alt="" loading="lazy" decoding="async" onError={() => setBad(true)}
    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", display: "block" }} />;
  return <img src={kindPic[offer.kind]} width={icon} height={icon} alt="" decoding="sync" style={{ objectFit: "contain" }} />;
}
