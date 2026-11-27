// re:Kassa Partner API клиенті (2026-11-27): онлайн-касса арқылы фискалдық чек шығару.
// Құжаттама: https://api-docs.rekassa.kz (openapi.yaml, errors.html). Кілттер — Secret Manager-де, репоға емес.
//  • Кіру: POST /api/auth/login?apiKey=…&format=json {number, password} → JWT, касса id, кассаның паролі (ауысымды жабуға)
//  • Чек: POST /api/crs/{id}/tickets + X-Request-ID (ауысым ішінде қайталанудан қорғау)
//  • Ауысым мерзімі өтсе: POST /api/crs/{id}/shifts/{n}/close (cash-register-password) → чекті қайта жібереміз
//  • Жауап жоғалса: соңғы екі ауысымның чектерінен externalId бойынша іздейміз (соқыр қайталау — қос чек қаупі)
//  • ОФД қолжетімсіз болса re:Kassa чекті өзі офлайн сақтап, 200 + offline: true қайтарады — өз кезегімізді құрмаймыз

export type Money = { bills: string; coins: number };
export const money = (tenge: number): Money => ({ bills: String(Math.trunc(tenge)), coins: Math.round((tenge - Math.trunc(tenge)) * 100) });

/** Қатенің класы (errors.html): retry — кейін қайталау; fix — дерек/күй қате; auth — қайта кіру; block — касса бұғатталған; shift — ауысымды жабу керек */
export type ErrorClass = "retry" | "fix" | "auth" | "block" | "shift";
const RETRY = new Set(["SERVICE_TEMPORARILY_UNAVAILABLE", "UNKNOWN_ERROR", "UNEXPECTED_ERROR"]);
const AUTH = new Set(["PERMISSION_ERROR", "USER_PERMISSION_ERROR", "INVALID_TOKEN"]);
const BLOCK = new Set(["CASH_REGISTER_BLOCKED", "BLOCKED", "UNKNOWN_ID", "PROTOCOL_ERROR", "UNKNOWN_COMMAND", "UNSUPPORTED_COMMAND", "SSL_IS_NOT_ALLOWED", "INVALID_CONFIGURATION"]);
const SHIFT = new Set(["CASH_REGISTER_SHIFT_PERIOD_EXPIRED", "OPEN_SHIFT_TIMEOUT_EXPIRED"]);
export function classify(http: number, code: string | null): ErrorClass {
  if (code && SHIFT.has(code)) return "shift";
  if (code && BLOCK.has(code)) return "block";
  if (code && RETRY.has(code)) return "retry";
  if (http === 401 || (code && AUTH.has(code))) return "auth";
  if (http >= 500 || http === 0) return "retry";
  return "fix";
}

export class RekassaError extends Error {
  /** unknown — жауап келмеді (желі/уақыт): чек шықты ма — белгісіз */
  /** detail — re:Kassa жауабының мәтіні (қате себебін логта көру үшін, 500 таңбаға дейін) */
  constructor(public code: string, public http: number, public cls: ErrorClass, public unknown = false, public detail = "") { super(`rekassa ${http} ${code}`); }
}

export type TicketKind = "sell" | "sell_return";
/** Қайтару чегіндегі бастапқы (сату) чек: ОФД протоколы 2.0.3+ талабы — ФП, күні-уақыты, сомасы, офлайн белгісі, касса РНМ-і */
export interface ParentTicket { number: string; at: ReturnType<typeof protocolNow>; total: Money; offline: boolean; kkmId: string | null }
export interface TicketInput { requestId: string; kind: TicketKind; title: string; amount: number; parent?: ParentTicket | null }
export interface TicketResult { ticketId: number; ticketNumber: string | null; qrUrl: string | null; shiftNumber: number | null; offline: boolean }

export interface RekassaOptions { url: string; apiKey: string; number: string; password: string; fetch?: typeof fetch; now?: () => Date }

/** Алматы уақыты (UTC+5) протокол пішімінде. re:Kassa уақытты бәрібір кассаның өз уақытымен ауыстырады. */
function protocolNow(d: Date) {
  const a = new Date(d.getTime() + 5 * 3600_000);
  return { date: { year: String(a.getUTCFullYear()), month: String(a.getUTCMonth() + 1), day: String(a.getUTCDate()) },
    time: { hour: String(a.getUTCHours()), minute: String(a.getUTCMinutes()), second: String(a.getUTCSeconds()) } };
}

/** Чек денесі (TicketRequest): бір позиция — қызмет пакеті, карта арқылы төлем. ҚҚС-сыз (салық режимі нақтыланған соң кеңейтіледі). */
export function ticketBody(t: TicketInput, now: Date) {
  const sum = money(t.amount);
  return {
    operation: t.kind === "sell" ? "OPERATION_SELL" : "OPERATION_SELL_RETURN",
    dateTime: protocolNow(now),
    domain: { type: "DOMAIN_SERVICES" },
    items: [{ type: "ITEM_TYPE_COMMODITY", commodity: { name: t.title.slice(0, 128), sectionCode: "1", quantity: 1000, price: sum, sum, measureUnitCode: "796", auxiliary: [{ key: "UNIT_TYPE", value: "PIECE" }] } }],
    payments: [{ type: "PAYMENT_CARD", sum }],
    amounts: { total: sum, taken: sum, change: money(0) },
    // Өріс атаулары — re:Kassa протоколының өзіндегідей (kkm.proto.TicketRequest.ParentTicket; «DataTime» — олардың жазылуы).
    // Бесеуі де міндетті; kgdKkmId — бастапқы чек шыққан кассаның РНМ-і (re:Kassa қосымшасы да солай толтырады)
    ...(t.kind === "sell_return" && t.parent ? { parentTicket: { parentTicketNumber: t.parent.number, parentTicketDataTime: t.parent.at,
      kgdKkmId: t.parent.kkmId ?? "", parentTicketTotal: t.parent.total, parentTicketIsOffline: t.parent.offline } } : {}),
  };
}

type Session = { token: string; id: number; crPassword: string | null };

export function rekassaClient(o: RekassaOptions) {
  const f = o.fetch ?? fetch;
  const base = o.url.replace(/\/+$/, "");
  let session: Session | null = null;

  async function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}) {
    let res: Response;
    try {
      res = await f(base + path, { method, headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.auth === false ? {} : { Authorization: "Bearer " + session!.token }), ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(30_000) });
    } catch { throw new RekassaError("NETWORK", 0, "retry", true); }
    const text = await res.text();
    let json: Record<string, unknown> | null = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const code = typeof json?.code === "string" ? json.code : "HTTP_" + res.status;
      throw new RekassaError(code, res.status, classify(res.status, typeof json?.code === "string" ? json.code : null), res.status >= 500, text.slice(0, 500));
    }
    return json;
  }

  async function login(): Promise<Session> {
    let j: Record<string, unknown> | null;
    try { j = await call("POST", `/api/auth/login?apiKey=${encodeURIComponent(o.apiKey)}&format=json`, { auth: false, body: { number: o.number, password: o.password } }); }
    catch (e) { if (e instanceof RekassaError && e.cls !== "retry") throw new RekassaError(e.code, e.http, "auth"); throw e; }
    if (!j?.token || typeof j.id !== "number") throw new RekassaError("BAD_LOGIN_RESPONSE", 200, "fix");
    session = { token: String(j.token), id: j.id, crPassword: typeof j.cashRegisterPassword === "string" ? j.cashRegisterPassword : null };
    return session;
  }

  /** Кіріп алып шақыру; 401 болса — бір рет қайта кіру */
  async function authed(method: string, path: (s: Session) => string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
    if (!session) await login();
    try { return await call(method, path(session!), init); }
    catch (e) {
      if (!(e instanceof RekassaError) || e.cls !== "auth") throw e;
      await login();
      return call(method, path(session!), init);
    }
  }

  async function cashRegister() {
    return (await authed("GET", (s) => `/api/crs/${s.id}`)) as { shiftNumber?: number; shiftOpen?: boolean } | null;
  }

  /** Ағымдағы ауысымды жабу (Z-есеп). Ауысым ашық болмаса — ештеңе істемейді. */
  async function closeShift() {
    const cr = await cashRegister();
    if (!cr?.shiftOpen || !cr.shiftNumber) return false;
    if (!session?.crPassword) throw new RekassaError("NO_CASH_REGISTER_PASSWORD", 0, "block");
    await authed("POST", (s) => `/api/crs/${s.id}/shifts/${cr.shiftNumber}/close`, { headers: { "X-Request-ID": `close-${cr.shiftNumber}`, "cash-register-password": session?.crPassword ?? "" } });
    return true;
  }

  const toResult = (j: Record<string, unknown> | null): TicketResult => ({
    ticketId: Number(j?.id), ticketNumber: (j?.ticketNumber as string | null) ?? (j?.offlineTicketNumber as string | null) ?? null,
    qrUrl: (j?.qrCode as string | null) ?? null, shiftNumber: typeof j?.shiftNumber === "number" ? j.shiftNumber : null, offline: Boolean(j?.offline),
  });

  /** Ағымдағы ауысым нөмірі (чекті жіберер алдында жазылады) */
  async function currentShift(): Promise<number | null> {
    const cr = await cashRegister();
    return cr?.shiftNumber ?? null;
  }

  /** Жауап жоғалған чекті соңғы екі ауысымнан (ашығы мен алдыңғысы) externalId бойынша іздеу */
  async function findTicket(requestId: string): Promise<TicketResult | null> {
    const sh = await authed("GET", (s) => `/api/crs/${s.id}/shifts?includeOpen=true&size=2`) as { _embedded?: { shifts?: { shiftNumber?: number }[] } } | null;
    const nums = [...new Set([...(sh?._embedded?.shifts ?? []).map((x) => x.shiftNumber).filter((n): n is number => typeof n === "number"), ...[await currentShift()].filter((n): n is number => typeof n === "number")])];
    for (const n of nums) {
      for (let page = 0; page < 50; page++) {
        const j = await authed("GET", (s) => `/api/crs/${s.id}/shifts/${n}/tickets?page=${page}&size=100`) as { _embedded?: { tickets?: Record<string, unknown>[] }; page?: { totalPages?: number } } | null;
        const hit = j?._embedded?.tickets?.find((t) => t.externalId === requestId);
        if (hit) return toResult(hit);
        if (!j?.page?.totalPages || page + 1 >= j.page.totalPages) break;
      }
    }
    return null;
  }

  /** Бастапқы чектің деректері (қайтару үшін): GET /api/crs/{id}/tickets/{ticketId}. messageTime — кассаның жергілікті уақыты */
  async function parentOf(ticketId: number): Promise<ParentTicket | null> {
    const j = await authed("GET", (s) => `/api/crs/${s.id}/tickets/${ticketId}`) as Record<string, any> | null;
    const number = (j?.ticketNumber as string | null) ?? (j?.offlineTicketNumber as string | null) ?? null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(j?.messageTime ?? ""));
    const total = j?.data?.ticket?.amounts?.total as Money | undefined;
    if (!number || !m || !total || !j?.data?.service?.regInfo?.kkm?.fnsKkmId) return null;
    const n = (x: string) => String(Number(x));
    return { number, offline: Boolean(j?.offline), total, kkmId: (j?.data?.service?.regInfo?.kkm?.fnsKkmId as string | undefined) ?? null,
      at: { date: { year: m[1], month: n(m[2]), day: n(m[3]) }, time: { hour: n(m[4]), minute: n(m[5]), second: n(m[6]) } } };
  }

  /** Чектің клиентке берілгенін тіркеу (re:Kassa талабы, 3-қадам): QR — чек Medeo түбіртегінде QR болып көрсетіледі */
  async function registerReceipt(ticketId: number, type: "QR" | "DOWNLOAD" = "QR") {
    await authed("POST", (s) => `/api/crs/${s.id}/tickets/${ticketId}/receipts`, { body: { type } });
  }

  /** Чек шығару. Ауысым мерзімі өтсе — жабып, бір рет қайта жібереді. */
  async function ticket(t: TicketInput): Promise<TicketResult> {
    const send = () => authed("POST", (s) => `/api/crs/${s.id}/tickets`, { body: ticketBody(t, o.now?.() ?? new Date()), headers: { "X-Request-ID": t.requestId } });
    try { return toResult(await send()); }
    catch (e) {
      if (!(e instanceof RekassaError) || e.cls !== "shift") throw e;
      await closeShift();
      return toResult(await send());
    }
  }

  return { login, ticket, closeShift, currentShift, findTicket, registerReceipt, parentOf };
}
export type RekassaClient = ReturnType<typeof rekassaClient>;
