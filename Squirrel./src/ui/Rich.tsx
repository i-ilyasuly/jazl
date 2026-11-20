// Мекеме сипаттамасының белгілеуі: *жасыл* — артықшылық, _көк_ — маңызды, «> » жолы — ақпарат блогы.
// Мекеме бөлімінде (алдын ала көрініс) де, клиенттің ұсыныс бетінде де бірдей көрінеді.
import { Fragment } from "react";

export function Rich({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*[^*]+\*|_[^_]+_)/g).map((p, i) =>
    p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i} className="hl hl-green" style={{ background: "var(--hl-green-bg)", color: "var(--hl-green-text)", fontWeight: 400 }}>{p.slice(1, -1)}</b>
      : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <b key={i} className="hl" style={{ background: "var(--hl-blue-bg)", color: "var(--hl-blue-text)", fontWeight: 400 }}>{p.slice(1, -1)}</b> : <Fragment key={i}>{p}</Fragment>);
  return <>{text.split("\n").filter((l) => l.trim()).map((l, i) => l.startsWith("> ")
    ? <p key={i} className="t-sub2 infoBox" style={{ margin: "8px 0 0" }}>{inline(l.slice(2))}</p>
    : <p key={i} style={{ margin: i ? "6px 0 0" : 0, fontSize: 17, lineHeight: "24px" }}>{inline(l)}</p>)}</>;
}
