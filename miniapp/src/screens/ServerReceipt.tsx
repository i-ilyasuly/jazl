// B2 · Сервердегі чек: /receipt/srv/:id. Клиентке пайдалы ақпараттың бәрі (сатушы, пакет, үнем, төлем, мерзім).
// Ішкі бөлігі (комиссия, мекемеге төлем, құрылғы) серверде қалады — мұнда келмейді.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { fmt } from "../mocks/offers";
import { CopyCode } from "../ui/CopyCode";
import { Sticker } from "../ui/Sticker";
import { Group, Note, SubPage } from "../ui/SubPage";
import s from "./Receipt.module.css";

interface Rc {
  no: string; total: number; status: string; dateLocal: string;
  seller: { name: string; address: string | null; bin: string | null };
  agent: { name: string; note: string };
  item: { title: string; units: number; unitName: string; pricePerUnit: number; regularPricePerUnit: number; regularTotal: number; saving: number; discountPct: number };
  payment: { label: string; ref: string; mode: string };
  pack: { validFrom: string; validUntil: string; validDays: number; howToUse: string };
}

const Kv = ({ k, v, copy }: { k: string; v: string; copy?: boolean }) => (
  <div className={`t-sub2 ${s.kv}`}><span>{k}</span>{copy ? <CopyCode code={v} className={`${s.copy} mono`}>{v} ⧉</CopyCode> : <b>{v}</b>}</div>
);

export function ServerReceipt() {
  const { id = "" } = useParams();
  const [rc, setRc] = useState<Rc | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api<{ receipt: Rc }>("/v1/receipts/" + id).then((j) => setRc(j.receipt)).catch(() => setErr(true)); }, [id]);
  if (err) return <SubPage title="Чек"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Чекті жүктеу мүмкін болмады</p></SubPage>;
  if (!rc) return <SubPage title="Чек"><p className="t-sub2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Жүктелуде…</p></SubPage>;
  const i = rc.item;
  return (
    <SubPage title={`Чек ${rc.no}`} top={92}>
      <div className={s.hero}>
        <Sticker name="party" size={96} />
        <p className={s.amount}>{fmt(rc.total)}</p>
        <span className={`t-cap1 ${s.chip}`}>{rc.status}</span>
      </div>
      <Group header="Сатып алынды" i={1}>
        <Kv k="Пакет" v={i.title} />
        <Kv k="Көлемі" v={`${i.units} ${i.unitName}`} />
        <Kv k="1 бірлік бағасы" v={fmt(i.pricePerUnit)} />
        <Kv k="Бөлек алғанда" v={`${fmt(i.regularPricePerUnit)} / ${i.unitName}`} />
        <Kv k="Үнем" v={`${fmt(i.saving)} · ${i.discountPct}%`} />
      </Group>
      <Group header="Мекеме" i={2}>
        <Kv k="Атауы" v={rc.seller.name} />
        {rc.seller.address && <Kv k="Мекенжайы" v={rc.seller.address} />}
        {rc.seller.bin && <Kv k="БСН" v={rc.seller.bin} />}
      </Group>
      <Group header="Төлем" i={3}>
        <Kv k="Тәсілі" v={rc.payment.label} />
        <Kv k="Уақыты" v={rc.dateLocal} />
        <Kv k="Чек №" v={rc.no} copy />
        <Kv k="Транзакция" v={rc.payment.ref.slice(0, 18)} copy />
      </Group>
      <Group header="Пакет мерзімі" i={4}>
        <Kv k="Басталды" v={rc.pack.validFrom} />
        <Kv k="Аяқталады" v={rc.pack.validUntil} />
      </Group>
      <Note i={5}>{rc.pack.howToUse}. {rc.agent.note}.{rc.payment.mode === "test" ? " Бұл — сынақ төлемі: ақша алынған жоқ." : ""}</Note>
    </SubPage>
  );
}
