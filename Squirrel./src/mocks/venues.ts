// Мекемелер (карта мен мекеме беті үшін). Алғашқы бесеуі Figma-дағы «Карта / Ашық тізім» тізімінен.
import type { OfferKind } from "./offers";
export interface Venue { id: string; name: string; kind: OfferKind; km: number; rating: number; reviews: number; address: string; hours: string; x: number; y: number; lng?: number; lat?: number; status?: "closed" | "new" | "nopay" | "247";
  /** Сенімділік белгісі (сервер, 90 күн): шағымсыз өткен қызмет үлесі, % — тек жеткілікті дерек болса */
  trust?: number | null; opensAt?: string; offers: [string, number, string?][] }
export const kindLabel: Record<OfferKind, string> = { food: "Тағам", coffee: "Кофе", hair: "Шаштараз" };
export const kindEmoji: Record<OfferKind, string> = { food: "🍔", coffee: "☕", hair: "✂️" };
export const kindTint: Record<OfferKind, string> = { food: "#ffb454", coffee: "#c9976a", hair: "#6aa2f5" };
// x, y — белгінің ортасы (Figma кадрындағы координата, 412×917)
export const venues: Venue[] = [
  { id: "damdi", name: "Dämdi Doner", kind: "food", km: 1.2, rating: 4.8, reviews: 23, address: "Нұркен Әбдіров, 24", hours: "09:00–22:00", x: 90, y: 236, offers: [["Тауық донері · 4 дана", 6000, "doner"], ["Донер + сусын · 4 дана", 9200, "doner-drink"], ["Донер комбо · 6 дана", 9600]] },
  { id: "brew", status: "247", name: "Brew Point", kind: "coffee", km: 0.9, rating: 4.7, reviews: 15, address: "Ерубаев 21", hours: "08:00–22:00", x: 205, y: 300, offers: [["Латте · 15 стақан", 27000]] },
  { id: "qala-barber", name: "Qala Barber", kind: "hair", km: 1.5, rating: 4.9, reviews: 18, address: "Нұркен Әбдіров 24", hours: "10:00–21:00", x: 300, y: 214, offers: [["Шаш қию · 4 рет", 12000, "haircut"]] },
  { id: "coffee-lab", name: "Coffee Lab", kind: "coffee", km: 1.6, rating: 4.6, reviews: 14, address: "Ерубаев 33", hours: "08:00–22:00", x: 330, y: 360, offers: [["Латте · 12 стакан", 10800, "latte"], ["Кофе · 10 стақан", 18000]] },
  { id: "bahandi", status: "nopay", name: "Bahandi", kind: "food", km: 1.2, rating: 4.7, reviews: 31, address: "Бұқар жырау 59", hours: "10:00–23:00", x: 140, y: 440, offers: [["Бургер комбо · 4 дана", 10800, "burger-combo"], ["Бургер · 6 дана", 9000]] },
  { id: "kebab", status: "closed", opensAt: "10:00", name: "Kebab House", kind: "food", km: 1.8, rating: 4.7, reviews: 19, address: "Гоголь 40", hours: "10:00–23:00", x: 268, y: 470, offers: [["Қой етінен донер · 4 дана", 7600, "lamb-doner"]] },
  { id: "tan", name: "Taň Coffee", kind: "coffee", km: 1.2, rating: 4.8, reviews: 26, address: "Бұқар жырау 47", hours: "08:00–22:00", x: 120, y: 330, offers: [["Капучино · 12 кесе", 12000, "cappuccino"]] },
  { id: "qala-coffee", name: "Qala Coffee", kind: "coffee", km: 0.9, rating: 4.6, reviews: 12, address: "Әлиханов 5", hours: "08:00–21:00", x: 190, y: 560, offers: [["Американо · 10 кесе", 10000, "americano"]] },
  { id: "dodo", name: "Dodo Pizza", kind: "food", km: 2.1, rating: 4.7, reviews: 40, address: "Ермеков 29", hours: "10:00–23:00", x: 318, y: 580, offers: [["Ірімшікті пицца · 4 дана", 16000, "pizza"]] },
  { id: "style", status: "new", name: "Style Studio", kind: "hair", km: 2.4, rating: 4.5, reviews: 9, address: "Абай 12", hours: "10:00–20:00", x: 64, y: 560, offers: [["Шаш қию · 3 рет", 9000]] },
];
export const findVenue = (id?: string) => venues.find((v) => v.id === id);

// Қарағанды орталығындағы шамамен координаттар (демо): Figma-дағы x/y орындарынан есептеледі.
export const CITY_CENTER: [number, number] = [73.0950, 49.8040];
export const lngLat = (v: Venue): [number, number] => [v.lng ?? CITY_CENTER[0] + (v.x - 206) / 412 * 0.034, v.lat ?? CITY_CENTER[1] - (v.y - 400) / 600 * 0.016];
