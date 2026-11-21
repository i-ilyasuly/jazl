// Telegram анимациялық эмодзилері: Bot API (getStickerSet → getFile → файл) — желісіз, жалған fetch-пен
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { emojiRoutes } from "../src/routes/emoji.js";
import type { Config } from "../src/config.js";

const cfg = { BOT_TOKEN: "123:TEST" } as unknown as Config;
const lottie = { v: "5.5.2", fr: 60, w: 512, h: 512, layers: [] };
function fake() {
  const calls: string[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url); calls.push(u.replace(/bot[^/]+/, "bot***"));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.endsWith("/getStickerSet")) return Response.json({ ok: body.name === "AnimatedEmojies", result: { stickers: [{ emoji: "👉", file_id: "F1", is_animated: true }, { emoji: "⭐️", file_id: "F2", is_animated: true }, { emoji: "💸", file_id: "F3", is_animated: true }] } });
    if (u.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: `stickers/${body.file_id}.tgs` } });
    if (u.includes("/file/bot")) return new Response(gzipSync(Buffer.from(JSON.stringify(lottie))));
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

describe("GET /v1/emoji/:slug", () => {
  it("Telegram жиынтығынан алып, Lottie JSON береді және кэштейді", async () => {
    const { f, calls } = fake(); const app = emojiRoutes(cfg, f);
    const r = await app.request("/point_right");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("max-age");
    expect(await r.json()).toEqual(lottie);
    const n = calls.length;
    expect((await app.request("/point_right")).status).toBe(200);
    expect(calls.length).toBe(n); // екінші рет Telegram-ға бармайды
  });
  it("вариация таңбасы бар эмодзиді (⭐️) де табады", async () => {
    const { f } = fake(); const r = await emojiRoutes(cfg, f).request("/star");
    expect(r.status).toBe(200);
  });
  it("бірінші үміткер жоқ болса — келесісін алады (🏷 жоқ → 💸)", async () => {
    const { f } = fake(); expect((await emojiRoutes(cfg, f).request("/cheap")).status).toBe(200);
  });
  it("рұқсат етілмеген не жиынтықта жоқ эмодзи — 404", async () => {
    const { f } = fake(); const app = emojiRoutes(cfg, f);
    expect((await app.request("/skull")).status).toBe(404);
    expect((await app.request("/fire")).status).toBe(404);
  });
  it("Telegram қолжетімсіз болса — 502, токен жауапқа шықпайды", async () => {
    const f = (async () => { throw new Error("down 123:TEST"); }) as unknown as typeof fetch;
    const r = await emojiRoutes(cfg, f).request("/bell");
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("123:TEST");
  });
});
