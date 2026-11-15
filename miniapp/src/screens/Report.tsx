// Figma: «Мәселе туралы жазу / Форма» (13886:39703) және «Қабылданды» (13886:39807)
import { useCallback, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useGo } from "../nav";
import { haptic } from "../telegram";
import { DoneHero, MainBar } from "../ui/MainBar";
import { Group, SubPage } from "../ui/SubPage";
import sp from "../ui/SubPage.module.css";
import attach from "../assets/icons/attach.svg";
import s from "./Report.module.css";

const kinds = ["Төлем өтпеді", "Мекеме қызмет көрсетпеді", "Төлем мәселесі", "Қайтару керек", "Басқа"];

export function Report() {
  const go = useGo();
  const [kind, setKind] = useState(0);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const send = useCallback(() => { haptic.success(); go("/profile/report/done", "up", { replace: true, state: { kind: kinds[kind] } }); }, [go, kind]);
  return (
    <SubPage title="Мәселе туралы жазу">
      <h2 className={`t-sub2 w-600 ${sp.sectionTitle} rise`}>Мәселе түрі</h2>
      <Group i={1}>
        {kinds.map((k, i) => (
          <button key={k} className={s.row} onClick={() => { if (kind !== i) { haptic.select(); setKind(i); } }}>
            <span className={s.label}>{k}</span><span className={`${s.radio} ${kind === i ? s.on : ""}`} />
          </button>
        ))}
      </Group>
      <h2 className={`t-sub2 w-600 ${sp.sectionTitle} rise`} style={{ ["--i" as string]: 2 }}>Сипаттама</h2>
      <label className={`${s.area} rise`} style={{ ["--i" as string]: 2 }}>
        <textarea value={text} rows={1} placeholder="Не болғанын жаз (міндетті емес)" onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} />
      </label>
      <button className={`t-text w-600 ${s.attach} rise`} style={{ ["--i" as string]: 3 }} onClick={() => file.current?.click()}>
        <img src={attach} width={22} height={22} alt="" /><span key={files.length} className={s.swap}>{files.length ? `${files.length} файл қосылды` : "Скриншот не фото қосу"}</span>
      </button>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])].map((x) => x.name); if (f.length) { haptic.success(); setFiles(f); } }} />
      <div style={{ height: 70 }} />
      <MainBar text="Жіберу" onClick={send} />
    </SubPage>
  );
}

export function ReportDone() {
  const go = useGo();
  const kind = (useLocation().state as { kind?: string } | null)?.kind ?? kinds[0];
  const done = useCallback(() => go(-1, "back"), [go]);
  const rows: [string, string, boolean?][] = [["Өтінім №", "JZ-2041"], ["Мәселе", kind], ["Мәртебе", "Қаралуда", true]];
  return (
    <SubPage title="Мәселе туралы жазу" top={372}>
      <DoneHero top={190} title="Өтінім қабылданды" text="Сізбен 24 сағат ішінде хабарласамыз" />
      <Group i={3}>
        {rows.map(([k, v, link]) => <div key={k} className={`t-sub2 ${s.kv}`}><span>{k}</span><b className={link ? s.link : ""}>{v}</b></div>)}
      </Group>
      <MainBar text="Дайын" onClick={done} />
    </SubPage>
  );
}
