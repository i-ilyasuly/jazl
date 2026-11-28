// Medeo бонусы (Патша, 2026-11-17). Ереже: мекеме тек көрсеткен қызметі үшін ақша алады.
// Пакеттің мерзімі өтіп, күту кезеңі (graceDays, 3 күн) де біткенде көшірілмеген бірліктердің құны
// (пакеттің толық құнынан қалған бөлігі, value.ts: көшірілген құн да ескеріледі, тиын жоғалмайды) клиентке бонус болып қайтады.
// Патша, 2026-11-28 («Ә» нұсқасы, 31-құжат Д5): 0042-ден кейін сатылған пакеттің бонусы тек СОЛ мекемеде жұмсалады, 3 ай (settings.bonusVenueMonths).
// Бұрын сатылғандардың бонусы (packs.bonus_scope = 'any') — бұрынғыша кез келген мекемеде, 12 ай (settings.bonusMonths). Басқару берген бонус — кез келген мекемеде.
// Себебі: көп мекемеде жұмсалатын теңгелік баланс электрондық ақшаға ұқсайды (ҚР «Төлемдер туралы» заңы); ақша сол мекемеде қалады.
// Мысал: 12 кесе латте 10 800 ₸ (бірлігі 900 ₸), 3 кесе қалды → 2 700 ₸ бонус; келесі пакет 12 000 ₸ → картадан 9 300 ₸ алынады.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { getSettings } from "./settings.js";
import { leftValueSql } from "./value.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;
const rows = async <T>(db: Q, q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

/** Жарамды бонус қалдығы және тарихы (мини апптағы «Medeo бонусы» беті) */
export async function bonusOf(db: Q, userId: string, offerSlug?: string) {
  const items = await rows<{ id: string; kind: string; amount: number; left: number; units: number; expires_at: Date; created_at: Date; title: string | null; venue: string | null; venue_id: string | null; only: string | null }>(db, sql`
    select b.id, b.kind, b.amount, b."left", b.units, b.expires_at, b.created_at, o.title, v.name as venue, b.venue_id, vo.name as only from app.bonuses b
    left join app.packs p on p.id = b.pack_id left join app.offers o on o.id = p.offer_id left join app.venues v on v.id = o.venue_id
    left join app.venues vo on vo.id = b.venue_id
    where b.user_id = ${userId} order by b.created_at desc limit 100`);
  // Ұсыныс берілсе — осы ұсыныста жұмсауға болатын бөлігі (жалпы бонус + осы мекеменің бонусы)
  const [target] = offerSlug ? await rows<{ venue_id: string }>(db, sql`select venue_id from app.offers where slug = ${offerSlug}`) : [];
  const now = Date.now();
  const live = items.filter((x) => x.left > 0 && new Date(x.expires_at).getTime() > now);
  const soonest = live.map((x) => new Date(x.expires_at)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    balance: live.reduce((a, x) => a + Number(x.left), 0),
    ...(offerSlug ? { usable: live.filter((x) => !x.venue_id || x.venue_id === target?.venue_id).reduce((a, x) => a + Number(x.left), 0) } : {}),
    nextExpiry: soonest,
    items: items.map((x) => ({ id: x.id, kind: x.kind, amount: Number(x.amount), left: Number(x.left), units: Number(x.units), expiresAt: x.expires_at, at: x.created_at,
      title: x.title ? x.title.split(" · ")[0] : null, venue: x.venue, onlyAt: x.venue_id ? x.only : null, expired: new Date(x.expires_at).getTime() <= now })),
  };
}

/** Төлем жасалғанда бонусты ұстау (ескі бонустан бастап). Тек транзакция ішінде: жолдар FOR UPDATE құлыпталады — екі рет жұмсалмайды. */
export async function holdBonus(tx: Tx, userId: string, want: number, venueId: string): Promise<{ used: number; from: { id: string; n: number }[] }> {
  if (want <= 0) return { used: 0, from: [] };
  // Тек осы мекемеге жарайтын бонус (жалпы + осы мекеменікі); алдымен мерзімі жақыны — сол мекеменің қысқа бонусы бірінші жұмсалады
  const live = await rows<{ id: string; left: number }>(tx, sql`select id, "left" from app.bonuses where user_id = ${userId} and "left" > 0 and expires_at > now()
    and (venue_id is null or venue_id = ${venueId}) order by expires_at, created_at for update`);
  const from: { id: string; n: number }[] = []; let used = 0;
  for (const b of live) {
    if (used >= want) break;
    const n = Math.min(Number(b.left), want - used);
    await tx.execute(sql`update app.bonuses set "left" = "left" - ${n} where id = ${b.id}`);
    from.push({ id: b.id, n }); used += n;
  }
  return { used, from };
}

/** Төлем өтпесе — ұсталған бонус қайтарылады. Идемпотентті: meta.bonusReleased белгісі екінші рет қайтармайды. */
export async function releaseBonus(db: Db, paymentId: string) {
  await db.transaction(async (tx) => {
    const [p] = await rows<{ meta: { bonus?: { used: number; from: { id: string; n: number }[] }; bonusReleased?: boolean } | null }>(tx, sql`select meta from app.payments where id = ${paymentId} for update`);
    const b = p?.meta?.bonus;
    if (!b?.used || p?.meta?.bonusReleased) return;
    for (const x of b.from) await tx.execute(sql`update app.bonuses set "left" = least(amount, "left" + ${x.n}) where id = ${x.id}`);
    await tx.execute(sql`update app.payments set meta = meta || '{"bonusReleased": true}'::jsonb where id = ${paymentId}`);
  });
}

/** Жоспарлы жұмыс (/cron/tick): күту кезеңі біткен пакеттердің қалған бірлігі → бонус. Пакет «expired» болып, қалдығы 0-ге түседі
 *  (кейін Басқару мерзімін ұзартса да, екі рет пайда болмайды). Қайтарады: хабарлама үшін жаңа бонустар. */
export async function creditBreakage(db: Db, now = new Date()) {
  const s = await getSettings(db);
  return db.transaction(async (tx) => {
    const due = await rows<{ id: string; user_id: string; units_left: number; left_value: number; title: string; title_ru: string | null; venue_id: string; scope: string; venue: string }>(tx, sql`
      select p.id, p.user_id, p.units_left, ${leftValueSql()} as left_value, o.title, o.title_ru, o.venue_id, p.bonus_scope as scope, v.name as venue
      from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id
      where p.status = 'active' and p.units_left > 0 and p.value_total > 0 and p.valid_until < ${now}::timestamptz - make_interval(days => ${s.graceDays})
        and not exists (select 1 from app.bonuses b where b.pack_id = p.id)
      order by p.valid_until limit 500 for update of p skip locked`);
    const out: { userId: string; packId: string; amount: number; units: number; title: string; titleRu: string | null; onlyAt: string | null; months: number }[] = [];
    for (const p of due) {
      const amount = Number(p.left_value);
      const only = p.scope === "venue"; const months = only ? s.bonusVenueMonths : s.bonusMonths;
      await tx.execute(sql`update app.packs set status = 'expired', units_left = 0 where id = ${p.id}`);
      await tx.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${p.id}, 'bonus', ${-p.units_left}, ${JSON.stringify({ amount })}::jsonb)`);
      if (amount > 0) await tx.execute(sql`insert into app.bonuses (user_id, kind, amount, "left", pack_id, units, venue_id, expires_at)
        values (${p.user_id}, 'breakage', ${amount}, ${amount}, ${p.id}, ${p.units_left}, ${only ? p.venue_id : null}, ${now}::timestamptz + make_interval(months => ${months})) on conflict (pack_id) do nothing`);
      out.push({ userId: p.user_id, packId: p.id, amount, units: Number(p.units_left), title: p.title, titleRu: p.title_ru, onlyAt: only ? p.venue : null, months });
    }
    return out;
  });
}
