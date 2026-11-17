// «Жүйе күйі» (Профиль → Жүйе күйі): мини апп пен бэкендтің байланысын тексеру беті (Патша, 2026-11-16, B1).
// Сервер жұмыс істей ме, каталог қайдан келді (сервер не үлгі), Telegram арқылы кіру өтті ме — бәрі бір жерде.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, API_URL } from "../api";
import { catalogState, loadCatalog } from "../catalog";
import { inTelegram, haptic } from "../telegram";
import { Group, Note, Row, SubPage } from "../ui/SubPage";
import { V as desk, loadStaff, roleName, useStaff } from "../venue/api";
import { useGo } from "../nav";

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
      {cat.branches.length > 0 && <TestDesk list={cat.branches} />}
      {cat.branches.length > 0 && <TestQrs list={cat.branches} />}
      <Note i={4}>Бұл бет бэкендтің мини аппен байланысын көрсетеді. «Сервер» деп тұрса — ұсыныстардың бағасы мен атауы дерекқордан келді.</Note>
    </SubPage>
  );
}

/** B3.1 сынағы (Патша, 2026-11-17): кассаның QR-ы. Нақты кассада мұны мекеме бөліміндегі кассир экраны көрсетеді.
 *  Medeo QR — кассир дана санын енгізеді, QR әр 30 секунд сайын жаңарады (суретке түсіріп алып, кейін қолдану мүмкін емес).
 *  Банк терминалы — кассир соманы енгізеді, клиент сомаға сай дананы «+» арқылы таңдайды. Компьютерден ашып, телефонмен сканерлеңіз. */
function TestQrs({ list }: { list: { venue: string; branchId: string; address: string }[] }) {
  const [pick, setPick] = useState(list[0]);
  const [mode, setMode] = useState<"medeo" | "bank">("medeo");
  const [units, setUnits] = useState(1);
  const [amount, setAmount] = useState(3000);
  const [payload, setPayload] = useState("");
  const [left, setLeft] = useState(0);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let dead = false; let timer = 0; let tick = 0;
    const load = async () => {
      try {
        const r = await fetch(API_URL + "/dev/qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "medeo" ? { branchId: pick.branchId, units } : { branchId: pick.branchId, amount }) });
        const j = await r.json() as { payload: string; exp: number | null };
        if (dead) return;
        setPayload(j.payload);
        if (j.exp) { setLeft(j.exp - Math.floor(Date.now() / 1000)); timer = window.setTimeout(load, Math.max(1000, (j.exp - Math.floor(Date.now() / 1000)) * 1000)); }
      } catch { /* сервер жоқ */ }
    };
    void load();
    tick = window.setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => { dead = true; clearTimeout(timer); clearInterval(tick); };
  }, [pick.branchId, mode, units, amount]);
  useEffect(() => { if (payload) void QRCode.toString(payload, { type: "svg", margin: 1, color: { dark: "#111a26", light: "#ffffff" } }).then(setSvg); }, [payload]);
  const chip = (on: boolean) => ({ padding: "4px 8px", borderRadius: 8, background: on ? "#229af0" : "var(--chip-tint)", color: on ? "#fff" : "var(--link)" });
  const step = { width: 36, height: 36, borderRadius: 18, background: "var(--chip-tint)", color: "var(--link)", fontSize: 20, lineHeight: "25px", fontWeight: 600 };
  return (
    <Group header="Сынақ касса QR-ы (B3)" i={5}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 16px" }}>
        {list.map((b) => <button key={b.branchId} onClick={() => setPick(b)} className="t-cap1" style={chip(b.branchId === pick.branchId)}>{b.venue}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "4px 16px" }}>
        <button className="t-sub2" style={chip(mode === "medeo")} onClick={() => setMode("medeo")}>Medeo QR · дана</button>
        <button className="t-sub2" style={chip(mode === "bank")} onClick={() => setMode("bank")}>Банк терминалы · сома</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "8px 16px" }}>
        {mode === "medeo" ? <>
          <button style={step} onClick={() => setUnits(Math.max(1, units - 1))}>−</button>
          <b className="t-title3">{units} дана</b>
          <button style={step} onClick={() => setUnits(Math.min(10, units + 1))}>+</button>
        </> : <>
          <button style={step} onClick={() => setAmount(Math.max(500, amount - 500))}>−</button>
          <b className="t-title3">{amount.toLocaleString("ru-RU")} ₸</b>
          <button style={step} onClick={() => setAmount(amount + 500)}>+</button>
        </>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 16px 16px" }}>
        <span style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="t-sub2" style={{ textAlign: "center" }}>{pick.venue} · {pick.address}</span>
        {mode === "medeo" && <span className="t-cap1 w-600" style={{ color: left <= 5 ? "#e53935" : "var(--link)" }}>QR {left} секундтан кейін жаңарады</span>}
        <span className="t-cap1" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Компьютерден ашып, телефондағы Medeo → Сканер арқылы оқыңыз. Пакет осы мекемеден болса — серверде шегеріледі; басқа мекемеден болса — ескерту шығады.</span>
      </div>
    </Group>
  );
}

/** C2 сынағы: өзіңді мекеменің иесі қылып, кассир экрандарын телефоннан көру (тек сынақ режимі, нақты режимде сервер 404 қайтарады). */
function TestDesk({ list }: { list: { venue: string; slug: string }[] }) {
  const go = useGo();
  const staff = useStaff();
  const [busy, setBusy] = useState("");
  const venues = list.filter((b, i) => list.findIndex((x) => x.slug === b.slug) === i);
  const toggle = async (slug: string, leave: boolean) => {
    setBusy(slug);
    try { await desk.devJoin(slug, leave); haptic.success(); await loadStaff(); if (!leave) go("/v"); } catch { haptic.error(); } finally { setBusy(""); }
  };
  return (
    <Group header="Мекеме бөлімі · сынақ (C2)" i={4}>
      {venues.map((v) => {
        const mine = staff?.find((x) => x.venue.slug === v.slug);
        return <Row key={v.slug} inset={16} title={v.venue} sub={mine ? `Сіз: ${roleName[mine.role]} · басып шығыңыз` : "Басып иесі болыңыз → Касса ашылады"}
          onClick={() => { if (!busy) void toggle(v.slug, Boolean(mine)); }} right={busy === v.slug ? wait : mine ? ok("қызметкер") : undefined} />;
      })}
    </Group>
  );
}
