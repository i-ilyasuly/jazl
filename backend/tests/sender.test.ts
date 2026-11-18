// Бот хабарын жіберу: тек Medeo боты (ескі @oylarbot өшірілді, 2026-11-18) — қате болса қайталанбайды, тек журналға жазылады
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { telegramSender } from "../src/notify.js";

describe("telegramSender", () => {
  const cfg = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: "1:HMAC", MINIAPP_BOT_TOKEN: "2:NEW", NODE_ENV: "test" });
  afterEach(() => { vi.unstubAllGlobals(); });
  const run = async (statuses: [number, string][]) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url.split("/bot")[1].split("/")[0]); const [st, body] = statuses[calls.length - 1]; return new Response(body, { status: st }); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await telegramSender(cfg)({ chatId: 1, text: "сәлем", button: { text: "Ашу", start: "v_home" } });
    return calls;
  };
  it("Medeo боты арқылы жібереді", async () => { expect(await run([[200, "{}"]])).toEqual(["2:NEW"]); });
  it("батырма көк (style primary), мәтін кәдімгі (parse_mode жоқ)", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response("{}", { status: 200 }); }));
    await telegramSender(cfg)({ chatId: 1, text: "<сәлем>", button: { text: "Ашу", start: "v_home" } });
    expect(body.parse_mode).toBeUndefined();
    expect((body.reply_markup as { inline_keyboard: { style: string }[][] }).inline_keyboard[0][0].style).toBe("primary");
  });
  it("бот бұғатталса (403) — басқа ботқа ауыспайды", async () => { expect(await run([[403, "Forbidden: bot was blocked"]])).toEqual(["2:NEW"]); });
  it("MINIAPP_BOT_TOKEN жоқ болса — BOT_TOKEN", async () => {
    const c2 = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: "1:HMAC", NODE_ENV: "test" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url.split("/bot")[1].split("/")[0]); return new Response("{}", { status: 200 }); }));
    await telegramSender(c2)({ chatId: 1, text: "x" });
    expect(calls).toEqual(["1:HMAC"]);
  });
});
