// Figma «07 · Команда» (14009:8251), «Рөлдер мен рұқсаттар» (14009:8625), «Кассир профилі» (14009:8720), «03 · Кассир шақыру» (13997:8165).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { copyText, haptic, nativePick, shareToChat } from "../telegram";
import { dayMonth, money, roleName, useCurrent, V, type StaffRow } from "./api";
import { Buttons, Note, Person, Sheet, Sk, VPage, VSticker } from "./ui";
import s from "./V.module.css";

const roleTag = { owner: "tag", manager: "tagYellow", cashier: "tagGreen" } as const;
const onlineNow = (d: string) => Date.now() - new Date(d).getTime() < 15 * 60_000;
const seen = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 60 * 24 ? "бүгін" : m < 60 * 48 ? "кеше" : dayMonth(d); };

export function VTeam() {
  const go = useGo();
  const me = useCurrent();
  const [data, setData] = useState<{ me: string; staff: StaffRow[] } | null>(null);
  const [roles, setRoles] = useState(false);
  const load = useCallback(() => { if (me) V.staff(me.venue.id).then(setData).catch(() => setData({ me: "", staff: [] })); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const owner = me?.role === "owner";
  async function approve(x: StaffRow) {
    if (!me) return;
    const r = await nativePick(x.name, "Кассир ретінде қосылуды сұрады. Растайсың ба?", [{ id: "no", text: "Бас тарту" }, { id: "yes", text: "Растау" }], "yes");
    if (r === "yes") await V.approve(me.venue.id, x.userId).then(() => haptic.success()).catch(() => haptic.error());
    else if (r === "no") await V.remove(me.venue.id, x.userId).catch(() => null);
    load();
  }
  const active = data?.staff.filter((x) => x.status === "active").length ?? 0;
  return (
    <VPage title="Команда" back>
      <div className={s.teamHead}>
        <div><h1 className={s.h1}>Команда</h1><p className={s.muted} style={{ marginTop: 4 }}>{data ? `${active} адам` : " "}</p></div>
        <VSticker name="team" size={84} at={[308, 92]} />
      </div>
      <div className={s.card}>
        {data === null ? <div className={s.row}><Sk h={40} /></div> : data.staff.map((x) => (
          <button key={x.userId} className={s.row} onClick={() => (x.status === "pending" ? (owner ? void approve(x) : undefined) : go(`/v/team/${x.userId}`))}>
            <Person name={x.name} photo={x.photoUrl} online={x.status === "active" && onlineNow(x.lastSeen)} />
            <span className={s.rowText}>
              <span className={s.rowTitle}>{x.name}{x.userId === data.me ? " (сіз)" : ""}<span className={`${s.tag} ${s[roleTag[x.role]]}`}>{roleName[x.role]}</span>{x.status === "pending" && <span className={`${s.tag} ${s.tagRed}`}>Растау күтуде</span>}</span>
              <span className={s.rowSub}>{x.role === "owner" && !x.branch ? "Барлық филиал" : x.branch ?? "Барлық филиал"}{x.role === "cashier" && !onlineNow(x.lastSeen) ? " • " + seen(x.lastSeen) : ""}</span>
            </span>
            <i className={s.arrow} />
          </button>
        ))}
      </div>
      <Note>Кассир тек төлем қабылдайды. Есеп пен баға өзгертуге рұқсаты жоқ.</Note>
      {owner ? <Buttons main={{ text: "Кассир шақыру", onClick: () => go("/v/team/invite") }} second={{ text: "Рөлдер", onClick: () => setRoles(true) }} />
        : <Buttons main={{ text: "Рөлдер", onClick: () => setRoles(true) }} />}
      {roles && <RolesSheet onClose={() => setRoles(false)} />}
    </VPage>
  );
}

const perms: [string, boolean, boolean, boolean][] = [
  ["Кассир режимі", true, true, true], ["Қолдану тарихы", true, true, false], ["Ұсыныстарды өңдеу", true, true, false],
  ["Бағаны өзгерту", true, false, false], ["Есеп және төлем", true, false, false], ["Команданы басқару", true, false, false],
];
function RolesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Рөлдер мен рұқсаттар" onClose={onClose} grab={false}>
      <div className={s.card} style={{ padding: "4px 8px" }}>
        <div className={s.grid3}>
          {["", "Иесі", "Басқар.", "Кассир"].map((h, i) => <span key={i} className={s.gh}>{h}</span>)}
          {perms.map(([t, a, b, c]) => [<span key={t}>{t}</span>, ...[a, b, c].map((v, i) => <span key={t + i} className={v ? s.yes : s.no}>{v ? "✓" : "—"}</span>)])}
        </div>
      </div>
    </Sheet>
  );
}

export function VInvite() {
  const go = useGo();
  const me = useCurrent();
  const [inv, setInv] = useState<{ code: string; expiresAt: string; link: string } | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const loadStaff = useCallback(() => { if (me) V.staff(me.venue.id).then((r) => setStaff(r.staff.filter((x) => x.role === "cashier"))).catch(() => setStaff([])); }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (me) { V.invite(me.venue.id).then(setInv).catch(() => setInv(null)); loadStaff(); } }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = useCallback(async () => {
    if (!me || busy) return;
    setBusy(true); haptic.medium();
    try { setInv(await V.newInvite(me.venue.id)); haptic.success(); } catch { haptic.error(); } finally { setBusy(false); }
  }, [me, busy]);
  useEffect(() => { if (inv === null && me) void fresh(); }, [inv]); // eslint-disable-line react-hooks/exhaustive-deps — код жоқ болса бірден жасаймыз
  const hours = inv ? Math.max(1, Math.round((new Date(inv.expiresAt).getTime() - Date.now()) / 3600_000)) : 24;
  const text = inv ? `${me?.venue.name}: Jazl+ кассасына қосылу коды ${inv.code}. Сілтеме арқылы да кіруге болады:` : "";
  async function remove(x: StaffRow) {
    if (!me) return;
    const r = await nativePick("Кассирді өшіру?", `${x.name} жүйеден бірден шығады.`, [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Өшіру" }], "yes");
    if (r === "yes") { await V.remove(me.venue.id, x.userId).then(() => haptic.success()).catch(() => haptic.error()); loadStaff(); }
  }
  return (
    <VPage title="Кассир шақыру" back>
      <div className={s.bigCode}>
        <span className={s.rowSub}>Шақыру коды</span>
        {inv ? <b>{inv.code.slice(0, 3)} {inv.code.slice(3)}</b> : <Sk w={160} h={38} />}
        <span className={s.rowSub}>Жарамдылығы: {hours} сағат</span>
      </div>
      <div className={s.twoBtns}>
        <button className={s.softBtn} onClick={() => { if (inv) { void copyText(inv.code); haptic.success(); } }}>⧉ Көшіру</button>
        <button className={s.softBtn} onClick={() => { if (inv) void shareToChat({ url: inv.link, text }); }}>⇪ Telegram-мен жіберу</button>
      </div>
      <h2 className={s.blueHead}>Белсенді кассирлер · {staff ? staff.filter((x) => x.status === "active").length : "–"}</h2>
      <div className={s.card}>
        {staff === null ? <div className={s.row}><Sk h={40} /></div> : staff.length === 0 ? <div className={s.row}><span className={s.rowSub}>Әзірге кассир жоқ. Кодты кассирге жіберіңіз.</span></div>
          : staff.map((x) => (
            <div key={x.userId} className={s.row}>
              <Person name={x.name} photo={x.photoUrl} size={36} />
              <span className={s.rowText}><span className={s.rowTitle}>{x.name}{x.status === "pending" && <span className={`${s.tag} ${s.tagRed}`}>Растау күтуде</span>}</span><span className={s.rowSub}>{x.branch ?? "Барлық филиал"} • {seen(x.lastSeen)}</span></span>
              <button className={s.textBtn} onClick={() => void remove(x)}>Өшіру</button>
            </div>
          ))}
      </div>
      <Note>Кассир тек төлем QR-ын шығарады. Есеп пен баға өзгерту оған жабық.</Note>
      <Buttons main={{ text: busy ? "Жасалуда…" : "Жаңа код жасау", onClick: () => void fresh(), disabled: busy }} second={{ text: "Жабу", onClick: () => go(-1, "back") }} />
    </VPage>
  );
}

export function VStaff() {
  const go = useGo();
  const me = useCurrent();
  const { uid = "" } = useParams();
  const [p, setP] = useState<Awaited<ReturnType<typeof V.staffOne>> | null>(null);
  const load = useCallback(() => { if (me) V.staffOne(me.venue.id, uid).then(setP).catch(() => null); }, [me?.venue.id, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const owner = me?.role === "owner";
  async function remove() {
    if (!me || !p) return;
    const r = await nativePick("Қолжетімділікті өшіру?", `${p.name} жүйеден бірден шығады.`, [{ id: "no", text: "Жоқ" }, { id: "yes", text: "Өшіру" }], "yes");
    if (r === "yes") { await V.remove(me.venue.id, uid).catch(() => null); haptic.success(); go(-1, "back"); }
  }
  async function move() {
    if (!me || !p) return;
    const opts = [{ id: "all", text: "Барлық филиал" }, ...me.branches.slice(0, 2).map((b) => ({ id: b.id, text: b.address }))];
    const id = await nativePick("Филиал ауыстыру", "Кассир қай филиалда жұмыс істейді?", opts, "");
    if (id) { await V.moveBranch(me.venue.id, uid, id === "all" ? null : id).catch(() => null); haptic.success(); load(); }
  }
  if (!p) return <VPage title={me ? roleName.cashier : ""} back><Sk h={200} /></VPage>;
  return (
    <VPage title={roleName[p.role]} back>
      <div className={s.result}>
        <Person name={p.name} photo={p.photoUrl} size={84} />
        <h1 className={s.resultTitle} style={{ marginTop: 4 }}>{p.name}</h1>
        <span className={`${s.tag} ${s[roleTag[p.role]]}`}>{roleName[p.role]}</span>
      </div>
      <div className={s.card}>
        <div className={s.row} style={{ ["--inset" as string]: "16px" }}><span className={s.rowText}><span className={s.rowTitle}>Филиал</span><span className={s.rowSub}>{p.branch ?? "Барлық филиал"}</span></span></div>
        <div className={s.row} style={{ ["--inset" as string]: "16px" }}><span className={s.rowText}><span className={s.rowTitle}>Бүгін</span><span className={s.rowSub}>{p.today.count} төлем • {money(p.today.amount)}</span></span></div>
        <div className={s.row} style={{ ["--inset" as string]: "16px" }}><span className={s.rowText}><span className={s.rowTitle}>Қосылған күні</span><span className={s.rowSub}>{dayMonth(p.since)}</span></span></div>
      </div>
      {p.days.length > 0 && <>
        <h2 className={s.blueHead} style={{ textAlign: "center" }}>Соңғы төлемдер</h2>
        <div className={s.card}>{p.days.map((d) => <div key={d.date} className={s.row} style={{ ["--inset" as string]: "16px" }}><span className={s.rowText}><span className={s.rowTitle}>{dayMonth(d.date)}</span><span className={s.rowSub}>{d.count} төлем • {money(d.amount)}</span></span></div>)}</div>
      </>}
      {owner && p.role !== "owner" && <>
        <Note tone="warn">Қолжетімділікті өшірсең, кассир бірден жүйеден шығады.</Note>
        <Buttons main={{ text: "Филиал ауыстыру", onClick: () => void move() }} second={{ text: "Өшіру", onClick: () => void remove() }} />
      </>}
    </VPage>
  );
}
