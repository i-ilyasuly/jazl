// Figma «08 · Тарих және тапсырыстар»: Қолдану тарихы (14010:8003), Тапсырыстар (14010:8161), Тапсырыс беті (14010:8248);
// «16»: Соңғы қолдануды қайтару (14045:10045), Қайтару: орындалды (14045:10115).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, nativePick } from "../telegram";
import { dayKey, dayMonth, err, hm, isToday, money, useCached, useCurrent, V, type Use, type VOrder } from "./api";
import { UseRow } from "./Home";
import { Buttons, Note, Sheet, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

const ranges = [{ d: 1, t: "Бүгін" }, { d: 7, t: "7 күн" }, { d: 30, t: "30 күн" }];

export function VHistory() {
  const go = useGo();
  const me = useCurrent();
  const [days, setDays] = useState(1);
  const [branch, setBranch] = useState<string | undefined>();
  const [data, , reloadData] = useCached<{ summary: { count: number; amount: number; refunds: number }; items: Use[] }>(me ? `hist:${me.venue.id}:${days}:${branch ?? ""}` : null, () => V.history(me!.venue.id, days, branch), { summary: { count: 0, amount: 0, refunds: 0 }, items: [] });
  const [refund, setRefund] = useState<Use | null>(null);
  const load = reloadData;
  async function pickBranch() {
    if (!me || me.branches.length < 2) return;
    const id = await nativePick("Филиал", "Қай филиал?", [{ id: "all", text: "Барлығы" }, ...me.branches.slice(0, 2).map((b) => ({ id: b.id, text: b.address }))], "all");
    if (id) { haptic.select(); setBranch(id === "all" ? undefined : id); }
  }
  // Күн бойынша топтау: «Бүгін, 14 қараша»
  const groups: { key: string; title: string; items: Use[] }[] = [];
  for (const u of data?.items ?? []) {
    const k = dayKey(u.at); let g = groups.find((x) => x.key === k);
    if (!g) { g = { key: k, title: (isToday(u.at) ? "Бүгін, " : "") + dayMonth(u.at), items: [] }; groups.push(g); }
    g.items.push(u);
  }
  return (
    <VPage title="Қолдану тарихы" back={me?.role === "owner"} tab={me && me.role !== "owner" ? "history" : undefined}>
      <div className={s.chips}>
        {ranges.map((r) => <button key={r.d} className={`${s.chip} ${days === r.d ? s.chipOn : ""}`} onClick={() => { haptic.select(); setDays(r.d); }}>{r.t}</button>)}
        {me && me.branches.length > 1 && <button className={`${s.chip} ${branch ? s.chipOn : ""}`} onClick={() => void pickBranch()}>{branch ? me.branches.find((b) => b.id === branch)?.address.split(",")[0] : "Филиал"} ▾</button>}
      </div>
      <div className={s.card} style={{ background: "var(--hl-blue-bg)", display: "grid", gridTemplateColumns: "1fr 1.4fr 0.8fr", padding: "12px 16px", gap: 4 }}>
        <span className={s.stat} style={{ padding: 0, background: "none" }}><span className={s.statLabel}>Қолданулар</span><b className={s.lead} style={{ fontSize: 20 }}>{data ? data.summary.count : "–"}</b></span>
        <span className={s.stat} style={{ padding: 0, background: "none" }}><span className={s.statLabel}>Түскен сома</span><b className={s.lead} style={{ fontSize: 20 }}>{data ? money(data.summary.amount) : "–"}</b></span>
        <span className={s.stat} style={{ padding: 0, background: "none", textAlign: "right" }}><span className={s.statLabel}>Қайтару</span><b className={s.lead} style={{ fontSize: 20 }}>{data ? data.summary.refunds : "–"}</b></span>
      </div>
      {data === null ? <><Sk h={20} w={140} /><Sk h={180} /></> : groups.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Бұл кезеңде қолдану болған жоқ</span></div></div>
        : groups.map((g) => (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className={s.blueHead}>{g.title}</h2>
            <div className={s.card}>{g.items.map((u) => <UseRow key={u.id} u={u} kind={me!.venue.kind} variant="history"
              onClick={u.kind === "order" ? () => go(`/v/orders/${u.id}`) : u.canCancel ? () => { haptic.tap(); setRefund(u); } : undefined} />)}</div>
          </section>
        ))}
      {data && data.items.some((u) => u.canCancel) && <p className={`t-cap1 ${s.muted} ${s.center}`}>Қате болса — соңғы 10 минуттағы қолдануды басып қайтаруға болады</p>}
      {refund && <RefundSheet u={refund} onClose={() => setRefund(null)} onDone={(n) => { setRefund(null); go(`/v/refunded/${n}`, "up"); }} />}
    </VPage>
  );
}

/** Figma «Қайтару: соңғы қолдануды қайтару» — төменгі парақ: клиент, ұсыныс, уақыты, сомасы; «Бас тарту» / «Қайтару» (қызыл). */
export function RefundSheet({ u, onClose, onDone }: { u: Use; onClose: () => void; onDone: (units: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const go = async () => {
    setBusy(true); haptic.warning();
    try { const r = await V.cancelUse(u.id); haptic.success(); onDone(r.returned); }
    catch (e) { haptic.error(); setFail(err(e) === "too_late" ? "10 минут өтіп кетті — қайтару мүмкін емес." : "Қайтару өтпеді. Қайталап көріңіз."); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Соңғы қолдануды қайтару" onClose={onClose}>
      <div className={s.card}>
        <div className={s.kv}><span>Клиент</span><b>{u.customer}</b></div>
        <div className={s.kv}><span>Ұсыныс</span><b>{u.title.split(" · ")[0]}</b></div>
        <div className={s.kv}><span>Уақыты</span><b>{isToday(u.at) ? "Бүгін" : dayMonth(u.at)} {hm(u.at)}</b></div>
        <div className={s.kv}><span>Сомасы</span><b>{money(u.amount)}</b></div>
      </div>
      <Note tone="warn">{fail || "Дана клиенттің пакетіне қайтады. Бөлінген төлем есепте теріс түзетумен реттеледі. Мұны қайтару мүмкін емес."}</Note>
      <Buttons main={{ text: busy ? "Қайтарылуда…" : "Қайтару", onClick: () => void go(), danger: true, disabled: busy }} second={{ text: "Бас тарту", onClick: onClose }} />
    </Sheet>
  );
}

export function VRefunded() {
  const go = useGo();
  const { n = "1" } = useParams();
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(362px + var(--top-shift))" }}><VSticker name="party" size={120} /><h2 className={s.stateTitle}>Қайтарылды</h2><p className={s.stateText}>{`Клиентке ${n} дана қайтарылды. Түзету «Есеп» бөлімінде көрінеді.`}</p></div>
      <Buttons main={{ text: "Түсінікті", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}

const orderPill: Record<string, [string, string]> = {
  sent: ["Жіберілді", "tagGreen"], accepted: ["Қабылданды", "tagGreen"], ready: ["Дайын", "tagGreen"], done: ["Берілді", "tagGray"], missed: ["Келмеді", "tagYellow"], cancelled: ["Бас тартылды", "tagGray"], failed: ["Жетпеді", "tagRed"],
};

export function VOrders() {
  const go = useGo();
  const me = useCurrent();
  const [list, setList] = useState<VOrder[] | null>(null);
  useEffect(() => {
    const load = () => V.orders().then((l) => setList(me ? l.filter((o) => me.branches.some((b) => b.id === o.branchId)) : l)).catch(() => setList([]));
    load(); const t = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(t);
  }, [me]);
  return (
    <VPage title="Тапсырыстар" back>
      <div className={s.teamHead}>
        <div><h1 className={s.h1} style={{ maxWidth: 230 }}>Алдын ала тапсырыс</h1><p className={s.muted} style={{ marginTop: 6 }}>Клиент тапсырысы осында келеді</p></div>
        <VSticker name="chef" size={92} at={[300, 90]} />
      </div>
      {list === null ? <Sk h={80} /> : list.length === 0 ? <div className={s.card}><div className={s.row}><span className={s.rowSub}>Қазір белсенді тапсырыс жоқ</span></div></div>
        : list.map((o) => {
          const [t, c] = orderPill[o.status] ?? ["", "tag"];
          const at = o.scheduledAt ?? o.createdAt;
          return (
            <button key={o.id} className={s.card} style={{ textAlign: "left", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }} onClick={() => go(`/v/orders/${o.id}`)}>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <b className={s.lead} style={{ fontSize: 18 }}>№{o.no} • {o.title.split(" · ")[0]}</b><span className={`${s.tag} ${s[c]}`}>{t}</span>
              </span>
              <span className={s.rowSub}>{`${o.type === "plan" ? (isToday(at) ? "" : dayMonth(at) + ", ") + hm(at) : "Қазір " + hm(o.createdAt)} • ${o.branch} • код ${o.code}${o.courier ? " • курьер" : ""}`}</span>
            </button>
          );
        })}
      <Note>Тапсырыс келгенде «Қабылдау» → «Дайын» басыңыз. Клиент кодты айтқанда «Берілді» деп белгілеңіз.</Note>
    </VPage>
  );
}

export function VOrder() {
  const go = useGo();
  const me = useCurrent();
  const { id = "" } = useParams();
  const [o, setO] = useState<(VOrder & { amount: number; venueAmount: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (me) V.order(me.venue.id, id).then(setO).catch(() => null); }, [me?.venue.id, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const act = useCallback(async () => {
    if (!o || busy) return;
    setBusy(true); haptic.medium();
    try {
      if (o.status === "sent") await V.setStatus(o.id, "accepted");
      else if (o.status === "accepted") await V.setStatus(o.id, "ready");
      else if (o.status === "ready") await V.verify(o.code);
      haptic.success(); load();
    } catch { haptic.error(); } finally { setBusy(false); }
  }, [o, busy, load]);
  const missed = useCallback(async () => {
    if (!o) return;
    const r = await nativePick(`Тапсырыс №${o.no}`, "Клиент келмеді деп белгілейміз бе? Дана қайтарылмайды.", [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Келмеді" }], "");
    if (r === "yes") { await V.setStatus(o.id, "missed").catch(() => null); load(); }
  }, [o, load]);
  if (!o) return <VPage title="Тапсырыс" back><Sk h={180} /><Sk h={160} /></VPage>;
  const order = ["sent", "accepted", "ready", "done"];
  const k = order.indexOf(o.status);
  const steps = [
    { t: "Тапсырыс жасалды", sub: `${hm(o.createdAt)} • клиент ${o.customer}`, ok: true },
    { t: "Мекеме қабылдады", sub: k >= 1 ? "Дайындалуда" : "Күтілуде", ok: k >= 1 },
    { t: "Дайын", sub: k >= 2 ? "Клиент алуға келеді" : "", ok: k >= 2 },
    { t: "Берілді", sub: o.doneAt ? hm(o.doneAt) : "Клиент кодты айтқанда", ok: k >= 3 },
  ];
  const closed = ["done", "missed", "cancelled", "failed"].includes(o.status);
  const at = o.scheduledAt ?? o.createdAt;
  return (
    <VPage title={`Тапсырыс №${o.no}`} back>
      <div className={`${s.card} ${s.steps}`}>
        {steps.map((x, i) => (
          <div key={i} className={`${s.step} ${steps[i + 1]?.ok ? "" : s.todo}`}>
            <span className={x.ok ? s.dotOk : s.dotTodo} />
            <span className={s.rowText}><span className={s.rowTitle}>{x.t}</span>{x.sub && <span className={s.rowSub}>{x.sub}</span>}</span>
          </div>
        ))}
      </div>
      <div className={s.card}>
        <div className={s.kv}><span>Тауар</span><b>{`${o.title.split(" · ")[0]} • 1 бірлік`}</b></div>
        <div className={s.kv}><span>Алу уақыты</span><b>{o.type === "plan" ? (isToday(at) ? "" : dayMonth(at) + ", ") + hm(at) : "Қазір"}{o.courier ? " • курьер" : ""}</b></div>
        <div className={s.kv}><span>Филиал</span><b>{o.branch}</b></div>
        <div className={s.kv}><span>Код (клиент айтады)</span><b style={{ color: "var(--link)" }}>{o.code}</b></div>
      </div>
      <Note tone="ok">Төлем: «Medeo алдын ала төленген». Мекеме шотына: <b>{money(o.venueAmount)}</b></Note>
      {!closed && <Buttons main={{ text: busy ? "…" : o.status === "sent" ? "Қабылдау" : o.status === "accepted" ? "Дайын" : "Берілді", onClick: () => void act(), shine: true, disabled: busy }} second={{ text: "Клиент келмеді", onClick: () => void missed() }} />}
      {closed && <Buttons main={{ text: "Тапсырыстарға", onClick: () => go("/v/orders", "back") }} />}
    </VPage>
  );
}
