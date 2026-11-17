// Провайдерді таңдау: PAYMENTS_PROVIDER (әзірге тек test). Нақты провайдер қосу:
//   1) src/payments/<name>.ts — PaymentProvider-ды жүзеге асыру (charge, tokenize, webhook — қолтаңбаны міндетті тексеру);
//   2) config.ts: PAYMENTS_PROVIDER енумына қосу, кілттер — Secret Manager арқылы;
//   3) мини апп: src/pay/tokenize.ts — провайдердің JS-кітапханасымен криптограмма жасау (карта нөмірі серверге келмейді).
import type { Config } from "../config.js";
import type { PaymentProvider } from "./types.js";
import { testProvider } from "./test.js";

const cache = new WeakMap<Config, PaymentProvider>();
export function paymentProvider(cfg: Config): PaymentProvider {
  let p = cache.get(cfg);
  if (!p) { p = testProvider(cfg.BOT_TOKEN); cache.set(cfg, p); }
  return p;
}
export type { CardInfo, ChargeResult, FailReason, PaymentProvider, WebhookEvent } from "./types.js";
