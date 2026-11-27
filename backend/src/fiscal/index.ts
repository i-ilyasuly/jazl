// Фискалдық чектер кезегі (2026-11-27). Төлем ағынына араласпайды: жоспарлы жұмыс (/cron/tick) және төлемнен кейінгі «түрткі»
// дерекқордан чегі жоқ төлемдерді тауып, re:Kassa арқылы шығарады. Сондықтан төлемнің қай жолмен өткені (вебхук, бірден,
// ұзарту) маңызды емес — бірде-бір төлем чексіз қалмайды.
//  • Сатылым чегі: төлем «төленді» болса (бонус пен сынақ провайдерінен басқа), fiscalSince-тен кейін
//  • Қайтару чегі: ақша клиентке нақты қайтарылса (refund_status = done), сатылым чегі шыққаннан кейін ғана
//  • Қайталау: уақытша қате → 1, 2, 5, 15, 30, 60, 120 мин; 10 әрекеттен соң — «failed» (Басқару қарайды)
//  • Жауап жоғалса: келесі әрекет алдында соңғы екі ауысымнан externalId бойынша іздейміз; ауысым ауысып, чек табылмаса —
//    қайта жібермей «reconcile» (қос чек шықпайды). Касса деңгейіндегі ақау — партия тоқтайды, Басқаруға fiscalAlert
import { sql } from "drizzle-orm";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { getSettings, setSetting } from "../settings.js";
import { RekassaError, rekassaClient, type ErrorClass, type RekassaClient, type TicketKind, type TicketResult } from "./rekassa.js";

export const fiscalEnabled = (cfg: Config) => cfg.FISCAL === "rekassa" && Boolean(cfg.REKASSA_API_KEY && cfg.REKASSA_NUMBER && cfg.REKASSA_PASSWORD);

const clients = new WeakMap<Config, RekassaClient>();
function clientFor(cfg: Config): RekassaClient {
  let c = clients.get(cfg);
  if (!c) { c = rekassaClient({ url: cfg.REKASSA_URL, apiKey: cfg.REKASSA_API_KEY!, number: cfg.REKASSA_NUMBER!, password: cfg.REKASSA_PASSWORD! }); clients.set(cfg, c); }
  return c;
}

const DELAYS_MIN = [1, 2, 5, 15, 30, 60, 120];
const MAX_ATTEMPTS = 10;

/** Чегі жоқ төлемдерді кезекке қою (қайталанса да қауіпсіз: request_id бірегей) */
export async function syncFiscalQueue(db: Db, cfg: Config) {
  const s = await getSettings(db, true);
  let since = s.fiscalSince;
  // Бірінші іске қосылғанда: 10 минут бұрыннан — қосқаннан кейінгі алғашқы төлем (оның «түрткісі» осы синхрондауды бастайды) чексіз қалмауы үшін
  if (!since) { since = new Date(Date.now() - 10 * 60_000).toISOString(); await setSetting(db, "fiscalSince", since); }
  // Сынақ контурында (app-test) сынақ провайдерінің төлемдері де чекке түседі — интеграцияны тексеру үшін
  const includeTest = cfg.REKASSA_URL.includes("app-test");
  await db.execute(sql`insert into app.fiscal_receipts (payment_id, kind, amount, title, request_id)
    select p.id, 'sell', p.amount,
      coalesce(case when p.meta->>'kind' = 'extend' then 'Пакет мерзімін ұзарту' end, o.title || ' · ' || pk.units_total || ' бірлік', 'Medeo пакеті'),
      'md-' || p.no || '-sell'
    from app.payments p left join app.packs pk on pk.id = p.pack_id left join app.offers o on o.id = pk.offer_id
    where p.status in ('paid','refunded') and p.amount > 0 and p.provider <> 'bonus' and (${includeTest} or p.provider <> 'test')
      and coalesce(p.paid_at, p.created_at) >= ${since}::timestamptz
    on conflict (request_id) do nothing`);
  await db.execute(sql`insert into app.fiscal_receipts (payment_id, kind, amount, title, request_id)
    select p.id, 'sell_return', p.refunded - coalesce(r.total, 0), s.title, 'md-' || p.no || '-ret-' || (coalesce(r.n, 0) + 1)
    from app.payments p join app.fiscal_receipts s on s.payment_id = p.id and s.kind = 'sell'
    left join lateral (select sum(amount)::int as total, count(*)::int as n from app.fiscal_receipts x where x.payment_id = p.id and x.kind = 'sell_return') r on true
    where p.refund_status = 'done' and p.refunded > coalesce(r.total, 0)
    on conflict (request_id) do nothing`);
}

type Row = { id: string; kind: TicketKind; amount: number; title: string; request_id: string; attempts: number; prev_unknown: boolean; prev_shift: number | null };

/** Касса деңгейіндегі қате (кіру, бұғат, ауысымды жаба алмау): чектің өз кінәсі емес — партияны тоқтатып, барлығын кейінге қалдырамыз */
const KASSA_LEVEL = new Set<ErrorClass>(["auth", "block", "shift"]);

async function saveOk(db: Db, id: string, r: TicketResult) {
  await db.execute(sql`update app.fiscal_receipts set status = ${r.offline ? "offline" : "ok"}, ticket_id = ${r.ticketId}, ticket_number = ${r.ticketNumber},
    qr_url = ${r.qrUrl}, shift_number = ${r.shiftNumber}, offline = ${r.offline}, error_code = null, last_unknown = false, updated_at = now() where id = ${id}`);
}

/** Кезектегі чектерді шығару. Бір уақытта бір процесс қана өңдейді (жол «алынып», келесі әрекет уақыты алға жылжиды).
 *  Қос чектен қорғау: алдыңғы әрекеттің нәтижесі белгісіз болса (жауап жоғалды / процесс тоқтады) — алдымен соңғы екі ауысымнан іздейміз;
 *  табылмаса және ауысым жіберілген кездегіден басқа болса — қайта жібермей, «reconcile» (қолмен салыстыру) күйіне қоямыз. */
export async function processFiscal(db: Db, cfg: Config, client: RekassaClient = clientFor(cfg), limit = 20) {
  const rows = (await db.execute(sql`with c as (
      select x.id, x.last_unknown as prev_unknown, x.sent_shift as prev_shift from app.fiscal_receipts x
      where x.status = 'pending' and x.next_try_at <= now()
        and (x.kind = 'sell' or exists (select 1 from app.fiscal_receipts s where s.payment_id = x.payment_id and s.kind = 'sell' and s.status in ('ok','offline')))
      order by x.created_at limit ${limit} for update skip locked)
    update app.fiscal_receipts f set attempts = f.attempts + 1, next_try_at = now() + interval '10 minutes', last_unknown = true, updated_at = now()
    from c where f.id = c.id
    returning f.id, f.kind, f.amount, f.title, f.request_id, f.attempts, c.prev_unknown, c.prev_shift`)).rows as Row[];
  let ok = 0, failed = 0, reconcile = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      let done: TicketResult | null = null;
      if (r.attempts > 1 && r.prev_unknown) {
        done = await client.findTicket(r.request_id);
        if (!done && r.prev_shift !== null) {
          const cur = await client.currentShift();
          if (cur !== null && cur !== r.prev_shift) {
            await db.execute(sql`update app.fiscal_receipts set status = 'reconcile', error_code = 'LOST_ACROSS_SHIFT', updated_at = now() where id = ${r.id}`);
            reconcile++; console.error("fiscal reconcile", r.request_id); continue;
          }
        }
      }
      if (!done) {
        const shift = await client.currentShift();
        await db.execute(sql`update app.fiscal_receipts set sent_shift = ${shift} where id = ${r.id}`);
        done = await client.ticket({ requestId: r.request_id, kind: r.kind, title: r.title, amount: r.amount });
      }
      await saveOk(db, r.id, done);
      await client.registerReceipt(done.ticketId).catch((e) => console.error("fiscal receipt", r.request_id, (e as Error).message));
      ok++;
    } catch (e) {
      const err = e instanceof RekassaError ? e : new RekassaError("INTERNAL", 0, "retry", true);
      const unknown = err.unknown || err.code === "INTERNAL";
      if (KASSA_LEVEL.has(err.cls)) {
        // Касса жұмыс істемейді: осы және әлі қолға алынбаған чектерді 30 минутқа қалдырамыз (әрекет саналмайды), Басқаруға белгі
        const rest = rows.slice(i + 1).map((x) => x.id);
        await db.execute(sql`update app.fiscal_receipts set next_try_at = now() + interval '30 minutes', error_code = ${err.code}, last_unknown = ${unknown}, updated_at = now() where id = ${r.id}`);
        if (rest.length) await db.execute(sql`update app.fiscal_receipts set attempts = attempts - 1, next_try_at = now() + interval '30 minutes', last_unknown = false, updated_at = now()
          where id in (${sql.join(rest.map((id) => sql`${id}::uuid`), sql`, `)}) and sent_shift is null`);
        if (rest.length) await db.execute(sql`update app.fiscal_receipts set attempts = attempts - 1, next_try_at = now() + interval '30 minutes', last_unknown = true, updated_at = now()
          where id in (${sql.join(rest.map((id) => sql`${id}::uuid`), sql`, `)}) and sent_shift is not null`);
        await setSetting(db, "fiscalAlert", `${new Date().toISOString()} ${err.code}`);
        console.error("fiscal kassa", err.code);
        return { taken: rows.length, ok, failed, reconcile, stopped: err.code };
      }
      const giveUp = err.cls === "fix" || r.attempts >= MAX_ATTEMPTS;
      const delay = DELAYS_MIN[Math.min(r.attempts - 1, DELAYS_MIN.length - 1)];
      await db.execute(sql`update app.fiscal_receipts set status = ${giveUp ? "failed" : "pending"}, error_code = ${err.code}, last_unknown = ${unknown},
        next_try_at = now() + make_interval(mins => ${delay}), updated_at = now() where id = ${r.id}`);
      if (giveUp) { failed++; console.error("fiscal failed", r.request_id, err.code); }
    }
  }
  if (ok > 0 && (await getSettings(db)).fiscalAlert) await setSetting(db, "fiscalAlert", "");
  return { taken: rows.length, ok, failed, reconcile, stopped: null as string | null };
}

/** Жоспарлы жұмыс: кезекті толтырып, өңдеу */
export async function fiscalTick(db: Db, cfg: Config) {
  if (!fiscalEnabled(cfg)) return null;
  await syncFiscalQueue(db, cfg);
  return processFiscal(db, cfg);
}

/** Төлемнен кейінгі «түрткі»: жауапты күттірмейді, қате болса cron қайта ұстайды */
export function kickFiscal(db: Db, cfg: Config) {
  if (!fiscalEnabled(cfg)) return;
  void fiscalTick(db, cfg).catch((e) => console.error("fiscal kick", (e as Error).message));
}

/** Клиент чегіндегі фискалдық чек (2026-11-27): сатып алу/сыйлық/ұзарту чегіне — төлемнің сатылым чегі, қайтару чегіне — уақыты
 *  ең жақын қайтару чегі. Тек шыққаны (ok/offline) көрсетіледі; кезекте тұрса — «дайындалуда». Қате/салыстыру күйі клиентке көрінбейді. */
export type PublicFiscal = { status: "ok"; qrUrl: string | null; number: string | null; offline: boolean } | { status: "pending" };
export async function fiscalForReceipt(db: Db, rc: { kind: string; paymentId: string | null; createdAt: Date }): Promise<PublicFiscal | null> {
  if (!rc.paymentId || !["purchase", "gift", "extend", "refund"].includes(rc.kind)) return null;
  const kind = rc.kind === "refund" ? "sell_return" : "sell";
  const [x] = (await db.execute(sql`select status, qr_url, ticket_number, offline from app.fiscal_receipts
    where payment_id = ${rc.paymentId} and kind = ${kind}
    order by abs(extract(epoch from created_at - ${rc.createdAt.toISOString()}::timestamptz)) limit 1`)).rows as { status: string; qr_url: string | null; ticket_number: string | null; offline: boolean }[];
  if (!x) return null;
  if (x.status === "ok" || x.status === "offline") return { status: "ok", qrUrl: x.qr_url, number: x.ticket_number, offline: x.offline };
  return x.status === "pending" ? { status: "pending" } : null;
}
