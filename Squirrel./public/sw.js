// Medeo service worker (Патша, 2026-11-21).
// 1) Карта: OpenFreeMap (стиль, плиткалар, қаріптер, спрайт) — кэштен; Қарағанды аймағы фонда бір рет алдын ала жүктеледі.
// 2) Қолданбаның өз файлдары (/assets/ — аттарында хэш бар, ешқашан өзгермейді) — кэштен. Telegram браузер кэшін
//    тазаласа да, қайта ашқанда желіден қайта жүктелмейді. index.html мен API-ге тимейміз (әрқашан желіден).
const MAP = "medeo-map-v1";
const APP = "medeo-app-v1";
const APP_MAX = 400; // ескі нұсқалардың файлдары жиналып қалмасын
const isMap = (u) => u.hostname === "tiles.openfreemap.org";
// Telegram анимациялық эмодзилері (біздің сервер арқылы) — бір рет жүктеліп, телефонда сақталады
const isEmoji = (u) => u.hostname.endsWith(".run.app") && u.pathname.startsWith("/v1/emoji/");
const isAsset = (u) => u.origin === self.location.origin && u.pathname.includes("/assets/");
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const fromCache = (name, req, after) => caches.open(name).then(async (c) => {
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { await c.put(req, res.clone()); if (after) after(c); }
  return res;
});
let pruning = false;
const prune = async (c) => {
  if (pruning) return; pruning = true;
  try { const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - APP_MAX))) await c.delete(k); } finally { pruning = false; }
};
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (isMap(u)) e.respondWith(fromCache(MAP, e.request));
  else if (isAsset(u) || isEmoji(u)) e.respondWith(fromCache(APP, e.request, prune));
});

// Қарағанды: плиткалар (z11–14; Wi-Fi-да — карта көзінде бар болса z15–16), қаріптер, белгішелер. Бір-бірлеп, телефонды қинамай.
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
// Латын, кеңейтілген латын (ә, ғ, қ, ң, ө, ұ, ү, һ, і), кирилл және тыныс белгілері
const RANGES = ["0-255", "256-511", "1024-1279", "8192-8447"];
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "prefetch-map") return;
  const { styles, bbox, deep } = e.data; // bbox: [west, south, east, north]
  e.waitUntil((async () => {
    const c = await caches.open(MAP);
    const get = async (url) => { try { const req = new Request(url); if (!(await c.match(req))) { const r = await fetch(req); if (r.ok) await c.put(req, r); } return true; } catch { return false; } };
    for (const s of styles) {
      try {
        await get(s);
        const style = await (await c.match(s)).json();
        // Белгішелер (спрайт): күндізгі және retina нұсқасы
        for (const sp of [].concat(style.sprite || []).map((x) => (typeof x === "string" ? x : x.url)))
          for (const suf of [".json", ".png", "@2x.json", "@2x.png"]) await get(sp + suf);
        // Қаріптер: стильде қолданылатын әр қаріп жиыны үшін
        if (style.glyphs) {
          const stacks = new Set();
          for (const l of style.layers || []) { const f = l.layout && l.layout["text-font"]; if (Array.isArray(f) && f.every((x) => typeof x === "string")) stacks.add(f.join(",")); }
          for (const st of stacks) for (const r of RANGES) await get(style.glyphs.replace("{fontstack}", st).replace("{range}", r));
        }
        for (const src of Object.values(style.sources || {})) {
          if (!src.url) continue;
          await get(src.url);
          const tj = await (await c.match(src.url)).json();
          const tpl = (tj.tiles || [])[0]; if (!tpl) continue;
          const top = Math.min(deep ? 16 : 14, tj.maxzoom ?? 14);
          for (let z = 11; z <= top; z++) {
            for (let x = lon2x(bbox[0], z); x <= lon2x(bbox[2], z); x++)
              for (let y = lat2y(bbox[3], z); y <= lat2y(bbox[1], z); y++)
                if (!(await get(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y)))) return;
          }
        }
      } catch { /* желі нашар — келесі жолы */ }
    }
  })());
});
