// Касса QR-ы (Патша, 2026-11-17). Екі түрі бар:
// 1) Medeo динамикалық QR — кассир өз құрылғысында дана санын енгізеді, QR әр 30 секунд сайын жаңарады:
//      MDQ2.<branchId>.<units>.<exp>.<sig>   (sig = HMAC(BOT_TOKEN), exp — unix секунд)
//    Суретке түсіріп алып, кейін үйден сканерлеу мүмкін емес: мерзімі 30 с (+15 с кешігуге шыдам).
// 2) Банк терминалының QR-ы (Kaspi т.б.) — кассир соманы енгізеді, Medeo дана санын сомадан есептейді:
//      …br_<branchId>&amount=<теңге>  немесе  MDB1:<branchId> (бұрынғы JZQ*/JZB1 — басылған плакаттар үшін әлі оқылады)?amount=<теңге>
//    Сома 1 бірлік бағасына еселі болмаса — «сома сәйкес емес»; 2 есе болса — клиент «+» басып 2 дана таңдауы керек.
// Тұрақты QR (сомасыз br_<id>) — тек сынақ режимінде.
import { createHmac, timingSafeEqual } from "node:crypto";

export const QR_TTL_SEC = 30;
const GRACE_SEC = 15;

export type ParsedQr =
  | { kind: "session"; sessionId: string; exp: number; valid: boolean; expired: boolean }
  | { kind: "dynamic"; branchId: string; units: number; exp: number; valid: boolean; expired: boolean }
  | { kind: "amount"; branchId: string; amount: number }
  | { kind: "static"; branchId: string };

const sign = (secret: string, branchId: string, units: number, exp: number) =>
  createHmac("sha256", secret).update(`jzq2:${branchId}:${units}:${exp}`).digest("hex").slice(0, 16);

export function makeDynamicQr(secret: string, branchId: string, units: number, now = Math.floor(Date.now() / 1000)) {
  const exp = now + QR_TTL_SEC;
  return { payload: `MDQ2.${branchId}.${units}.${exp}.${sign(secret, branchId, units, exp)}`, exp, ttl: QR_TTL_SEC };
}

// 3) Кассир сеансы (Figma «Кассир: QR шығару», 2026-11-17): MDQ3.<sessionId>.<exp>.<sig> — пакет, дана, қосымша серверде (qr_sessions).
const signS = (secret: string, id: string, exp: number) => createHmac("sha256", secret).update(`jzq3:${id}:${exp}`).digest("hex").slice(0, 16);
export function makeSessionQr(secret: string, sessionId: string, now = Math.floor(Date.now() / 1000)) {
  const exp = now + QR_TTL_SEC;
  return { payload: `MDQ3.${sessionId}.${exp}.${signS(secret, sessionId, exp)}`, exp, ttl: QR_TTL_SEC };
}

export function parseQr(raw: string, secret: string, now = Math.floor(Date.now() / 1000)): ParsedQr | null {
  const t = raw.trim();
  const ss = t.match(/^(?:MD|JZ)Q3\.([0-9a-f-]{36})\.(\d{9,11})\.([0-9a-f]{16})$/i);
  if (ss) {
    const [, id, e, sig] = ss; const exp = Number(e); const sessionId = id.toLowerCase();
    const want = Buffer.from(signS(secret, sessionId, exp)); const got = Buffer.from(sig.toLowerCase());
    return { kind: "session", sessionId, exp, valid: want.length === got.length && timingSafeEqual(want, got), expired: now > exp + GRACE_SEC };
  }
  const d = t.match(/^(?:MD|JZ)Q2\.([0-9a-f-]{36})\.(\d{1,2})\.(\d{9,11})\.([0-9a-f]{16})$/i);
  if (d) {
    const [, branchId, u, e, sig] = d; const units = Number(u), exp = Number(e);
    const want = Buffer.from(sign(secret, branchId.toLowerCase(), units, exp)); const got = Buffer.from(sig.toLowerCase());
    const valid = want.length === got.length && timingSafeEqual(want, got);
    return { kind: "dynamic", branchId: branchId.toLowerCase(), units, exp, valid, expired: now > exp + GRACE_SEC };
  }
  const b = t.match(/(?:^(?:MD|JZ)B1:|startapp=br_)([0-9a-f-]{36})/i);
  if (!b) return null;
  const amount = Number(t.match(/[?&]amount=(\d{2,7})/)?.[1] ?? 0);
  return amount ? { kind: "amount", branchId: b[1].toLowerCase(), amount } : { kind: "static", branchId: b[1].toLowerCase() };
}
