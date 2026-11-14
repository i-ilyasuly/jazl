// Ішкі беттердің ортақ қаңқасы: ортадағы тақырып, «Артқа» (Telegram-да нативті BackButton),
// мазмұн 104px-тен басталады, топтар арасы 12px.
import { useCallback, type ReactNode } from "react";
import { useGo } from "../nav";
import { haptic, useBackButton } from "../telegram";
import { TelegramChrome } from "./TelegramChrome";
import s from "./SubPage.module.css";

export function SubPage({ title, children, variant, top }: { title: string; children: ReactNode; variant?: "settings" | "roomy"; top?: number }) {
  const go = useGo();
  const back = useCallback(() => go(-1, "back"), [go]);
  useBackButton(back);
  return (
    <div className={`${s.page} ${variant ? s[variant] : ""}`} style={top ? { ["--body-top" as string]: top + "px" } : undefined}>
      <TelegramChrome mode="back" onBack={back} />
      <h1 className={s.title}>{title}</h1>
      <div className={s.body}>{children}</div>
    </div>
  );
}

export function Group({ header, children, i = 0 }: { header?: string; children: ReactNode; i?: number }) {
  return (
    <section className={`${s.group} rise`} style={{ ["--i" as string]: i }}>
      {header && <h2 className={`t-sub2 w-600 ${s.header}`}>{header}</h2>}
      {children}
    </section>
  );
}

export function Row({ left, title, sub, right, onClick, inset = 68, wrap, dim }: { left?: ReactNode; title: string; sub?: string; right?: ReactNode; onClick?: () => void; inset?: number; wrap?: boolean; dim?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`${s.row} ${onClick ? s.tap : ""} ${dim ? s.dim : ""}`} style={{ ["--inset" as string]: inset + "px" }} onClick={onClick}>
      {left}
      <span className={`${s.text} ${wrap ? s.wrap : ""}`}><span className={s.rowTitle}>{title}</span>{sub && <span className={`t-cap1 ${s.sub}`}>{sub}</span>}</span>
      {right}
    </Tag>
  );
}

/** Figma: «Android / Switch» 52×32 */
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} className={`${s.switch} ${on ? s.on : ""}`} onClick={() => { haptic.select(); onChange(!on); }}><span /></button>;
}

export function SkRows({ n, circle = true }: { n: number; circle?: boolean }) {
  return <>{Array.from({ length: n }, (_, i) => (
    <div key={i} className={s.row}>
      {circle && <span className="sk" style={{ width: 40, height: 40, borderRadius: 20, flex: "none" }} />}
      <span className={s.text}><span className="sk" style={{ display: "block", width: 160, height: 16, borderRadius: 6, margin: "5px 0" }} /><span className="sk" style={{ display: "block", width: 120, height: 12, borderRadius: 6, margin: "4px 0" }} /></span>
      <span className="sk" style={{ width: 56, height: 16, borderRadius: 6 }} />
    </div>
  ))}</>;
}

/** Figma: «Android / Radio» 20×20 */
export function Radio({ on }: { on: boolean }) {
  return <span className={`${s.radio} ${on ? s.radioOn : ""}`} />;
}

export function Note({ children, i = 2 }: { children: ReactNode; i?: number }) {
  return <p className={`t-cap1 ${s.note} rise`} style={{ ["--i" as string]: i }}>{children}</p>;
}
