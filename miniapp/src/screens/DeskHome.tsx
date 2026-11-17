// C2 · «Касса» — мекеме бөлімінің басты беті (кассир, менеджер, иесі).
// Бүгінгі қорытынды → екі негізгі әрекет (QR көрсету, кодты тексеру) → тапсырыстар (қазір / жоспар) → соңғы қолданулар (10 мин ішінде бас тарту).
// Деректер әр 8 секунд сайын жаңарады (бет ашық тұрғанда); жаңа тапсырыс келсе — діріл.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGo } from "../nav";
import { ago, currentStaff, desk, err, roleName, setDeskPick, timeOf, useDeskPick, useStaff, whenOf, type DeskOrder, type DeskUse, type Today } from "../desk";
import { haptic, nativePick, useBottomButtons } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { SubPage, Group, Row } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import s from "./Desk.module.css";

const statusName = { sent: "Жаңа", accepted: "Дайындалуда", ready: "Дайын" } as const;

export function DeskHome() {
  const go = useGo();
  const staff = useStaff();
  const pickI = useDeskPick();
  const me = currentStaff();
  const [today, setToday] = useState<Today | null>(null);
  const [orders, setOrders] = useState<DeskOrder[] | null>(null);
  const [uses, setUses] = useState<DeskUse[] | null>(null);
  const [tab, setTab] = useState<"now" | "plan">("now");
  const [busy, setBusy] = useState("");
  const [cancel, setCancel] = useState<DeskUse | null>(null);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [t, o, u] = await Promise.allSettled([desk.today(me.venue.id), desk.orders(), desk.uses()]);
    if (t.status === "fulfilled") setToday(t.value);
    if (o.status === "fulfilled") {
      const mine = o.value.filter((x) => me.branches.some((b) => b.id === x.branchId));
      if (known.current && mine.some((x) => !known.current!.has(x.id))) haptic.success(); // жаңа тапсырыс
      known.current = new Set(mine.map((x) => x.id));
      setOrders(mine);
    }
    if (u.status === "fulfilled") setUses(u.value.filter((x) => me.branches.some((b) => b.id === x.branchId)));
  }, [me?.venue.id, me?.branches]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    known.current = null; setToday(null); setOrders(null); setUses(null);
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  const qr = useCallback(() => { haptic.medium(); go("/desk/qr", "forward"); }, [go]);
  const code = useCallback(() => { haptic.tap(); go("/desk/code", "forward"); }, [go]);
  useBottomButtons({ text: "QR көрсету", shine: true, onClick: qr }, { text: "Код", position: "left", onClick: code }, Boolean(me));

  if (staff === null) return <SubPage title="Касса"><div className={s.empty}>Жүктелуде…</div></SubPage>;
  if (!me) return (
    <SubPage title="Касса">
      <div className={s.empty}>Сіз әлі ешбір мекеменің қызметкері емессіз. Мекеме иесінен шақыру сілтемесін сұраңыз.</div>
    </SubPage>
  );

  async function setStatus(o: DeskOrder, st: "accepted" | "ready" | "missed") {
    setBusy(o.id); haptic.medium();
    try { await desk.setStatus(o.id, st); haptic.success(); await load(); } catch { haptic.error(); } finally { setBusy(""); }
  }
  async function more(o: DeskOrder) {
    const id = await nativePick(`Тапсырыс №${o.no}`, `${o.title} · ${o.customer}`, [{ id: "missed", text: "Клиент келмеді" }, { id: "x", text: "Жабу" }], "x");
    if (id === "missed") await setStatus(o, "missed");
  }
  async function doCancel(u: DeskUse) {
    try { const r = await desk.cancelUse(u.id); haptic.success(); await nativeInfo(`${r.returned} дана клиенттің пакетіне қайтарылды.`); }
    catch (e) { haptic.error(); await nativeInfo(err(e) === "too_late" ? "10 минут өтіп кетті — бас тарту мүмкін емес." : "Бас тарту өтпеді. Қайталап көріңіз."); }
    void load();
  }

  const list = (orders ?? []).filter((o) => o.type === tab);
  const nowCount = (orders ?? []).filter((o) => o.type === "now").length;
  const planCount = (orders ?? []).filter((o) => o.type === "plan").length;
  const branchLine = me.branches.length === 1 ? me.branches[0].address : `${me.branches.length} филиал`;

  return (
    <SubPage title="Касса">
      {staff.length > 1 && (
        <div className={`${s.chips} rise`}>
          {staff.map((x, i) => <button key={x.venue.id} className={`${s.chip} ${i === pickI ? s.chipOn : ""}`} onClick={() => { haptic.select(); setDeskPick(i); }}>{x.venue.name}</button>)}
        </div>
      )}
      <div className={`${s.hero} rise`}>
        <span className={s.logo}>{me.venue.logoUrl ? <img src={me.venue.logoUrl} alt="" /> : me.venue.name.slice(0, 1)}</span>
        <span className={s.heroText}><span className={s.heroName}>{me.venue.name}</span><span className={`t-sub2 ${s.heroSub}`}>{branchLine}</span></span>
        <span className={`${s.role} ${s[me.role]}`}>{roleName[me.role]}</span>
      </div>

      <div className={`${s.stats} rise`} style={{ ["--i" as string]: 1 }}>
        <div className={s.stat}><span className={s.statNum}>{today ? today.units : "–"}</span><span className={`t-cap1 ${s.statLabel}`}>дана QR-мен</span></div>
        <div className={s.stat}><span className={s.statNum}>{today ? today.done : "–"}</span><span className={`t-cap1 ${s.statLabel}`}>тапсырыс берілді</span></div>
        <div className={`${s.stat} ${today && today.open ? s.statHot : ""}`}><span className={s.statNum}>{today ? today.open : "–"}</span><span className={`t-cap1 ${s.statLabel}`}>күтуде</span></div>
      </div>

      <div className={`${s.actions} rise`} style={{ ["--i" as string]: 2 }}>
        <button className={s.action} onClick={qr}><Tile e="▦" size={40} /><b>QR көрсету</b><small>Клиент сканерлейді, дана шегеріледі</small></button>
        <button className={s.action} onClick={code}><Tile e="#" size={40} /><b>Кодты тексеру</b><small>Тапсырыс не жоспардың 4 таңбалы коды</small></button>
      </div>

      <div className={`${s.sectionHead} rise`} style={{ ["--i" as string]: 3 }}>
        <h2 className={s.sectionTitle}>Тапсырыстар</h2>
        <div className={s.seg}>
          <button className={`${s.segBtn} ${tab === "now" ? s.segOn : ""}`} onClick={() => { haptic.select(); setTab("now"); }}>Қазір{nowCount ? ` · ${nowCount}` : ""}</button>
          <button className={`${s.segBtn} ${tab === "plan" ? s.segOn : ""}`} onClick={() => { haptic.select(); setTab("plan"); }}>Жоспар{planCount ? ` · ${planCount}` : ""}</button>
        </div>
      </div>
      {orders === null ? <div className={s.empty}>Жүктелуде…</div>
        : list.length === 0 ? <div className={`t-sub2 ${s.empty}`}>{tab === "now" ? "Қазір күтіп тұрған тапсырыс жоқ" : "Алдағы жоспарлар жоқ"}</div>
        : list.map((o) => (
          <div key={o.id} className={s.card}>
            <div className={s.cardTop}>
              <span className={s.cardText}>
                <span className={s.cardTitle}>{o.title}</span>
                <span className={`t-sub2 ${s.cardSub}`}>{o.customer}{o.username ? " · @" + o.username : ""}{o.courier ? " · курьер" : ""}</span>
                <span className={`t-sub2 ${s.cardSub}`}>{whenOf(o)}{me.branches.length > 1 ? " · " + o.branch : ""}</span>
              </span>
              <span className={s.no}>№{o.no}</span>
            </div>
            <span className={`${s.pill} ${s[o.status]}`}>{statusName[o.status]}</span>
            <div className={s.cardBtns}>
              {o.status === "sent" && <button className={s.btn} disabled={busy === o.id} onClick={() => void setStatus(o, "accepted")}>Қабылдау</button>}
              {o.status === "accepted" && <button className={s.btn} disabled={busy === o.id} onClick={() => void setStatus(o, "ready")}>Дайын</button>}
              {o.status === "ready" && <button className={s.btn} onClick={code}>Кодты енгізу</button>}
              <button className={`${s.btn} ${s.btnSoft} ${s.btnSmall}`} style={{ height: 42 }} onClick={() => void more(o)}>•••</button>
            </div>
          </div>
        ))}

      <div className={s.sectionHead}><h2 className={s.sectionTitle}>Соңғы қолданулар</h2><span className={`t-cap1 ${s.cardSub}`}>30 минут</span></div>
      {uses === null ? <div className={s.empty}>Жүктелуде…</div>
        : uses.length === 0 ? <div className={`t-sub2 ${s.empty}`}>Әзірге QR-мен қолдану болған жоқ</div>
        : <div className={s.list}>{uses.map((u) => (
          <div key={u.id} className={`${s.use} ${u.cancelled ? s.struck : ""}`}>
            <span className={s.useText}><span className={s.useTitle}>{u.customer} · {u.title}</span><span className={`t-cap1 ${s.useSub}`}>{timeOf(u.at)} · {ago(u.at)}{u.cancelled ? " · бас тартылды" : ""}</span></span>
            <span className={s.units}>{u.units} дана</span>
            {u.canCancel && <button className={`${s.btn} ${s.btnDanger} ${s.btnSmall}`} onClick={() => { haptic.tap(); setCancel(u); }}>Қайтару</button>}
          </div>
        ))}</div>}

      {me.role !== "cashier" && (
        <Group i={6}><Row left={<Tile e="👥" size={36} />} title="Қызметкерлер" sub="Кассир шақыру, тізім" onClick={() => go("/desk/staff")} /></Group>
      )}
      {cancel && <Confirm title="Қолдануды қайтару?" text={`${cancel.customer}: ${cancel.units} дана пакетіне қайтарылады. Тек қате болса қолданыңыз (басқа мекеме, қате дана).`}
        cancel="Жоқ" ok="Қайтару" danger onClose={() => setCancel(null)} onOk={() => void doCancel(cancel)} />}
    </SubPage>
  );
}

function nativeInfo(text: string) { return nativePick("Касса", text, [{ id: "ok", text: "Түсінікті" }], "ok"); }
