// Іздеу 2-кезең (Патша, 2026-11-25): санатты Gemini Decision 1 ұсынады, іздеу сөздері сақталады және каталогқа шығады
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { signInitData } from "../src/auth/telegram.js";
import { loadConfig } from "../src/config.js";
import { AiError, suggestCategory } from "../src/ai.js";

const TOKEN = "123456:TEST-token-not-real";
const KEY = "AIza-test-key-not-real-000000";
const answer = (choice: string, probabilities: Record<string, number>) => new Response(JSON.stringify({ answers: { category: { type: "choice", choice, confidence: probabilities[choice], probabilities } } }), { status: 200 });

describe("ai.suggestCategory", () => {
  const cfg = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: TOKEN, NODE_ENV: "test", GEMINI_API_KEY: KEY });
  it("Decisions API-ге дұрыс сұрау жібереді, ең ықтимал 3 санатты қайтарады", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return answer("sushi", { sushi: 0.93, lunch: 0.04, combo: 0.02, other: 0.01 }); }) as unknown as typeof fetch;
    const out = await suggestCategory(cfg, "food", { title: "Суши сет", packName: "Тойымды", composition: "ролл, лосось" }, f);
    expect(out.best.kk).toBe("Суши"); expect(out.confidence).toBeCloseTo(0.93);
    expect(out.top.map((x) => x.category.id)).toEqual(["sushi", "lunch", "combo"]);
    expect(seen!.url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe("gemini-decision-1");
    expect(body.questions.category.type).toBe("choice");
    expect(Object.keys(body.questions.category.criteria)).toContain("sushi");
    expect(body.input).toContain("Тойымды");
  });
  it("кілт жоқ — ai_off; банк қатесі — ai_error; бөтен жауап — ai_error", async () => {
    const off = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: TOKEN, NODE_ENV: "test" });
    await expect(suggestCategory(off, "food", { title: "Суши" })).rejects.toMatchObject({ code: "ai_off" });
    const bad = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(suggestCategory(cfg, "food", { title: "Суши" }, bad)).rejects.toBeInstanceOf(AiError);
    const weird = (async () => answer("spaceship", { spaceship: 1 })) as unknown as typeof fetch;
    await expect(suggestCategory(cfg, "food", { title: "Суши" }, weird)).rejects.toMatchObject({ code: "ai_error" });
  });
});

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
d("санат ұсынысы және іздеу сөздері (API)", () => {
  const cfg = loadConfig({ DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", GEMINI_API_KEY: KEY });
  let dbh: ReturnType<typeof createDb>; let app: ReturnType<typeof createApp>; let venueId = "";
  const realFetch = globalThis.fetch;
  const h = (id: number) => ({ Authorization: "tma " + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "А" + id }) }, TOKEN), "Content-Type": "application/json" });
  const post = (p: string, body: object, id: number) => app.request(p, { method: "POST", headers: h(id), body: JSON.stringify(body) });
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db); app = createApp(cfg, dbh.db);
    venueId = (await dbh.pool.query("select id from app.venues where slug='damdi'")).rows[0].id;
    await post("/v1/venue/dev-join", { venueSlug: "damdi" }, 801);
    vi.stubGlobal("fetch", (async (input: string | globalThis.URL, init?: RequestInit) => String(input).includes("generativelanguage") ? answer("sushi", { sushi: 0.9, other: 0.1 }) : realFetch(input, init)) as typeof fetch);
  });
  afterAll(async () => { vi.unstubAllGlobals(); await dbh?.pool.end(); });

  it("иесі санат ұсынысын алады; бөгде адам — 403", async () => {
    const r = await post(`/v1/venue/${venueId}/offers/suggest-category`, { title: "Суши сет", packName: "Тойымды" }, 801);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, category: "Суши", top: [{ category: "Суши" }, { category: "Басқа" }] });
    expect((await post(`/v1/venue/${venueId}/offers/suggest-category`, { title: "Суши сет" }, 802)).status).toBe(403);
  });
  it("іздеу сөздері сақталады (тазаланып, 8-ге дейін) және каталогқа шығады", async () => {
    const body = { title: "Суши сет", titleRu: "Суши сет", packName: "Тойымды", packNameRu: "Тойымды", category: "Суши", keywords: ["Ролл", "ролл", " сет ", "жапон"],
      about: "", sizes: [{ units: 4, price: 6000 }], regularUnitPrice: 2000, validDays: 30, rules: { carry: true, extend: true, preorder: false, branches: null }, publish: false };
    const d0 = await (await post(`/v1/venue/${venueId}/offers`, body, 801)).json();
    const o = (await (await app.request(`/v1/venue/${venueId}/offers/${d0.offer.id}`, { headers: h(801) })).json()).offer;
    expect(o.keywords).toEqual(["ролл", "сет", "жапон"]);
    await dbh.pool.query("update app.offers set status='active' where id=$1", [d0.offer.id]);
    const cat = await (await app.request("/v1/catalog")).json();
    const mine = cat.offers.find((x: { slug: string }) => x.slug === o.slug);
    expect(mine).toMatchObject({ category: "Суши", details: { keywords: ["ролл", "сет", "жапон"], packName: "Тойымды" } });
  });
});
