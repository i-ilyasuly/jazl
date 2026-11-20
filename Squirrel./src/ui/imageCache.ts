// Қолданба ішіндегі тұрақты суреттер (плиткалар, фонсыз белгілер, Fluent 3D) — бір рет жүктеліп, декодталып, жадта сақталады.
// Себебі (Патша, 2026-11-16): навигациямен қайта келгенде ұяшықтағы фонсыз суреттер қайта «пайда болып» жатты —
// decoding="async" + loading="lazy" әр жаңа <img> үшін бір-екі кадр бос қалдырады. Енді: ашылғанда барлығы алдын ала
// декодталады, <img> синхронды салынады. Ұсыныс/өнім беттеріндегі сыртқы фотолар бұл тізімге кірмейді (бұрынғыдай жүктеледі).
// Кейін кәсіби суреттерге ауыстырғанда — тек assets/ ішіндегі файлдар ауысады, логика сол күйі қалады.
const files = import.meta.glob(["../assets/tiles/*.webp", "../assets/emoji/*.webp"], { eager: true, import: "default" }) as Record<string, string>;

const kept: HTMLImageElement[] = [];
let started = false;

/** Барлық тұрақты суретті жүктеп, декодтап, сілтемесін ұстап тұрады (кэштен түсіп қалмасын). */
export function warmImages() {
  if (started) return;
  started = true;
  const urls = Object.values(files);
  // Алдымен басты беттегілер (плиткалар), қалғаны бос уақытта
  urls.sort((a, b) => Number(b.includes("tiles")) - Number(a.includes("tiles")));
  const load = (u: string) => { const im = new Image(); im.decoding = "async"; im.src = u; kept.push(im); void im.decode?.().catch(() => {}); };
  urls.slice(0, 12).forEach(load);
  const rest = urls.slice(12);
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
  idle(() => rest.forEach(load));
}
