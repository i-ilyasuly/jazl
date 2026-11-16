// Figma «15 · Профиль»: «Қолдану тарихы» 13918:8337, «күтілуде» 13941:8134, «расталды» 13941:8196, «қайтарылды» 13941:8260.
// Демо: ?use=pending | ok | fail — бірінші жолдың күйі (банк растауын күту, расталды, өтпеді → бірлік қайтарылды).
import { Emo } from "../ui/Emo";
import { useEffect, useState } from "react";
import { usage } from "../mocks/history";
import { demoEmpty, useMock } from "../mocks/useMock";
import { useGo } from "../nav";
import { EmptyState } from "../ui/EmptyState";
import { Group, Row, SkRows, SubPage } from "../ui/SubPage";
import s from "./History.module.css";

type Use = "pending" | "ok" | "fail" | "";
export function UsageHistory() {
  const go = useGo();
  const { loading } = useMock("usage", true, 450);
  const [state, setState] = useState<Use>(() => (window.location.hash.match(/[?&]use=(pending|ok|fail)/)?.[1] as Use) ?? "");
  const [snack, setSnack] = useState("");
  // «Күтілуде» → бірнеше секундтан кейін банк жауабы (демо: расталды)
  useEffect(() => {
    if (state === "ok") setSnack("Төлем расталды • Тауық донері");
    if (state === "fail") setSnack("Төлем өтпеді, бірлік қайтарылды");
    if (state !== "pending") return;
    const t = window.setTimeout(() => setState("ok"), 3000);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => { if (!snack) return; const t = window.setTimeout(() => setSnack(""), 3000); return () => clearTimeout(t); }, [snack]);
  if (demoEmpty()) return <SubPage title="Қолдану тарихы"><EmptyState sticker="archive" title="Әзірге қолдану жоқ" text="Мекемеде QR сканерлеп төлесең, осында көрінеді" action={{ text: "Пакеттерім", onClick: () => go("/packs", "fade") }} /></SubPage>;
  return (
    <SubPage title="Қолдану тарихы">
      {usage.map((g, gi) => (
        <Group key={g.month} header={g.month} i={gi}>
          {loading ? <SkRows n={g.items.length} /> : g.items.map((it, i) => {
            const first = gi === 0 && i === 0 && state;
            const sub = first === "pending" ? "Dämdi Doner • күтілуде" : first === "fail" ? "Dämdi Doner • қайтарылды" : it.sub;
            const right = first === "pending" ? <span className={`t-cap1 w-600 ${s.pending}`}>Күтілуде</span>
              : first === "fail" ? <span className={`t-cap1 w-600 ${s.failed}`}>Өтпеді</span>
              : <span className={`t-text w-600 ${s.value}`}>{it.v}</span>;
            return <Row key={it.id} title={it.t} sub={sub} right={right} left={<span className={s.emoji}><Emo e={it.e} size={28} /></span>}
              onClick={it.packId && first !== "pending" && first !== "fail" ? () => go("/receipt/use/" + it.packId) : undefined} />;
          })}
        </Group>
      ))}
      {snack && <div className={`t-sub2 ${s.snack}`} role="status">{snack}</div>}
    </SubPage>
  );
}
