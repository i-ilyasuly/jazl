// Клиент IP-і (аудит 2026-11-25): X-Forwarded-For басын клиент өзі жаза алады — IP_HOPS берілсе, оңнан санаймыз
import { describe, expect, it } from "vitest";
import { ipFrom } from "../src/rateLimit.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db/client.js";

describe("ipFrom", () => {
  it("IP_HOPS жоқ — бұрынғыдай бірінші мән", () => {
    expect(ipFrom("6.6.6.6, 1.2.3.4", 0)).toBe("6.6.6.6");
  });
  it("IP_HOPS=1 — прокси соңынан қосқан мән (клиент жазған жалған мән елеусіз)", () => {
    expect(ipFrom("6.6.6.6, 1.2.3.4", 1)).toBe("1.2.3.4");
    expect(ipFrom("1.2.3.4", 1)).toBe("1.2.3.4");
  });
  it("IP_HOPS=2 — алдында жүктеме теңестіргіш болса", () => {
    expect(ipFrom("6.6.6.6, 1.2.3.4, 35.1.1.1", 2)).toBe("1.2.3.4");
    expect(ipFrom("1.2.3.4", 2)).toBe("1.2.3.4");
  });
  it("тақырып жоқ — undefined", () => {
    expect(ipFrom(undefined, 1)).toBeUndefined();
  });
});

describe("/cron/ip", () => {
  const cfg = loadConfig({ DATABASE_URL: "postgres://x", BOT_TOKEN: "123:abc", NODE_ENV: "test", CRON_KEY: "k".repeat(20) });
  const app = createApp(cfg, {} as Db);
  it("кілтсіз — 404", async () => {
    expect((await app.request("/cron/ip")).status).toBe(404);
  });
  it("кілтпен — тақырыпты көрсетеді", async () => {
    const r = await app.request("/cron/ip", { headers: { "X-Cron-Key": "k".repeat(20), "X-Forwarded-For": "6.6.6.6, 1.2.3.4" } });
    expect(await r.json()).toMatchObject({ ok: true, xff: "6.6.6.6, 1.2.3.4", chosen: "6.6.6.6", hops: 0 });
  });
});
