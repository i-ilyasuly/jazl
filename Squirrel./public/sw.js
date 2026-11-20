// Medeo: карта кэші (Патша, 2026-11-21). Тек OpenFreeMap (стиль, вектор плиткалар, қаріптер, спрайт) — бет файлдарына тимейді.
// Бірінші кірістен кейін карта телефоннан бірден ашылады; Қарағанды аймағы фонда бір рет алдын ала жүктеледі.
const CACHE = "medeo-map-v1";
const isMap = (u) => u.hostname === "tiles.openfreemap.org";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || !isMap(u)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) c.put(e.request, res.clone());
    return res;
  }));
});
// Қарағанды: z11–14 плиткаларын фонда жүктеу (≈150 файл), бір-бірлеп, телефонды қинамай
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "prefetch-map") return;
  const { styles, bbox } = e.data; // bbox: [west, south, east, north]
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const get = async (url) => { try { if (!(await c.match(url))) { const r = await fetch(url); if (r.ok) await c.put(url, r); } return true; } catch { return false; } };
    for (const s of styles) {
      try {
        await get(s);
        const style = await (await c.match(s)).json();
        for (const src of Object.values(style.sources || {})) {
          if (!src.url) continue;
          await get(src.url);
          const tj = await (await c.match(src.url)).json();
          const tpl = (tj.tiles || [])[0]; if (!tpl) continue;
          for (let z = 11; z <= 14; z++) {
            for (let x = lon2x(bbox[0], z); x <= lon2x(bbox[2], z); x++)
              for (let y = lat2y(bbox[3], z); y <= lat2y(bbox[1], z); y++)
                if (!(await get(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y)))) return;
          }
        }
      } catch { /* желі нашар — келесі жолы */ }
    }
  })());
});
