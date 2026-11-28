// Бот хабарламалары (Figma «16 · Бот хабарламалары (мекеме)» 14045:11127 және «Бот хабарламалары (клиент)» 14044:12950).
// Хабар мини апп ашылатын боттан (@Mmedeo_bot: MINIAPP_BOT_TOKEN, жоқ болса BOT_TOKEN) жіберіледі. Батырма — t.me/<бот>?startapp=<кілт>:
// Telegram мини аппты бірден тиісті бетте ашады (main.tsx start_param).
// Хабар жіберілмесе (бот бұғатталған, желі) — тек журналға жазылады: негізгі әрекет (тапсырыс, шағым) ешқашан құламайды.
import { creditBreakage } from "./bonus.js";
import { limitsOf, soldThisMonth } from "./limits.js";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";

export interface Msg { chatId: number; text: string; button?: { text: string; start?: string; url?: string };
  /** Бір қатар callback батырмалары (бот өзі өңдейді: bot/handler.ts) — мысалы, пилот сұрағы «pv:<пакет>:n» */
  choices?: { text: string; data: string }[] }
export type Sender = (m: Msg) => Promise<void>;

/** Telegram Bot API арқылы жіберу. Токен журналға ешқашан жазылмайды. */
export function telegramSender(cfg: Config): Sender {
  // Тек Medeo боты (@Mmedeo_bot). Ескі @oylarbot өшірілді (Патша, 2026-11-18) — қосалқы жіберу жолы жоқ.
  const token = cfg.MINIAPP_BOT_TOKEN || cfg.BOT_TOKEN;
  return async (m) => {
    const body = {
      chat_id: m.chatId, text: m.text, link_preview_options: { is_disabled: true },
      // style: батырма түсі (Bot API 9.4, «primary» — көк); ескі клиенттер елемейді. Мәтін кәдімгі (parse_mode жоқ): атауларды экрандау қажет емес
      ...(m.choices?.length ? { reply_markup: { inline_keyboard: [m.choices.map((c) => ({ text: c.text, callback_data: c.data }))] } }
        : m.button ? { reply_markup: { inline_keyboard: [[{ text: m.button.text, url: m.button.url ?? `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=${m.button.start}`, style: "primary" }]] } } : {}),
    };
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    if (!r.ok) console.warn(`notify: telegram ${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  };
}
export const noopSender: Sender = async () => {};

const tz = { timeZone: "Asia/Almaty" } as const;
const hm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", ...tz });
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", tz);
const MON = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const MON_RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** Хабарлама тілі (Патша, 2026-11-18: орыс тілі): алушының users.lang мәні бойынша. Мәтін — қазақша не {kk, ru}. */
export type Lang = "kk" | "ru";
export type Txt = string | { kk: string; ru: string };
export const L = (kk: string, ru: string): Txt => ({ kk, ru });
const pick = (t: Txt, l: Lang) => (typeof t === "string" ? t : t[l]);
/** «бүгін 14:30», «ертең 14:00», «21 қараша 10:00» (орысша: «сегодня 14:30», «21 ноября 10:00») */
export function when(d: Date, now = new Date(), l: Lang = "kk") {
  const day = ymd(d); const t = hm(d);
  if (day === ymd(now)) return `${l === "ru" ? "сегодня" : "бүгін"} ${t}`;
  if (day === ymd(new Date(now.getTime() + 86400_000))) return `${l === "ru" ? "завтра" : "ертең"} ${t}`;
  return `${Number(day.slice(8, 10))} ${(l === "ru" ? MON_RU : MON)[Number(day.slice(5, 7)) - 1]} ${t}`;
}
/** Екі тілде бірден: уақыт мәтіні */
const whenL = (d: Date) => ({ kk: when(d, new Date(), "kk"), ru: when(d, new Date(), "ru") });
export const money = (n: number) => n.toLocaleString("ru-RU").replace(/[\s,]/g, " ") + " ₸";
const short = (f: string, l: string | null) => (l ? `${f} ${l.slice(0, 1)}.` : f);
const head = (t: string) => t.split(" · ")[0];
/** Алматы уақыты бойынша сағат (0–23) */
const hourAt = (d: Date) => Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, ...tz })) % 24;

/** Мекеме қызметкерінің хабарландыру баптаулары (Figma «Баптаулар»); жоқ кілт — әдепкі мән */
export const venuePrefDefaults = { newOrder: true, newReview: true, daily: true, paymentSent: true, orderFailed: true, offerEnding: false, pin: false };
type VenuePref = keyof typeof venuePrefDefaults;
/** Клиенттің баптаулары (Figma «Хабарландырулар»): мерзім ескертуі т.б. */
export const clientPrefDefaults = { expiry: true, rating: true, offers: true, promo: false };

type Row = Record<string, unknown>;
export type Notifier = ReturnType<typeof makeNotifier>;

/** Басқару иесінің баптаулары (Figma «18 · Хабарлама баптаулары»). Шұғыл: complaint, payFail, pos, priceDrop. */
export const adminPrefDefaults = { complaint: true, payFail: true, pos: true, priceDrop: true, application: true, moderation: true, daily: true, weekly: false, quiet: true };
export type AdminPref = keyof typeof adminPrefDefaults;
const URGENT: AdminPref[] = ["complaint", "payFail", "pos", "priceDrop"];

export function makeNotifier(db: Db, rawSend: Sender, opts: { adminIds?: string; adminUrl?: string; feePct?: number } = {}) {
  const adminTg = (opts.adminIds ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const adminUrl = (path: string) => `${(opts.adminUrl ?? "").replace(/\/$/, "")}/#/a${path}`;
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  /** Алушының тілі (users.lang): мини апп тіл таңдағанда PATCH /v1/me арқылы жаңартады */
  const langOf = async (chatId: number): Promise<Lang> => (await rows<{ lang: string }>(sql`select lang from app.users where telegram_id = ${chatId}`))[0]?.lang === "ru" ? "ru" : "kk";
  type LMsg = { chatId: number; text: Txt; button?: { text: Txt; start?: string; url?: string }; choices?: { text: Txt; data: string }[] };
  const send = async (m: LMsg) => {
    const l = typeof m.text === "string" && (!m.button || typeof m.button.text === "string") && !m.choices?.some((c) => typeof c.text !== "string") ? "kk" : await langOf(m.chatId);
    await rawSend({ chatId: m.chatId, text: pick(m.text, l), ...(m.button ? { button: { ...m.button, text: pick(m.button.text, l) } } : {}),
      ...(m.choices ? { choices: m.choices.map((c) => ({ text: pick(c.text, l), data: c.data })) } : {}) });
  };
  const safe = async (what: string, f: () => Promise<void>) => { try { await f(); } catch (e) { console.warn(`notify ${what}: ${(e as Error).message}`); } };
  /** Кілт бойынша бір рет: журналда бар болса — false */
  const once = async (key: string) => (await rows(sql`insert into app.notify_log (key) values (${key}) on conflict do nothing returning key`)).length > 0;
  const sendAll = async (ids: number[], m: Omit<LMsg, "chatId">) => { await Promise.all([...new Set(ids)].map((chatId) => send({ chatId, ...m }).catch((e) => console.warn(`notify send: ${(e as Error).message}`)))); };

  /** Мекеменің белсенді қызметкерлері: рөл, филиал (филиалға бекітілмеген — бәрін көреді), баптау бойынша сүзгі */
  const staff = async (venueId: string, roles: string[], opt: { branchId?: string; pref?: VenuePref } = {}) => {
    const list = await rows<{ tg: string; role: string; branch_id: string | null; prefs: Partial<Record<VenuePref, boolean>> | null }>(sql`
      select u.telegram_id as tg, s.role, s.branch_id, s.prefs from app.venue_staff s join app.users u on u.id = s.user_id
      where s.venue_id = ${venueId} and s.status = 'active'`);
    return list.filter((x) => roles.includes(x.role) && (!opt.branchId || !x.branch_id || x.branch_id === opt.branchId)
      && (!opt.pref || ({ ...venuePrefDefaults, ...(x.prefs ?? {}) })[opt.pref])).map((x) => Number(x.tg));
  };

  /** Басқару иесіне (иелеріне): баптау және тыныш уақыт (23:00–08:00, шұғылдан басқасы жіберілмейді — таңғы қорытындыға кіреді) */
  const toAdmins = async (kind: AdminPref, text: string, button?: { text: string; path: string }, now = new Date()) => {
    if (!adminTg.length) return;
    const list = await rows<{ tg: string; prefs: Partial<Record<AdminPref, boolean>> | null }>(sql`select u.telegram_id as tg, a.prefs from app.users u left join app.admins a on a.user_id = u.id where u.telegram_id::text in (${sql.join(adminTg.map((x) => sql`${x}`), sql`, `)})`);
    const h = hourAt(now);
    const to = list.filter((x) => { const p = { ...adminPrefDefaults, ...(x.prefs ?? {}) }; return p[kind] && (URGENT.includes(kind) || !p.quiet || (h >= 8 && h < 23)); }).map((x) => Number(x.tg));
    await sendAll(to, { text, ...(button ? { button: { text: button.text, url: adminUrl(button.path) } } : {}) });
  };
  const n = {
    /** 🛒 Жаңа тапсырыс / 🗓 Жаңа жазылу → филиал кассирлері, басқарушы, иесі */
    order: (orderId: string) => safe("order", async () => {
      const [o] = await rows<{ no: string; type: string; scheduled_at: Date | null; courier: boolean; title: string; kind: string; venue_id: string; branch_id: string; first_name: string; last_name: string | null }>(sql`
        select o.no, o.type, o.scheduled_at, o.courier, f.title, v.kind, v.id as venue_id, o.branch_id, u.first_name, u.last_name
        from app.orders o join app.packs p on p.id = o.pack_id join app.offers f on f.id = p.offer_id join app.venues v on v.id = f.venue_id join app.users u on u.id = o.user_id where o.id = ${orderId}`);
      if (!o) return;
      const to = await staff(o.venue_id, ["owner", "manager", "cashier"], { branchId: o.branch_id, pref: "newOrder" });
      const at = o.scheduled_at ? whenL(new Date(o.scheduled_at)) : { kk: "қазір (~15 мин)", ru: "сейчас (~15 мин)" };
      const who = short(o.first_name, o.last_name);
      const text = o.kind === "hair" && o.type === "plan"
        ? L(`🗓 Жаңа жазылу: ${head(o.title)}, ${at.kk} • ${who}`, `🗓 Новая запись: ${head(o.title)}, ${at.ru} • ${who}`)
        : L(`🛒 Жаңа тапсырыс № ${o.no}: ${head(o.title)} ×1, ${o.type === "plan" ? "алу " + at.kk : "қазір алады (~15 мин)"}${o.courier ? ", курьер" : ""} • ${who}`,
          `🛒 Новый заказ № ${o.no}: ${head(o.title)} ×1, ${o.type === "plan" ? "получение " + at.ru : "заберёт сейчас (~15 мин)"}${o.courier ? ", курьер" : ""} • ${who}`);
      await sendAll(to, { text, button: { text: L("Ашу", "Открыть"), start: `vo_${orderId}` } });
    }),

    /** Клиентке: тапсырыс дайын */
    orderReady: (orderId: string) => safe("orderReady", async () => {
      const [o] = await rows<{ tg: string; no: string; code: string; name: string; pack_id: string }>(sql`
        select u.telegram_id as tg, o.no, o.code, v.name, o.pack_id from app.orders o join app.users u on u.id = o.user_id join app.branches b on b.id = o.branch_id join app.venues v on v.id = b.venue_id where o.id = ${orderId}`);
      if (o) await send({ chatId: Number(o.tg), text: L(`🍽 Тапсырыс № ${o.no} дайын — ${o.name}. Кассаға кодыңызды айтыңыз: ${o.code}.`, `🍽 Заказ № ${o.no} готов — ${o.name}. Назовите на кассе код: ${o.code}.`), button: { text: L("Пакетті ашу", "Открыть пакет"), start: `pk_${o.pack_id}` } });
    }),

    /** Клиентке: ✅ Қолданылды (Figma клиент хабарламасы) */
    used: (redemptionId: string, receiptNo: string) => safe("used", async () => {
      const [x] = await rows<{ tg: string; name: string; units: number; left: number; unit_name: string }>(sql`
        select u.telegram_id as tg, v.name, r.units, p.units_left as left, f.unit_name from app.redemptions r join app.packs p on p.id = r.pack_id
        join app.offers f on f.id = p.offer_id join app.venues v on v.id = f.venue_id join app.users u on u.id = p.user_id where r.id = ${redemptionId}`);
      if (x) await send({ chatId: Number(x.tg), text: L(`✅ Қолданылды: ${x.name} · ${x.units} ${x.unit_name || "дана"}. Пакетте ${x.left} ${x.unit_name || "дана"} қалды. Чек ${receiptNo}.`,
        `✅ Использовано: ${x.name} · ${x.units} ед. В пакете осталось ${x.left} ед. Чек ${receiptNo}.`) });
    }),

    /** ⚠️ Жаңа шағым → иесі мен басқарушы (24 сағат ішінде жауап) */
    complaint: (id: string) => safe("complaint", async () => {
      const [x] = await rows<{ venue_id: string; reason: string | null; created_at: Date; used_at: Date | null }>(sql`
        select c.venue_id, c.reason, c.created_at, r.created_at as used_at from app.complaints c left join app.redemptions r on r.id = c.redemption_id where c.id = ${id}`);
      if (!x) return;
      const reason = x.reason === "refused" ? { kk: "мекеме қабылдамады", ru: "заведение не приняло" } : { kk: (x.reason ?? "шағым").toLowerCase(), ru: (x.reason ?? "жалоба").toLowerCase() };
      const used = x.used_at ? whenL(new Date(x.used_at)) : null;
      await sendAll(await staff(x.venue_id, ["owner", "manager"]), { text: L(`⚠️ Жаңа шағым: ${reason.kk}${used ? ` (${used.kk})` : ""}. 24 сағат ішінде жауап бер.`, `⚠️ Новая жалоба: ${reason.ru}${used ? ` (${used.ru})` : ""}. Ответьте в течение 24 часов.`), button: { text: L("Қарау", "Посмотреть"), start: `vc_${id}` } });
    }),

    /** Клиентке: шағымға жауап */
    complaintDone: (id: string, returned: number) => safe("complaintDone", async () => {
      const [x] = await rows<{ tg: string; status: string; reply: string | null; name: string; pack_id: string }>(sql`
        select u.telegram_id as tg, c.status, c.reply, v.name, c.pack_id from app.complaints c join app.users u on u.id = c.user_id join app.venues v on v.id = c.venue_id where c.id = ${id}`);
      if (!x) return;
      const text = x.status === "refunded"
        ? L(`✅ ${x.name} шағымыңызды қанағаттандырды: ${returned} дана пакетіңізге қайтарылды.${x.reply ? ` Жауабы: «${x.reply}»` : ""}`, `✅ ${x.name} удовлетворило вашу жалобу: ${returned} ед. возвращено в пакет.${x.reply ? ` Ответ: «${x.reply}»` : ""}`)
        : L(`💬 ${x.name} шағымыңызға жауап берді: «${x.reply ?? ""}». Келіспесеңіз — Medeo қолдауына жазыңыз.`, `💬 ${x.name} ответило на вашу жалобу: «${x.reply ?? ""}». Если не согласны — напишите в поддержку Medeo.`);
      await send({ chatId: Number(x.tg), text, button: { text: L("Пакетті ашу", "Открыть пакет"), start: `pk_${x.pack_id}` } });
    }),

    /** 👤 Жаңа қызметкер шақыру кодымен кірді → иесі растайды */
    staffRequest: (venueId: string, userId: string) => safe("staffRequest", async () => {
      const [u] = await rows<{ first_name: string; last_name: string | null }>(sql`select first_name, last_name from app.users where id = ${userId}`);
      if (u) await sendAll(await staff(venueId, ["owner"]), { text: L(`👤 ${short(u.first_name, u.last_name)} командаға қосылуды сұрайды. Растасаңыз, кассир режимі ашылады.`, `👤 ${short(u.first_name, u.last_name)} просит добавить его в команду. После подтверждения откроется режим кассира.`), button: { text: L("Қарау", "Посмотреть"), start: "v_team" } });
    }),
    /** Қызметкерге: иесі растады */
    staffApproved: (venueId: string, userId: string) => safe("staffApproved", async () => {
      const [x] = await rows<{ tg: string; name: string }>(sql`select u.telegram_id as tg, v.name from app.users u, app.venues v where u.id = ${userId} and v.id = ${venueId}`);
      if (x) await send({ chatId: Number(x.tg), text: L(`✅ Сізді «${x.name}» командасына қабылдады. Кассир режимі ашық.`, `✅ Вас приняли в команду «${x.name}». Режим кассира открыт.`), button: { text: L("Ашу", "Открыть"), start: "v_home" } });
    }),

    /** ⭐ Жаңа пікір → иесі мен басқарушы («Жаңа пікір» баптауы) */
    review: (venueId: string, stars: number, text: string | null) => safe("review", async () => {
      await sendAll(await staff(venueId, ["owner", "manager"], { pref: "newReview" }), { text: L(`⭐ Жаңа пікір: ${"★".repeat(stars)}${"☆".repeat(5 - stars)}${text ? ` — «${text.slice(0, 200)}»` : ""}`, `⭐ Новый отзыв: ${"★".repeat(stars)}${"☆".repeat(5 - stars)}${text ? ` — «${text.slice(0, 200)}»` : ""}`), button: { text: L("Жауап беру", "Ответить"), start: "v_reviews" } });
    }),

    /** Өтінім нәтижесі (мақұлданды / түзету керек / қабылданбады) — күй өзгерген соң бір рет */
    application: (appId: string) => safe("application", async () => {
      const [a] = await rows<{ status: string; note: string | null; tg: string; name: string | null }>(sql`
        select a.status, a.note, u.telegram_id as tg, coalesce(v.name, a.data->>'name') as name from app.venue_applications a join app.users u on u.id = a.user_id left join app.venues v on v.id = a.venue_id where a.id = ${appId}`);
      if (!a || !["approved", "need_info", "rejected"].includes(a.status) || !(await once(`app:${appId}:${a.status}`))) return;
      const nm = a.name ? `«${a.name}» ` : "";
      const m = a.status === "approved" ? { text: L(`🎉 Өтінім мақұлданды! ${nm}Medeo-ға қосылды. Енді бірінші ұсынысты жариялаңыз.`, `🎉 Заявка одобрена! ${nm}подключено к Medeo. Теперь опубликуйте первое предложение.`), button: { text: L("Мекемеге өту", "Перейти к заведению"), start: "v_home" } }
        : a.status === "need_info" ? { text: L(`✏️ Өтінімге түзету керек${a.note ? `: ${a.note}` : "."}`, `✏️ Заявку нужно исправить${a.note ? `: ${a.note}` : "."}`), button: { text: L("Түзету", "Исправить"), start: "v_apply" } }
        : { text: L(`Өтінім қабылданбады${a.note ? `: ${a.note}` : "."} Сұрағыңыз болса — қолдауға жазыңыз.`, `Заявка отклонена${a.note ? `: ${a.note}` : "."} Если есть вопросы — напишите в поддержку.`), button: { text: L("Толығырақ", "Подробнее"), start: "v_apply" } };
      await send({ chatId: Number(a.tg), ...m });
    }),

    /** Medeo Басқару «Хабарлама жазу»: мекеме иесіне (иелеріне) не нақты пайдаланушыға */
    /** Автожаңарту (Патша, 2026-11-18): жаңа пакет алынды не тоқтады (себебі) → клиентке */
    autoRenew: (userId: string, title: string, titleRu: string | null, r: { ok: true; amount: number; packId: string } | { ok: false; why: "card" | "price" | "unavailable" | "payment" | "limit" }) => safe("autoRenew", async () => {
      const [u] = await rows<{ tg: string }>(sql`select telegram_id as tg from app.users where id = ${userId}`);
      if (!u) return;
      const t = head(title), tr = titleRu ?? head(title);
      if (r.ok) { await send({ chatId: Number(u.tg), text: L(`🔁 «${t}» пакеті автоматты жаңарды: картаңыздан ${money(r.amount)} алынды. Қалған бірліктер жаңа пакетке көшті. Автожаңартуды пакет бетінде өшіруге болады.`, `🔁 Пакет «${tr}» продлён автоматически: с карты списано ${money(r.amount)}. Оставшиеся единицы перенесены в новый пакет. Автопродление можно отключить на странице пакета.`), button: { text: L("Пакетті ашу", "Открыть пакет"), start: `pk_${r.packId}` } }); return; }
      const why = { card: { kk: "сақталған карта өшірілген", ru: "сохранённая карта удалена" }, price: { kk: "мекеме бағаны көтерген", ru: "заведение повысило цену" }, unavailable: { kk: "ұсыныс қазір сатылмайды", ru: "предложение сейчас не продаётся" }, payment: { kk: "банк төлемді өткізбеді (растау не қаражат керек)", ru: "банк не провёл платёж (нужно подтверждение или средства)" },
        limit: { kk: "мекеменің осы айғы пакет лимиті таусылды (не бір адамға шекке жеттіңіз)", ru: "лимит пакетов заведения на этот месяц исчерпан (или достигнут лимит на человека)" } }[r.why];
      if (r.why === "limit") { await send({ chatId: Number(u.tg), text: L(`⏳ «${t}» пакетін бұл айда жаңарта алмадық: ${why.kk}. Ақша алынған жоқ. Автожаңарту өшпеді — келесі айдың 1-інде өзі қайта көреді.`,
        `⏳ Пакет «${tr}» не удалось продлить в этом месяце: ${why.ru}. Деньги не списаны. Автопродление не отключено — 1-го числа следующего месяца попробуем снова.`), button: { text: L("Пакеттерім", "Мои пакеты"), start: "p_packs" } }); return; }
      await send({ chatId: Number(u.tg), text: L(`⏸ «${t}» пакетінің автожаңартуы тоқтады: ${why.kk}. Ақша алынған жоқ. Қаласаңыз, пакетті қолмен қайта алыңыз.`, `⏸ Автопродление пакета «${tr}» остановлено: ${why.ru}. Деньги не списаны. При желании купите пакет заново вручную.`), button: { text: L("Қайта алу", "Купить снова"), start: "p_packs" } });
    }),
    /** Комиссия деңгейі өзгерді (рейтинг өсті не түсті) → иесіне (Патша, 2026-11-18) */
    feeTier: (venueId: string, pct: number, prev: number, rating: number) => safe("feeTier", async () => {
      const r = rating.toFixed(1);
      const text = pct < prev
        ? L(`🎉 Құттықтаймыз! Рейтингіңіз ${r} — Medeo комиссиясы ${prev}%-дан ${pct}%-ға түсті. Жаңа қолданулар осы комиссиямен есептеледі.`, `🎉 Поздравляем! Ваш рейтинг ${r} — комиссия Medeo снижена с ${prev}% до ${pct}%. Новые использования считаются по этой ставке.`)
        : L(`ℹ️ Рейтингіңіз ${r} — комиссия ${pct}%-ға оралды. Рейтинг қайта өссе, комиссия қайта азаяды.`, `ℹ️ Ваш рейтинг ${r} — комиссия вернулась к ${pct}%. Когда рейтинг снова вырастет, комиссия снова снизится.`);
      await sendAll(await staff(venueId, ["owner"]), { text, button: { text: L("Ашу", "Открыть"), start: "v_home" } });
    }),
    toVenue: async (venueId: string, text: string) => { const to = await staff(venueId, ["owner"]); await sendAll(to, { text: `✉️ Medeo: ${text}`, button: { text: L("Ашу", "Открыть"), start: "v_home" } }); return to.length; },
    toUser: async (userId: string, text: string, start?: string) => {
      const [u] = await rows<{ tg: string }>(sql`select telegram_id as tg from app.users where id = ${userId}`);
      if (u) await send({ chatId: Number(u.tg), text: `✉️ Medeo: ${text}`, ...(start ? { button: { text: L("Ашу", "Открыть"), start } } : {}) }).catch(() => null);
    },
    /** Мекемеге: ұсыныс тексерілді (жарияланды / түзету керек / тоқтатылды) */
    offerReviewed: (offerId: string, result: "approved" | "fix" | "stopped", note?: string) => safe("offerReviewed", async () => {
      const [o] = await rows<{ venue_id: string; title: string }>(sql`select venue_id, title from app.offers where id = ${offerId}`);
      if (!o) return;
      const t = head(o.title);
      const text = result === "approved" ? L(`✅ «${t}» ұсынысы тексеруден өтіп, жарияланды.`, `✅ Предложение «${t}» прошло проверку и опубликовано.`)
        : result === "fix" ? L(`✏️ «${t}» ұсынысына түзету керек: ${note ?? ""}`, `✏️ Предложение «${t}» нужно исправить: ${note ?? ""}`)
        : L(`⛔ «${t}» ұсынысын Medeo тоқтатты${note ? `: ${note}` : "."}`, `⛔ Medeo приостановил предложение «${t}»${note ? `: ${note}` : "."}`);
      await sendAll(await staff(o.venue_id, ["owner", "manager"]), { text, button: { text: L("Ашу", "Открыть"), start: "v_home" } });
    }),
    /** Мекемеге: Medeo тоқтатты / қайта қосты */
    venueStatus: (venueId: string, paused: boolean, note?: string) => safe("venueStatus", async () => {
      await sendAll(await staff(venueId, ["owner", "manager"]), { text: paused ? L(`⛔ Мекеме уақытша тоқтатылды${note ? `: ${note}` : "."} Сатылған пакеттерге қызмет көрсету жалғасады.`, `⛔ Заведение временно приостановлено${note ? `: ${note}` : "."} Обслуживание проданных пакетов продолжается.`)
        : L("✅ Мекеме қайта іске қосылды. Жаңа пакеттер сатылады.", "✅ Заведение снова работает. Новые пакеты продаются."), button: { text: L("Ашу", "Открыть"), start: "v_home" } });
    }),

    /** Басқаруға: жаңа мекеме өтінімі (Figma 18) */
    adminApplication: (appId: string) => safe("adminApplication", async () => {
      const [a] = await rows<{ name: string | null; kind: string | null; docs: number }>(sql`select a.data->>'name' as name, a.data->>'kind' as kind, (select count(distinct kind) from app.venue_docs d where d.application_id = a.id)::int as docs from app.venue_applications a where a.id = ${appId}`);
      if (!a) return;
      const kinds: Record<string, string> = { food: "Тағамдар", coffee: "Кофе", hair: "Шаштараз" };
      await toAdmins("application", `🏪 Жаңа мекеме өтінімі\n${a.name ?? "Атаусыз"} · ${kinds[a.kind ?? ""] ?? "—"}. Құжаттар: ${a.docs} / 4 жүктелген.`, { text: "Өтінімді ашу", path: `/apps/${appId}` });
    }),
    /** Басқаруға: сайттағы «Өтінім қалдырыңыз» формасы (мекеме иесі хабарласуды сұрады) */
    adminSiteLead: (l: { no: number; venue: string; kind: string; name: string; phone: string; pos: string | null; lang: string }) => safe("adminSiteLead", async () => {
      const kinds: Record<string, string> = { food: "Тағам", coffee: "Кофехана", hair: "Шаштараз" };
      await toAdmins("application", `🌐 Сайттан өтінім №${l.no}\n${l.venue} · ${kinds[l.kind] ?? l.kind}\n${l.name} · ${l.phone}${l.pos ? `\nКасса: ${l.pos}` : ""} · ${l.lang === "ru" ? "орысша" : "қазақша"}\nХабарласып, 15 минутта көрсетіңіз.`);
    }),
    /** Басқаруға: жаңа шағым (шұғыл) */
    adminComplaint: (id: string, hours: number) => safe("adminComplaint", async () => {
      const [x] = await rows<{ no: number; first_name: string; last_name: string | null; venue: string; reason: string | null; created_at: Date }>(sql`select (select count(*) from app.complaints c2 where c2.created_at <= c.created_at)::int as no, u.first_name, u.last_name, v.name as venue, c.reason, c.created_at
        from app.complaints c join app.users u on u.id = c.user_id join app.venues v on v.id = c.venue_id where c.id = ${id}`);
      if (!x) return;
      await toAdmins("complaint", `💬 Жаңа шағым №${x.no}\n${short(x.first_name, x.last_name)} · ${x.venue}${x.reason ? ` · ${x.reason.toLowerCase()}` : ""}. Шешім мерзімі: ${when(new Date(new Date(x.created_at).getTime() + hours * 3600_000))}.`, { text: "Шағымды ашу", path: `/complaints/${id}` });
    }),
    /** Басқаруға: ұсыныс модерацияға түсті */
    adminModeration: (offerId: string) => safe("adminModeration", async () => {
      const [o] = await rows<{ title: string; venue: string; price: number }>(sql`select o.title, v.name as venue, o.price from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${offerId}`);
      if (o) await toAdmins("moderation", `🏷 Модерацияға ұсыныс түсті\n${o.title} · ${o.venue} · ${money(o.price)}`, { text: "Тексеру", path: `/offers/${offerId}` });
    }),
    /** Басқаруға: мекеме «қабылдамады» шағымдарынан автоматты тоқтатылды (шұғыл) */
    adminAutoPause: (venueId: string, users: number) => safe("adminAutoPause", async () => {
      const [v] = await rows<{ name: string }>(sql`select name from app.venues where id = ${venueId}`);
      if (v) await toAdmins("complaint", `⛔ ${v.name} автоматты тоқтатылды: 30 күнде ${users} клиент «мекеме қабылдамады» деп шағымданды. Тексеріп, қайта қосыңыз не жабыңыз.`, { text: "Мекемені ашу", path: `/venues/${venueId}` });
    }),

    /** Басқаруға: бағаның күрт түсуі (30%-дан артық, шұғыл) */
    adminPriceDrop: (offerId: string, from: number, to: number) => safe("adminPriceDrop", async () => {
      const [o] = await rows<{ title: string; venue: string }>(sql`select o.title, v.name as venue from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${offerId}`);
      if (o) await toAdmins("priceDrop", `📉 Баға күрт түсті: ${head(o.title)} · ${o.venue}\n${money(from)} → ${money(to)} (−${Math.round((1 - to / from) * 100)}%)`, { text: "Ұсынысты ашу", path: `/offers/${offerId}` });
    }),

    /** Жоспарлы жұмыс (Cloud Scheduler, 15 минут сайын): өтінім нәтижелері, 22:00 күндік қорытынды, 10:00 мерзім ескертуі */
    tick: async (now = new Date()) => {
      const out = { applications: 0, daily: 0, expiry: 0, expiry5: 0, priorAsked: 0, bonus: 0, bonusSoon: 0, venueAsked: 0, soldOut: 0, restock: 0, lastUnit: 0, idle: 0, savings: 0, saleEnded: 0 };
      // 🎁 Күйген бірлік → клиентке Medeo бонусы (мекемеге үлес жоқ — Патша, 2026-11-17)
      for (const b of await creditBreakage(db, now).catch((e) => { console.error("creditBreakage", e); return []; })) {
        if (b.amount <= 0 || !(await once(`bonus:${b.packId}`))) continue;
        const [u] = await rows<{ tg: string }>(sql`select telegram_id as tg from app.users where id = ${b.userId}`);
        if (u) await send({ chatId: Number(u.tg), text: L(`🎁 «${head(b.title)}» пакетінің ${b.units} бірлігі пайдаланылмай қалды. Ақшаң күйген жоқ: ${money(b.amount)} Medeo бонусы болып қайтты. ${b.onlyAt ? `Бонус ${b.months} ай жарамды, «${b.onlyAt}» мекемесінде келесі сатып алуға жұмсалады.` : `Бонус ${b.months} ай жарамды, кез келген мекемеде келесі сатып алуға жұмсалады.`}`,
          `🎁 В пакете «${b.titleRu ?? head(b.title)}» осталось неиспользованных единиц: ${b.units}. Деньги не сгорели: ${money(b.amount)} вернулись бонусом Medeo. ${b.onlyAt ? `Бонус действует ${b.months} мес., его можно потратить на следующую покупку в «${b.onlyAt}».` : `Бонус действует ${b.months} мес., его можно потратить на следующую покупку в любом заведении.`}`), button: { text: L("Бонусты көру", "Посмотреть бонус"), start: "p_bonus" } }).catch(() => null);
        out.bonus++;
      }
      // ⌛ Сатылым соңы (мекеме қойған күн, Алматы бойынша сол күн қоса): өткен ұсыныс «аяқталды» болады — каталог, сатып алу, «Хабарла», автожаңарту өзі тоқтайды
      await safe("saleEnd", async () => {
        const ended = await rows(sql`update app.offers set status = 'ended' where status = 'active' and (rules->>'saleUntil') is not null
          and (rules->>'saleUntil')::date < (now() at time zone 'Asia/Almaty')::date returning id`);
        out.saleEnded += ended.length;
      });
      // 🔔 Сату лимиті: таусылса — мекемеге (айына бір рет); қайта ашылса (жаңа ай, лимит көбейді, ұсыныс қайта қосылды) — күткен клиенттерге
      await safe("limits", async () => {
        const lim = await rows<{ id: string; title: string; venue_id: string; rules: unknown }>(sql`select id, title, venue_id, rules from app.offers where status = 'active' and (rules->>'monthlyLimit') is not null`);
        const sold = await soldThisMonth(db, lim.map((o) => o.id));
        const ym = ymd(now).slice(0, 7);
        for (const o of lim) {
          const max = limitsOf(o.rules).monthlyLimit; if (!max || (sold.get(o.id) ?? 0) < max) continue;
          if (!(await once(`soldout:${o.id}:${ym}:${max}`))) continue;
          await sendAll(await staff(o.venue_id, ["owner", "manager"]), { text: L(`🔥 «${head(o.title)}» осы айдың лимиті (${max}) түгел сатылды. Келесі айдың 1-інде қайта ашылады. Қазір көбейтсеңіз — күтіп тұрған клиенттерге бірден хабар барады.`,
            `🔥 Лимит этого месяца по «${head(o.title)}» (${max}) распродан. Продажи откроются 1-го числа следующего месяца. Если увеличите лимит сейчас — ожидающим клиентам сразу придёт уведомление.`), button: { text: L("Лимитті өзгерту", "Изменить лимит"), start: "v_offers" } });
          out.soldOut++;
        }
        const waits = await rows<{ user_id: string; tg: string; offer_id: string; slug: string; title: string; title_ru: string | null; rules: unknown }>(sql`select w.user_id, u.telegram_id as tg, o.id as offer_id, o.slug, o.title, o.title_ru, o.rules
          from app.offer_waits w join app.users u on u.id = w.user_id join app.offers o on o.id = w.offer_id join app.venues v on v.id = o.venue_id
          where o.status = 'active' and v.status = 'active' limit 500`);
        const wSold = await soldThisMonth(db, [...new Set(waits.map((w) => w.offer_id))]);
        for (const w of waits) {
          const max = limitsOf(w.rules).monthlyLimit;
          if (max && (wSold.get(w.offer_id) ?? 0) >= max) continue; // әлі таусылған
          const del = await rows(sql`delete from app.offer_waits where user_id = ${w.user_id} and offer_id = ${w.offer_id} returning user_id`);
          if (!del.length) continue;
          await send({ chatId: Number(w.tg), text: L(`🔔 «${head(w.title)}» қайта сатылымда! Орын шектеулі — үлгеріп ал.`, `🔔 «${w.title_ru ?? head(w.title)}» снова в продаже! Мест немного — успейте.`),
            button: { text: L("Ашу", "Открыть"), start: `offer_${w.slug}` } }).catch(() => null);
          out.restock++;
        }
      });
      // Өтінім күйі қолмен (дерекқорда) өзгерсе де хабар кетеді
      for (const a of await rows<{ id: string }>(sql`select a.id from app.venue_applications a where a.status in ('approved','need_info','rejected')
          and coalesce(a.decided_at, a.submitted_at, a.created_at) > now() - interval '14 days'
          and not exists (select 1 from app.notify_log l where l.key = 'app:' || a.id || ':' || a.status)`)) { await n.application(a.id); out.applications++; }

      const h = hourAt(now); const day = ymd(now);
      if (h >= 22) {
        // 📊 Бүгінгі қорытынды → иесі («Күндік қорытынды» баптауы); бүгін қолдану не тапсырыс болған мекемелерге ғана
        const from = new Date(`${day}T00:00:00+05:00`);
        const stats = await rows<{ venue_id: string; uses: number; orders: number; amount: number }>(sql`
          with u as (select b.venue_id, sum(r.units)::int as uses, sum(r.amount)::int as amount from app.redemptions r
              join app.branches b on b.id = r.branch_id join app.packs p on p.id = r.pack_id where r.created_at >= ${from} and r.cancelled_at is null group by b.venue_id),
            o as (select b.venue_id, count(*)::int as orders, sum(o.amount)::int as amount from app.orders o join app.branches b on b.id = o.branch_id
              join app.packs p on p.id = o.pack_id where o.created_at >= ${from} and o.status in ('done','missed') group by b.venue_id)
          select coalesce(u.venue_id, o.venue_id) as venue_id, coalesce(u.uses, 0) as uses, coalesce(o.orders, 0) as orders, coalesce(u.amount, 0) + coalesce(o.amount, 0) as amount
          from u full join o on o.venue_id = u.venue_id`);
        for (const s of stats) {
          if (!(await once(`daily:${s.venue_id}:${day}`))) continue;
          await sendAll(await staff(s.venue_id, ["owner"], { pref: "daily" }), { text: L(`📊 Бүгінгі қорытынды: ${s.uses} қолдану • ${s.orders} тапсырыс • ${money(s.amount)}.`, `📊 Итоги дня: использований ${s.uses} • заказов ${s.orders} • ${money(s.amount)}.`), button: { text: L("Есеп", "Отчёт"), start: "v_report" } });
          out.daily++;
        }
      }
      if (h >= 9 && adminTg.length && (await once(`adm-daily:${day}`))) {
        // 📊 Басқаруға кешегі қорытынды (Figma 18 «Күндік қорытынды · 13 қараша»), дүйсенбіде — апталық есеп
        const y = new Date(new Date(`${day}T00:00:00+05:00`).getTime() - 86400_000); const t = new Date(`${day}T00:00:00+05:00`);
        const sum = async (from: Date) => (await rows<{ sales: number; fee: number; packs: number; uses: number; complaints: number }>(sql`select
          coalesce((select sum(p.price_paid) from app.packs p where p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at >= ${from} and p.created_at < ${t}), 0)::int as sales,
          coalesce((select sum(round(p.price_paid * coalesce(v.fee_pct, v.auto_fee_pct, ${sql.raw(String(Number(opts.feePct ?? 10)))}) / 100.0)) from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at >= ${from} and p.created_at < ${t}), 0)::int as fee,
          (select count(*) from app.packs where status <> 'pending_payment' and source <> 'carry' and created_at >= ${from} and created_at < ${t})::int as packs,
          coalesce((select sum(units) from app.redemptions where cancelled_at is null and created_at >= ${from} and created_at < ${t}), 0)::int as uses,
          (select count(*) from app.complaints where created_at >= ${from} and created_at < ${t})::int as complaints`))[0];
        const d = await sum(y);
        const label = `${Number(ymd(y).slice(8, 10))} ${MON[Number(ymd(y).slice(5, 7)) - 1]}`;
        await toAdmins("daily", `📊 Күндік қорытынды · ${label}\nСатылым ${money(d.sales)} · комиссия ${money(d.fee)} · ${d.packs} пакет · ${d.uses} қолдану · ${d.complaints} шағым.`, { text: "Пульсті ашу", path: "/pulse" }, now);
        if (new Date(`${day}T12:00:00+05:00`).getUTCDay() === 1) {
          const w = await sum(new Date(t.getTime() - 7 * 86400_000));
          await toAdmins("weekly", `🗓 Апталық есеп\nСатылым ${money(w.sales)} · комиссия ${money(w.fee)} · ${w.packs} пакет · ${w.uses} қолдану · ${w.complaints} шағым.`, { text: "Пульсті ашу", path: "/pulse" }, now);
        }
      }
      if (h >= 10 && h < 21) {
        // ⏰ Пакет мерзімі 3 күннен кейін бітеді → клиент («Мерзім ескертулері» баптауы)
        const soon = await rows<{ id: string; tg: string; title: string; title_ru: string | null; left: number; unit_name: string; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
          select p.id, u.telegram_id as tg, f.title, f.title_ru, p.units_left as left, f.unit_name, u.notify from app.packs p join app.offers f on f.id = p.offer_id join app.users u on u.id = p.user_id
          where p.status = 'active' and p.units_left > 0 and p.valid_until between now() + interval '2 days' and now() + interval '3 days'
            and not exists (select 1 from app.notify_log l where l.key = 'exp:' || p.id) limit 500`);
        for (const p of soon) {
          if (!({ ...clientPrefDefaults, ...(p.notify ?? {}) }).expiry || !(await once(`exp:${p.id}`))) continue;
          await send({ chatId: Number(p.tg), text: L(`⏰ «${head(p.title)}» пакетінің мерзімі 3 күннен кейін бітеді. ${p.left} ${p.unit_name || "дана"} қалды. Қайта алсаң, қалған бірліктер жаңа пакетке көшеді — ештеңе жоғалмайды.`, `⏰ Срок пакета «${p.title_ru ?? head(p.title)}» истекает через 3 дня. Осталось ${p.left} ед. Если купите пакет снова, оставшиеся единицы перейдут в новый — ничего не пропадёт.`), button: { text: L("Пакеттерім", "Мои пакеты"), start: `pk_${p.id}` } }).catch(() => null);
          out.expiry++;
        }
        const pref = (x: Partial<typeof clientPrefDefaults> | null, k: keyof typeof clientPrefDefaults) => ({ ...clientPrefDefaults, ...(x ?? {}) })[k];
        // ⏳ Мерзімге 5 күн қалды (Патша, 2026-11-27: «бір рет тегін 7 күн ұзарту» ережесі): тегін ұзарту әлі қолданылмаса — соны ұсынамыз.
        // Ұсыныс ұзартуға рұқсат бермесе (rules.extend = false) не тегін ұзарту қолданылған болса — бұл ескерту жіберілмейді (3 күндік ескерту бәрібір келеді)
        const soon5 = await rows<{ id: string; tg: string; title: string; title_ru: string | null; left: number; unit_name: string; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
          select p.id, u.telegram_id as tg, f.title, f.title_ru, p.units_left as left, f.unit_name, u.notify from app.packs p join app.offers f on f.id = p.offer_id join app.users u on u.id = p.user_id
          where p.status = 'active' and p.units_left > 0 and not p.free_extend_used and coalesce((f.rules->>'extend')::boolean, true)
            and p.valid_until between now() + interval '4 days' and now() + interval '5 days'
            and not exists (select 1 from app.notify_log l where l.key = 'exp5:' || p.id) limit 500`);
        for (const p of soon5) {
          if (!pref(p.notify, "expiry") || !(await once(`exp5:${p.id}`))) continue;
          await send({ chatId: Number(p.tg), text: L(`⏳ «${head(p.title)}» пакетінің мерзіміне 5 күн қалды, ${p.left} ${p.unit_name || "дана"} әлі бар. Үлгермесең — бір рет тегін 7 күнге ұзартуға болады.`,
            `⏳ До конца срока пакета «${p.title_ru ?? head(p.title)}» 5 дней, осталось ${p.left} ед. Не успеваете — один раз можно бесплатно продлить на 7 дней.`), button: { text: L("Тегін ұзарту", "Продлить бесплатно"), start: `pk_${p.id}` } }).catch(() => null);
          out.expiry5++;
        }
        // 💰 Бонус мерзіміне 7 күн қалды (Патша, 2026-11-28: жаңа бонус 3 ай, тек сол мекемеде — inKind-тің «кенет күйген» қатесін қайталамау үшін бір рет ескертеміз)
        const bsoon = await rows<{ id: string; tg: string; left: number; venue: string | null; notify: Record<string, boolean> | null }>(sql`
          select b.id, u.telegram_id as tg, b."left", v.name as venue, u.notify from app.bonuses b join app.users u on u.id = b.user_id left join app.venues v on v.id = b.venue_id
          where b."left" > 0 and b.expires_at between now() and now() + interval '7 days'
            and not exists (select 1 from app.notify_log l where l.key = 'bexp:' || b.id) limit 500`);
        for (const b of bsoon) {
          if (!pref(b.notify, "expiry") || !(await once(`bexp:${b.id}`))) continue;
          await send({ chatId: Number(b.tg), text: L(`💰 ${money(b.left)} Medeo бонусыңның мерзіміне 7 күн қалды.${b.venue ? ` Оны «${b.venue}» мекемесінде келесі пакетке жұмсай аласың.` : " Оны кез келген мекемеде келесі пакетке жұмсай аласың."}`,
            `💰 До конца срока бонуса Medeo ${money(b.left)} осталось 7 дней.${b.venue ? ` Его можно потратить на следующий пакет в «${b.venue}».` : " Его можно потратить на следующий пакет в любом заведении."}`), button: { text: L("Бонусты көру", "Посмотреть бонус"), start: "p_bonus" } }).catch(() => null);
          out.bonusSoon++;
        }
        // 📋 Пилот өлшеуі (0041): бір мекемедегі бірінші пакеттен кейін бір сұрақ — Medeo-ға дейін осы мекемеге барды ма (жаңа клиент пе, тұрақты ма)
        const fresh = await rows<{ id: string; tg: string; venue: string }>(sql`
          update app.packs p set prior_asked_at = now() from app.offers f, app.venues v, app.users u
          where f.id = p.offer_id and v.id = f.venue_id and u.id = p.user_id and p.prior_asked_at is null and p.prior_visit is null
            and p.status in ('active', 'used') and p.source = 'purchase' and p.price_paid > 0
            and p.created_at between now() - interval '6 hours' and now() - interval '10 minutes'
            and coalesce((u.notify->>'offers')::boolean, true)
            and not exists (select 1 from app.packs q join app.offers g on g.id = q.offer_id where q.user_id = p.user_id and g.venue_id = f.venue_id
              and q.id <> p.id and q.status <> 'pending_payment' and q.created_at < p.created_at)
          returning p.id, u.telegram_id as tg, v.name as venue`);
        for (const p of fresh) {
          await send({ chatId: Number(p.tg), text: L(`📋 Бір қысқа сұрақ (Medeo-ны жақсартуға көмектеседі): «${p.venue}» мекемесіне Medeo-ға дейін барып па едің?`,
            `📋 Один короткий вопрос (поможет улучшить Medeo): вы бывали в «${p.venue}» до Medeo?`),
            choices: [{ text: L("Жоқ, алғаш рет", "Нет, впервые"), data: `pv:${p.id}:n` }, { text: L("Кейде", "Иногда"), data: `pv:${p.id}:s` }, { text: L("Иә, жиі", "Да, часто"), data: `pv:${p.id}:r` }] }).catch(() => null);
          out.priorAsked++;
        }
        // 🏪 Мекемеге ай сайынғы сұрақ (Патша, 2026-11-28; inKind Toca Madera дәлелі — 32-құжат): Medeo арқылы келген жаңа клиенттер кейін пакетсіз де қайта келе ме.
        // Тек Medeo-дан «алғаш келген» клиенті болған мекемеге (14–60 күн бұрын), айына бір рет, бір иесіне. Жауап — бот батырмасымен (vf:<id>:n|s|r|u)
        const month = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }).slice(0, 7);
        const ask = await rows<{ id: string; tg: string; venue: string }>(sql`
          with cand as (
            select distinct on (v.id) v.id as venue_id, v.name, st.user_id, u.telegram_id as tg from app.venues v
            join app.venue_staff st on st.venue_id = v.id and st.role = 'owner' and st.status = 'active' join app.users u on u.id = st.user_id
            where v.status = 'active' and exists (select 1 from app.packs p join app.offers o on o.id = p.offer_id where o.venue_id = v.id and p.prior_visit = 'n'
              and p.created_at between now() - interval '60 days' and now() - interval '14 days')
            order by v.id, st.created_at),
          ins as (insert into app.venue_feedback (venue_id, user_id, month) select venue_id, user_id, ${month} from cand on conflict (venue_id, month) do nothing returning id, venue_id)
          select ins.id, cand.tg, cand.name as venue from ins join cand on cand.venue_id = ins.venue_id`);
        for (const f of ask) {
          await send({ chatId: Number(f.tg), text: L(`🏪 «${f.venue}» үшін бір сұрақ (айына бір рет): Medeo арқылы алғаш келген клиенттер кейін пакетсіз де, өз ақшасымен қайта келе ме?`,
            `🏪 Один вопрос для «${f.venue}» (раз в месяц): гости, впервые пришедшие через Medeo, потом возвращаются и без пакета, за свои деньги?`),
            choices: [{ text: L("Жоқ", "Нет"), data: `vf:${f.id}:n` }, { text: L("Кейде", "Иногда"), data: `vf:${f.id}:s` }, { text: L("Иә, жиі", "Да, часто"), data: `vf:${f.id}:r` }, { text: L("Білмеймін", "Не знаю"), data: `vf:${f.id}:u` }] }).catch(() => null);
          out.venueAsked++;
        }
        // 🍽 Соңғы бірлік қолданылды (Хормози: ең жақсы сату сәті — пайданы жаңа көрген сәт) → сол бағамен қайта алу ұсынысы.
        // Автожаңарту қосулы, жаңасы алынған не ұсыныс сатылмайтын болса — жібермейміз
        const done = await rows<{ id: string; tg: string; slug: string; title: string; title_ru: string | null; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
          select p.id, u.telegram_id as tg, f.slug, f.title, f.title_ru, u.notify from app.packs p join app.offers f on f.id = p.offer_id join app.users u on u.id = p.user_id
          where p.units_left = 0 and p.status in ('active','used') and not p.auto_renew and p.renewed_to is null and f.status = 'active'
            and exists (select 1 from app.pack_events e where e.pack_id = p.id and e.units_delta < 0 and e.created_at > now() - interval '2 days')
            and not exists (select 1 from app.packs q where q.user_id = p.user_id and q.offer_id = p.offer_id and q.created_at > p.created_at and q.status <> 'pending_payment')
            and not exists (select 1 from app.notify_log l where l.key = 'last:' || p.id) limit 300`);
        for (const p of done) {
          if (!pref(p.notify, "offers") || !(await once(`last:${p.id}`))) continue;
          await send({ chatId: Number(p.tg), text: L(`🍽 «${head(p.title)}» пакетіңнің соңғы бірлігі қолданылды. Ұнаса — сол жеңілдікпен қайта ал, бір басу жеткілікті.`, `🍽 Последняя единица пакета «${p.title_ru ?? head(p.title)}» использована. Понравилось — купите снова с той же скидкой, в одно касание.`),
            button: { text: L("Қайта алу", "Купить снова"), start: `offer_${p.slug}` } }).catch(() => null);
          out.lastUnit++;
        }
        // 🎟 Сатып алғанына 2 күн өтті, бірде-бір бірлік қолданылмады → жұмсақ еске салу (алғашқы қолдану — клиентті ұстаудың ең үлкен рычагы)
        const idle = await rows<{ id: string; tg: string; title: string; title_ru: string | null; venue: string; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
          select p.id, u.telegram_id as tg, f.title, f.title_ru, v.name as venue, u.notify from app.packs p join app.offers f on f.id = p.offer_id join app.venues v on v.id = f.venue_id join app.users u on u.id = p.user_id
          where p.status = 'active' and p.units_left = p.units_total and p.source <> 'carry' and p.created_at between now() - interval '72 hours' and now() - interval '48 hours'
            and not exists (select 1 from app.orders o where o.pack_id = p.id)
            and not exists (select 1 from app.notify_log l where l.key = 'idle:' || p.id) limit 300`);
        for (const p of idle) {
          if (!pref(p.notify, "expiry") || !(await once(`idle:${p.id}`))) continue;
          await send({ chatId: Number(p.tg), text: L(`🎟 «${head(p.title)}» пакетің сені күтіп тұр. Алғашқысын бүгін ал — ${p.venue}, кассада «Medeo» деп айтсаң болды.`, `🎟 Пакет «${p.title_ru ?? head(p.title)}» ждёт вас. Заберите первую единицу сегодня — ${p.venue}, просто скажите на кассе «Medeo».`),
            button: { text: L("Пакетті ашу", "Открыть пакет"), start: `pk_${p.id}` } }).catch(() => null);
          out.idle++;
        }
        // 📊 Айдың 1-інде: өткен айдағы жеке үнем (Хормози: ең күшті дәлел — адамның өз нәтижесі)
        if (day.slice(8, 10) === "01") {
          const to = new Date(`${day}T00:00:00+05:00`);
          const prev = new Date(to.getTime() - 86400_000); const from = new Date(`${ymd(prev).slice(0, 7)}-01T00:00:00+05:00`);
          const sav = await rows<{ tg: string; user_id: string; saved: number; uses: number; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
            with x as (
              select p.user_id, r.units::int as units, greatest(0, r.units * f.regular_unit_price - coalesce(r.amount, round(coalesce(p.value_total, p.price_paid)::numeric * r.units / p.units_total)::int)) as saved
                from app.redemptions r join app.packs p on p.id = r.pack_id join app.offers f on f.id = p.offer_id where r.cancelled_at is null and r.created_at >= ${from} and r.created_at < ${to}
              union all
              select p.user_id, 1, greatest(0, f.regular_unit_price - coalesce(o.amount, round(coalesce(p.value_total, p.price_paid)::numeric / p.units_total)::int))
                from app.orders o join app.packs p on p.id = o.pack_id join app.offers f on f.id = p.offer_id where o.status = 'done' and o.created_at >= ${from} and o.created_at < ${to})
            select u.telegram_id as tg, x.user_id, sum(x.saved)::int as saved, sum(x.units)::int as uses, u.notify from x join app.users u on u.id = x.user_id group by x.user_id, u.telegram_id, u.notify having sum(x.saved) > 0 limit 2000`);
          const mon = MON[Number(ymd(prev).slice(5, 7)) - 1];
          for (const u of sav) {
            if (!pref(u.notify, "expiry") || !(await once(`sav:${u.user_id}:${ymd(prev).slice(0, 7)}`))) continue;
            await send({ chatId: Number(u.tg), text: L(`📊 ${cap(mon)} айында Medeo-мен ${money(u.saved)} үнемдедің — ${u.uses} рет қолдандың. Жарайсың!`, `📊 В прошлом месяце вы сэкономили с Medeo ${money(u.saved)} — использований: ${u.uses}. Отлично!`),
              button: { text: L("Үнемді көру", "Моя экономия"), start: "p_savings" } }).catch(() => null);
            out.savings++;
          }
        }
      }
      return out;
    },
  };
  return n;
}
