// «Жүйе күйі» (Профиль → Жүйе күйі): мини апп пен бэкендтің байланысын тексеру беті (Патша, 2026-11-16, B1).
// Сервер жұмыс істей ме, каталог қайдан келді (сервер не үлгі), Telegram арқылы кіру өтті ме — бәрі бір жерде.
import { useEffect, useState } from "react";
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
    api<Me>("/v1/me").then((r) => setMe({ ok: true, name: r.user.firstName })).catch((e: { status?: number }) => setMe({ ok: false, why: e.status === 401 ? (inTelegram ? "қолтаңба өтпеді" : "Telegram сыртында ашылған") : "сервер жауап бермеді" }));
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
      <Note i={4}>Бұл бет бэкендтің мини аппен байланысын көрсетеді. «Сервер» деп тұрса — ұсыныстардың бағасы мен атауы дерекқордан келді.</Note>
    </SubPage>
  );
}
