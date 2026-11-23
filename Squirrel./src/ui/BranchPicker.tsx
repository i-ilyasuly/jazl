// Филиал таңдау (Патша, 2026-11-23): таңдалған филиал карточкасы + төменнен шығатын тізім.
// Әдепкі — ең жақын ашық филиал («Ең жақын» белгісі); жабық филиал таңдалмайды; орналасу белгісіз болса — «Ең жақынын табу».
import { useState } from "react";
import pin from "../assets/glyphs/map-pin.svg";
import nav from "../assets/glyphs/navigation.svg";
import { kmLabel, statusOf, type PickBranch } from "../branchPick";
import { haptic } from "../telegram";
import s from "./BranchPicker.module.css";

const mask = (u: string) => ({ maskImage: `url("${u}")`, WebkitMaskImage: `url("${u}")` });

function Status({ b }: { b: PickBranch }) {
  const st = statusOf(b);
  return <span className={s.meta}><i className={`${s.dot} ${st.ok ? s.ok : s.bad}`} /><span className={st.ok ? s.okText : s.badText}>{st.text}</span></span>;
}

/** Тапсырыс/жоспар бетіндегі «Қайдан аласың» карточкасы */
export function BranchCard({ venue, b, count, nearestId, loading, onOpen, i = 1 }: { venue: string; b: PickBranch | null; count: number; nearestId: string | null; loading?: boolean; onOpen: () => void; i?: number }) {
  if (loading && !b) return <div className={`${s.card} ${s.skel} rise`} style={{ ["--i" as string]: i }} aria-busy><span className={s.pinBig} /><span className={s.lines}><i /><i /><i /></span></div>;
  if (!b) return null;
  const many = count > 1;
  return (
    <button className={`${s.card} rise`} style={{ ["--i" as string]: i }} disabled={!many} onClick={() => { haptic.tap(); onOpen(); }} aria-label={`Алу орны: ${b.address}${many ? ". Өзгерту" : ""}`}>
      <span className={s.pinBig}><span className={s.glyph} style={mask(pin)} /></span>
      <span className={s.text}>
        <small className={s.over}>{many ? `${venue} · ${count} филиал` : venue}</small>
        <b key={b.id} className={s.addr}>{b.address}</b>
        <Status b={b} />
        {(b.km != null || b.id === nearestId) && <span className={s.meta}>{b.km != null && <span>{kmLabel(b.km)}</span>}{b.id === nearestId && <span className={s.near}>Ең жақын</span>}</span>}
      </span>
      {many && <span className={s.change}>Өзгерту</span>}
    </button>
  );
}

/** Төменнен шығатын тізім */
export function BranchSheet({ list, value, nearestId, hasKm, onPick, onLocate, onClose }: { list: PickBranch[]; value: string | null; nearestId: string | null; hasKm: boolean; onPick: (id: string) => void; onLocate: () => Promise<boolean>; onClose: () => void }) {
  const [locating, setLocating] = useState(false);
  const [noGeo, setNoGeo] = useState(false);
  const openN = list.filter((b) => b.open).length;
  return (
    <div className={s.root} role="dialog" aria-modal aria-label="Филиал таңдау">
      <div className={s.scrim} onClick={() => { haptic.soft(); onClose(); }} />
      <div className={s.sheet}>
        <span className={s.grabber} />
        <div className={s.head}>
          <h2 className={s.title}>Қай филиалдан аласың?</h2>
          <p className={s.sub}>{`${list.length} филиал · ${openN} ашық${hasKm ? " · жақыннан алысқа" : ""}`}</p>
        </div>
        {!hasKm && (
          <button className={s.locate} disabled={locating} onClick={async () => { haptic.tap(); setLocating(true); const ok = await onLocate(); setLocating(false); if (ok) haptic.success(); else { haptic.warning(); setNoGeo(true); } }}>
            <span className={`${s.locIco} ${locating ? s.spin : ""}`}><span className={s.glyph} style={mask(nav)} /></span>
            <span className={s.text}><b>{locating ? "Орналасу анықталуда…" : "Ең жақынын табу"}</b><small>{noGeo ? "Орналасу алынбады — филиалды тізімнен таңда" : "Орналасуды бір рет рұқсат етсең, жақыны жоғарыда тұрады"}</small></span>
          </button>
        )}
        <div className={s.list}>
          {list.map((b, n) => {
            const on = b.id === value;
            return (
              <button key={b.id} className={`${s.row} ${on ? s.on : ""}`} style={{ ["--n" as string]: n }} disabled={!b.open} aria-pressed={on}
                onClick={() => { haptic.select(); onPick(b.id); setTimeout(onClose, 200); }}>
                <span className={`${s.pinSm} ${b.open ? "" : s.pinOff}`}><span className={s.glyph} style={mask(pin)} /></span>
                <span className={s.text}><b className={s.rowTitle}>{b.address}{b.id === nearestId && <span className={s.near}>Ең жақын</span>}</b><Status b={b} /></span>
                {b.km != null && <span className={s.km}>{kmLabel(b.km)}</span>}
                <span className={s.radio} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
