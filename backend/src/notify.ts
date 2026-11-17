// Бот хабарламалары (Figma «16 · Бот хабарламалары (мекеме)» 14045:11127 және «Бот хабарламалары (клиент)» 14044:12950).
// Хабар мини апп ашылатын боттан (@Mmedeo_bot: MINIAPP_BOT_TOKEN, жоқ болса BOT_TOKEN) жіберіледі. Батырма — t.me/<бот>?startapp=<кілт>:
// Telegram мини аппты бірден тиісті бетте ашады (main.tsx start_param).
// Хабар жіберілмесе (бот бұғатталған, желі) — тек журналға жазылады: негізгі әрекет (тапсырыс, шағым) ешқашан құламайды.
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";

export interface Msg { chatId: number; text: string; button?: { text: string; start?: string; url?: string } }
export type Sender = (m: Msg) => Promise<void>;

/** Telegram Bot API арқылы жіберу. Токен журналға ешқашан жазылмайды. */
export function telegramSender(cfg: Config): Sender {
  const token = cfg.MINIAPP_BOT_TOKEN || cfg.BOT_TOKEN;
  return async (m) => {
    const body = {
      chat_id: m.chatId, text: m.text, link_preview_options: { is_disabled: true },
      ...(m.button ? { reply_markup: { inline_keyboard: [[{ text: m.button.text, url: m.button.url ?? `https://t.me/${cfg.MINIAPP_BOT_USERNAME}?startapp=${m.button.start}` }]] } } : {}),
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
/** «бүгін 14:30», «ертең 14:00», «21 қараша 10:00» */
export function when(d: Date, now = new Date()) {
  const day = ymd(d); const t = hm(d);
  if (day === ymd(now)) return `бүгін ${t}`;
  if (day === ymd(new Date(now.getTime() + 86400_000))) return `ертең ${t}`;
  return `${Number(day.slice(8, 10))} ${MON[Number(day.slice(5, 7)) - 1]} ${t}`;
}
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

export function makeNotifier(db: Db, send: Sender, opts: { adminIds?: string; adminUrl?: string; feePct?: number } = {}) {
  const adminTg = (opts.adminIds ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const adminUrl = (path: string) => `${(opts.adminUrl ?? "").replace(/\/$/, "")}/#/a${path}`;
  const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
  const safe = async (what: string, f: () => Promise<void>) => { try { await f(); } catch (e) { console.warn(`notify ${what}: ${(e as Error).message}`); } };
  /** Кілт бойынша бір рет: журналда бар болса — false */
  const once = async (key: string) => (await rows(sql`insert into app.notify_log (key) values (${key}) on conflict do nothing returning key`)).length > 0;
  const sendAll = async (ids: number[], m: Omit<Msg, "chatId">) => { await Promise.all([...new Set(ids)].map((chatId) => send({ chatId, ...m }).catch((e) => console.warn(`notify send: ${(e as Error).message}`)))); };

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
      const at = o.scheduled_at ? when(new Date(o.scheduled_at)) : "қазір (~15 мин)";
      const text = o.kind === "hair" && o.type === "plan"
        ? `🗓 Жаңа жазылу: ${head(o.title)}, ${at} • ${short(o.first_name, o.last_name)}`
        : `🛒 Жаңа тапсырыс № ${o.no}: ${head(o.title)} ×1, ${o.type === "plan" ? "алу " + at : "қазір алады (~15 мин)"}${o.courier ? ", курьер" : ""} • ${short(o.first_name, o.last_name)}`;
      await sendAll(to, { text, button: { text: "Ашу", start: `vo_${orderId}` } });
    }),

    /** Клиентке: тапсырыс дайын */
    orderReady: (orderId: string) => safe("orderReady", async () => {
      const [o] = await rows<{ tg: string; no: string; code: string; name: string; pack_id: string }>(sql`
        select u.telegram_id as tg, o.no, o.code, v.name, o.pack_id from app.orders o join app.users u on u.id = o.user_id join app.branches b on b.id = o.branch_id join app.venues v on v.id = b.venue_id where o.id = ${orderId}`);
      if (o) await send({ chatId: Number(o.tg), text: `🍽 Тапсырыс № ${o.no} дайын — ${o.name}. Кассаға кодыңызды айтыңыз: ${o.code}.`, button: { text: "Пакетті ашу", start: `pk_${o.pack_id}` } });
    }),

    /** Клиентке: ✅ Қолданылды (Figma клиент хабарламасы) */
    used: (redemptionId: string, receiptNo: string) => safe("used", async () => {
      const [x] = await rows<{ tg: string; name: string; units: number; left: number; unit_name: string }>(sql`
        select u.telegram_id as tg, v.name, r.units, p.units_left as left, f.unit_name from app.redemptions r join app.packs p on p.id = r.pack_id
        join app.offers f on f.id = p.offer_id join app.venues v on v.id = f.venue_id join app.users u on u.id = p.user_id where r.id = ${redemptionId}`);
      if (x) await send({ chatId: Number(x.tg), text: `✅ Қолданылды: ${x.name} · ${x.units} ${x.unit_name || "дана"}. Пакетте ${x.left} ${x.unit_name || "дана"} қалды. Чек ${receiptNo}.` });
    }),

    /** ⚠️ Жаңа шағым → иесі мен басқарушы (24 сағат ішінде жауап) */
    complaint: (id: string) => safe("complaint", async () => {
      const [x] = await rows<{ venue_id: string; reason: string | null; created_at: Date; used_at: Date | null }>(sql`
        select c.venue_id, c.reason, c.created_at, r.created_at as used_at from app.complaints c left join app.redemptions r on r.id = c.redemption_id where c.id = ${id}`);
      if (!x) return;
      const reason = (x.reason ?? "шағым").toLowerCase();
      await sendAll(await staff(x.venue_id, ["owner", "manager"]), { text: `⚠️ Жаңа шағым: ${reason}${x.used_at ? ` (${when(new Date(x.used_at))})` : ""}. 24 сағат ішінде жауап бер.`, button: { text: "Қарау", start: `vc_${id}` } });
    }),

    /** Клиентке: шағымға жауап */
    complaintDone: (id: string, returned: number) => safe("complaintDone", async () => {
      const [x] = await rows<{ tg: string; status: string; reply: string | null; name: string; pack_id: string }>(sql`
        select u.telegram_id as tg, c.status, c.reply, v.name, c.pack_id from app.complaints c join app.users u on u.id = c.user_id join app.venues v on v.id = c.venue_id where c.id = ${id}`);
      if (!x) return;
      const text = x.status === "refunded"
        ? `✅ ${x.name} шағымыңызды қанағаттандырды: ${returned} дана пакетіңізге қайтарылды.${x.reply ? ` Жауабы: «${x.reply}»` : ""}`
        : `💬 ${x.name} шағымыңызға жауап берді: «${x.reply ?? ""}». Келіспесеңіз — Medeo қолдауына жазыңыз.`;
      await send({ chatId: Number(x.tg), text, button: { text: "Пакетті ашу", start: `pk_${x.pack_id}` } });
    }),

    /** 👤 Жаңа қызметкер шақыру кодымен кірді → иесі растайды */
    staffRequest: (venueId: string, userId: string) => safe("staffRequest", async () => {
      const [u] = await rows<{ first_name: string; last_name: string | null }>(sql`select first_name, last_name from app.users where id = ${userId}`);
      if (u) await sendAll(await staff(venueId, ["owner"]), { text: `👤 ${short(u.first_name, u.last_name)} командаға қосылуды сұрайды. Растасаңыз, кассир режимі ашылады.`, button: { text: "Қарау", start: "v_team" } });
    }),
    /** Қызметкерге: иесі растады */
    staffApproved: (venueId: string, userId: string) => safe("staffApproved", async () => {
      const [x] = await rows<{ tg: string; name: string }>(sql`select u.telegram_id as tg, v.name from app.users u, app.venues v where u.id = ${userId} and v.id = ${venueId}`);
      if (x) await send({ chatId: Number(x.tg), text: `✅ Сізді «${x.name}» командасына қабылдады. Кассир режимі ашық.`, button: { text: "Ашу", start: "v_home" } });
    }),

    /** ⭐ Жаңа пікір → иесі мен басқарушы («Жаңа пікір» баптауы) */
    review: (venueId: string, stars: number, text: string | null) => safe("review", async () => {
      await sendAll(await staff(venueId, ["owner", "manager"], { pref: "newReview" }), { text: `⭐ Жаңа пікір: ${"★".repeat(stars)}${"☆".repeat(5 - stars)}${text ? ` — «${text.slice(0, 200)}»` : ""}`, button: { text: "Жауап беру", start: "v_reviews" } });
    }),

    /** Өтінім нәтижесі (мақұлданды / түзету керек / қабылданбады) — күй өзгерген соң бір рет */
    application: (appId: string) => safe("application", async () => {
      const [a] = await rows<{ status: string; note: string | null; tg: string; name: string | null }>(sql`
        select a.status, a.note, u.telegram_id as tg, coalesce(v.name, a.data->>'name') as name from app.venue_applications a join app.users u on u.id = a.user_id left join app.venues v on v.id = a.venue_id where a.id = ${appId}`);
      if (!a || !["approved", "need_info", "rejected"].includes(a.status) || !(await once(`app:${appId}:${a.status}`))) return;
      const nm = a.name ? `«${a.name}» ` : "";
      const m = a.status === "approved" ? { text: `🎉 Өтінім мақұлданды! ${nm}Medeo-ға қосылды. Енді бірінші ұсынысты жариялаңыз.`, button: { text: "Мекемеге өту", start: "v_home" } }
        : a.status === "need_info" ? { text: `✏️ Өтінімге түзету керек${a.note ? `: ${a.note}` : "."}`, button: { text: "Түзету", start: "v_apply" } }
        : { text: `Өтінім қабылданбады${a.note ? `: ${a.note}` : "."} Сұрағыңыз болса — қолдауға жазыңыз.`, button: { text: "Толығырақ", start: "v_apply" } };
      await send({ chatId: Number(a.tg), ...m });
    }),

    /** Medeo Басқару «Хабарлама жазу»: мекеме иесіне (иелеріне) не нақты пайдаланушыға */
    toVenue: async (venueId: string, text: string) => { const to = await staff(venueId, ["owner"]); await sendAll(to, { text: `✉️ Medeo: ${text}`, button: { text: "Ашу", start: "v_home" } }); return to.length; },
    toUser: async (userId: string, text: string, start?: string) => {
      const [u] = await rows<{ tg: string }>(sql`select telegram_id as tg from app.users where id = ${userId}`);
      if (u) await send({ chatId: Number(u.tg), text: `✉️ Medeo: ${text}`, ...(start ? { button: { text: "Ашу", start } } : {}) }).catch(() => null);
    },
    /** Мекемеге: ұсыныс тексерілді (жарияланды / түзету керек / тоқтатылды) */
    offerReviewed: (offerId: string, result: "approved" | "fix" | "stopped", note?: string) => safe("offerReviewed", async () => {
      const [o] = await rows<{ venue_id: string; title: string }>(sql`select venue_id, title from app.offers where id = ${offerId}`);
      if (!o) return;
      const t = head(o.title);
      const text = result === "approved" ? `✅ «${t}» ұсынысы тексеруден өтіп, жарияланды.` : result === "fix" ? `✏️ «${t}» ұсынысына түзету керек: ${note ?? ""}` : `⛔ «${t}» ұсынысын Medeo тоқтатты${note ? `: ${note}` : "."}`;
      await sendAll(await staff(o.venue_id, ["owner", "manager"]), { text, button: { text: "Ашу", start: "v_home" } });
    }),
    /** Мекемеге: Medeo тоқтатты / қайта қосты */
    venueStatus: (venueId: string, paused: boolean, note?: string) => safe("venueStatus", async () => {
      await sendAll(await staff(venueId, ["owner", "manager"]), { text: paused ? `⛔ Мекеме уақытша тоқтатылды${note ? `: ${note}` : "."} Сатылған пакеттерге қызмет көрсету жалғасады.` : "✅ Мекеме қайта іске қосылды. Жаңа пакеттер сатылады.", button: { text: "Ашу", start: "v_home" } });
    }),

    /** Басқаруға: жаңа мекеме өтінімі (Figma 18) */
    adminApplication: (appId: string) => safe("adminApplication", async () => {
      const [a] = await rows<{ name: string | null; kind: string | null; docs: number }>(sql`select a.data->>'name' as name, a.data->>'kind' as kind, (select count(distinct kind) from app.venue_docs d where d.application_id = a.id)::int as docs from app.venue_applications a where a.id = ${appId}`);
      if (!a) return;
      const kinds: Record<string, string> = { food: "Тағамдар", coffee: "Кофе", hair: "Шаштараз" };
      await toAdmins("application", `🏪 Жаңа мекеме өтінімі\n${a.name ?? "Атаусыз"} · ${kinds[a.kind ?? ""] ?? "—"} · Қарағанды. Құжаттар: ${a.docs} / 4 жүктелген.`, { text: "Өтінімді ашу", path: `/apps/${appId}` });
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
    /** Басқаруға: бағаның күрт түсуі (30%-дан артық, шұғыл) */
    adminPriceDrop: (offerId: string, from: number, to: number) => safe("adminPriceDrop", async () => {
      const [o] = await rows<{ title: string; venue: string }>(sql`select o.title, v.name as venue from app.offers o join app.venues v on v.id = o.venue_id where o.id = ${offerId}`);
      if (o) await toAdmins("priceDrop", `📉 Баға күрт түсті: ${head(o.title)} · ${o.venue}\n${money(from)} → ${money(to)} (−${Math.round((1 - to / from) * 100)}%)`, { text: "Ұсынысты ашу", path: `/offers/${offerId}` });
    }),

    /** Жоспарлы жұмыс (Cloud Scheduler, 15 минут сайын): өтінім нәтижелері, 22:00 күндік қорытынды, 10:00 мерзім ескертуі */
    tick: async (now = new Date()) => {
      const out = { applications: 0, daily: 0, expiry: 0 };
      // Өтінім күйі қолмен (дерекқорда) өзгерсе де хабар кетеді
      for (const a of await rows<{ id: string }>(sql`select a.id from app.venue_applications a where a.status in ('approved','need_info','rejected')
          and coalesce(a.decided_at, a.submitted_at, a.created_at) > now() - interval '14 days'
          and not exists (select 1 from app.notify_log l where l.key = 'app:' || a.id || ':' || a.status)`)) { await n.application(a.id); out.applications++; }

      const h = hourAt(now); const day = ymd(now);
      if (h >= 22) {
        // 📊 Бүгінгі қорытынды → иесі («Күндік қорытынды» баптауы); бүгін қолдану не тапсырыс болған мекемелерге ғана
        const from = new Date(`${day}T00:00:00+05:00`);
        const stats = await rows<{ venue_id: string; uses: number; orders: number; amount: number }>(sql`
          with u as (select b.venue_id, sum(r.units)::int as uses, sum(r.units * (p.price_paid / p.units_total))::int as amount from app.redemptions r
              join app.branches b on b.id = r.branch_id join app.packs p on p.id = r.pack_id where r.created_at >= ${from} and r.cancelled_at is null group by b.venue_id),
            o as (select b.venue_id, count(*)::int as orders, sum(p.price_paid / p.units_total)::int as amount from app.orders o join app.branches b on b.id = o.branch_id
              join app.packs p on p.id = o.pack_id where o.created_at >= ${from} and o.status not in ('cancelled','failed') group by b.venue_id)
          select coalesce(u.venue_id, o.venue_id) as venue_id, coalesce(u.uses, 0) as uses, coalesce(o.orders, 0) as orders, coalesce(u.amount, 0) + coalesce(o.amount, 0) as amount
          from u full join o on o.venue_id = u.venue_id`);
        for (const s of stats) {
          if (!(await once(`daily:${s.venue_id}:${day}`))) continue;
          await sendAll(await staff(s.venue_id, ["owner"], { pref: "daily" }), { text: `📊 Бүгінгі қорытынды: ${s.uses} қолдану • ${s.orders} тапсырыс • ${money(s.amount)}.`, button: { text: "Есеп", start: "v_report" } });
          out.daily++;
        }
      }
      if (h >= 9 && adminTg.length && (await once(`adm-daily:${day}`))) {
        // 📊 Басқаруға кешегі қорытынды (Figma 18 «Күндік қорытынды · 13 қараша»), дүйсенбіде — апталық есеп
        const y = new Date(new Date(`${day}T00:00:00+05:00`).getTime() - 86400_000); const t = new Date(`${day}T00:00:00+05:00`);
        const sum = async (from: Date) => (await rows<{ sales: number; fee: number; packs: number; uses: number; complaints: number }>(sql`select
          coalesce((select sum(p.price_paid) from app.packs p where p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at >= ${from} and p.created_at < ${t}), 0)::int as sales,
          coalesce((select sum(round(p.price_paid * coalesce(v.fee_pct, ${sql.raw(String(Number(opts.feePct ?? 10)))}) / 100.0)) from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.status <> 'pending_payment' and p.source <> 'carry' and p.created_at >= ${from} and p.created_at < ${t}), 0)::int as fee,
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
        const soon = await rows<{ id: string; tg: string; title: string; left: number; unit_name: string; notify: Partial<typeof clientPrefDefaults> | null }>(sql`
          select p.id, u.telegram_id as tg, f.title, p.units_left as left, f.unit_name, u.notify from app.packs p join app.offers f on f.id = p.offer_id join app.users u on u.id = p.user_id
          where p.status = 'active' and p.units_left > 0 and p.valid_until between now() + interval '2 days' and now() + interval '3 days'
            and not exists (select 1 from app.notify_log l where l.key = 'exp:' || p.id) limit 500`);
        for (const p of soon) {
          if (!({ ...clientPrefDefaults, ...(p.notify ?? {}) }).expiry || !(await once(`exp:${p.id}`))) continue;
          await send({ chatId: Number(p.tg), text: `⏰ «${head(p.title)}» пакетінің мерзімі 3 күннен кейін бітеді. ${p.left} ${p.unit_name || "дана"} қалды.`, button: { text: "Пакеттерім", start: `pk_${p.id}` } }).catch(() => null);
          out.expiry++;
        }
      }
      return out;
    },
  };
  return n;
}
