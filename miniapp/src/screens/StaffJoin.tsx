// C2 · Шақыру сілтемесі ашылғанда (t.me/<бот>?startapp=staff_<code>): қай мекеме, қандай рөл → «Қабылдау» → Касса.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { desk, err, loadStaff, roleName, type Role } from "../desk";
import { haptic, inTelegram, useBottomButtons } from "../telegram";
import { SubPage } from "../ui/SubPage";
import { Tile } from "../ui/Tile";
import s from "./Desk.module.css";

type Info = { venue: string; role: Role; state: "open" | "used" | "expired" } | "notfound" | null;

export function StaffJoin() {
  const { code = "" } = useParams();
  const go = useGo();
  const [info, setInfo] = useState<Info>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  useEffect(() => { desk.inviteInfo(code).then(setInfo).catch(() => setInfo("notfound")); }, [code]);

  const accept = useCallback(async () => {
    if (busy) return;
    setBusy(true); haptic.medium();
    try { await desk.accept(code); haptic.success(); await loadStaff(); go("/desk", "forward", { replace: true }); }
    catch (e) { haptic.error(); const k = err(e); setFail(k === "invite_used" ? "Бұл сілтеме бұрын қолданылған" : k === "invite_expired" ? "Сілтеменің мерзімі өткен" : "Қабылдау өтпеді — қайталаңыз"); }
    finally { setBusy(false); }
  }, [busy, code, go]);
  const open = info && info !== "notfound" && info.state === "open";
  useBottomButtons({ text: busy ? "Қосылуда…" : "Қабылдау", shine: true, disabled: busy, onClick: () => void accept() }, undefined, Boolean(open));

  const bad = info === "notfound" ? "Шақыру табылмады" : info && info.state === "used" ? "Бұл шақыру қолданылған" : info && info.state === "expired" ? "Шақырудың мерзімі өткен" : "";
  return (
    <SubPage title="Шақыру">
      <div className={`${s.invite} rise`}>
        <Tile e="🏪" size={64} />
        {info === null ? <span className={`t-sub1 ${s.cardSub}`}>Жүктелуде…</span> : bad ? (
          <><h2 className={s.inviteName}>{bad}</h2><p className={`t-sub1 ${s.cardSub}`}>Мекеме иесінен жаңа сілтеме сұраңыз.</p></>
        ) : info !== "notfound" && (
          <>
            <h2 className={s.inviteName}>{info.venue}</h2>
            <p className={`t-sub1 ${s.cardSub}`}>сізді Jazl+ кассасына шақырады</p>
            <span className={`${s.role} ${s[info.role]}`}>{roleName[info.role]}</span>
            <p className={`t-sub2 ${s.cardSub}`}>{info.role === "cashier" ? "Сіз QR көрсетіп, тапсырыс кодтарын тексересіз." : "Сіз касса мен кассирлерді басқарасыз."}</p>
          </>
        )}
        {fail && <p className={`t-sub2 ${s.codeErr}`}>{fail}</p>}
      </div>
      {open && !inTelegram && <button className={s.btn} style={{ marginTop: 4 }} disabled={busy} onClick={() => void accept()}>Қабылдау</button>}
    </SubPage>
  );
}
