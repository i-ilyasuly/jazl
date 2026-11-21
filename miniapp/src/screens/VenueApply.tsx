// Figma: «Мекеме болып қосыл / Өтінім» (13886:39967) және «Қабылданды» (13886:40157)
import { RichWords } from "../ui/RichWords";
import { useCallback, useState } from "react";
import { useGo } from "../nav";
import { askPhone, haptic, nativePick } from "../telegram";
import { DoneHero, MainBar } from "../ui/MainBar";
import { SubPage } from "../ui/SubPage";
import chev from "../assets/icons/cardMore.svg";
import tgIcon from "../assets/icons/vTg.svg";
import tgGray from "../assets/icons/vTgGray.svg";
import wa from "../assets/icons/vWa.svg";
import check from "../assets/icons/vCheck.svg";
import s from "./VenueApply.module.css";

const cats = [{ id: "Тағам", text: "Тағам" }, { id: "Кофе", text: "Кофе" }, { id: "Шаштараз", text: "Шаштараз" }];
type Apps = { tg: boolean; wa: boolean };

function Messengers({ v, set }: { v: Apps; set: (a: Apps) => void }) {
  return (
    <div className={s.apps}>
      <button type="button" className={`t-cap1 w-600 ${s.app} ${v.tg ? s.appOn : ""}`} onClick={() => { haptic.select(); set({ ...v, tg: !v.tg }); }}>
        <img src={v.tg ? tgIcon : tgGray} width={16} height={16} alt="" />Telegram{v.tg && <img src={check} width={14} height={14} className={s.tick} alt="" />}
      </button>
      <button type="button" className={`t-cap1 w-600 ${s.app} ${v.wa ? s.appOnWa : ""}`} onClick={() => { haptic.select(); set({ ...v, wa: !v.wa }); }}>
        <img src={wa} width={16} height={16} alt="" />WhatsApp{v.wa && <span className={s.tickWa}>✓</span>}
      </button>
    </div>
  );
}

export function VenueApply() {
  const go = useGo();
  const [name, setName] = useState("");
  const [cat, setCat] = useState("Тағам");
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [apps, setApps] = useState<Apps>({ tg: true, wa: false });
  const [apps2, setApps2] = useState<Apps>({ tg: false, wa: false });
  const [bad, setBad] = useState(0);
  const missing = !name.trim() ? "name" : !addr.trim() ? "addr" : phone.replace(/\D/g, "").length < 10 ? "phone" : "";
  const send = useCallback(() => {
    if (missing) { haptic.error(); setBad((n) => n + 1); document.getElementById("v-" + missing)?.focus(); return; }
    haptic.success(); go("/profile/venue/done", "up", { replace: true });
  }, [missing, go]);
  const pickCat = async () => { const id = await nativePick("Санаты", "Мекемеңнің санатын таңда", cats, cats[(cats.findIndex((c) => c.id === cat) + 1) % cats.length].id); if (id) { haptic.select(); setCat(id); } };
  const fillPhone = async () => { if (phone) return; const p = await askPhone(); if (p) setPhone(p.startsWith("+") ? p : "+" + p); };
  const err = (k: string) => (bad && missing === k ? s.err : "");
  return (
    <SubPage title="Мекеме болып қосыл" top={100}>
      <h2 className={`${s.h} rise`}>Мекемеңді Squirrel-ге қос</h2>
      <p className={`${s.lead} rise`} style={{ ["--i" as string]: 1 }}>
        <RichWords cls={s} text="Мекемеңе [blue:жаңа тұрақты клиенттер] әкел. Төлем [green:алдын ала] түседі, ал [blue:комиссия төмен]." />
      </p>
      <ul className={`${s.points} rise`} style={{ ["--i" as string]: 2 }}>
        <li>Клиент Squirrel сканерімен төлейді, кассир тек жазылымды таңдап QR шығарады.</li>
        <li>Бірліктер мен мерзімді жүйе өзі есептейді</li>
        <li>Клиенттердің бағасы мен пікірін көресің</li>
      </ul>
      <form key={bad} className={`${s.form} rise`} style={{ ["--i" as string]: 3 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className={`${s.field} ${err("name")}`}><span className="t-cap1">Мекеме атауы</span><input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dämdi Doner" enterKeyHint="next" /></label>
        <button type="button" className={s.field} onClick={pickCat}><span className="t-cap1">Санаты</span><span key={cat} className={s.value}>{cat}</span><img src={chev} width={20} height={20} className={s.chev} alt="" /></button>
        <label className={`${s.field} ${err("addr")}`}><span className="t-cap1">Мекенжайы</span><input id="v-addr" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Қарағанды, Бухар-Жырау 52" enterKeyHint="next" /></label>
        <div className={`${s.field} ${s.tall} ${err("phone")}`}><label><span className="t-cap1">Байланыс телефоны</span><input id="v-phone" type="tel" inputMode="tel" value={phone} onFocus={fillPhone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 700 000 00 00" /></label><Messengers v={apps} set={setApps} /></div>
        <div className={`${s.field} ${s.tall}`}><label><span className="t-cap1">Қосымша телефон (міндетті емес)</span><input type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Нөмір қосу" /></label><Messengers v={apps2} set={setApps2} /></div>
      </form>
      <div style={{ height: 70 }} />
      <MainBar text="Өтінім жіберу" onClick={send} />
    </SubPage>
  );
}

export function VenueDone() {
  const go = useGo();
  const done = useCallback(() => go(-1, "back"), [go]);
  return (
    <SubPage title="Мекеме болып қосыл">
      <DoneHero top={280} title="Өтінім қабылданды" text="Сізбен 24 сағат ішінде хабарласамыз" sticker="reader" />
      <MainBar text="Дайын" onClick={done} />
    </SubPage>
  );
}
