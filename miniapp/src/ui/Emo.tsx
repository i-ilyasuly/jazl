// Emoji орнына фонсыз суреттер (Патша, 2026-11-16).
// Түр белгілері (тағам/кофе/шаштараз, сыйлық, орын) — басты беттегі плиткалардың фонсыз суреттері;
// қалғаны — Microsoft Fluent Emoji 3D (MIT лицензиясы, Telegram эмодзилеріне ұқсас көлемді стиль), 128px webp.
import type { OfferKind } from "../mocks/offers";
import food from "../assets/tiles/food.webp";
import coffee from "../assets/tiles/coffee.webp";
import hair from "../assets/tiles/hair.webp";
import giftTile from "../assets/tiles/b_gift.webp";
import pinTile from "../assets/tiles/b_pin.webp";
import coinsTile from "../assets/tiles/b_coins.webp";
import s from "./Emo.module.css";

const fluent = import.meta.glob("../assets/emoji/*.webp", { eager: true, import: "default" }) as Record<string, string>;
const F = (n: string) => fluent[`../assets/emoji/${n}.webp`];

export const kindPic: Record<OfferKind, string> = { food, coffee, hair };
/** Нақты зат (санат ішіндегі түр): Fluent 3D */
const item: Record<string, string> = {
  "🍔": F("burger"), "🌯": F("burrito"), "🥙": F("pita"), "🍕": F("pizza"), "🍣": F("sushi"), "🍮": F("dessert"), "🍰": F("cake"), "🥗": F("salad"),
  "☕": F("coffee"), "🍵": F("tea"), "🥛": F("milk"), "🧋": F("bubbletea"), "🥤": F("cup"),
  "✂": F("scissors"), "💈": F("barber"), "🧔": F("beard"), "🧒": F("child"),
};
/** Жалпы белгі: түрлер — плитка суреттері, әрекеттер — Fluent 3D */
const sign: Record<string, string> = {
  "🍔": food, "🌯": food, "🥙": food, "🍕": food, "🍴": F("cutlery"), "☕": coffee, "🍵": coffee, "✂": hair, "💈": hair,
  "🎁": giftTile, "📍": pinTile, "💰": coinsTile, "🎉": F("party"), "🛒": F("cart"), "🛍": F("bags"), "💳": F("card"), "🏦": F("bank"),
  "📅": F("calendar"), "🧾": F("receipt"), "🔔": F("bell"), "🧭": F("compass"), "📞": F("phone"), "✈": F("plane"), "↩": F("undo"),
};
const norm = (e?: string) => (e ?? "").replace(/️/g, "").trim();
export const emoSrc = (e?: string, asItem = false) => (asItem ? item[norm(e)] : undefined) ?? sign[norm(e)];

/** e — emoji (белгісі сурет болмаса мәтін күйінде қалады); kind — түр суреті; asItem — санат ішіндегі нақты зат. */
export function Emo({ e, kind, size = 28, asItem, className }: { e?: string; kind?: OfferKind; size?: number; asItem?: boolean; className?: string }) {
  const src = kind ? kindPic[kind] : emoSrc(e, asItem);
  if (!src) return <>{e}</>;
  return <img src={src} width={size} height={size} alt="" draggable={false} className={`${s.emo} ${className ?? ""}`} />;
}
