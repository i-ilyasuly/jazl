// Қайтару (Патша, 2026-11-18 түзетуі). Ереже: пакеттен бір де бірлік жұмсалмаса және сатып алғанына 14 күн толмаса — толық қайтарылады.
//  • Картадан/Kaspi-ден төленген бөлігі — төлем провайдері арқылы НАҚТЫ қайтарылады (бұрын тек «қайтарылды» деп белгіленетін).
//  • Medeo бонусымен төленген бөлігі — ақша болып емес, бонус шотына қайтады (бонусты ақшаға айналдыру жолы жабылды).
//    Бонус мерзімі өтіп кеткен болса — 30 күнге ұзартылады: клиент қайтару кезінде бонусынан айырылмауы керек.
//  • Сыйлық: тек сыйлық БЕРУШІ қайтара алады және алушы әлі қабылдамаған кезде ғана (сыйлық коды жойылады).
//    Қабылданған сыйлықты алушы қайтара алмайды — ақша берушінің картасына кететін еді.
//  • Қайта алынған пакетте көшірілген бірліктер болса — олар ескі пакетке оралады (жоғалмайды).
//  • Мерзімді ұзарту төлемдері қайтарылмайды (ұзарту ақысы — Medeo-ныкі, Патша шешімі).
// Провайдерге сұрау дерекқор транзакциясынан ТЫС жіберіледі: алдымен «күтуде» жазылады, сосын провайдер, сосын нәтиже.
// Провайдер қабылдамаса — refund_status = failed, Басқару «Пульсінде» шығады және «Қайта жіберу» батырмасы бар.
import { settleFiscal } from "./fiscal/index.js";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { providerByName } from "./payments/index.js";

export const REFUND_DAYS = 14;
const BONUS_GRACE_DAYS = 30;
export class RefundError extends Error { constructor(public code: string, public status: 404 | 409 = 409) { super(code); } }
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Tx | Db, q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as T | undefined;
const almaty = (d: Date) => d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " ₸";

type PayMeta = { kind?: string; price?: number; count?: number; packIds?: string[]; bonus?: { used: number; from: { id: string; n: number }[] }; bonusRefunded?: number };

export async function refundPack(db: Db, cfg: Config, userId: string, packId: string) {
  const out = await db.transaction(async (tx) => {
    const p = await one<{ id: string; user_id: string; status: string; source: string; units_left: number; units_total: number; price_paid: number; created_at: Date; venue_id: string; title: string; unit_name: string; venue_name: string; address: string | null }>(tx,
      sql`select p.*, o.venue_id, o.title, o.unit_name, v.name as venue_name,
            (select b.address from app.branches b where b.venue_id = v.id and b.active order by b.created_at limit 1) as address
          from app.packs p join app.offers o on o.id = p.offer_id join app.venues v on v.id = o.venue_id where p.id = ${packId} for update of p`);
    if (!p) throw new RefundError("not_found", 404);
    const gift = await one<{ id: string; status: string; from_user_id: string }>(tx, sql`select id, status, from_user_id from app.gifts where pack_id = ${p.id} for update`);
    // Кім қайтара алады
    const giverWaiting = gift && gift.from_user_id === userId && gift.status === "sent";
    if (giverWaiting) {
      if (p.status !== "gifted") throw new RefundError("pack_" + p.status);
    } else if (p.user_id === userId) {
      // Алушы қабылдаған сыйлық: ақша берушінің картасынан төленген — алушы қайтара алмайды.
      // (Беруші сыйлықты болдырмаса не 7 күнде қабылданбаса — пакет берушіге оралады, сонда ол өзі қайтара алады.)
      if (gift && gift.status === "accepted" && gift.from_user_id !== userId) throw new RefundError("gift_refund_giver");
      if (p.status !== "active") throw new RefundError("pack_" + p.status);
    } else if (gift && gift.from_user_id === userId) throw new RefundError("gift_accepted");
    else throw new RefundError("not_found", 404);
    if (p.units_left !== p.units_total) throw new RefundError("units_used");
    if (Date.now() - new Date(p.created_at).getTime() > REFUND_DAYS * 86400_000) throw new RefundError("too_late");

    // Сатып алу төлемі (ұзарту төлемдері емес). Көп сыйлық бір төлеммен алынса — meta.packIds ішінде
    const pay = await one<{ id: string; amount: number; refunded: number; provider: string; external_id: string | null; meta: PayMeta | null; status: string }>(tx,
      sql`select id, amount, refunded, provider, external_id, meta, status from app.payments
          where status in ('paid','refunded') and coalesce(meta->>'kind','purchase') = 'purchase' and (pack_id = ${p.id} or coalesce(meta->'packIds','[]'::jsonb) ? ${p.id}::text)
          order by created_at limit 1 for update`);
    const m = pay?.meta ?? {};
    const bonusUsed = m.bonus?.used ?? 0;
    const total = pay ? Number(pay.amount) + bonusUsed : p.price_paid; // төлемнің толық бағасы (барлық пакет)
    // Бұл пакеттің үлесі: карта бөлігі пропорционал, қалғаны — бонус. Бір пакетте: карта = amount, бонус = used.
    let cash = pay && total > 0 ? Math.round((Number(pay.amount) * p.price_paid) / total) : 0;
    cash = Math.min(cash, pay ? Number(pay.amount) - Number(pay.refunded) : 0);
    let bonus = Math.max(0, p.price_paid - cash);
    bonus = Math.min(bonus, bonusUsed - (m.bonusRefunded ?? 0));

    // Бонус бөлігін бонус шотына қайтару (мерзімі өткен болса — 30 күнге ұзартылады)
    let restore = bonus;
    for (const x of m.bonus?.from ?? []) {
      if (restore <= 0) break;
      const n = Math.min(x.n, restore);
      await tx.execute(sql`update app.bonuses set "left" = least(amount, "left" + ${n}), expires_at = greatest(expires_at, now() + make_interval(days => ${BONUS_GRACE_DAYS})) where id = ${x.id}`);
      restore -= n;
    }
    const bonusBack = bonus - restore;

    // Көшірілген бірліктер ескі пакетке оралады
    const carry = await one<{ from: string; units: number }>(tx, sql`select (meta->>'fromPackId') as "from", units_delta::int as units from app.pack_events where pack_id = ${p.id} and type = 'carry_in' limit 1`);
    if (carry?.from) {
      await tx.execute(sql`update app.packs set units_left = least(units_total, units_left + ${carry.units}), status = 'active' where id = ${carry.from}`);
      await tx.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${carry.from}, 'carry_back', ${carry.units}, ${JSON.stringify({ fromPackId: p.id, reason: "refund" })}::jsonb)`);
    }

    await tx.execute(sql`update app.packs set status = 'refunded', units_left = 0, auto_renew = false where id = ${p.id}`);
    if (giverWaiting) await tx.execute(sql`update app.gifts set status = 'cancelled' where id = ${gift!.id}`);
    if (pay) {
      const refundedAll = Number(pay.refunded) + cash;
      await tx.execute(sql`update app.payments set refunded = ${refundedAll}, refund_status = ${cash > 0 ? "pending" : pay.status === "refunded" ? "done" : null},
          status = ${refundedAll >= Number(pay.amount) && (m.count ?? 1) <= 1 ? "refunded" : pay.status}::app.payment_status,
          meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({ bonusRefunded: (m.bonusRefunded ?? 0) + bonusBack, lastRefund: cash })}::jsonb where id = ${pay.id}`);
    }
    await tx.execute(sql`insert into app.pack_events (pack_id, type, units_delta, meta) values (${p.id}, 'refund', ${-p.units_left}, ${JSON.stringify({ amount: p.price_paid, cash, bonus: bonusBack, paymentId: pay?.id ?? null, by: userId, carriedBack: carry?.units ?? 0 })}::jsonb)`);
    const now = new Date();
    const note = [cash ? `${fmt(cash)} төлем тәсіліңе 1–3 жұмыс күнінде түседі` : "", bonusBack ? `${fmt(bonusBack)} Medeo бонусыңа қайтты` : ""].filter(Boolean).join(". ");
    const rc = await one<{ id: string; no: number }>(tx, sql`insert into app.receipts (kind, user_id, pack_id, payment_id, venue_id, total, public, internal) values ('refund', ${userId}, ${p.id}, ${pay?.id ?? null}, ${p.venue_id}, ${-p.price_paid},
      ${JSON.stringify({ title: "Ақша қайтарылды", status: "Қайтарылды", dateLocal: almaty(now), seller: { name: p.venue_name, address: p.address, bin: null }, item: { title: p.title, units: p.units_total, unitName: p.unit_name }, refund: { cash, bonus: bonusBack, carriedBack: carry?.units ?? 0 }, note })}::jsonb,
      ${JSON.stringify({ version: 1, amount: p.price_paid, cash, bonus: bonusBack, reason: "unused_within_" + REFUND_DAYS + "d", gift: gift ? gift.id : null, status: { current: "refunded", history: [{ status: "refunded", at: now }] } })}::jsonb) returning id, no`);
    return { paymentId: cash > 0 ? pay!.id : null, refunded: p.price_paid, cash, bonus: bonusBack, carriedBack: carry?.units ?? 0, receipt: { id: rc!.id, no: "MD-" + rc!.no } };
  });
  const refundStatus = out.paymentId ? await pushRefund(db, cfg, out.paymentId, out.cash) : "done";
  return { ...out, refundStatus };
}

/** Ақшаны провайдер арқылы қайтару (транзакциядан тыс). Сынақ режимінде (ақша жүрмейді) — бірден «өтті». Басқару қайта жібере алады. */
export async function pushRefund(db: Db, cfg: Config, paymentId: string, amount?: number): Promise<"done" | "failed" | "unknown"> {
  const pay = await one<{ id: string; provider: string; external_id: string | null; refunded: number; meta: { refundAttempts?: number; lastRefund?: number } | null }>(db, sql`select id, provider, external_id, refunded, meta from app.payments where id = ${paymentId}`);
  if (!pay) return "failed";
  const sum = amount ?? pay.meta?.lastRefund ?? Number(pay.refunded);
  // Төлем қай провайдер арқылы өтсе — қайтару да сол арқылы (кейін банк ауысса да)
  const provider = pay.provider === "bonus" ? null : providerByName(cfg, pay.provider);
  let res: { ok: boolean; reason?: string };
  if (pay.provider === "bonus") res = { ok: true };
  else if (!provider) res = { ok: false, reason: "provider_unavailable" };
  else if (!provider.refund) res = { ok: false, reason: "refund_not_supported" };
  else if (!pay.external_id) res = { ok: false, reason: "no_external_id" };
  else {
    try { res = await provider.refund(pay.external_id, sum); }
    catch {
      // Жауап келмеді (желі, уақыт бітті, 5xx): ақша қайтты ма — БЕЛГІСІЗ. «Сәтсіз» деп белгілесек, Басқару қайта жіберіп,
      // ақшаны екі рет қайтаруы мүмкін. Сондықтан «күтуде» қалады: Пульсте «ескірген қайтару» болып шығады, провайдер кабинетінен тексеріледі.
      await db.execute(sql`update app.payments set refund_failure = 'provider_no_answer',
          meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({ refundAttempts: (pay.meta?.refundAttempts ?? 0) + 1, refundAt: new Date(), refundUnknown: true })}::jsonb where id = ${pay.id}`);
      return "unknown";
    }
  }
  await db.execute(sql`update app.payments set refund_status = ${res.ok ? "done" : "failed"}, refund_failure = ${res.ok ? null : res.reason ?? "provider_error"},
      meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({ refundAttempts: (pay.meta?.refundAttempts ?? 0) + 1, refundAt: new Date() })}::jsonb where id = ${pay.id}`);
  if (res.ok) await settleFiscal(db, cfg); // қайтару чегі (re:Kassa қосулы болса) — жауаптан бұрын шығарамыз (Cloud Run фонды тежейді)
  return res.ok ? "done" : "failed";
}
