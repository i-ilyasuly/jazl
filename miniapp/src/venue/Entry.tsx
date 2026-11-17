// Figma «01 · Кіру»: Қош келдіңіз (13994:8040), Мекемені таңда (13994:8084), Шақыру коды (13994:8132), Код қате (13994:8166),
// Кассир: растау күтілуде (13994:8229).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGo } from "../nav";
import { haptic, openChat } from "../telegram";
import { Sticker } from "../ui/Sticker";
import { Tile } from "../ui/Tile";
import { SUPPORT_BOT } from "../config";
import { err, loadStaff, roleName, setPick, useStaff, V } from "./api";
import { Buttons, VPage, VSticker } from "./ui";
import s from "./V.module.css";

/** /v — кім екеніне қарай: қызметкер емес → Қош келдіңіз; расталмаған → күту; бірнеше мекеме → таңдау; әйтпесе рөлдің басты беті */
export function VGate() {
  const go = useGo();
  const staff = useStaff();
  useEffect(() => {
    if (staff === null) return;
    const act = staff.filter((x) => x.status === "active");
    if (!staff.length) go("/v/welcome", "fade", { replace: true });
    else if (!act.length) go("/v/pending", "fade", { replace: true });
    else if (act.length > 1 && !sessionStorage.getItem("jazl_v_picked")) go("/v/pick", "fade", { replace: true });
    else go(act[0] && act[0].role === "cashier" ? "/v/cashier" : "/v/home", "fade", { replace: true });
  }, [staff, go]);
  return <VPage><div className={s.state}><Sticker name="wait" size={100} /></div></VPage>;
}

export function VWelcome() {
  const go = useGo();
  const reg = useCallback(() => go("/v/apply"), [go]);
  const join = useCallback(() => go("/v/join"), [go]);
  return (
    <VPage>
      <div className={s.result} style={{ marginTop: 24 }}>
        <VSticker name="egg" size={150} />
        <h1 className={s.resultTitle} style={{ fontSize: 26 }}>Jazl+ Мекеме</h1>
        <p className={s.stateText}>Пакеттер, кассир режимі және есептер бір жерде</p>
      </div>
      <div className={s.card} style={{ marginTop: 20 }}>
        <button className={s.row} onClick={reg}><Tile e="v:venue" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Мекемені тіркеу</span><span className={s.rowSub}>Жаңа мекеме қосу, 10 минут</span></span><i className={s.arrow} /></button>
        <button className={s.row} onClick={join}><Tile e="v:key" size={36} /><span className={s.rowText}><span className={s.rowTitle}>Кассир ретінде қосылу</span><span className={s.rowSub}>Мекеме иесінің шақыру кодымен</span></span><i className={s.arrow} /></button>
      </div>
      <Buttons main={{ text: "Мекемені тіркеу", onClick: reg }} second={{ text: "Кіру", onClick: join }} />
    </VPage>
  );
}

export function VPickVenue() {
  const go = useGo();
  const staff = useStaff();
  const act = (staff ?? []).filter((x) => x.status === "active");
  const [i, setI] = useState(0);
  const next = useCallback(() => { setPick(i); sessionStorage.setItem("jazl_v_picked", "1"); haptic.medium(); go(act[i]?.role === "cashier" ? "/v/cashier" : "/v/home", "forward", { replace: true }); }, [i, act, go]);
  const tiles = ["v:venue", "v:venueOrange", "v:venuePurple"];
  return (
    <VPage title="Мекемені таңда" back>
      <p className={s.muted} style={{ fontSize: 17, lineHeight: "22px" }}>Бұл Telegram аккаунты бірнеше мекемеге байланған</p>
      <div className={s.card}>
        {act.map((x, k) => (
          <button key={x.venue.id} className={s.row} onClick={() => { haptic.select(); setI(k); }}>
            <Tile e={tiles[k % 3]} size={36} />
            <span className={s.rowText}><span className={s.rowTitle}>{x.venue.name}</span><span className={s.rowSub}>{roleName[x.role]} • {x.venue.city === "karaganda" ? "Қарағанды" : x.venue.city} • {x.venue.branchesTotal} филиал</span></span>
            <span className={`${s.check} ${i === k ? s.checkOn : ""}`} style={i === k ? undefined : { boxShadow: "inset 0 0 0 2px #b0b5ba" }} />
          </button>
        ))}
      </div>
      <Buttons main={{ text: "Жалғастыру", onClick: next }} />
    </VPage>
  );
}

/** Шақыру коды: 6 ұяшық (482-9…), «Қосылу» 6 сан енгізілгенде белсенді. Сілтемеден келсе (startapp=staff_<код>) — өзі толады. */
export function VJoin() {
  const go = useGo();
  const { code: pre = "" } = useParams();
  const [code, setCode] = useState(pre.replace(/\D/g, "").slice(0, 6));
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const join = useCallback(async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); haptic.medium();
    try {
      const r = await V.join(code); haptic.success(); await loadStaff();
      go(r.status === "active" ? "/v" : "/v/pending", "forward", { replace: true });
    } catch (e) { haptic.error(); setBad(true); setShake((x) => x + 1); void err(e); } finally { setBusy(false); }
  }, [code, busy, go]);
  const back = useCallback(() => go(-1, "back"), [go]);
  return (
    <VPage title="Шақыру коды" back>
      <div className={s.result} style={{ marginTop: 10 }}>
        <VSticker name={bad ? "think" : "lock"} size={110} />
        <h2 className={s.resultTitle} style={{ fontSize: 22 }}>{bad ? "Код қате" : "Кодты енгіз"}</h2>
        <p className={s.stateText}>{bad ? "Код дұрыс емес немесе мерзімі өтті. Мекеме иесінен жаңа код сұра." : "Мекеме иесі жіберген 6 таңбалы код. Ол қосымшада «Кассир шақыру» арқылы жасалады."}</p>
      </div>
      <div key={shake} className={`${s.cells} ${shake ? s.shake : ""}`} style={{ marginTop: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ display: "contents" }}>
            {i === 3 && <span className={s.dash} />}
            <span className={`${s.cell} ${bad ? s.cellBad : i === code.length ? s.cellOn : ""}`}>{code[i] ?? ""}</span>
          </span>
        ))}
        <input className={s.cellsInput} inputMode="numeric" autoComplete="one-time-code" autoFocus aria-label="Шақыру коды" value={code} maxLength={6}
          onChange={(e) => { setBad(false); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} />
      </div>
      <Buttons main={{ text: busy ? "Тексерілуде…" : "Қосылу", onClick: () => void join(), disabled: code.length !== 6 || busy }} second={{ text: "Артқа", onClick: back }} />
    </VPage>
  );
}

export function VPending() {
  const go = useGo();
  const staff = useStaff();
  useEffect(() => { const t = window.setInterval(() => void loadStaff(), 10000); return () => clearInterval(t); }, []);
  useEffect(() => { if (staff?.some((x) => x.status === "active")) go("/v", "fade", { replace: true }); }, [staff, go]); // иесі растаған сәтте ашылады
  const close = useCallback(() => go("/profile", "fade"), [go]);
  const contact = useCallback(() => openChat(SUPPORT_BOT), []);
  return (
    <VPage>
      <div className={s.state} style={{ top: "calc(362px + var(--top-shift))" }}>
        <VSticker name="wait" size={120} />
        <h2 className={s.stateTitle}>Сұраныс жіберілді</h2>
        <p className={s.stateText}>Мекеме иесі растағанша күтіңіз. Растау кезінде Telegram арқылы хабарлаймыз.</p>
      </div>
      <Buttons main={{ text: "Иесімен байланысу", onClick: contact }} second={{ text: "Жабу", onClick: close }} />
    </VPage>
  );
}
