// «Шрифт» сынақ беті (Патша, 2026-11-16): Medeo отбасының барлық стилі мен салмағы, UI-kit шкаласы,
// көк/сары ескерту блоктары ішіндегі боялған сөздер. Профиль → «Шрифт: Medeo».
import { Group, Note, SubPage } from "../ui/SubPage";
import s from "./FontTest.module.css";

const sample = "Әсем Қарағанды: ұлы дала, өзен, үміт, іңкәр, ғасыр, һәм ₸ 1 234 567";
const scale: [string, string, number][] = [
  ["Large Title · 34/41", "t-large-title", 700], ["Title 1 · 28/34", "t-title1", 700], ["Title 2 · 24/30", "t-title2", 700],
  ["Title 3 · 20/25", "t-title3", 600], ["Headline · 19/24", "t-headline", 600], ["Text · 17/22", "t-text", 400],
  ["Subheadline 1 · 16/21", "t-sub1", 400], ["Subheadline 2 · 15/20", "t-sub2", 400], ["Caption 1 · 13/16", "t-cap1", 400], ["Caption 2 · 11/13", "t-cap2", 400],
];
const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function FontTest() {
  return (
    <SubPage title="Шрифт: Medeo" variant="settings">
      <Group header="Medeo Sans · UI-kit шкаласы" i={0}>
        <div className={s.box}>{scale.map(([n, c, w]) => <div key={n} className={s.item}><small className="t-cap1">{n} · {w}</small><p className={c} style={{ fontWeight: w }}>Medeo пакеттер</p></div>)}</div>
      </Group>
      <Group header="Medeo Sans · салмақтар 100–900" i={1}>
        <div className={s.box}>{weights.map((w) => <div key={w} className={s.item}><small className="t-cap1">{w}</small><p className="t-text" style={{ fontWeight: w }}>{sample}</p></div>)}</div>
      </Group>
      <Group header="Medeo Sans Italic" i={2}>
        <div className={s.box}>{[400, 600, 800].map((w) => <p key={w} className="t-text" style={{ fontStyle: "italic", fontWeight: w }}>{w} · {sample}</p>)}</div>
      </Group>
      <Group header="Ескерту блоктары: көк, сары, жасыл" i={3}>
        <div className={s.box}>
          <p className="t-text infoBox">Пакеттің <b className={s.hlG}>мерзімі 30 күн</b>, әр бірлікті бөлек күндері аласың. Сусын <b className={s.hlB}>қосылмайды</b>, бірақ мекемеде оған жеңілдік бар.</p>
          <p className="t-sub2 infoBox infoWarn">Мекемеге келгенде кассирге <b className={s.hlB}>«Medeo, тапсырыс 104»</b> деп айт. Код: <b className={`${s.hlG} mono`}>4729</b>. Курьер жалдасаң, ол кодты айтады.</p>
          <p className="t-sub2 infoBox infoOk">Қайта алсаң, қалған бірлік <b className={s.hlG}>келесі айға көшеді</b>.</p>
        </div>
      </Group>
      <Group header="Medeo Mono · кодтар" i={4}>
        <div className={s.box}>
          <p className={`mono ${s.code}`}>4 7 2 9</p>
          <p className="mono t-text">MD-8F3K29 · MD-ORD104 · 0123456789</p>
          {[400, 600, 800].map((w) => <p key={w} className="mono t-sub2" style={{ fontWeight: w }}>{`${w} · Тапсырыс №104 · 6 000 ₸`}</p>)}
        </div>
      </Group>
      <Group header="Medeo Serif" i={5}>
        <div className={s.box}><p className={s.serif} style={{ fontSize: 24, lineHeight: "30px" }}>Medeo — жергілікті мекемелердің пакеттері</p><p className={`${s.serif} t-text`}>{sample}</p></div>
      </Group>
      <Group header="Medeo Pixel" i={6}>
        <div className={s.box}><p className={s.pixel} style={{ fontSize: 28, lineHeight: "34px" }}>MEDEO. 30%</p><p className={`${s.pixel} t-text`}>{sample}</p></div>
      </Group>
      <Note i={7}>Medeo — DNF студиясының ашық шрифті (SIL OFL 1.1). Қосымшада негізгі шрифт — Medeo Sans, кодтарда — Medeo Mono. Serif пен Pixel тек осы бетте.</Note>
    </SubPage>
  );
}
