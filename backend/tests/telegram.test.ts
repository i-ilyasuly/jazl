import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "../src/auth/telegram.js";

const TOKEN = "123456:TEST-token-not-real";
const now = 1_800_000_000;
const user = JSON.stringify({ id: 42, first_name: "Айгерім", language_code: "kk" });

describe("initData тексеру", () => {
  it("дұрыс қолтаңба өтеді", () => {
    const raw = signInitData({ auth_date: String(now - 60), user, query_id: "AAA" }, TOKEN);
    const r = validateInitData(raw, TOKEN, 3600, now);
    expect(r.ok && r.user.id).toBe(42);
  });
  it("өзгертілген дерек өтпейді", () => {
    const raw = signInitData({ auth_date: String(now - 60), user }, TOKEN).replace("42", "43");
    expect(validateInitData(raw, TOKEN, 3600, now)).toEqual({ ok: false, reason: "bad_hash" });
  });
  it("басқа бот токенімен қол қойылғаны өтпейді", () => {
    const raw = signInitData({ auth_date: String(now - 60), user }, "999:OTHER");
    expect(validateInitData(raw, TOKEN, 3600, now).ok).toBe(false);
  });
  it("ескірген initData өтпейді", () => {
    const raw = signInitData({ auth_date: String(now - 7200), user }, TOKEN);
    expect(validateInitData(raw, TOKEN, 3600, now)).toEqual({ ok: false, reason: "expired" });
  });
  it("бос initData", () => expect(validateInitData("", TOKEN, 3600, now)).toEqual({ ok: false, reason: "missing" }));
});
