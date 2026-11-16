// «Жүйе күйі» (Профиль → Жүйе күйі): мини апп пен бэкендтің байланысын тексеру беті (Патша, 2026-11-16, B1).
// Сервер жұмыс істей ме, каталог қайдан келді (сервер не үлгі), Telegram арқылы кіру өтті ме — бәрі бір жерде.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, API_URL } from "../api";
import { catalogState, loadCatalog } from "../catalog";
import { inTelegram, haptic } from "../telegram";
import { Group, Note, Row, SubPage } from "../ui/SubPage";

type Me = { user: { firstName: string; lang: string; city: string } };
const ok = (t: string) => <b className="t-text" style={{ color: "#1b6b2e", ["--dark-fg" as string]: "var(--tone-ok)" }}>{t}</b>;
const bad = (t: string) => <b className="t-text" style={{ color: "#e53935", ["--dark-fg" as string]: "var(--tone-bad)" }}>{t}</b>;
const wait = <b className="t-text" style={{ color: "var(--text-secondary)" }}>тексерілуде…</b>;

export function SystemStatus() {
  const [health, setHealth] = useState<null | { ok: boolean; ms: number }>(null);
  const [me, setMe] = useState<null | { ok: true; name: string } | { ok: false; why: string }>(null);
  const [cat, setCat] = useState({ ...catalogState });
  const check = () => {
    setHealth(null); setMe(null);
    const t0 = performance.now();
    api<{ ok: boolean }>("/health").then((r) => setHealth({ ok: r.ok, ms: Math.round(performance.now() - t0) })).catch(() => setHealth({ ok: false, ms: 0 }));
    api<Me>("/v1/me").then((r) => setMe({ ok: true, name: r.user.firstName })).catch((e: { status?: number; body?: { reason?: string } }) => {
      const why: Record<string, string> = { bad_hash: "қолтаңба өтпеді: басқа бот токені", expired: "кіру мерзімі өткен", missing: "Telegram сыртында ашылған", no_user: "пайдаланушы дерегі жоқ" };
      setMe({ ok: false, why: e.status === 401 ? (why[e.body?.reason ?? ""] ?? (inTelegram ? "қолтаңба өтпеді" : "Telegram сыртында ашылған")) : "сервер жауап бермеді" });
    });
    void loadCatalog().then(() => setCat({ ...catalogState }));
  };
  useEffect(check, []);
  return (
    <SubPage title="Жүйе күйі" variant="settings">
      <Group header="Сервер" i={0}>
        <Row title="API мекенжайы" sub={API_URL.replace("https://", "")} wrap />
        <Row title="Байланыс" right={health === null ? wait : health.ok ? ok(`жұмыс істейді · ${health.ms} мс`) : bad("жауап жоқ")} />
      </Group>
      <Group header="Каталог (B1)" i={1}>
        <Row title="Дереккөз" right={cat.source === "server" ? ok("сервер") : bad("үлгі деректер")} />
        <Row title="Мекемелер" right={<b className="t-text">{cat.venues || "—"}</b>} />
        <Row title="Ұсыныстар" right={<b className="t-text">{cat.offers || "—"}</b>} />
      </Group>
      <Group header="Кіру (Telegram)" i={2}>
        <Row title="Сіз" right={me === null ? wait : me.ok ? ok(`${me.name} · тіркелді`) : bad(me.why)} />
      </Group>
      <Group i={3}><Row title="Қайта тексеру" onClick={() => { haptic.tap(); check(); }} /></Group>
      {cat.branches.length > 0 && <TestQrs list={cat.branches} />}
      <Note i={4}>Бұл бет бэкендтің мини аппен байланысын көрсетеді. «Сервер» деп тұрса — ұсыныстардың бағасы мен атауы дерекқордан келді.</Note>
    </SubPage>
  );
}

/** B3 сынағы: әр филиалдың касса QR-ы (нақты кассаларда мекеме басып шығарады). Компьютерден ашып, телефонмен сканерлеуге болады. */
function TestQrs({ list }: { list: { venue: string; branchId: string; address: string }[] }) {
  const [pick, setPick] = useState(list[0]);
  const [svg, setSvg] = useState("");
  const url = `https://t.me/oylarbot?startapp=br_${pick.branchId}`;
  useEffect(() => { void QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#111a26", light: "#ffffff" } }).then(setSvg); }, [url]);
  return (
    <Group header="Сынақ касса QR-ы (B3)" i={5}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 16px" }}>
        {list.map((b) => <button key={b.branchId} onClick={() => setPick(b)} className="t-cap1" style={{ padding: "4px 8px", borderRadius: 8, background: b.branchId === pick.branchId ? "#229af0" : "var(--chip-tint)", color: b.branchId === pick.branchId ? "#fff" : "var(--link)" }}>{b.venue}</button>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 16px 16px" }}>
        <span style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="t-sub2" style={{ textAlign: "center" }}>{pick.venue} · {pick.address}</span>
        <span className="t-cap1" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Осы бетті компьютерден ашып, телефондағы Jazl+ → Сканер арқылы оқыңыз. Пакет осы мекемеден болса — бір бірлік серверде шегеріледі.</span>
      </div>
    </Group>
  );
}
