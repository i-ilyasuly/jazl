// Мекемені тіркеу (Figma «02 · Тіркелу», «03 · Өтінім күйі»). Бір пайдаланушыда бір белсенді өтінім.
// Әр қадам PUT арқылы сақталады (кейін жалғастыруға болады), «Өтінімді жіберу» толық тексеріп, күйін review етеді.
// Құжаттар (БСН анықтамасы, жеке куәлік…) — жеке дерек: ашық бакетке емес, дерекқорда (venue_docs) жабық сақталады.
// БСН мен IBAN бақылау санымен тексеріледі; мемлекеттік дерекқорға қосылу (заңды тұлғаның атауы, басшысы) — кейінгі кезең.
import { randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../app.js";
import { devToolsFor, type Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { Notifier } from "../notify.js";
import { branches, venueApplications, venueDocs, venuePayees, venueStaff, venues } from "../db/schema.js";
import { MediaError, mediaStore, type MediaKind } from "../media.js";

/** Қазақстан БСН/ЖСН бақылау саны (12 сан): салмақ 1..11, қалдық 10 болса — 3..11,1,2 */
export function validBin(v: string) {
  if (!/^\d{12}$/.test(v)) return false;
  const d = [...v].map(Number);
  const sum = (w: number[]) => w.reduce((a, x, i) => a + x * d[i], 0) % 11;
  let c = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (c === 10) c = sum([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return c !== 10 && c === d[11];
}
/** IBAN (KZ, 20 таңба) — mod 97 */
export function validIban(raw: string) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!/^KZ\d{2}[0-9A-Z]{16}$/.test(v)) return false;
  const n = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0; for (const ch of n) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}
const BANKS: Record<string, [string, string]> = {
  "601": ["Halyk Bank", "HSBKKZKX"], "722": ["Kaspi Bank", "CASPKZKA"], "998": ["Jusan Bank", "TSESKZKA"], "914": ["ForteBank", "IRTYKZKA"],
  "856": ["Bank CenterCredit", "KCJBKZKX"], "551": ["Freedom Bank", "KSNVKZKA"], "821": ["Bank RBK", "KINCKZKA"], "886": ["Отбасы банк", "HCSKKZKA"],
  "949": ["Altyn Bank", "ATYNKZKA"], "832": ["Шинхан Банк", "SHBKKZKA"], "125": ["Ситибанк", "CITIKZKA"], "070": ["Қазынашылық", "KKMFKZ2A"],
};
export const bankOf = (iban: string) => BANKS[iban.replace(/\s/g, "").slice(4, 7)] ?? null;

export const POS_KINDS = ["iiko", "r_keeper", "poster", "syrve", "paloma", "other", "none"] as const;
export const posName: Record<string, string> = { iiko: "iiko", r_keeper: "r_keeper", poster: "Poster", syrve: "Syrve", paloma: "Paloma365", other: "Басқа", none: "Касса бағдарламасы жоқ" };
const Hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Url = z.string().url().max(500);
const Data = z.object({
  kind: z.enum(["food", "coffee", "hair"]).optional(), name: z.string().trim().max(60).optional(), about: z.string().trim().max(120).optional(), link: z.string().trim().max(100).optional(),
  bin: z.string().regex(/^\d{0,12}$/).optional(), legalName: z.string().trim().max(120).optional(), director: z.string().trim().max(80).optional(), regDate: z.string().max(20).optional(), authorized: z.boolean().optional(),
  contactName: z.string().trim().max(80).optional(), phone: z.string().trim().max(20).optional(), email: z.string().trim().max(80).optional(),
  branches: z.array(z.object({ address: z.string().trim().min(3).max(120), open: Hm, close: Hm })).max(20).optional(),
  logoUrl: Url.nullable().optional(), coverUrl: Url.nullable().optional(), gallery: z.array(Url).max(9).optional(),
  /** Касса бағдарламасы (Патша, 2026-11-18): алғашқы мекемелердің жауабы POS интеграциясын қайсысынан бастауды көрсетеді */
  pos: z.enum(POS_KINDS).optional(), posOther: z.string().trim().max(40).optional(),
  iban: z.string().max(40).optional(), ownAccount: z.boolean().optional(), agreeTerms: z.boolean().optional(), agreePrivacy: z.boolean().optional(),
}).strict();
export type AppData = z.infer<typeof Data>;
const DOC_KINDS = ["bin", "id", "charter", "halal"] as const;
const DOC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Жіберу алдындағы толық тексеру: жетпейтін қадамдардың тізімі (бос болса — жіберуге болады) */
export function missing(d: AppData, docs: string[]) {
  const m: string[] = [];
  if (!d.kind || !d.name || d.name.length < 2 || !d.about || d.about.length < 20) m.push("about");
  if (!d.bin || !validBin(d.bin) || !d.legalName || !d.authorized) m.push("legal");
  if (!d.contactName || !d.phone || !/^\+?\d[\d\s()-]{9,}$/.test(d.phone) || !d.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) m.push("contact");
  if (!d.branches?.length || !d.pos || (d.pos === "other" && !d.posOther)) m.push("branches"); // филиалдар қадамында касса бағдарламасы да
  if (!d.logoUrl || !d.coverUrl || (d.gallery?.length ?? 0) < 3) m.push("photos");
  if (!d.iban || !validIban(d.iban) || !d.ownAccount) m.push("bank");
  if (!docs.includes("bin") || !docs.includes("id") || (d.kind === "food" && !docs.includes("halal"))) m.push("docs");
  if (!d.agreeTerms || !d.agreePrivacy) m.push("terms");
  return m;
}

export function applyRoutes(cfg: Config, db: Db, notify?: Notifier) {
  const r = new Hono<Env>();
  const current = async (userId: string) => (await db.select().from(venueApplications).where(and(eq(venueApplications.userId, userId), inArray(venueApplications.status, ["draft", "review", "need_info", "rejected", "approved"]))).orderBy(desc(venueApplications.createdAt)).limit(1))[0];
  const docsOf = async (appId: string) => db.select({ kind: venueDocs.kind, fileName: venueDocs.fileName, size: venueDocs.size, mime: venueDocs.mime }).from(venueDocs).where(eq(venueDocs.applicationId, appId));
  const view = async (a: typeof venueApplications.$inferSelect) => {
    const docs = await docsOf(a.id);
    return { id: a.id, status: a.status, data: a.data, note: a.note, submittedAt: a.submittedAt, decidedAt: a.decidedAt, venueId: a.venueId, docs, missing: missing(a.data as AppData, docs.map((x) => x.kind)) };
  };
  const editable = (s: string) => s === "draft" || s === "need_info";

  r.get("/venue/application", async (c) => {
    const a = await current(c.get("user").id);
    return c.json({ ok: true, application: a ? await view(a) : null });
  });

  r.put("/venue/application", async (c) => {
    const b = z.object({ data: Data }).strict().safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ ok: false, error: "bad_request", issues: b.error.issues.slice(0, 3).map((x) => x.path.join(".")) }, 400);
    const user = c.get("user");
    let a = await current(user.id);
    if (a && !editable(a.status)) return c.json({ ok: false, error: "locked", status: a.status }, 409);
    const data = { ...((a?.data as object) ?? {}), ...b.data.data };
    if (a) [a] = await db.update(venueApplications).set({ data }).where(eq(venueApplications.id, a.id)).returning();
    else [a] = await db.insert(venueApplications).values({ userId: user.id, data }).returning();
    return c.json({ ok: true, application: await view(a) });
  });

  // Құжат жүктеу: денесі — файлдың өзі (PDF/JPG/PNG, 5 МБ дейін), атауы X-File-Name тақырыбында
  r.post("/venue/application/docs", async (c) => {
    const kind = c.req.query("kind") ?? "";
    if (!(DOC_KINDS as readonly string[]).includes(kind)) return c.json({ ok: false, error: "bad_kind" }, 400);
    const mime = (c.req.header("content-type") ?? "").split(";")[0];
    if (!DOC_TYPES.has(mime)) return c.json({ ok: false, error: "bad_type" }, 415);
    const a = await current(c.get("user").id);
    if (!a || !editable(a.status)) return c.json({ ok: false, error: "no_application" }, 409);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024) return c.json({ ok: false, error: "too_large" }, 413);
    if (!bytes.byteLength) return c.json({ ok: false, error: "empty" }, 400);
    let fileName = `${kind}.${mime === "application/pdf" ? "pdf" : "jpg"}`;
    try { fileName = decodeURIComponent(c.req.header("x-file-name") ?? fileName); } catch { /* бұзылған атау — әдепкісі (аудит 2026-11-21: бұрын 500 болатын) */ }
    fileName = fileName.replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 120);
    await db.delete(venueDocs).where(and(eq(venueDocs.applicationId, a.id), eq(venueDocs.kind, kind)));
    await db.insert(venueDocs).values({ applicationId: a.id, kind, fileName, mime, size: bytes.byteLength, bytes });
    return c.json({ ok: true, doc: { kind, fileName, size: bytes.byteLength, mime } });
  });
  r.post("/venue/application/docs/:kind/remove", async (c) => {
    const a = await current(c.get("user").id);
    if (!a || !editable(a.status)) return c.json({ ok: false, error: "no_application" }, 409);
    await db.delete(venueDocs).where(and(eq(venueDocs.applicationId, a.id), eq(venueDocs.kind, c.req.param("kind"))));
    return c.json({ ok: true });
  });

  // Тіркеу кезіндегі суреттер (логотип, мұқаба, галерея) — мекеме әлі жоқ, сондықтан өтінім жолымен
  const media = mediaStore(cfg);
  r.post("/venue/application/media", async (c) => {
    const a = await current(c.get("user").id);
    if (!a || !editable(a.status)) return c.json({ ok: false, error: "no_application" }, 409);
    const kind = (["offer", "logo", "cover"].includes(c.req.query("kind") ?? "") ? c.req.query("kind") : "offer") as MediaKind;
    try { return c.json({ ok: true, url: await media.put(new Uint8Array(await c.req.arrayBuffer()), (c.req.header("content-type") ?? "").split(";")[0], kind, `applications/${a.id}`) }); }
    catch (e) { if (e instanceof MediaError) return c.json({ ok: false, error: e.code }, e.status); throw e; }
  });

  r.get("/venue/check/bin/:bin", (c) => c.json({ ok: true, valid: validBin(c.req.param("bin")) }));
  r.get("/venue/check/iban/:iban", (c) => { const v = c.req.param("iban"); const ok = validIban(v); const b = ok ? bankOf(v) : null; return c.json({ ok: true, valid: ok, bank: b?.[0] ?? null, bik: b?.[1] ?? null }); });

  r.post("/venue/application/submit", async (c) => {
    const a = await current(c.get("user").id);
    if (!a || !editable(a.status)) return c.json({ ok: false, error: "no_application" }, 409);
    const docs = (await docsOf(a.id)).map((x) => x.kind);
    const m = missing(a.data as AppData, docs);
    if (m.length) return c.json({ ok: false, error: "incomplete", missing: m }, 409);
    const [x] = await db.update(venueApplications).set({ status: "review", submittedAt: new Date(), note: null }).where(eq(venueApplications.id, a.id)).returning();
    await notify?.adminApplication(a.id);
    return c.json({ ok: true, application: await view(x) });
  });

  // Сынақ режимі ғана: өтінімді өзің мақұлдау (Medeo басқару беті жасалғанша). Нақты режимде 404.
  r.post("/venue/application/dev-approve", async (c) => {
    if (!devToolsFor(cfg, c.get("user").telegramId)) return c.json({ ok: false, error: "disabled" }, 404);
    const a = await current(c.get("user").id);
    if (!a || a.status !== "review") return c.json({ ok: false, error: "not_in_review" }, 409);
    const venueId = await approve(db, a);
    await notify?.application(a.id);
    return c.json({ ok: true, venueId });
  });
  return r;
}

const translit = (t: string) => {
  const map: Record<string, string> = { а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", қ: "q", л: "l", м: "m", н: "n", ң: "n", о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ұ: "u", ү: "u", ф: "f", х: "h", һ: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "yu", я: "ya" };
  return [...t.toLowerCase()].map((ch) => map[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "venue";
};

/** Мақұлдау: мекеме (белсенді), филиалдар (күн сайынғы кесте), иесі ретінде өтінім берушінің өзі */
export async function approve(db: Db, a: typeof venueApplications.$inferSelect) {
  const d = a.data as AppData;
  return db.transaction(async (tx) => {
    const [v] = await tx.insert(venues).values({ slug: `${translit(d.name ?? "venue")}-${randomInt(1000, 10000)}`, name: d.name!, kind: d.kind!, city: "karaganda", about: d.about ?? null,
      logoUrl: d.logoUrl ?? null, coverUrl: d.coverUrl ?? null, gallery: d.gallery ?? [], status: "active" }).returning();
    // Негізгі ақша алушы (0034) — өтінімдегі заңды тұлға; франшиза филиалдарына Басқару кейін бөлек алушы қосады
    const [pe] = await tx.insert(venuePayees).values({ venueId: v.id, legalName: d.legalName || d.name!, bin: d.bin || null, iban: d.iban ? d.iban.replace(/\s/g, "").toUpperCase() : null, bank: d.iban ? bankOf(d.iban)?.[0] ?? null : null, isMain: true }).returning({ id: venuePayees.id });
    for (const b of d.branches ?? []) await tx.insert(branches).values({ venueId: v.id, address: b.address, payeeId: pe.id, hours: { days: Array.from({ length: 7 }, () => ({ on: true, open: b.open, close: b.close })) } });
    await tx.insert(venueStaff).values({ venueId: v.id, userId: a.userId, role: "owner" }).onConflictDoNothing();
    await tx.update(venueApplications).set({ status: "approved", venueId: v.id, decidedAt: new Date() }).where(eq(venueApplications.id, a.id));
    await tx.execute(sql`select 1`);
    return v.id;
  });
}

export type ApplyCtx = Context<Env>;
