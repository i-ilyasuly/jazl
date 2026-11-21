// Фондық жүктеу (Патша, 2026-11-21): қолданба ашылып, бірінші экран салынып болған соң, бос уақытта жүктелетіндер.
// Нашар желіде (Data Saver / 2G) ештеңе жүктемейміз. Ауыр нәрселер (ұсыныс фотолары) — тек Wi-Fi-да.
import { warmMaplibre } from "./ui/maplibre";
import { preloadSticker } from "./ui/Sticker";
import { offers } from "./mocks/offers";
import { galleryOf } from "./mocks/photos";

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
  // 6. Жиі шығатын үйрек стикерлері: тізім бітті / желі жоқ / табылмады; басты беттегі баннерлердің үйректері
  for (const n of ["sleep", "offline", "search", "bags", "gift", "city"] as const) void preloadSticker(n).catch(() => null);
  // 7. Алғашқы 6 ұсыныстың үлкен фотосы (ұсыныс беті ашылғанда бірден тұрады) — тек Wi-Fi
  if (onWifi()) for (const o of offers.slice(0, 6)) { const src = galleryOf(o.id, o.kind)[0]; if (src) { const im = new Image(); im.src = src; kept.push(im); } }
}
