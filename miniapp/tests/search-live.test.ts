// Нақты сервер каталогымен (2026-11-25 көшірмесі) іздеу: Патша телефонда «сәні», «үлкен аппетит» таппай қалған қате
import { describe, expect, it, vi } from "vitest";
import cat from "./fixtures/catalog-2026-11-25.json";

vi.mock("../src/api", () => ({ api: () => Promise.reject(new Error("offline")) }));
describe("нақты каталогпен іздеу", async () => {
  const { applyCatalog } = await import("../src/catalog");
  const { allOffers } = await import("../src/mocks/offers");
  const { score } = await import("../src/search");
  applyCatalog(cat as never, 0, "server");
  const find = (q: string) => allOffers().filter((o) => score(o, q) > 0).map((o) => o.id).sort();
  it("пакет атауы — барлық тізімнен (санат беттеріндегілер де)", () => {
    expect(find("сәні")).toEqual(["mens-cut"]);
    expect(find("үлкен аппетит")).toEqual(["burger-combo"]);
    expect(find("Тойымды")).toEqual(["doner"]);
  });
  it("іздеу сөздері мен санат", () => {
    expect(find("шаурма")).toContain("doner");
    expect(find("барбер").sort()).toEqual(["haircut", "mens-cut"]);
    expect(find("пицца")).toEqual(["pizza"]);
  });
  it("бір ұсыныс бір рет қана", () => { const ids = allOffers().map((o) => o.id); expect(new Set(ids).size).toBe(ids.length); });
});

// «Клиент көретін көрініс» (Патша, 2026-11-25): алдын ала қарау каталогпен бір функциядан құрылады
import { offerPatch, previewOffer } from "../src/catalog";
describe("клиент көрінісі = каталог", () => {
  it("мерзімі мен фотолары мекеменің нақты деректерінен", () => {
    const o = { slug: "x", title: "Суши сет · 8 дана", kind: "food" as const, unitName: "дана", units: 8, price: 12000, regularUnitPrice: 2000, validDays: 60, photos: ["https://e/1.jpg", "https://e/2.jpg"], status: "active" as const,
      details: { packName: "Тойымды", about: "Сет" }, category: "Суши" };
    const p = offerPatch(o, "Sakura");
    expect(p).toMatchObject({ validDays: 60, photos: ["https://e/1.jpg", "https://e/2.jpg"], photo: "https://e/1.jpg", packName: "Тойымды", venue: "Sakura", oldPrice: 16000 });
    const full = previewOffer(o, "Sakura", { id: "draft-preview" });
    expect(full).toMatchObject({ id: "draft-preview", ...p, active: 0 });
  });
});
