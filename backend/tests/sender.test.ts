// Бот хабарын жіберу (Medeo. атауына ауысу): жаңа бот 403 берсе — ескі бот арқылы қайталанады; басқа қатеде — қайталанбайды
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { telegramSender } from "../src/notify.js";

describe("telegramSender", () => {
  const cfg = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: "1:HMAC", MINIAPP_BOT_TOKEN: "2:NEW", LEGACY_MINIAPP_BOT_TOKEN: "3:OLD", NODE_ENV: "test" });
  afterEach(() => { vi.unstubAllGlobals(); });
  const run = async (statuses: [number, string][]) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url.split("/bot")[1].split("/")[0]); const [st, body] = statuses[calls.length - 1]; return new Response(body, { status: st }); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await telegramSender(cfg)({ chatId: 1, text: "сәлем", button: { text: "Ашу", start: "v_home" } });
    return calls;
  };
  it("жаңа бот жеткізсе — тек сол", async () => { expect(await run([[200, "{}"]])).toEqual(["2:NEW"]); });
  it("жаңа ботты ашпаған (403) — ескі бот арқылы", async () => { expect(await run([[403, "Forbidden: bot can't initiate"], [200, "{}"]])).toEqual(["2:NEW", "3:OLD"]); });
  it("chat not found (400) — ескі бот арқылы; басқа 400 — қайталамайды", async () => {
    expect(await run([[400, "Bad Request: chat not found"], [200, "{}"]])).toEqual(["2:NEW", "3:OLD"]);
    expect(await run([[400, "Bad Request: message is too long"]])).toEqual(["2:NEW"]);
  });
});
