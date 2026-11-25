// Іздеу (Патша, 2026-11-25): «Тойымды» — тек сол пакет; «суши» — барлық суши; қазақ әріптері мен регистр бірдей
import { describe, expect, it } from "vitest";
import { hits, norm, score } from "../src/search";
import type { Offer } from "../src/mocks/offers";

const mk = (id: string, o: Partial<Offer>): Offer => ({ id, title: "Тест", unitWord: "дана", venue: "Мекеме", distance: "1 км", kind: "food", price: 1000, oldPrice: 1200, units: 4,
  buyers: 0, favorite: false, rating: 0, ratingCount: 0, address: "", hours: "", ...o });
const toiymdy = mk("a", { packName: "Тойымды", title: "Суши сет · 24 дана", idx: { name: "Тойымды Тойымды", title: "Суши сет Суши сет", cat: "Суши", comp: "ролл, лосось, күріш · ролл, лосось, рис", venue: "Sakura" } });
const other = mk("b", { title: "Суши сет · 12 дана", idx: { name: "", title: "Суши сет Суши сет", cat: "Суши", comp: "ролл", venue: "Tokyo" } });
const doner = mk("c", { title: "Тауық дөнер · 4 дана", idx: { name: "", title: "Тауық дөнер Куриный донер", cat: "Дөнер", comp: "лаваш, тауық", venue: "Doner House" } });
const all = [toiymdy, other, doner];
const find = (q: string) => all.filter((o) => score(o, q) > 0).sort((a, b) => score(b, q) - score(a, q)).map((o) => o.id);

describe("іздеу", () => {
  it("пакет атауы бойынша — тек сол", () => expect(find("Тойымды")).toEqual(["a"]));
  it("регистр мен қазақ әріптері бірдей", () => { expect(find("тойымды")).toEqual(["a"]); expect(find("ТОИЫМДЫ")).toEqual(["a"]); });
  it("тауар/санат бойынша — бәрі, атауы барлары жоғарыда емес, сәйкестігі бойынша", () => expect(find("суши").sort()).toEqual(["a", "b"]));
  it("орысша да табады", () => { expect(find("куриный")).toEqual(["c"]); expect(find("рис")).toEqual(["a"]); });
  it("құрам бойынша", () => expect(find("лосось")).toEqual(["a"]));
  it("бірнеше сөз — бәрі табылуы керек", () => { expect(find("суши tokyo")).toEqual(["b"]); expect(find("суши doner")).toEqual([]); });
  it("«донер» → «дөнер» (ө→о)", () => expect(find("донер")).toEqual(["c"]));
  it("санаттың жалпы сөзі: «тағам» барлық тағамды табады", () => expect(find("тағам").length).toBe(3));
  it("басы сәйкес келсе де табады (тойым → Тойымды)", () => expect(find("тойым")).toEqual(["a"]));
  it("ұзындық сақталады — ерекшелеу дәл", () => { expect(norm("Тойымды").length).toBe(7); expect(hits("Тойымды сет", "тойымды")).toEqual([[0, 7]]); });
});
