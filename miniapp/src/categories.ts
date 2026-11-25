// Ұсыныс санаттары — backend/src/categories.ts-пен бірдей (екеуін бірге өзгерт). Сақталатыны — қазақша атауы (kk).
// Мекеме тізімнен таңдайды; клиент іздеуі екі тілде де табады («суши» / «роллы» т.б. — kk + ru).
import { kk } from "./i18n";

export type CatKind = "food" | "coffee" | "hair";
export const CATEGORIES: Record<CatKind, { kk: string; ru: string }[]> = {
  food: [
    { kk: kk("Дөнер"), ru: kk("Донер") }, { kk: kk("Бургер"), ru: kk("Бургер") }, { kk: kk("Пицца"), ru: kk("Пицца") }, { kk: kk("Суши"), ru: kk("Суши") },
    { kk: kk("Бизнес-ланч"), ru: kk("Бизнес-ланч") }, { kk: kk("Комбо"), ru: kk("Комбо") }, { kk: kk("Тауық"), ru: kk("Курица") }, { kk: kk("Ұлттық тағам"), ru: kk("Национальная кухня") },
    { kk: kk("Таңғы ас"), ru: kk("Завтрак") },
    { kk: kk("Салат"), ru: kk("Салат") }, { kk: kk("Десерт"), ru: kk("Десерт") }, { kk: kk("Нан-тоқаш"), ru: kk("Выпечка") }, { kk: kk("Сусын"), ru: kk("Напитки") }, { kk: kk("Басқа"), ru: kk("Другое") },
  ],
  coffee: [{ kk: kk("Кофе"), ru: kk("Кофе") }, { kk: kk("Шай"), ru: kk("Чай") }, { kk: kk("Десерт"), ru: kk("Десерт") }, { kk: kk("Таңғы ас"), ru: kk("Завтрак") }, { kk: kk("Басқа"), ru: kk("Другое") }],
  hair: [
    { kk: kk("Ерлер шаш қию"), ru: kk("Мужская стрижка") }, { kk: kk("Әйелдер шаш қию"), ru: kk("Женская стрижка") }, { kk: kk("Балалар"), ru: kk("Детская стрижка") },
    { kk: kk("Сақал"), ru: kk("Борода") }, { kk: kk("Шаш бояу"), ru: kk("Окрашивание") }, { kk: kk("Күтім"), ru: kk("Уход") }, { kk: kk("Басқа"), ru: kk("Другое") },
  ],
};
/** Сақталған санаттың (kk) екі тілдегі түрі — іздеу үшін. Ескі еркін мәтін болса — өзі. */
export function catBoth(cat?: string | null): string {
  if (!cat) return "";
  for (const list of Object.values(CATEGORIES)) { const c = list.find((x) => x.kk === cat); if (c) return `${c.kk} ${c.ru}`; }
  return cat;
}
/** Мекеме тілінде көрсету */
export const catLabel = (cat: string, lang: "kk" | "ru") => (lang === "ru" ? Object.values(CATEGORIES).flat().find((x) => x.kk === cat)?.ru ?? cat : cat);
