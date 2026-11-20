// Сынақ провайдері: ақша жүрмейді, бірақ нақты провайдердің барлық күйін қайталайды — бірден өту, 3-D Secure, бас тарту.
// Криптограмма — «test:» + base64(JSON {last4, brand, exp, holder}); карта нөмірінің өзі ешқашан жіберілмейді.
// Сценарийлер соңғы 4 цифр бойынша (провайдерлердің сынақ карталары сияқты):
//   •• 4242 — бірден өтеді;  •• 0002 — банк бас тартты;  •• 9995 — қаражат жеткіліксіз;  басқасы — 3-D Secure растауы сұралады.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CardInfo, ChargeResult, PaymentProvider, WebhookEvent } from "./types.js";
import { PaymentError } from "./types.js";

export function parseTestCryptogram(c: string): Omit<CardInfo, "token"> {
  if (!c.startsWith("test:")) throw new PaymentError("bad_card");
  let j: { last4?: string; brand?: string; exp?: string; holder?: string };
  try { j = JSON.parse(Buffer.from(c.slice(5), "base64").toString("utf8")); } catch { throw new PaymentError("bad_card"); }
  if (!/^\d{4}$/.test(j.last4 ?? "") || !/^\d{2}\/\d{2}$/.test(j.exp ?? "")) throw new PaymentError("bad_card");
  const [mm, yy] = j.exp!.split("/").map(Number);
  if (mm < 1 || mm > 12) throw new PaymentError("bad_card");
  return { brand: (j.brand || "Карта").slice(0, 20), last4: j.last4!, expMonth: mm, expYear: 2000 + yy, holder: j.holder?.slice(0, 60) ?? null };
}
/** Тесттерге және мини апптың сынақ режиміне: криптограмма жасау (карта нөмірінсіз) */
export const makeTestCryptogram = (last4: string, exp = "08/28", brand = "Visa", holder = "TEST USER") => "test:" + Buffer.from(JSON.stringify({ last4, brand, exp, holder })).toString("base64");

export function testProvider(secret: string, keys: string[] = [secret]): PaymentProvider & { sign(body: string): string } {
  const sign = (body: string) => createHmac("sha256", secret).update("testpay:" + body).digest("hex");
  const signOk = (body: string, got: string) => keys.some((k) => { const w = Buffer.from(createHmac("sha256", k).update("testpay:" + body).digest("hex")); const g = Buffer.from(got); return w.length === g.length && timingSafeEqual(w, g); });
  const tokenOf = (card: Omit<CardInfo, "token">, userId: string) => "tok_" + createHmac("sha256", secret).update(`${userId}:${card.last4}:${card.expMonth}:${card.expYear}`).digest("hex").slice(0, 24);
  /** Токеннен соңғы 4 цифрды қайта табу үшін: сынақта токенге жазып қоямыз */
  const cards = new Map<string, Omit<CardInfo, "token">>();
  return {
    name: "test",
    sign,
    async tokenize(cryptogram, user) {
      const c = parseTestCryptogram(cryptogram);
      const token = tokenOf(c, user.id); cards.set(token, c);
      return { token, ...c };
    },
    async charge(i): Promise<ChargeResult> {
      const externalId = "test_" + randomUUID();
      let c: Omit<CardInfo, "token"> | undefined;
      let token = i.card.token;
      if (i.card.cryptogram) { c = parseTestCryptogram(i.card.cryptogram); if (i.card.save) { token = tokenOf(c, i.user.id); cards.set(token, c); } }
      else if (token) c = cards.get(token) ?? { brand: "Карта", last4: token.endsWith("0002") ? "0002" : "4242", expMonth: 12, expYear: 2030 };
      if (!c) return { status: "failed", reason: "provider_error" };
      const now = new Date(); const expired = c.expYear < now.getFullYear() || (c.expYear === now.getFullYear() && c.expMonth < now.getMonth() + 1);
      if (expired) return { status: "failed", externalId, reason: "expired_card" };
      if (c.last4 === "0002") return { status: "failed", externalId, reason: "declined" };
      if (c.last4 === "9995") return { status: "failed", externalId, reason: "insufficient_funds" };
      const card = token && i.card.save ? { token, ...c } : undefined;
      // Сақталған карта (токен) және «•• 4242» — 3-D Secure-сіз; жаңа басқа карта — банк растауы
      if (c.last4 === "4242" || (i.card.token && !i.card.cryptogram)) return { status: "paid", externalId, card };
      return { status: "action_required", externalId, confirmUrl: `app:/pay/3ds/${i.paymentId}` };
    },
    async webhook(req): Promise<WebhookEvent | null> {
      if (!signOk(req.body, req.headers["x-test-signature"] ?? "")) return null;
      try { const j = JSON.parse(req.body) as WebhookEvent; return j.externalId && (j.status === "paid" || j.status === "failed") ? j : null; } catch { return null; }
    },
    // Сынақта ақша жүрмейді: қайтару бірден «өтті». Сәтсіз қайтаруды тексеру — externalId «test_fail» деп басталса
    async refund(externalId, amount) { return externalId.startsWith("test_fail") || amount <= 0 ? { ok: false, reason: "declined" } : { ok: true }; },
  };
}
