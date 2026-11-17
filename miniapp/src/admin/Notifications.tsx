// Figma «18 · Иесіне хабарламалар» (14067:12239): хабарлама баптаулары. Хабарлар Jazl+ ботына келеді, батырмасы Басқарудың веб-бетін ашады.
import { useState } from "react";
import { haptic } from "../telegram";
import { Switch } from "../ui/SubPage";
import { useCached } from "../venue/api";
import { Note, Sk, VPage } from "../venue/ui";
import { A } from "./api";
import v from "../venue/V.module.css";

type Prefs = { complaint: boolean; payFail: boolean; pos: boolean; priceDrop: boolean; application: boolean; moderation: boolean; daily: boolean; weekly: boolean; quiet: boolean };
const groups: [string, [keyof Prefs, string, string?][]][] = [
  ["Шұғыл", [["complaint", "Жаңа шағым"], ["payFail", "Сәтсіз төлемдердің өсуі", "Сағатына 3-тен көп болса"], ["pos", "POS қосылымының үзілуі"], ["priceDrop", "Бағаның күрт түсуі", "30%-дан артық"]]],
  ["Күнделікті", [["application", "Жаңа мекеме өтінімі"], ["moderation", "Модерацияға түскен ұсыныс"], ["daily", "Күндік қорытынды", "Күн сайын 09:00"], ["weekly", "Апталық есеп", "Дүйсенбі 09:00"]]],
  ["Тыныш уақыт", [["quiet", "23:00 – 08:00", "Шұғылдан басқасы таңертеңге қалады"]]],
];

export function ANotifications() {
  const [d, setD] = useCached<{ prefs: Prefs }>("a:prefs", () => A("/prefs"));
  const [err, setErr] = useState(false);
  const set = async (k: keyof Prefs, val: boolean) => {
    if (!d) return;
    haptic.select();
    const n = { ...d.prefs, [k]: val };
    setD({ prefs: n });
    try { await A("/prefs", { method: "PUT", body: JSON.stringify(n) }); setErr(false); } catch { haptic.error(); setErr(true); }
  };
  return (
    <VPage title="Хабарламалар" back>
      {!d ? <Sk h={300} /> : groups.map(([h, rows]) => (
        <div key={h} style={{ display: "contents" }}>
          <h2 className={v.blueHead}>{h}</h2>
          <div className={v.card}>{rows.map(([k, t, sub]) => (
            <div key={k} className={v.row} style={{ ["--inset" as string]: "16px", minHeight: 54 }}>
              <span className={v.rowText}><span className={v.rowTitle}>{t}</span>{sub && <span className={v.rowSub}>{sub}</span>}</span>
              <Switch on={d.prefs[k]} onChange={(x) => void set(k, x)} />
            </div>
          ))}</div>
        </div>
      ))}
      {err && <Note tone="warn">Сақталмады. Қайталап көріңіз.</Note>}
      <Note>Хабарлар Jazl+ ботына келеді, батырмасы Басқарудың веб-бетін ашады. Бот жаза алуы үшін оған бір рет /start басыңыз.</Note>
    </VPage>
  );
}
