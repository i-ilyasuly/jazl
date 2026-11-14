// Сатып алу тарихы (бэкенд қосылғанша жалған дерек)
export interface Purchase { id: string; e: string; t: string; sub: string; v: string; plus?: boolean; venue: string; date: string; method: string; txn: string }
export const history: { month: string; items: Purchase[] }[] = [
  { month: "Қараша", items: [
    { id: "h1", e: "🍔", t: "Тауық донері · 4 дана", sub: "Dämdi Doner • 8 қараша", v: "−6 000 ₸", venue: "Dämdi Doner", date: "8 қараша, 13:20", method: "Kaspi Pay", txn: "JZ-8F3K29" },
    { id: "h2", e: "✂️", t: "Шаш қию · 4 рет", sub: "Qala Barber • 3 қараша", v: "−12 000 ₸", venue: "Qala Barber", date: "3 қараша, 18:05", method: "Kaspi Pay", txn: "JZ-7C1M40" },
    { id: "h3", e: "🎁", t: "Латте · 15 стақан", sub: "Brew Point • сыйлық", v: "−27 000 ₸", venue: "Brew Point", date: "1 қараша, 10:42", method: "Visa •• 4417", txn: "JZ-6A9P13" },
  ] },
  { month: "Қазан", items: [
    { id: "h4", e: "↩️", t: "Кофе · 10 стақан", sub: "Coffee Lab • қайтарылды", v: "+18 000 ₸", plus: true, venue: "Coffee Lab", date: "27 қазан, 09:15", method: "Kaspi Pay", txn: "JZ-5R2T88" },
    { id: "h5", e: "🍔", t: "Бургер комбо · 4 дана", sub: "Bahandi • 20 қазан", v: "−10 800 ₸", venue: "Bahandi", date: "20 қазан, 19:31", method: "Kaspi Pay", txn: "JZ-4D7W56" },
  ] },
];
export const purchaseOf = (id?: string) => history.flatMap((g) => g.items).find((i) => i.id === id);
