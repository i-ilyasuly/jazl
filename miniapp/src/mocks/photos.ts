// Нақты фотолар: Unsplash (тегін пайдалану лицензиясы), сурет қызметінің өзінен жүктеледі.
// Жүктелмей қалса, карточкада бұрынғы белгіше көрінеді (onError).
const u = (id: string, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=72`;
export const photoOf: Record<string, string> = {
  doner: u("1699728088614-7d1d4277414b"),
  "lamb-doner": u("1778168199427-4e839943d20f"),
  "doner-drink": u("1719282431565-3b30bb7d2658"),
  burger: u("1568901346375-23c9450c58cd"),
  "burger-combo": u("1572802419224-296b0aeee0d9"),
  pizza: u("1513104890138-7c749659a591"),
  latte: u("1509042239860-f550ce710b93"),
  cappuccino: u("1572442388796-11668a67e53d"),
  americano: u("1495474472287-4d71bcdd2085"),
  haircut: u("1503951914875-452162b0f3f1"),
  "mens-cut": u("1585747860715-2ba37e788b70"),
};
export const tilePhoto = { food: u("1568901346375-23c9450c58cd", 500), coffee: u("1509042239860-f550ce710b93", 600), hair: u("1503951914875-452162b0f3f1", 600) };
export const coverPhoto = { food: u("1699728088614-7d1d4277414b", 900), coffee: u("1554118811-1e0d58224f24", 900), hair: u("1585747860715-2ba37e788b70", 900) };

/** Ұсыныс бетіндегі сырғытылатын галерея: өз фотосы, сол санаттағы басқа фотолар, мекеме мұқабасы. */
export function galleryOf(id: string, kind: "food" | "coffee" | "hair"): string[] {
  const same: Record<string, string[]> = { food: ["doner", "lamb-doner", "doner-drink", "burger-combo", "pizza"], coffee: ["latte", "cappuccino", "americano"], hair: ["haircut", "mens-cut"] };
  const list = [photoOf[id], ...same[kind].filter((k) => k !== id).map((k) => photoOf[k]), coverPhoto[kind]].filter(Boolean) as string[];
  return [...new Set(list)].slice(0, 5);
}
