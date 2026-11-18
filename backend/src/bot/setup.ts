// Боттың баптауларын бір рет орнату (Cloud Run job: node dist/bot/setup.js). Қайта іске қосуға болады — нәтиже бірдей.
// Ретімен: getMe (дұрыс бот па) → мәзір батырмасы (тіркелген Mini App доменімен) → командалар → сипаттамалар → вебхук.
import type { Config } from "../config.js";
import { tgApi, webhookSecret, type TgCall } from "./api.js";
import { COMMANDS, DESCRIPTION, LANGS, MENU_TEXT, SHORT } from "./texts.js";

export async function runSetup(cfg: Config, call: TgCall = tgApi(cfg), log: (s: string) => void = console.log) {
  const step = async (name: string, method: string, body?: unknown) => {
    const r = await call(method, body);
    log(`${r.ok ? "✓" : "✗"} ${name}${r.ok ? "" : ` — ${r.description ?? "қате"}`}`);
    return r;
  };
  const me = await call("getMe");
  const username = (me.result as { username?: string } | undefined)?.username;
  if (!me.ok || username?.toLowerCase() !== cfg.MINIAPP_BOT_USERNAME.toLowerCase()) {
    log(`✗ Бот табылмады не басқа бот (${username ?? "?"}), күтілгені @${cfg.MINIAPP_BOT_USERNAME} — ештеңе өзгертілмеді`);
    return false;
  }
  log(`✓ Бот: @${username}`);
  // Мәзір батырмасы: Mini App тек тіркелген доменде жұмыс істейді (Bot API 10.2) — бар батырманың мекенжайын сақтаймыз
  const cur = await call("getChatMenuButton");
  const curUrl = (cur.result as { type?: string; web_app?: { url?: string } } | undefined)?.web_app?.url;
  const url = curUrl || cfg.ADMIN_WEB_URL;
  log(`  Mini App мекенжайы: ${url}${curUrl ? " (бұрынғы)" : " (жаңа)"}`);
  await step("Мәзір батырмасы «Medeo»", "setChatMenuButton", { menu_button: { type: "web_app", text: MENU_TEXT.kk, web_app: { url } } });
  for (const l of LANGS) {
    const lc = l === "kk" ? undefined : l; // қазақша — әдепкі (тілі бөлек көрсетілмеген барлық адамға), орысша — ru
    await step(`Командалар (${l})`, "setMyCommands", { commands: COMMANDS[l], ...(lc ? { language_code: lc } : {}) });
    await step(`Қысқа сипаттама (${l})`, "setMyShortDescription", { short_description: SHORT[l], ...(lc ? { language_code: lc } : {}) });
    await step(`«Бот не істей алады?» (${l})`, "setMyDescription", { description: DESCRIPTION[l], ...(lc ? { language_code: lc } : {}) });
  }
  if (!cfg.PUBLIC_URL) { log("✗ PUBLIC_URL жоқ — вебхук орнатылмады"); return false; }
  const hook = await step("Вебхук", "setWebhook", { url: cfg.PUBLIC_URL + "/bot/webhook", secret_token: webhookSecret(cfg), allowed_updates: ["message", "callback_query"], drop_pending_updates: true, max_connections: 20 });
  const info = await call("getWebhookInfo");
  const wi = info.result as { url?: string; pending_update_count?: number; last_error_message?: string } | undefined;
  log(`  Вебхук: ${wi?.url ?? "?"} · күтуде ${wi?.pending_update_count ?? 0}${wi?.last_error_message ? ` · соңғы қате: ${wi.last_error_message}` : ""}`);
  return hook.ok;
}

// Тікелей іске қосылғанда (Cloud Run job)
if (process.argv[1]?.endsWith("setup.js")) {
  const { loadConfig } = await import("../config.js");
  const ok = await runSetup(loadConfig(process.env));
  process.exit(ok ? 0 : 1);
}
