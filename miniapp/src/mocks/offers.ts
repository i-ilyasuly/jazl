// Жалған деректер: Figma-дағы мәндермен бірдей. Бэкенд қосылғанда осы файл API-мен ауысады.
export type OfferKind = "food" | "coffee" | "hair";

export interface Offer {
  /** Пакет көлемінің нұсқалары (Figma: «Ұсыныс беті / Пакет көлемі»). Бірінші — негізгі. */
  sizes?: { units: number; price: number; oldPrice: number }[];
  id: string;
  title: string;
  unitWord: string;
  venue: string;
  distance: string;
  kind: OfferKind;
  price: number;
  oldPrice: number;
  units: number;
  buyers: number;
  favorite: boolean;
  deadline?: string;
  photo?: string;
  rating: number;
  ratingCount: number;
  address: string;
  hours: string;
}

export const offers: Offer[] = [
  { id: "doner", title: "Тауық донері · 4 дана", unitWord: "донер", venue: "Dämdi Doner", distance: "1,2 км", kind: "food", price: 6000, oldPrice: 8000, units: 4, buyers: 48, favorite: true, rating: 4.8, ratingCount: 23, address: "Қарағанды, Бухар-Жырау даңғылы 52", hours: "Ашық · бүгін 09:00–22:00", sizes: [{ units: 4, price: 6000, oldPrice: 8000 }, { units: 8, price: 11000, oldPrice: 16000 }, { units: 12, price: 15600, oldPrice: 24000 }] },
  { id: "haircut", title: "Шаш қию · 4 рет", unitWord: "рет", venue: "Qala Barber", distance: "1,5 км", kind: "hair", price: 12000, oldPrice: 16000, units: 4, buyers: 31, favorite: false, deadline: "2 күн қалды", rating: 4.9, ratingCount: 18, address: "Қарағанды, Нұркен Әбдіров даңғылы 24", hours: "Ашық · бүгін 10:00–21:00" },
  { id: "latte", title: "Латте · 12 стакан", unitWord: "стакан", venue: "Coffee Lab", distance: "2,1 км", kind: "coffee", price: 10800, oldPrice: 13200, units: 12, buyers: 27, favorite: false, rating: 4.6, ratingCount: 14, address: "Қарағанды, Ерубаев көшесі 33", hours: "Ашық · бүгін 08:00–22:00" },
];

export const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₸";
export const unitPrice = (o: Offer) => Math.round(o.price / o.units);
export const saving = (o: Offer) => o.oldPrice - o.price;
export const discount = (o: Offer) => Math.round((1 - o.price / o.oldPrice) * 100);

// Сатылымы аяқталған ұсыныс (Таңдаулыда «Хабарла» батырмасымен көрінеді)
export const endedOffers: Offer[] = [
  { id: "burger", title: "Бургер комбо · 4 дана", unitWord: "комбо", venue: "Bahandi", distance: "1,2 км", kind: "food", price: 10800, oldPrice: 14000, units: 4, buyers: 27, favorite: true, rating: 4.7, ratingCount: 31, address: "Қарағанды, Бұқар жырау даңғылы 59", hours: "Ашық · бүгін 10:00–23:00" },
];

// Іздеуде ғана шығатын қосымша ұсыныстар (Figma: «Іздеу / Нәтижелер»)
export const moreOffers: Offer[] = [
  { id: "doner-drink", title: "Донер + сусын · 4 дана", unitWord: "комбо", venue: "Dämdi Doner", distance: "1,2 км", kind: "food", price: 9200, oldPrice: 12000, units: 4, buyers: 19, favorite: false, rating: 4.8, ratingCount: 23, address: "Қарағанды, Бухар-Жырау даңғылы 52", hours: "Ашық · бүгін 09:00–22:00" },
  { id: "lamb-doner", title: "Қой етінен донер · 4 дана", unitWord: "донер", venue: "Kebab House", distance: "1,8 км", kind: "food", price: 7600, oldPrice: 10000, units: 4, buyers: 31, favorite: false, rating: 4.7, ratingCount: 19, address: "Қарағанды, Гоголь көшесі 40", hours: "Ашық · бүгін 10:00–23:00" },
];
// Санат беттеріндегі ұсыныстар (Figma: «Санат беті / Кофе», «Тағамдар», «Шаш алу»)
export const categoryOffers: Offer[] = [
  { id: "cappuccino", title: "Капучино · 12 кесе", unitWord: "кесе", venue: "Taň Coffee", distance: "1,2 км", kind: "coffee", price: 12000, oldPrice: 15600, units: 12, buyers: 48, favorite: true, rating: 4.8, ratingCount: 26, address: "Қарағанды, Бұқар жырау даңғылы 47", hours: "Ашық · бүгін 08:00–22:00" },
  { id: "americano", title: "Американо · 10 кесе", unitWord: "кесе", venue: "Qala Coffee", distance: "0,9 км", kind: "coffee", price: 10000, oldPrice: 13000, units: 10, buyers: 31, favorite: false, rating: 4.6, ratingCount: 12, address: "Қарағанды, Әлиханов көшесі 5", hours: "Ашық · бүгін 08:00–21:00" },
  { id: "burger-combo", title: "Бургер комбо · 4 дана", unitWord: "комбо", venue: "Bahandi", distance: "1,2 км", kind: "food", price: 10800, oldPrice: 12800, units: 4, buyers: 86, favorite: false, rating: 4.7, ratingCount: 31, address: "Қарағанды, Бұқар жырау даңғылы 59", hours: "Ашық · бүгін 10:00–23:00" },
  { id: "pizza", title: "Ірімшікті пицца · 4 дана", unitWord: "пицца", venue: "Dodo Pizza", distance: "2,1 км", kind: "food", price: 16000, oldPrice: 20000, units: 4, buyers: 54, favorite: false, rating: 4.7, ratingCount: 40, address: "Қарағанды, Ермеков көшесі 29", hours: "Ашық · бүгін 10:00–23:00" },
  { id: "mens-cut", title: "Ерлердің шашын қию · 4 рет", unitWord: "қию", venue: "Qala Barber", distance: "1,8 км", kind: "hair", price: 10000, oldPrice: 14000, units: 4, buyers: 27, favorite: false, rating: 4.9, ratingCount: 18, address: "Қарағанды, Нұркен Әбдіров даңғылы 24", hours: "Ашық · бүгін 10:00–21:00" },
];
export const allOffers = () => [...offers, ...moreOffers];
export const offersOfVenue = (name: string) => [...offers, ...moreOffers, ...categoryOffers].filter((o) => o.venue === name);
import { photoOf } from "./photos";
for (const list of [offers, moreOffers, categoryOffers, endedOffers]) for (const x of list) if (photoOf[x.id]) x.photo = photoOf[x.id];
export const findOffer = (id?: string) => [...offers, ...moreOffers, ...categoryOffers, ...endedOffers].find((o) => o.id === id) ?? offers[0];

export const isEnded = (id: string) => endedOffers.some((o) => o.id === id);

// Ұсыныс бетіндегі мәтіндер санатқа сай болуы керек (кофе пакетінде лаваш туралы сөз болмауы тиіс).
type Seg = string | { g: string } | { b: string };
export interface OfferDetails { take: string; use: string; includes: Seg[]; about: Seg[]; reviews: { name: string; text: string }[] }
const byKind: Record<OfferKind, OfferDetails> = {
  food: {
    take: "мекемеде немесе алып кету", use: "Кассада QR сканерлеп",
    includes: ["Негізгі тағам, толық порция", { g: "Қаптама бағаға кіреді" }, "Сусын мен қосымша кірмейді"],
    about: [{ g: "Ыстық, жаңа дайындалған" }, " тағам. Әр бірлікті бөлек күндері алуға болады. Сусын ", { b: "қосылмайды" }, ", бірақ мекемеде оған жеңілдік бар."],
    reviews: [{ name: "Айгерім", text: "Ыстық әрі үлкен порция, төлем бірден өтті." }, { name: "Ерлан", text: "Баға тиімді, кезек аз болды." }],
  },
  coffee: {
    take: "алып кету немесе орында", use: "Бариста QR-ын сканерлеп",
    includes: ["Бір кесе — кез келген күні", { g: "Кез келген сүт тегін" }, "Сироп пен десерт кірмейді"],
    about: [{ g: "Жаңа қуырылған дән" }, ", әр кесе тапсырыспен жасалады. Күніне бір кесе аласың. Сироп ", { b: "қосылмайды" }, ", бірақ оны бөлек қосуға болады."],
    reviews: [{ name: "Дана", text: "Кофесі дәмді, таңертең кезек күтпедім." }, { name: "Асхат", text: "Күнде аламын, бөлек төлегеннен әлдеқайда арзан." }],
  },
  hair: {
    take: "алдын ала жазылу арқылы", use: "Шеберге QR көрсетіп",
    includes: ["Шаш қию және жуу", { g: "Сәндеу бағаға кіреді" }, "Сақал түзету кірмейді"],
    about: [{ g: "Тәжірибелі шебер" }, " қияды, жуу мен сәндеу кіреді. Келу уақытын алдын ала таңдайсың. Сақал түзету ", { b: "қосылмайды" }, "."],
    reviews: [{ name: "Нұрлан", text: "Шебер ұқыпты, дәл уақытында қабылдады." }, { name: "Тимур", text: "Айына бір барамын, пакетпен әлдеқайда тиімді." }],
  },
};
const includesById: Record<string, Seg[]> = {
  doner: ["Лаваш, тауық еті, көкөніс, үй соусы", { g: "Қаптама бағаға кіреді" }, "Сусын мен қосымша ет кірмейді"],
  "lamb-doner": ["Лаваш, қой еті, көкөніс, ақ соус", { g: "Қаптама бағаға кіреді" }, "Сусын кірмейді"],
  "doner-drink": ["Тауық донері + сусын 0,5 л", { g: "Сусынды таңдауға болады" }, "Қосымша соус кірмейді"],
  burger: ["Бургер, орташа фри, сусын 0,4 л", { g: "Соусты таңдауға болады" }, "Қосымша ірімшік кірмейді"],
  "burger-combo": ["Бургер, орташа фри, сусын 0,4 л", { g: "Соусты таңдауға болады" }, "Қосымша ірімшік кірмейді"],
  pizza: ["Ірімшікті пицца, 30 см", { g: "Қорап бағаға кіреді" }, "Жеткізу кірмейді"],
  latte: ["Латте 350 мл", { g: "Кез келген сүт тегін" }, "Сироп пен десерт кірмейді"],
  cappuccino: ["Капучино 250 мл", { g: "Кез келген сүт тегін" }, "Сироп пен десерт кірмейді"],
  americano: ["Американо 300 мл", { g: "Сүт қосу тегін" }, "Сироп пен десерт кірмейді"],
};
export const detailsOf = (o: Offer): OfferDetails => ({ ...byKind[o.kind], includes: includesById[o.id] ?? byKind[o.kind].includes });
