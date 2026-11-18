// Пакет картасы — Bot API 10.4 HTML widget (Патша, 2026-11-18: «жаңа мүмкіндіктерді барынша»).
// Клиентке сатып алғанда жеке чатқа келеді, бірлік қолданылған сайын санағы өзі жаңарады (editMessageWidgetData — дыбыссыз, «өзгертілді» белгісі жоқ).
// Виджет желіге шыға алмайды: күйін (chat_data) тек бот жазады. Ескі Telegram виджетті көрмейді — оларға мәтін (caption) мен «Пакетті ашу» батырмасы.
// Бір пакетке бір карта: packs.widget_msg_id (-1 — жіберу мүмкін болмады, қайталамаймыз). Жаңа карталар тек соңғы 3 күнде белсенді болған пакеттерге
// (енгізілген күні ескі пакеттер үшін ешкімге көп хабар кетпейді).
import { sql } from "drizzle-orm";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { TgCall } from "./api.js";
import type { BotLang } from "./texts.js";

const MON = { kk: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"], ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] };
const L = {
  kk: { left: "қалды", until: "дейін", used: "Пакет толық қолданылды", expired: "Мерзімі бітті", refunded: "Қайтарылды", open: "Пакетті ашу", cap: "🎟 Пакет картасы" },
  ru: { left: "осталось", until: "до", used: "Пакет полностью использован", expired: "Срок истёк", refunded: "Возвращён", open: "Открыть пакет", cap: "🎟 Карта пакета" },
};
/** Виджеттің коды (жіберілгеннен кейін өзгермейді): күйді chatData-дан оқиды, өзгергенде қайта салады. Түстер — чаттың өз түстері. */
export function packCardHtml(lang: BotLang, bot: string) {
  const t = L[lang];
  return `<style>body{margin:0;padding:12px 12px max(12px,env(safe-area-inset-bottom))}
.h{display:flex;justify-content:space-between;gap:8px}.t{font-weight:600;font-size:1.05em;line-height:1.25}.b{font-weight:800;letter-spacing:-.02em;white-space:nowrap}.b i{font-style:normal;color:var(--tg-theme-button-color)}
.v{color:var(--tg-theme-hint-color);font-size:.9em;margin-top:2px}.r{display:flex;align-items:baseline;gap:6px;margin-top:12px}
.n{font-size:2em;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}.o{color:var(--tg-theme-hint-color)}
.bar{display:flex;gap:4px;margin-top:10px}.bar i{flex:1;height:6px;border-radius:3px;background:var(--tg-theme-secondary-bg-color)}.bar i.on{background:var(--tg-theme-button-color)}
.u{margin-top:8px;color:var(--tg-theme-hint-color);font-size:.9em}.u.x{color:var(--tg-theme-destructive-text-color)}button{margin-top:12px;width:100%}</style>
<div class="h"><div class="t" id="t"></div><div class="b">Medeo<i>.</i></div></div><div class="v" id="v"></div>
<div class="r"><span class="n" id="l"></span><span class="o" id="o"></span></div><div class="bar" id="bar"></div><div class="u" id="u"></div>
<button id="go">${t.open}</button>
<script>
var W=window.TelegramWidget,d={},T=${JSON.stringify({ left: t.left, used: t.used, expired: t.expired, refunded: t.refunded })};
function $(i){return document.getElementById(i)}
function r(){try{d=JSON.parse(W&&W.chatData)||{}}catch(e){d={}}
$('t').textContent=d.t||'';$('v').textContent=d.v||'';$('l').textContent=d.l==null?'':d.l;$('o').textContent=d.n?'/ '+d.n+' '+T.left:'';
var b=$('bar');b.innerHTML='';var n=Math.min(d.n||0,20),on=d.n?Math.round((d.l||0)*n/d.n):0;for(var k=0;k<n;k++){var e=document.createElement('i');if(k<on)e.className='on';b.appendChild(e)}
var u=$('u'),s=d.s||'a';u.className='u'+(s==='a'?'':' x');u.textContent=s==='a'?(d.d||''):s==='u'?T.used:s==='e'?T.expired:T.refunded;
$('go').style.display=d.id?'':'none'}
$('go').onclick=function(){if(d.id&&W)W.openTelegramLink('https://t.me/${bot}?startapp=pk_'+d.id)};
if(W){W.onEvent('chatDataChanged',r)}r();if(W)W.ready()</script>`;
}

type PackRow = { id: string; tg: string; lang: string; title: string; title_ru: string | null; venue: string; units_left: number; units_total: number; valid_until: Date; status: string; widget_msg_id: number | null; widget_state: string | null };
// Қазақшада «дейін» барыс септігін қалайды: «18 желтоқсанға дейін» (дауысты үндестігіне қарай -ға/-ге/-қа/-ке)
const MON_DAT = ["қаңтарға", "ақпанға", "наурызға", "сәуірге", "мамырға", "маусымға", "шілдеге", "тамызға", "қыркүйекке", "қазанға", "қарашаға", "желтоқсанға"];
const untilText = (d: Date, l: BotLang) => { const x = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Almaty" })); return l === "ru" ? `до ${x.getDate()} ${MON.ru[x.getMonth()]}` : `${x.getDate()} ${MON_DAT[x.getMonth()]} дейін`; };
/** Пакеттің күйі (chat_data): қысқа кілттер — 1024 байт шегіне сыяды */
export function cardState(p: PackRow) {
  const l: BotLang = p.lang === "ru" ? "ru" : "kk";
  const expired = new Date(p.valid_until).getTime() < Date.now();
  const s = p.status === "refunded" ? "r" : p.units_left <= 0 || p.status === "used" ? "u" : expired || p.status === "expired" ? "e" : "a";
  const title = (l === "ru" && p.title_ru ? p.title_ru : p.title).slice(0, 80);
  return JSON.stringify({ id: p.id, t: title, v: p.venue.slice(0, 60), l: p.units_left, n: p.units_total, d: untilText(new Date(p.valid_until), l), s });
}

export function packCards(cfg: Config, db: Db, call: TgCall) {
  const bot = cfg.MINIAPP_BOT_USERNAME;
  const q = (where: ReturnType<typeof sql>) => db.execute(sql`select p.id, u.telegram_id as tg, u.lang, o.title, o.title_ru, v.name as venue, p.units_left, p.units_total, p.valid_until, p.status, p.widget_msg_id, p.widget_state
    from app.packs p join app.users u on u.id = p.user_id join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where ${where}`).then((r) => r.rows as PackRow[]);

  async function sendCard(p: PackRow) {
    const l: BotLang = p.lang === "ru" ? "ru" : "kk";
    const state = cardState(p);
    const title = (l === "ru" && p.title_ru ? p.title_ru : p.title);
    // Бірінші болып иелік алады (екі қатар шақыру екі карта жібермесін): 0 — «жіберілуде»
    const claimed = (await db.execute(sql`update app.packs set widget_msg_id = 0 where id = ${p.id} and widget_msg_id is null returning id`)).rows.length;
    if (!claimed) return;
    const r = await call("sendWidget", { chat_id: Number(p.tg), html: packCardHtml(l, bot), chat_data: state, height: 0,
      caption: `${L[l].cap}: ${title} — ${p.venue}`, reply_markup: { inline_keyboard: [[{ text: L[l].open, url: `https://t.me/${bot}?startapp=pk_${p.id}`, style: "primary" }]] }, disable_notification: true });
    const msgId = (r.result as { message_id?: number } | undefined)?.message_id;
    await db.execute(sql`update app.packs set widget_msg_id = ${r.ok && msgId ? msgId : -1}, widget_state = ${r.ok ? state : null} where id = ${p.id}`);
    if (!r.ok) console.warn("packCard send:", r.description);
  }
  async function updateCard(p: PackRow) {
    const state = cardState(p);
    if (state === p.widget_state || !p.widget_msg_id || p.widget_msg_id <= 0) return;
    const r = await call("editMessageWidgetData", { chat_id: Number(p.tg), message_id: p.widget_msg_id, chat_data: state });
    if (r.ok || /not modified/i.test(r.description ?? "")) await db.execute(sql`update app.packs set widget_state = ${state} where id = ${p.id}`);
    else console.warn("packCard edit:", r.description);
  }
  return {
    /** Бір пакет: картасы жоқ болса — жіберу, бар болса — күйін жаңарту (сатып алу, қолдану сәтінде шақырылады) */
    touch: async (packId: string) => {
      if (cfg.PACK_CARDS !== "1") return;
      try {
        const [p] = await q(sql`p.id = ${packId}`);
        if (!p) return;
        if (p.widget_msg_id == null) { if (p.status === "active" && p.units_left > 0) await sendCard(p); }
        else await updateCard(p);
      } catch (e) { console.warn("packCard:", (e as Error).message); }
    },
    /** Жоспарлы тексеріс (15 минут): жаңа белсенді пакеттерге карта, өзгерген күйлерді жаңарту (мерзім біту, қайтару, ұзарту т.б.) */
    sweep: async () => {
      if (cfg.PACK_CARDS !== "1") return { sent: 0, updated: 0 };
      let sent = 0, updated = 0;
      for (const p of await q(sql`p.widget_msg_id is null and p.status = 'active' and p.units_left > 0 and p.created_at > now() - interval '3 days' limit 50`)) { await sendCard(p); sent++; }
      for (const p of await q(sql`p.widget_msg_id > 0 and (p.status = 'active' or p.created_at > now() - interval '120 days') limit 500`)) {
        if (cardState(p) !== p.widget_state) { await updateCard(p); updated++; }
      }
      return { sent, updated };
    },
  };
}
export type PackCards = ReturnType<typeof packCards>;

/** Қосымшаның бір данасы (createApp орнатады): маршруттар пакет өзгергенде шақырады; орнатылмаса (тест, скрипт) — ештеңе істемейді */
let active: PackCards | null = null;
export const setPackCards = (c: PackCards | null) => { active = c; };
export const onPackChanged = async (packId: string) => { await active?.touch(packId); };
