// Автожаңарту (Патша, 2026-11-18). Клиент пакет бетінде өзі қосады (келісім уақыты сақталады), сақталған карта міндетті.
// Пакет біткенде (бірлігі таусылса не мерзімі өтсе) жоспарлы тапсырма сол көлемді сол картадан ҚАЙТА АЛАДЫ — бір рет қана:
//  • Төлем кілті тұрақты («renew_<пакет>»): тапсырма қайта іске қосылса да екінші рет ақша алынбайды (payments_idem).
//  • Ешқашан сынақ «төленді» жолымен емес — тек провайдер арқылы, сақталған картаның токенімен.
//  • Банк растау (3-D Secure) сұраса не бас тартса — бір әрекет, сосын автожаңарту өшеді, клиентке хабар барады (ақша алынбайды).
//  • Ұсыныс сатылмаса не мекеме бағаны көтерсе — алынбайды, өшеді, хабар барады (клиент келіспеген бағамен ақша алынбайды).
//  • Қалған бірліктер (мерзімі өткеніне 3 күн толмаса) жаңа пакетке көшеді — қайта алу ережесімен бірдей.
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { Notifier } from "./notify.js";
import { offPeakPrice, type OffPeakT } from "./offpeak.js";
import { startPurchase } from "./routes/purchases.js";

type Due = { id: string; user_id: string; tg: string; username: string | null; units_total: number; carried_in: number; price_paid: number; off_peak: OffPeakT | null; auto_renew_card: string | null;
  card_ok: boolean; slug: string; title: string; title_ru: string | null; o_status: string; v_status: string; price: number; units: number; sizes: { units: number; price: number }[] | null; rules: { offPeak?: OffPeakT; planOnly?: boolean } | null };

export async function autoRenewTick(db: Db, cfg: Config, notify?: Notifier): Promise<number> {
  const due = (await db.execute(sql`
    select p.id, p.user_id, u.telegram_id as tg, u.username, p.units_total, p.price_paid, p.off_peak, p.auto_renew_card,
      coalesce((select sum(e.units_delta) from app.pack_events e where e.pack_id = p.id and e.type = 'carry_in'), 0)::int as carried_in,
      exists (select 1 from app.payment_cards c where c.id = p.auto_renew_card and c.user_id = p.user_id and c.removed_at is null) as card_ok,
      o.slug, o.title, o.title_ru, o.status as o_status, v.status as v_status, o.price, o.units, o.sizes, o.rules
    from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id join app.users u on u.id = p.user_id
    where p.auto_renew and p.renewed_to is null and p.status in ('active','used','expired') and (p.units_left = 0 or p.valid_until < now())
    order by p.valid_until limit 50`)).rows as Due[];
  let renewed = 0;
  for (const p of due) {
    const stop = async (why: "card" | "price" | "unavailable" | "payment") => {
      await db.execute(sql`update app.packs set auto_renew = false where id = ${p.id}`);
      await notify?.autoRenew(p.user_id, p.title, p.title_ru, { ok: false, why });
    };
    if (!p.card_ok) { await stop("card"); continue; }
    if (p.o_status !== "active" || p.v_status !== "active") { await stop("unavailable"); continue; }
    const units = Number(p.units_total) - Number(p.carried_in); // клиент сатып алған көлем (көшірілгенсіз)
    const size = units === Number(p.units) ? { units, price: Number(p.price) } : (p.sizes ?? []).find((x) => x.units === units);
    if (!size) { await stop("unavailable"); continue; }
    const offPeak = p.off_peak ? p.rules?.offPeak : undefined;
    if (p.off_peak && (!offPeak || !p.rules?.planOnly)) { await stop("unavailable"); continue; }
    const price = offPeak ? offPeakPrice(size.price, offPeak.pct) : size.price;
    if (price > Number(p.price_paid)) { await stop("price"); continue; } // клиент келіскен бағадан қымбат — алмаймыз
    const r = await startPurchase(db, cfg, { id: p.user_id, telegramId: Number(p.tg), username: p.username },
      { offerSlug: p.slug, units, method: "card", card: { id: p.auto_renew_card! }, idempotencyKey: `renew_${p.id}`, fromPackId: p.id, ...(offPeak ? { offPeak: true } : {}) },
      { auto: true, renewOf: p.id }, { background: true });
    const paidPack = r.type === "paid" ? r.out.packId : r.type === "repeated" && r.pay.status === "paid" ? r.pay.packId : null;
    if (paidPack) {
      await db.execute(sql`update app.packs set renewed_to = ${paidPack} where id = ${p.id}`);
      // Жаңа пакет те автожаңарумен жалғасады (клиент сол келісіммен)
      await db.execute(sql`update app.packs set auto_renew = true, auto_renew_card = ${p.auto_renew_card}, auto_renew_at = (select auto_renew_at from app.packs where id = ${p.id}) where id = ${paidPack}`);
      if (r.type === "paid") { renewed++; await notify?.autoRenew(p.user_id, p.title, p.title_ru, { ok: true, amount: price, packId: paidPack }); }
      continue;
    }
    await stop("payment");
  }
  return renewed;
}
