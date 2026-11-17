// Профильдегідей иконка: түсті дөңгелек-шаршы фон + ақ сызықты белгі (Патша, 2026-11-16: «барлық иконкалар осындай болсын»).
// Түстер — профиль иконкаларының фоны және Telegram Mini Apps UI Kit «Colors» палитрасы.
// Белгілер — Lucide (ISC лицензиясы, assets/glyphs/LICENSE.txt). Бөлісу, лайк, санат плиткалары сияқты үлкен
// суретті жерлерге қолданылмайды.
import s from "./Tile.module.css";

const glyphs = import.meta.glob("../assets/glyphs/*.svg", { eager: true, import: "default" }) as Record<string, string>;
const G = (n: string) => glyphs[`../assets/glyphs/${n}.svg`];

export const tileColor = { red: "#FF3A30", orange: "#FE9500", blue: "#008AFF", indigo: "#4378FF", purple: "#B00FB4", green: "#31D158", darkGreen: "#3A9F20", cyan: "#2AABEE", gray: "#8E8E93", yellow: "#FFB800", lavender: "#8E7CF3" } as const;
type C = keyof typeof tileColor;

/** Мағына → белгі мен түс. Emoji кілттері ескі деректермен үйлесу үшін. */
const map: Record<string, [string, C]> = {
  "🏦": ["landmark", "red"], "💳": ["credit-card", "blue"], "+": ["plus", "blue"], "🧾": ["receipt", "indigo"],
  "📍": ["map-pin", "red"], "🛍": ["shopping-bag", "orange"], "▦": ["qr-code", "blue"], "📅": ["calendar-days", "red"],
  "🛒": ["shopping-cart", "green"], "🍴": ["utensils", "orange"], "☕": ["coffee", "orange"], "✂": ["scissors", "purple"],
  "↪": ["redo-2", "blue"], "↩": ["undo-2", "gray"], "🎁": ["gift", "orange"], "✈": ["send", "cyan"], "📞": ["phone", "green"],
  "🔔": ["bell", "red"], "🧭": ["navigation", "blue"], "🎉": ["party-popper", "purple"], "💰": ["coins", "yellow"],
  "#": ["hash", "indigo"], "👥": ["users", "green"], "🏪": ["store", "cyan"],
  // Мекеме бөлімі (Figma «Jazl+ Мекеме»)
  "v:cashier": ["qr-code", "blue"], "v:offer": ["tag", "orange"], "v:invite": ["user", "green"], "v:report": ["wallet", "lavender"], "v:key": ["key", "green"],
  "v:venue": ["store", "blue"], "v:venueOrange": ["store", "orange"], "v:venuePurple": ["store", "lavender"], "v:branch": ["map-pin", "green"], "v:team": ["user", "lavender"], "v:integration": ["refresh", "orange"],
  "v:reviews": ["star", "yellow"], "v:guide": ["file", "blue"], "v:settings": ["settings", "gray"], "v:support": ["message", "green"], "v:orders": ["list", "cyan"], "v:client": ["repeat", "blue"],
  "v:clock": ["clock", "blue"], "v:pin": ["lock", "blue"], "v:complaint": ["alert", "orange"], "v:carry": ["refresh", "green"], "v:extend": ["plus", "orange"], "v:preorder": ["shopping-cart", "lavender"],
  "🍔": ["utensils", "orange"], "🌯": ["utensils", "orange"], "🥙": ["utensils", "orange"], "🍕": ["utensils", "orange"], "🍵": ["coffee", "orange"], "💈": ["scissors", "purple"],
};
const norm = (e: string) => e.replace(/️/g, "").trim();
/** Оқиға/әрекет белгісі (өнім суреті емес): сатып алу, қайтару, сыйлық, көшу, жазылу, чек */
const events = new Set(["↩", "↪", "🎁", "🛒", "📅", "🧾", "🛍"]);
export const isEvent = (e?: string) => Boolean(e && events.has(norm(e)));
export const hasTile = (e?: string) => Boolean(e && map[norm(e)]);

/** e — мағына (emoji не «+»); size — сыртқы өлшемі (профильде 36). */
export function Tile({ e, size = 36, className }: { e: string; size?: number; className?: string }) {
  const m = map[norm(e)];
  if (!m) return null;
  const [glyph, color] = m;
  const url = `url("${G(glyph)}")`;
  return (
    <span className={`${s.tile} ${className ?? ""}`} aria-hidden style={{ width: size, height: size, ["--tile" as string]: tileColor[color], ["--r" as string]: Math.round(size * 9 / 36) + "px" }}>
      <span className={s.glyph} style={{ maskImage: url, WebkitMaskImage: url, width: Math.round(size / 2), height: Math.round(size / 2) }} />
    </span>
  );
}
