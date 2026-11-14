// Жалған деректер: Figma-дағы мәндермен бірдей. Бэкенд қосылғанда осы файл API-мен ауысады.
export type OfferKind = "food" | "coffee" | "hair";

export interface Offer {
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
  { id: "doner", title: "Тауық донері · 4 дана", unitWord: "донер", venue: "Dämdi Doner", distance: "1,2 км", kind: "food", price: 6000, oldPrice: 8000, units: 4, buyers: 48, favorite: true, rating: 4.8, ratingCount: 23, address: "Қарағанды, Бухар-Жырау даңғылы 52", hours: "Ашық · бүгін 09:00–22:00" },
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
  { id: "lamb-doner", title: "Қой етінен донер · 4 дана", unitWord: "донер", venue: "Kebab House", distance: "1,8 км", kind: "food", price: 7600, oldPrice: 10000, units: 4, buyers: 31, favorite: false, rating: 4.7, ratingCount: 19, address: "Қарағанды, Гоголь көшесі 40", hours: "Ашық · бүгін 10:00–23:00" },
];
export const allOffers = () => [...offers, ...moreOffers];
export const findOffer = (id?: string) => [...offers, ...moreOffers, ...endedOffers].find((o) => o.id === id) ?? offers[0];
