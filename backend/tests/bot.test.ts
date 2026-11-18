// Medeo боты: вебхук, /start (жаңа және қайта келген), /packs, /help, /support, /business, /lang, кез келген мәтін; баптау скрипті (Telegram жасанды)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { Hono } from "hono";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seedCatalog } from "../src/db/seed.js";
import { loadConfig } from "../src/config.js";
import { botRoutes } from "../src/bot/handler.js";
import { runSetup } from "../src/bot/setup.js";
import { webhookSecret, type TgCall } from "../src/bot/api.js";

const URL = process.env.TEST_DATABASE_URL;
const TOKEN = "123456:TEST-token-not-real";
const d = URL ? describe : describe.skip;
type Sent = { method: string; body: Record<string, unknown> };

d("Medeo боты", () => {
  const base = { DATABASE_URL: URL, BOT_TOKEN: TOKEN, DB_SSL: "disable", NODE_ENV: "test", PUBLIC_URL: "https://api.example.com" };
  const cfg = loadConfig(base);
  let dbh: ReturnType<typeof createDb>;
  const sent: Sent[] = [];
  const call: TgCall = async (method, body) => { sent.push({ method, body: (body ?? {}) as Record<string, unknown> }); return { ok: true, result: true }; };
  const appOf = (c = cfg) => { const a = new Hono(); a.route("/bot", botRoutes(c, dbh.db, call)); return a; };
  const upd = (a: Hono, u: object, secret = webhookSecret(cfg)) => a.request("/bot/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(u) });
  let n = 1;
  const msg = (text: string, from: object = { id: 7001, first_name: "Әли", language_code: "kk" }) => ({ update_id: n++, message: { message_id: n, chat: { id: (from as { id: number }).id, type: "private" }, from, text } });
  const last = () => sent.filter((x) => x.method === "sendMessage").at(-1)!.body;
  const buttons = (b: Record<string, unknown>) => ((b.reply_markup as { inline_keyboard: { text: string; url?: string; callback_data?: string; style?: string }[][] }).inline_keyboard).flat();

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query("drop schema if exists app cascade; drop schema if exists app_migrations cascade"); await admin.end();
    await runMigrations(URL!, "disable"); dbh = createDb(cfg); await seedCatalog(dbh.db);
  });
  afterAll(async () => { await dbh?.pool.end(); });

  it("құпиясыз не қате құпия — 401, ештеңе жіберілмейді", async () => {
    const a = appOf();
    expect((await upd(a, msg("/start"), "wrong")).status).toBe(401);
    expect(sent.length).toBe(0);
  });

  it("/start жаңа адам: сәлемдесу (аты экрандалған), «Medeo-ны ашу» көк батырма, «Қалай жұмыс істейді?», «Мен мекеме иесімін»; орысша Telegram — орысша", async () => {
    const a = appOf();
    expect((await upd(a, msg("/start", { id: 7002, first_name: "<Әли>", language_code: "kk" }))).status).toBe(200);
    const b = last();
    expect(b.parse_mode).toBe("HTML"); expect(b.text).toContain("Сәлем, &lt;Әли&gt;!");
    const bt = buttons(b);
    expect(bt[0]).toMatchObject({ text: "Medeo-ны ашу", url: "https://t.me/Mmedeo_bot?startapp", style: "primary" });
    expect(bt.map((x) => x.callback_data)).toEqual(expect.arrayContaining(["help", "business"]));
    await upd(a, msg("/start", { id: 7003, first_name: "Анна", language_code: "ru" }));
    expect(last().text).toContain("Привет, Анна!");
  });

  it("/start қайта келген (пакеті бар): пакет саны, бонус, ең жақын мерзім tg-time; /packs — тізім және «Пакеттерімді ашу»", async () => {
    const u = (await dbh.pool.query("insert into app.users (telegram_id, first_name, lang) values (7010, 'Дана', 'kk') returning id")).rows[0].id;
    const offer = (await dbh.pool.query("select id from app.offers where slug = 'doner'")).rows[0].id;
    await dbh.pool.query("insert into app.packs (user_id, offer_id, units_total, units_left, price_paid, valid_until, status, source) values ($1, $2, 4, 3, 6000, now() + interval '10 days', 'active', 'purchase')", [u, offer]);
    await dbh.pool.query("insert into app.bonuses (user_id, kind, amount, \"left\", units, expires_at) values ($1, 'manual', 1500, 1500, 0, now() + interval '1 month')", [u]);
    const a = appOf();
    await upd(a, msg("/start", { id: 7010, first_name: "Дана" }));
    const b = last();
    expect(b.text).toContain("Қайта қош келдің, Дана!"); expect(b.text).toContain("<b>1</b>"); expect(b.text).toContain("1 500 ₸");
    expect(b.text).toMatch(/<tg-time unix="\d+" format="D">\d+ \S+<\/tg-time>/);
    expect(buttons(b)[0]).toMatchObject({ url: "https://t.me/Mmedeo_bot?startapp=p_packs" });
    await upd(a, msg("/packs", { id: 7010, first_name: "Дана" }));
    expect(last().text).toContain("Белсенді пакеттерің"); expect(last().text).toContain("<b>3/4</b>");
  });

  it("/help — қадамдар мен жиналатын сұрақтар; /business — тіркелу; /lang — мини апптағы тіл беті; мәтін — көмек", async () => {
    const a = appOf();
    await upd(a, msg("/help")); expect(last().text).toContain("<blockquote expandable>");
    await upd(a, msg("/business")); expect(buttons(last())[0].url).toBe("https://t.me/Mmedeo_bot?startapp=v_new");
    await upd(a, msg("/lang")); expect(buttons(last())[0].url).toBe("https://t.me/Mmedeo_bot?startapp=p_lang");
    await upd(a, msg("сәлем, бұл не?")); expect(last().text).toContain("Мен хабарламаларды оқымаймын");
  });

  it("/support: қолдау аккаунты бапталса — жеке чатқа; әйтпесе — мини апптағы форма", async () => {
    await upd(appOf(), msg("/support")); expect(buttons(last())[0].url).toBe("https://t.me/Mmedeo_bot?startapp=p_report");
    await upd(appOf(loadConfig({ ...base, SUPPORT_USERNAME: "medeo_help" })), msg("/support")); expect(buttons(last())[0].url).toBe("https://t.me/medeo_help");
  });

  it("батырма «Қалай жұмыс істейді?» — answerCallbackQuery және көмек мәтіні; топтағы хабарға жауап жоқ", async () => {
    const a = appOf(); const before = sent.length;
    await upd(a, { update_id: n++, callback_query: { id: "q1", from: { id: 7001, language_code: "kk" }, message: { chat: { id: 7001 } }, data: "help" } });
    expect(sent.slice(before).map((x) => x.method)).toEqual(expect.arrayContaining(["answerCallbackQuery", "sendMessage"]));
    const k = sent.length;
    await upd(a, { update_id: n++, message: { message_id: 1, chat: { id: -100, type: "group" }, from: { id: 7001 }, text: "/start" } });
    expect(sent.length).toBe(k);
  });

  it("баптау: басқа бот болса — ештеңе өзгертілмейді; дұрыс бот — мәзір (бұрынғы домен), екі тілде командалар мен сипаттамалар, вебхук құпиясымен", async () => {
    const calls: Sent[] = []; const logs: string[] = [];
    const mk = (username: string, menuUrl?: string): TgCall => async (method, body) => {
      calls.push({ method, body: (body ?? {}) as Record<string, unknown> });
      if (method === "getMe") return { ok: true, result: { username } };
      if (method === "getChatMenuButton") return { ok: true, result: menuUrl ? { type: "web_app", web_app: { url: menuUrl } } : { type: "default" } };
      if (method === "getWebhookInfo") return { ok: true, result: { url: "https://api.example.com/bot/webhook", pending_update_count: 0 } };
      return { ok: true, result: true };
    };
    expect(await runSetup(cfg, mk("other_bot"), (s) => logs.push(s))).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["getMe"]);
    calls.length = 0;
    expect(await runSetup(cfg, mk("Mmedeo_bot", "https://miniapp-fkro.vercel.app/"), (s) => logs.push(s))).toBe(true);
    const by = (m: string) => calls.filter((c) => c.method === m).map((c) => c.body);
    expect(by("setChatMenuButton")[0]).toMatchObject({ menu_button: { type: "web_app", web_app: { url: "https://miniapp-fkro.vercel.app/" } } });
    expect(by("setMyCommands").map((b) => b.language_code)).toEqual([undefined, "ru"]);
    expect(by("setMyDescription").every((b) => String(b.description).length <= 512)).toBe(true);
    expect(by("setMyShortDescription").every((b) => String(b.short_description).length <= 120)).toBe(true);
    expect(by("setWebhook")[0]).toMatchObject({ url: "https://api.example.com/bot/webhook", secret_token: webhookSecret(cfg), allowed_updates: ["message", "callback_query"] });
    expect(logs.join("\n")).not.toContain(TOKEN);
  });
});
