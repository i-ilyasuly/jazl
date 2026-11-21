// Фондық жүктеу (Патша, 2026-11-21): қолданба ашылып, бірінші экран салынып болған соң, бос уақытта жүктелетіндер.
// Нашар желіде (Data Saver / 2G) ештеңе жүктемейміз. Ауыр нәрселер (ұсыныс фотолары) — тек Wi-Fi-да.
import { warmMaplibre } from "./ui/maplibre";
import { preloadSticker } from "./ui/Sticker";
import { offers } from "./mocks/offers";
import { galleryOf } from "./mocks/photos";
import { allPacks } from "./store";
import { preloadTgEmoji } from "./ui/TgEmoji";

type Conn = { saveData?: boolean; effectiveType?: string; type?: string };
const conn = () => (navigator as unknown as { connection?: Conn }).connection;
export const slowNet = () => { const c = conn(); return !!c?.saveData || /2g/.test(c?.effectiveType ?? ""); };
/** Wi-Fi екені анық болса ғана true (iPhone бұл ақпаратты бермейді — онда false). */
export const onWifi = () => conn()?.type === "wifi" || conn()?.type === "ethernet";

const kept: HTMLImageElement[] = [];
export function warmBackground() {
  if (slowNet()) return;
  // 1. Картаның бағдарламасы (≈1,6 МБ)
  warmMaplibre();
  // 6. Жиі шығатын үйрек стикерлері: тізім бітті / желі жоқ / табылмады; басты беттегі баннерлердің үйректері; «Жуырда» парағының үйрегі
  for (const n of ["sleep", "offline", "search", "bags", "gift", "city", "repair"] as const) void preloadSticker(n).catch(() => null);
  // Telegram анимациялық эмодзилері (Патша, 2026-11-21): басты беттегілері бірден, қалғандары кейін — бәрі фонда,
  // кішкентай (20–50 КБ), service worker телефонда сақтайды. Көрінген сәтте дайын тұрады.
  for (const n of ["fire", "rocket", "you", "rich", "thumbs", "partyface", "bell"] as const) void preloadTgEmoji(n).catch(() => null);
  window.setTimeout(() => { for (const n of ["point_right", "point_up", "point_down", "star", "money", "phone"] as const) void preloadTgEmoji(n).catch(() => null); }, 8000);
  // Пакетке байланысты стикерлер (Патша, 2026-11-21) — тек клиентке керек болатын сәтте:
  // мерзімі аз қалған пакет бар → сағатты үйрек (Пакеттерім) + себетті үйрек (Қайта алу);
  // соңғы бірлігі қалған пакет бар → кубокты үйрек (пакет біткенде).
  const ps = allPacks().filter((p) => p.left > 0);
  if (ps.some((p) => p.daysLeft <= 3)) { for (const n of ["clock", "shop"] as const) void preloadSticker(n).catch(() => null); void preloadTgEmoji("point_right").catch(() => null); }
  if (ps.some((p) => p.left <= 1)) void preloadSticker("trophy").catch(() => null);
  // Сирек беттердің стикерлері — ең соңында, 20 с кейін, тек жақсы желіде (мерекелік, мұңайған, ұйықтаған, телефон, құжат)
  window.setTimeout(() => { for (const n of ["partyhat", "sad", "phone", "reader"] as const) void preloadSticker(n).catch(() => null); void preloadTgEmoji("money").catch(() => null); }, 20000);
  // 7. Алғашқы 6 ұсыныстың үлкен фотосы (ұсыныс беті ашылғанда бірден тұрады) — тек Wi-Fi
  if (onWifi()) for (const o of offers.slice(0, 6)) { const src = galleryOf(o.id, o.kind)[0]; if (src) { const im = new Image(); im.src = src; kept.push(im); } }
}
