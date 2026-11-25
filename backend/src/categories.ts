// Ұсыныс санаттары (Патша, 2026-11-25, іздеу 2-кезең): тізімнен таңдалады — іздеу мен сүзгі дұрыс жұмыс істеуі үшін.
// offers.category ішіне қазақша атауы (kk) жазылады; мини апп (miniapp/src/categories.ts) дәл осы тізімді қолданады — екеуін бірге өзгерт.
// hint — Gemini Decision 1 моделіне түсінік (тауар мысалдары), клиентке көрінбейді.
export type Kind = "food" | "coffee" | "hair";
export interface Category { id: string; kk: string; ru: string; hint: string }

export const CATEGORIES: Record<Kind, Category[]> = {
  food: [
    { id: "doner", kk: "Дөнер", ru: "Донер", hint: "doner, shawarma, lavash wraps, донер, шаурма" },
    { id: "burger", kk: "Бургер", ru: "Бургер", hint: "burgers, cheeseburgers, бургер" },
    { id: "pizza", kk: "Пицца", ru: "Пицца", hint: "pizza, пицца" },
    { id: "sushi", kk: "Суши", ru: "Суши", hint: "sushi, rolls, sets, Japanese food, суши, роллы, сеты" },
    { id: "lunch", kk: "Бизнес-ланч", ru: "Бизнес-ланч", hint: "business lunch, set lunch, first and second course, түскі ас, обед" },
    { id: "combo", kk: "Комбо", ru: "Комбо", hint: "combo meal with a drink or fries" },
    { id: "chicken", kk: "Тауық", ru: "Курица", hint: "fried chicken, wings, nuggets, тауық, курица" },
    { id: "national", kk: "Ұлттық тағам", ru: "Национальная кухня", hint: "plov, beshbarmak, manty, lagman, palau, ұлттық тағам" },
    { id: "salad", kk: "Салат", ru: "Салат", hint: "salads, bowls, healthy food" },
    { id: "dessert", kk: "Десерт", ru: "Десерт", hint: "cakes, desserts, ice cream, pastries, торт" },
    { id: "bakery", kk: "Нан-тоқаш", ru: "Выпечка", hint: "bakery, bread, samsa, pies, бәліш, самса" },
    { id: "drinks", kk: "Сусын", ru: "Напитки", hint: "drinks, lemonade, juice, tea" },
    { id: "other", kk: "Басқа", ru: "Другое", hint: "anything that does not fit the other categories" },
  ],
  coffee: [
    { id: "coffee", kk: "Кофе", ru: "Кофе", hint: "coffee, latte, cappuccino, americano, espresso" },
    { id: "tea", kk: "Шай", ru: "Чай", hint: "tea, matcha" },
    { id: "dessert", kk: "Десерт", ru: "Десерт", hint: "cakes, croissants, desserts" },
    { id: "breakfast", kk: "Таңғы ас", ru: "Завтрак", hint: "breakfast, sandwiches, porridge" },
    { id: "other", kk: "Басқа", ru: "Другое", hint: "anything else" },
  ],
  hair: [
    { id: "men", kk: "Ерлер шаш қию", ru: "Мужская стрижка", hint: "men's haircut, барбер" },
    { id: "women", kk: "Әйелдер шаш қию", ru: "Женская стрижка", hint: "women's haircut, styling" },
    { id: "kids", kk: "Балалар", ru: "Детская стрижка", hint: "children's haircut" },
    { id: "beard", kk: "Сақал", ru: "Борода", hint: "beard trim, shave" },
    { id: "color", kk: "Шаш бояу", ru: "Окрашивание", hint: "hair coloring" },
    { id: "care", kk: "Күтім", ru: "Уход", hint: "hair care, treatments, masks" },
    { id: "other", kk: "Басқа", ru: "Другое", hint: "anything else" },
  ],
};
