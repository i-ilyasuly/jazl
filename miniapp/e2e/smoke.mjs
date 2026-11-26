// Мини апптың негізгі жолдарын шын браузерде тексеру (Патша, 2026-11-21). Іске қосу: npm run build && npm run e2e
// Сервер (API) әдейі қолжетімсіз: апп үлгі деректермен жұмыс істеуі керек. Telegram — жалған нысан (e2e/tgmock.cjs).
// Әр қадамда беттегі JS қателері де тексеріледі — бір қате болса, тест құлайды.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, devices } from "playwright";

const require = createRequire(import.meta.url);
const DIST = path.join(import.meta.dirname, "../dist");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".webm": "video/webm" };
const server = createServer(async (q, r) => {
  let p = decodeURIComponent((q.url ?? "/").split("?")[0]); if (p === "/") p = "/index.html";
  try { const d = await readFile(path.join(DIST, p)); r.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream" }); r.end(d); }
  catch { r.writeHead(404); r.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "allow" });
await ctx.addInitScript({ content: require("./tgmock.cjs") });
await ctx.addInitScript(() => { localStorage.setItem("medeo_onboarded", "1"); localStorage.setItem("medeo_nav_hints", "1"); });
await ctx.route(/\.run\.app\//, (r) => r.abort()); // сервер жоқ
// Нағыз telegram-web-app.js жүктелсе, жалған Telegram нысанын бос initData-мен басып тастайды → апп «Telegram-нан тыс» режиміне өтеді
await ctx.route(/telegram\.org\/js\//, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

let failed = 0;
async function step(name, fn) {
  errors.length = 0;
  try {
    await fn();
    if (errors.length) throw new Error("JS қатесі: " + errors.join(" | "));
    console.log("✓", name);
  } catch (e) { failed++; console.log("✗", name, "—", e.message.split("\n")[0]); await page.screenshot({ path: `e2e-fail-${failed}.png` }).catch(() => null); }
}
const open = async (hash, wait = 1500) => { await page.goto(base + "#" + hash); await page.waitForTimeout(wait); };
const btn = () => page.evaluate(() => window.__btn());
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

await step("Басты бет: ұсыныс карточкалары шығады", async () => {
  await open("/", 2500);
  must((await page.locator("a[href^='#/offer/']").count()) >= 3, "карточкалар аз");
});
await step("Ұсыныс беті ашылып, «Сатып алу» батырмасы көрінеді", async () => {
  await page.locator("a[href^='#/offer/']").first().click(); await page.waitForTimeout(1500);
  must(page.url().includes("#/offer/"), "ұсыныс беті ашылмады");
  must((await btn()).main !== "-", "негізгі батырма жоқ");
});
await step("Белгілер: иконка нұсқасы таңдалса — карточкада дөңгелек иконкалар", async () => {
  await open("/profile/motion");
  await page.getByText("Иконкалар", { exact: true }).click(); await page.waitForTimeout(300);
  // Бет қайта жүктелмей, ішкі ауысумен басты бетке ораламыз (Telegram-да баптау CloudStorage-та)
  await page.evaluate(() => { location.hash = "#/"; }); await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector("a[href^='#/offer/']")?.scrollIntoView());
  must((await page.locator("[class*=_iconStack_] svg").count()) > 0, "иконкалар жоқ");
  await page.evaluate(() => { location.hash = "#/profile/motion"; }); await page.waitForTimeout(800); await page.getByText("Анимациялық эмодзи", { exact: true }).click();
});
for (const [hash, name] of [["/packs", "Пакеттерім"], ["/profile", "Профиль"], ["/scan", "Сканер"], ["/profile/favorites", "Таңдаулылар"], ["/profile/motion", "Анимациялар"], ["/gift/americano", "Сыйлық"], ["/map", "Карта"], ["/category/coffee", "Санат"], ["/error/offline", "«Желі жоқ»"]]) {
  await step(`${name} беті қатесіз ашылады`, async () => {
    await open(hash, 2000);
    must((await page.locator("#root").innerText()).trim().length > 0, "бет бос");
  });
}
await step("Интернетсіз: қолданба соңғы нұсқасымен ашылады", async () => {
  await open("/", 2500); await page.reload(); await page.waitForTimeout(2000);
  must(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker басқармайды");
  await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(2000);
  must((await page.locator("a[href^='#/offer/']").count()) >= 3, "интернетсіз ашылмады");
  await ctx.setOffline(false);
});

await browser.close(); server.close();
console.log(failed ? `\n${failed} тест құлады` : "\nБарлығы өтті ✅");
process.exit(failed ? 1 : 0);
