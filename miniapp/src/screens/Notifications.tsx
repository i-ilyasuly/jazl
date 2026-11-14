// Figma: «Хабарландырулар / Негізгі» (13886:37921)
import { demoEmpty, useMock } from "../mocks/useMock";
import { EmptyState } from "../ui/EmptyState";
import { haptic } from "../telegram";
import { readNotice, setNoticePref, useNoticePrefs, useNotices, type NoticePrefs } from "../store";
import { Group, Row, SkRows, SubPage, Switch } from "../ui/SubPage";
import s from "./Notifications.module.css";

const settings: [keyof NoticePrefs, string, string][] = [
  ["expiry", "Мерзім ескертулері", "Пакет бітер алдында хабарлау"],
  ["rating", "Бағалау сұраулары", "Пайдаланғаннан кейін"],
  ["offers", "Жаңа ұсыныстар", "Таңдаулы мекемелерден"],
  ["promo", "Акциялар", "Арнайы ұсыныстар мен жеңілдіктер"],
];

export function Notifications() {
  const { loading } = useMock("notifications", true, 450);
  const list = useNotices();
  const prefs = useNoticePrefs();
  if (demoEmpty() || !list.length) return <SubPage title="Хабарландырулар"><EmptyState sticker="sleep" title="Жаңа хабарлама жоқ" text="Мерзім ескертулері мен жаңа ұсыныстар осында көрінеді" /></SubPage>;
  return (
    <SubPage title="Хабарландырулар">
      <Group header="Жаңа" i={0}>
        {loading ? <SkRows n={2} circle={false} /> : list.map((n) => (
          <Row key={n.id} wrap inset={38} title={n.title} sub={n.sub} onClick={() => { if (!n.read) { haptic.select(); readNotice(n.id); } }}
            left={<span className={`${s.dot} ${n.read ? s.read : ""}`} />}
            right={<span className={`t-cap1 ${s.time}`}>{n.time}</span>} />
        ))}
      </Group>
      <Group header="Баптаулар" i={1}>
        {settings.map(([k, t, sub]) => (
          <Row key={k} inset={16} title={t} sub={sub} right={<Switch on={prefs[k]} onChange={(v) => setNoticePref(k, v)} />} />
        ))}
      </Group>
    </SubPage>
  );
}
