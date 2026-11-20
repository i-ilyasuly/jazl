// Карта деректерін «криптограммаға» айналдыру. ЕРЕЖЕ (PCI DSS): карта нөмірі, мерзімі, CVC біздің серверге ЕШҚАШАН жіберілмейді.
// Нақты провайдерде (Halyk ePay / Freedom Pay / TipTop Pay) осы жерде провайдердің JS-кітапханасы картаны өзі шифрлайды
// не провайдердің қорғалған өрістері (iframe) пайдаланылады — серверге тек криптограмма барады.
// Сынақ провайдері: криптограмма = «test:» + base64({last4, brand, exp, holder}) — CVC мен толық нөмір мүлде қосылмайды.

export const brandOf = (n: string) => (/^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^220[0-4]/.test(n) ? "МИР" : /^9860/.test(n) ? "Humo" : "");
export const luhn = (n: string) => { let sum = 0; for (let i = 0; i < n.length; i++) { let d = +n[n.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; } return n.length >= 13 && sum % 10 === 0; };

export interface CardInput { number: string; exp: string; cvc: string; holder: string }
export interface Tokenized { cryptogram: string; brand: string; last4: string; exp: string }

/** Провайдер: «test» — сынақ (VITE_PAY_PROVIDER, әдепкі test) */
const PROVIDER = (import.meta.env.VITE_PAY_PROVIDER as string | undefined) ?? "test";

export async function tokenizeCard(c: CardInput): Promise<Tokenized> {
  const brand = brandOf(c.number) || "Карта";
  const last4 = c.number.slice(-4);
  const exp = `${c.exp.slice(0, 2)}/${c.exp.slice(2, 4)}`;
  if (PROVIDER === "test") {
    const json = JSON.stringify({ last4, brand, exp, holder: c.holder.trim() });
    return { cryptogram: "test:" + btoa(unescape(encodeURIComponent(json))), brand, last4, exp };
  }
  // Нақты провайдер қосылғанда: мысалы, провайдердің SDK-сы `createCryptogram({ number, exp, cvc })` → криптограмма
  throw new Error("payment_provider_not_configured");
}
