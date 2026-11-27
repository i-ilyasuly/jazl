// Medeo боты (@Mmedeo_bot): /start, командалар, кез келген мәтінге жауап. Вебхук — POST /bot/webhook (құпия тақырыпшамен).
// Ережелер (кеңесшінің ескертуі бойынша): кәдімгі sendMessage + HTML (ескі Telegram клиенттері де көреді), атаулар экрандалады,
// батырмалар t.me/<бот>?startapp=<кілт> (телефонда тексерілген жол), вебхук әрқашан 200 қайтарады (әйтпесе Telegram қайта жібереді).
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { tgApi, webhookSecret, type TgCall } from "./api.js";
import { B, TXT, tgTime, type BotLang } from "./texts.js";

type Btn = { text: string; url?: string; callback_data?: string; style?: "primary" | "success" | "danger" };
type Update = {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number; first_name?: string; language_code?: string; is_bot?: boolean }; text?: string };
  callback_query?: { id: string; from: { id: number; first_name?: string; language_code?: string }; message?: { message_id?: number; chat: { id: number } }; data?: string };
};
const MON = { kk: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"], ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] };
const dayText = (d: Date, l: BotLang) => { const x = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Almaty" })); return `${x.getDate()} ${MON[l][x.getMonth()]}`; };

export function makeBot(cfg: Config, db: Db, call: TgCall = tgApi(cfg)) {
  const app = (start = "") => `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp${start ? "=" + start : ""}`;
  const kb = (rows: Btn[][]) => ({ inline_keyboard: rows });
  const send = (chatId: number, text: string, rows?: Btn[][]) =>
    call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(rows ? { reply_markup: kb(rows) } : {}) });

  async function userOf(tgId: number, code?: string) {
    const r = (await db.execute(sql`select id, first_name, lang from app.users where telegram_id = ${tgId} limit 1`)).rows[0] as { id: string; first_name: string; lang: string } | undefined;
    const lang: BotLang = r ? (r.lang === "ru" ? "ru" : "kk") : /^(ru|be|uk)/i.test(code ?? "") ? "ru" : "kk";
    return { user: r, lang };
  }
  async function packsOf(userId: string) {
    return (await db.execute(sql`select o.title, o.title_ru, p.units_left, p.units_total, p.valid_until from app.packs p join app.offers o on o.id = p.offer_id
      where p.user_id = ${userId} and p.status = 'active' and p.units_left > 0 and p.valid_until > now() order by p.valid_until`)).rows as { title: string; title_ru: string | null; units_left: number; units_total: number; valid_until: Date }[];
  }
  async function bonusOf(userId: string) {
    const r = (await db.execute(sql`select coalesce(sum("left"), 0)::int as s from app.bonuses where user_id = ${userId} and "left" > 0 and expires_at > now()`)).rows[0] as { s: number };
    return r.s;
  }
  const supportRow = (l: BotLang): Btn[] => [cfg.SUPPORT_USERNAME ? { text: B.support[l], url: `https://t.me/${cfg.SUPPORT_USERNAME}` } : { text: B.report[l], url: app("p_report") }];

  async function start(chatId: number, from: { id: number; first_name?: string; language_code?: string }) {
    const { user, lang } = await userOf(from.id, from.language_code);
    const name = (user?.first_name || from.first_name || "").trim() || (lang === "ru" ? "друг" : "дос");
    const packs = user ? await packsOf(user.id) : [];
    if (user && packs.length) {
      const bonus = await bonusOf(user.id);
      const near = packs[0];
      return send(chatId, TXT.startBack(name, packs.length, bonus, tgTime(new Date(near.valid_until), dayText(new Date(near.valid_until), lang), "D"))[lang],
        [[{ text: B.openPacks[lang], url: app("p_packs"), style: "primary" }], [{ text: B.how[lang], callback_data: "help" }]]);
    }
    return send(chatId, TXT.startNew(name)[lang], [[{ text: B.open[lang], url: app(), style: "primary" }], [{ text: B.how[lang], callback_data: "help" }, { text: B.owner[lang], callback_data: "business" }]]);
  }
  const help = (chatId: number, l: BotLang) => send(chatId, TXT.help[l], [[{ text: B.open[l], url: app(), style: "primary" }], [{ text: B.faq[l], url: app("p_help") }], supportRow(l)]);
  const business = (chatId: number, l: BotLang) => send(chatId, TXT.business[l], [[{ text: B.apply[l], url: app("v_new"), style: "primary" }]]);
  async function packsCmd(chatId: number, from: { id: number; language_code?: string }) {
    const { user, lang } = await userOf(from.id, from.language_code);
    const packs = user ? await packsOf(user.id) : [];
    if (!packs.length) return send(chatId, TXT.packsEmpty[lang], [[{ text: B.open[lang], url: app(), style: "primary" }]]);
    const lines = packs.slice(0, 6).map((p) => TXT.packLine(lang === "ru" && p.title_ru ? p.title_ru : p.title.split(" · ")[0], p.units_left, p.units_total, tgTime(new Date(p.valid_until), dayText(new Date(p.valid_until), lang), "D"))[lang]);
    if (packs.length > 6) lines.push(TXT.packsMore(packs.length - 6)[lang]);
    return send(chatId, [TXT.packsHead[lang], "", ...lines].join("\n"), [[{ text: B.openPacks[lang], url: app("p_packs"), style: "primary" }]]);
  }

  /** Бір жаңартуды өңдеу (тесттер мен вебхук үшін) */
  async function handle(u: Update) {
    if (u.callback_query) {
      const q = u.callback_query; const chatId = q.message?.chat.id ?? q.from.id;
      // 📋 Пилот сұрағы (0041): «pv:<пакет>:n|s|r» — тек пакет иесінің жауабы, бір рет жазылады
      const pv = /^pv:([0-9a-f-]{36}):([nsr])$/.exec(q.data ?? "");
      if (pv) {
        const { lang } = await userOf(q.from.id, q.from.language_code);
        const done = (await db.execute(sql`update app.packs p set prior_visit = ${pv[2]} from app.users u
          where p.id = ${pv[1]} and u.id = p.user_id and u.telegram_id = ${q.from.id} and p.prior_visit is null returning p.id`)).rows.length > 0;
        void call("answerCallbackQuery", { callback_query_id: q.id, text: lang === "ru" ? "Спасибо!" : "Рақмет!" });
        if (done && q.message?.message_id) await call("editMessageText", { chat_id: chatId, message_id: q.message.message_id, text: TXT.priorThanks[lang] });
        return;
      }
      void call("answerCallbackQuery", { callback_query_id: q.id });
      const { lang } = await userOf(q.from.id, q.from.language_code);
      if (q.data === "help") await help(chatId, lang);
      else if (q.data === "business") await business(chatId, lang);
      return;
    }
    const m = u.message;
    if (!m || m.chat.type !== "private" || !m.from || m.from.is_bot) return; // тек жеке чат
    const text = (m.text ?? "").trim();
    const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/i.exec(text);
    const { lang } = await userOf(m.from.id, m.from.language_code);
    switch (cmd?.[1]?.toLowerCase()) {
      case "start": return void (await start(m.chat.id, m.from));
      case "packs": return void (await packsCmd(m.chat.id, m.from));
      case "help": return void (await help(m.chat.id, lang));
      case "support": return void (await send(m.chat.id, cfg.SUPPORT_USERNAME ? TXT.support[lang] : TXT.supportForm[lang], [supportRow(lang)]));
      case "business": return void (await business(m.chat.id, lang));
      case "lang": return void (await send(m.chat.id, TXT.lang[lang], [[{ text: B.lang[lang], url: app("p_lang") }]]));
      default: return void (await send(m.chat.id, TXT.fallback[lang], [[{ text: B.open[lang], url: app(), style: "primary" }], supportRow(lang)]));
    }
  }
  return { handle };
}

export function botRoutes(cfg: Config, db: Db, call?: TgCall) {
  const r = new Hono();
  const bot = makeBot(cfg, db, call);
  const secret = Buffer.from(webhookSecret(cfg));
  r.post("/webhook", async (c) => {
    const got = Buffer.from(c.req.header("x-telegram-bot-api-secret-token") ?? "");
    if (got.length !== secret.length || !timingSafeEqual(got, secret)) return c.json({ ok: false }, 401);
    try { await bot.handle(await c.req.json()); } catch (e) { console.error("bot update", (e as Error).message); } // дене журналға жазылмайды
    return c.json({ ok: true }); // әрқашан 200: Telegram қайта жібермесін (қайталанған жауап болмасын)
  });
  return r;
}
