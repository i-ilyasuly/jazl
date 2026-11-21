// Мини апп логикасының тесттері (Патша, 2026-11-21: «кейінгі өзгерістер бір нәрсені байқатпай бұзып кетпесін»).
// Іске қосу: npm test
import { describe, expect, it } from "vitest";
import { badgesOf } from "../src/ui/badges";
import { discount, fmt, isSoldOut, unitPrice, type Offer } from "../src/mocks/offers";

const base: Offer = { id: "t-offer", title: "Тест", unitWord: "кесе", venue: "Тест", distance: "", kind: "coffee", price: 8000, oldPrice: 10000, units: 10,
  buyers: 0, favorite: false, rating: 0, ratingCount: 0, address: "", hours: "" };
const day = (d: number) => new Date(Date.now() + d * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
const emos = (o: Partial<Offer>) => badgesOf({ ...base, ...o }).map((b) => b.emo);

describe("карточка белгілері", () => {
  it("шарт орындалмаса — белгі жоқ", () => expect(emos({})).toEqual([]));
  it("ақылы: ыстық → 🔥, топ → 🔝", () => {
    expect(emos({ promo: "hot" })).toEqual(["fire"]);
    expect(emos({ promo: "top" })).toEqual(["top"]);
  });
  it("⏳ — сатылым 48 сағатта бітсе ғана", () => {
    expect(emos({ saleUntil: day(1) })).toContain("hourglass");
    expect(emos({ saleUntil: day(5) })).not.toContain("hourglass");
    expect(emos({ saleUntil: day(-2) })).not.toContain("hourglass");
  });
  it("⚡ — айлық лимиттен 10-нан аз қалса (0 емес)", () => {
    expect(emos({ limit: { monthly: 50, left: 4, perUser: null } })).toContain("zap");
    expect(emos({ limit: { monthly: 50, left: 0, perUser: null } })).not.toContain("zap");
    expect(emos({ limit: { monthly: 50, left: 30, perUser: null } })).not.toContain("zap");
  });
  it("🆕 — 7 күннен жас; ⭐ — рейтинг ≥ 4.8 және ≥ 20 баға", () => {
    expect(emos({ createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() })).toContain("new");
    expect(emos({ createdAt: new Date(Date.now() - 9 * 86400_000).toISOString() })).not.toContain("new");
    expect(emos({ rating: 4.9, ratingCount: 25 })).toContain("star");
    expect(emos({ rating: 4.9, ratingCount: 5 })).not.toContain("star");
  });
  it("рет тұрақты: ақылылар алдымен, сосын маңыздылығы бойынша", () => {
    expect(emos({ promo: "hot", rating: 5, ratingCount: 40, saleUntil: day(0), createdAt: new Date().toISOString() })).toEqual(["fire", "hourglass", "new", "star"]);
  });
});

describe("баға есептері", () => {
  it("теңге пішімі", () => { expect(fmt(10000)).toBe("10 000 ₸"); expect(fmt(950)).toBe("950 ₸"); });
  it("бір дана бағасы, жеңілдік %", () => { expect(unitPrice(base)).toBe(800); expect(discount(base)).toBe(20); });
  it("лимит таусылса — «Таусылды»", () => {
    expect(isSoldOut({ ...base, limit: { monthly: 10, left: 0, perUser: null } })).toBe(true);
    expect(isSoldOut({ ...base, limit: { monthly: null, left: null, perUser: 2 } })).toBe(false);
  });
});
