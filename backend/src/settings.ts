// Платформа баптаулары (app.settings) және мекеме комиссиялары — жадта қысқа уақыт сақталады (әр сұрауда дерекқорға бармау үшін).
// Medeo Басқару өзгерткенде кэш бірден жаңарады.
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";

/** Figma «Бизнес-ережелер», «Техникалық жұмыстар». Мәндер — Figma «00 · Жазбалар» ұсынысы (Патша растайды). */
export const SETTING_DEFAULTS = {
  /** Техникалық жұмыстар: клиент пен мекеме API-і 503 «maintenance» қайтарады (Басқару жұмыс істей береді) */
  maintenance: false,
  maintenanceText: "Жаңарту жүріп жатыр. Біраз уақыттан соң қайта кіріңіз.",
  /** Жаңа ұсыныс жарияланғанда Medeo тексеруіне түседі */
  moderation: true,
  /** Мерзімі өткен пакеттің күту кезеңі, күн */
  graceDays: 3,
  /** Шағымға жауап мерзімі, сағат */
  complaintHours: 24,
};
export type Settings = typeof SETTING_DEFAULTS;

const TTL = 10_000;
const stores = new WeakMap<Db, { s: Settings; at: number; fees: Map<string, number>; feesAt: number }>();
const st = (db: Db) => { let x = stores.get(db); if (!x) { x = { s: { ...SETTING_DEFAULTS }, at: 0, fees: new Map(), feesAt: 0 }; stores.set(db, x); } return x; };

export async function getSettings(db: Db, fresh = false): Promise<Settings> {
  const x = st(db);
  if (fresh || Date.now() - x.at > TTL) {
    const rows = (await db.execute(sql`select key, value from app.settings`)).rows as { key: keyof Settings; value: unknown }[];
    const s = { ...SETTING_DEFAULTS } as Record<string, unknown>;
    for (const r of rows) if (r.key in SETTING_DEFAULTS) s[r.key] = r.value;
    x.s = s as Settings; x.at = Date.now();
  }
  return x.s;
}
export async function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]) {
  await db.execute(sql`insert into app.settings (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
  await getSettings(db, true);
}

/** Мекеме комиссиясы (%): venues.fee_pct, жоқ болса — әдепкі. Синхронды оқылады (есеп сандары), фонда жаңарады. */
export function feeFor(db: Db, venueId: string, def: number) {
  const x = st(db);
  if (Date.now() - x.feesAt > 60_000) { x.feesAt = Date.now(); void refreshFees(db); }
  return x.fees.get(venueId) ?? def;
}
export async function refreshFees(db: Db) {
  const x = st(db);
  const rows = (await db.execute(sql`select id, fee_pct from app.venues where fee_pct is not null`)).rows as { id: string; fee_pct: number }[];
  x.fees = new Map(rows.map((r) => [r.id, Number(r.fee_pct)])); x.feesAt = Date.now();
}
