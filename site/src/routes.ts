// Сайт беттерінің мекенжайлары. Орысшасы — /ru/... Келесі кезеңде жасалатын беттер де осында тұр (сілтемелер бір жерден).
import { APP_URL, BOT_URL, VENUE_APPLY_URL } from "./config";

const PATHS = {
  home: "/",
  offers: "/offers",
  how: "/#how",
  venues: "/venues",
  about: "/about",
  buy: "/how-to-buy",
  places: "/places",
  gift: "/#faq",
  faq: "/#faq",
  terms: "/venues#terms",
  apply: "/venues#apply",
  // Банк талап ететін беттер (Figma 69:2230)
  payment: "/payment",
  security: "/payment-security",
  personal: "/personal-data",
  service: "/service-terms",
  // Заңды құжаттар (мәтіні мини апптағы miniapp/src/legal/texts.ts-тен алынады)
  offer: "/docs/offer",
  privacy: "/docs/privacy",
  refund: "/docs/refund",
  use: "/docs/terms",
  venueContract: "/docs/venue",
} as const;

export type PageKey = keyof typeof PATHS | "cabinet";

export function href(lang: string, key: PageKey): string {
  if (key === "cabinet") return BOT_URL;
  const p: string = PATHS[key];
  if (lang !== "ru") return p;
  return p === "/" ? "/ru/" : p.startsWith("/#") ? "/ru/" + p.slice(1) : "/ru" + p;
}

/** Осы беттің екінші тілдегі мекенжайы */
export function otherLang(path: string, lang: string): string {
  if (lang === "ru") return path.replace(/^\/ru(\/|$)/, "/") || "/";
  return path === "/" ? "/ru/" : "/ru" + path;
}

export { APP_URL, VENUE_APPLY_URL };
