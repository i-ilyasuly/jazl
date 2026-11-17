// C2 · Қызметкерлер (иесі мен менеджерге): тізім, шақыру сілтемесі (48 сағат, бір рет), шақыруды жою, қызметкерді шығару.
// Сілтеме Telegram-ның «Кімге жіберу» терезесімен жіберіледі: кассир ашқанда мини апп бірден «Шақыру» бетінде ашылады.
import { useCallback, useEffect, useState } from "react";
import { currentStaff, desk, roleName, useStaff, type InviteRow, type Role, type StaffRow } from "../desk";
import { copyText, haptic, nativePick, shareToChat, useBottomButtons } from "../telegram";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import s from "./Desk.module.css";

export function DeskStaff() {
  useStaff();
  const me = currentStaff();
  const [data, setData] = useState<{ me: string; staff: StaffRow[]; invites: InviteRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (me) { try { setData(await desk.staff(me.venue.id)); } catch { setData({ me: "", staff: [], invites: [] }); } } }, [me?.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  const send = async (link: string, role: Role) => {
    const text = `${me!.venue.name}: сізді Jazl+-те ${roleName[role].toLowerCase()} ретінде шақырамын. Сілтеме 48 сағат жарамды, бір рет ашылады.`;
    void copyText(link);
    await shareToChat({ url: link, text });
  };
  const invite = useCallback(async () => {
    if (!me || busy) return;
    let role: "cashier" | "manager" = "cashier";
    if (me.role === "owner") {
      const id = await nativePick("Кімді шақырасыз?", "Кассир — тек касса. Менеджер — касса және кассир шақыру.", [{ id: "cashier", text: "Кассир" }, { id: "manager", text: "Менеджер" }], "cashier");
      if (!id) return; role = id as typeof role;
    }
    let branchId: string | undefined;
    if (role === "cashier" && me.branches.length > 1) {
      const id = await nativePick("Қай филиал?", "Кассир тек сол филиалдың QR-ы мен тапсырыстарын көреді.", [...me.branches.slice(0, 2).map((b) => ({ id: b.id, text: b.address })), { id: "all", text: "Барлығы" }], "all");
      if (!id) return; branchId = id === "all" ? undefined : id;
    }
    setBusy(true); haptic.medium();
    try { const r = await desk.invite(me.venue.id, role, branchId); haptic.success(); await send(r.link, role); await load(); }
    catch { haptic.error(); } finally { setBusy(false); }
  }, [me, busy, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useBottomButtons({ text: busy ? "Жасалуда…" : "Қызметкер шақыру", shine: true, disabled: busy, onClick: () => void invite() }, undefined, Boolean(me));

  async function onStaff(x: StaffRow) {
    if (!me || x.userId === data?.me || x.role === "owner" || (me.role === "manager" && x.role !== "cashier")) return;
    const id = await nativePick(x.name, `${roleName[x.role]}${x.branch ? " · " + x.branch : ""}`, [{ id: "remove", text: "Мекемеден шығару" }, { id: "x", text: "Жабу" }], "x");
    if (id !== "remove") return;
    try { await desk.remove(me.venue.id, x.userId); haptic.success(); await load(); } catch { haptic.error(); }
  }
  async function onInvite(i: InviteRow) {
    if (!me) return;
    const id = await nativePick(`${roleName[i.role]} шақыруы`, "Сілтеме әлі ашылмаған.", [{ id: "send", text: "Қайта жіберу" }, { id: "revoke", text: "Жою" }], "send");
    if (id === "send") await send(i.link, i.role);
    else if (id === "revoke") { try { await desk.revoke(me.venue.id, i.code); haptic.success(); await load(); } catch { haptic.error(); } }
  }

  if (!me) return <SubPage title="Қызметкерлер"><div className={s.empty}>Рұқсат жоқ.</div></SubPage>;
  const hours = (d: string) => Math.max(1, Math.round((new Date(d).getTime() - Date.now()) / 3600_000));
  return (
    <SubPage title="Қызметкерлер" variant="roomy">
      <Group header={me.venue.name} i={0}>
        {data === null ? <Row title="Жүктелуде…" /> : data.staff.map((x) => (
          <Row key={x.userId} inset={68} onClick={() => void onStaff(x)}
            left={<span className={s.avatar}>{x.photoUrl ? <img src={x.photoUrl} alt="" /> : x.name.slice(0, 1)}</span>}
            title={x.name + (x.userId === data.me ? " (сіз)" : "")} sub={[x.username ? "@" + x.username : "", x.branch ?? ""].filter(Boolean).join(" · ") || undefined}
            right={<span className={`${s.role} ${s[x.role]}`}>{roleName[x.role]}</span>} />
        ))}
      </Group>
      {data && data.invites.length > 0 && (
        <Group header="Ашылмаған шақырулар" i={1}>
          {data.invites.map((i) => <Row key={i.code} inset={16} title={roleName[i.role]} sub={`${hours(i.expiresAt)} сағат қалды`} onClick={() => void onInvite(i)} right={<span className={`t-sub2 ${s.cardSub}`}>•••</span>} />)}
        </Group>
      )}
      <Note i={2}>Шақыру сілтемесі 48 сағат жарамды және бір адамға ғана жарайды. Кассир тек кассаны көреді: QR, код, тапсырыстар. Менеджер кассир шақыра алады. Қызметкерді шығару үшін атын басыңыз.</Note>
    </SubPage>
  );
}
