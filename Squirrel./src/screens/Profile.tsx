// Figma: «Профиль / Негізгі (1)» және «(2)» (13886:35519, 13886:35845)
import { getLang } from "../i18n";
import { useCallback, useState } from "react";
import { useMock } from "../mocks/useMock";
import { useSettings, useUnread } from "../store";
import { useGo } from "../nav";
import { haptic, inTelegram, nativePick, openChat, tg, useBackButton } from "../telegram";
import { Confirm } from "../ui/Confirm";
import { SUPPORT_BOT } from "../config";
import { HowSheet } from "../ui/HowSheet";
import { TelegramChrome } from "../ui/TelegramChrome";
import saving from "../assets/icons/p_saving.svg";
import fav from "../assets/icons/p_fav.svg";
import card from "../assets/icons/p_card.svg";
import doc from "../assets/icons/p_doc.svg";
import gift from "../assets/icons/p_gift.svg";
import bell from "../assets/icons/p_bell.svg";
import lock from "../assets/icons/p_lock.svg";
import globe from "../assets/icons/p_globe.svg";
import city from "../assets/icons/p_city.svg";
import ask from "../assets/icons/p_ask.svg";
import how from "../assets/icons/p_how.svg";
import terms from "../assets/icons/p_terms.svg";
import venue from "../assets/icons/p_venue.svg";
import font from "../assets/icons/p_font.svg";
import system from "../assets/icons/p_system.svg";
import { Tile } from "../ui/Tile";
import { roleName, useStaff } from "../venue/api";
import { useIsAdmin } from "../admin/api";
import { useBonus } from "../pay/bonus";
import { hasServer } from "../pay/checkout";
import { fmt } from "../mocks/offers";
import s from "./Profile.module.css";

interface RowDef { icon: string; tile?: string; title: string; sub?: string; value?: string; badge?: number; to: string }

const groups: { header?: string; rows: RowDef[] }[] = [
  { rows: [{ icon: saving, title: "Осы айдағы үнем", sub: "3 пакет пайдаланылды", value: "8 400 ₸", to: "/profile/savings" }] },
  { rows: [
    { icon: fav, title: "Таңдаулы", sub: "5 ұсыныс • 2 мекеме", to: "/profile/favorites" },
    { icon: card, title: "Төлем тәсілдері", sub: "Kaspi Pay, Visa •• 4417", to: "/profile/payment" },
    { icon: doc, title: "Сатып алу тарихы", sub: "Чектер, қайтарулар", to: "/profile/history" },
    { icon: gift, title: "Сыйлықтарым", sub: "Жіберілген және алынған", to: "/profile/gifts" },
    { icon: bell, title: "Хабарландырулар", sub: "Пакет мерзімі, жаңа ұсыныстар", badge: 2, to: "/profile/notifications" },
    { icon: lock, title: "Қауіпсіздік", sub: "Экран құлпы: өшірулі", to: "/profile/security" },
  ] },
  { rows: [
    { icon: globe, title: "Тіл", sub: "Қазақша", to: "/profile/language" },
    { icon: city, title: "Қала", sub: "Қарағанды", to: "/profile/city" },
    { icon: bell, title: "Діріл сынағы", sub: "Нативті дірілдерді тексеру", to: "/profile/haptics" },
    { icon: font, title: "Шрифт: Medeo", sub: "Барлық стильдер мен салмақтар", to: "/profile/fonts" },
    { icon: system, title: "Жүйе күйі", sub: "Сервер, каталог, кіру", to: "/profile/system" },
  ] },
  { header: "Көмек", rows: [
    { icon: ask, title: "Сұрақ қою", to: "/profile/ask" },
    { icon: how, title: "Қалай жұмыс істейді?", to: "/profile/how" },
    { icon: terms, title: "Шарттар және құпиялылық", to: "/profile/terms" },
    { icon: venue, title: "Мекеме болып қосыл", sub: "Тіркеу немесе кассир ретінде кіру", to: "/v/welcome" },
  ] },
];

export function Profile() {
  const go = useGo();
  const back = useCallback(() => go("/", "fade"), [go]);
  useBackButton(back);
  const { loading } = useMock("profile", true, 450);
  const unread = useUnread();
  const st = useSettings();
  const staff = useStaff();
  // C2: мекеме қызметкеріне ең үстінде «Касса» жолы (клиентке көрінбейді)
  const isAdmin = useIsAdmin();
  const top: RowDef[] = [
    ...(isAdmin ? [{ icon: "", tile: "a:security", title: "Medeo Басқару", sub: "Платформа иесінің беті", to: "/a" }] : []),
    ...(staff && staff.length ? [{ icon: "", tile: "🏪", title: "Мекеме бөлімі", sub: `${staff[0].venue.name} · ${staff[0].status === "pending" ? "растау күтуде" : roleName[staff[0].role]}${staff.length > 1 ? ` · +${staff.length - 1}` : ""}`, to: "/v" }] : []),
  ];
  // Medeo бонусы (күйген бірліктен қайтқан ақша): «Төлем тәсілдері» жолының астында
  const bonus = useBonus();
  const withBonus = groups.map((g, i) => (i !== 1 || !hasServer() ? g : { ...g, rows: [...g.rows.slice(0, 2), { icon: "", tile: "💰", title: "Medeo бонусы", sub: "Қайтқан ақша", value: bonus ? fmt(bonus.balance) : undefined, to: "/profile/bonus" }, ...g.rows.slice(2)] }));
  const all: typeof groups = top.length ? [{ rows: top }, ...withBonus] : withBonus;
  const subOf = (r: RowDef) => (r.to === "/profile/security" ? `Экран құлпы: ${st.lock ? "қосулы" : "өшірулі"}` : r.to === "/profile/language" ? (getLang() === "ru" ? "Русский" : "Қазақша") : r.sub);
  const [how, setHow] = useState(false);
  const [ask, setAsk] = useState(false);
  // Figma «Сұрақ қою / Ескерту диалогы» 13886:39249: алдымен ЖҚС ұсынылады
  const askFlow = async () => {
    haptic.tap();
    if (!inTelegram) return setAsk(true);
    const id = await nativePick("Сұрақ қою", "Алдымен жиі қойылатын сұрақтарды қарап шық: жауап сол жерде болуы мүмкін.", [{ id: "ask", text: "Сұрақ қою" }, { id: "faq", text: "ЖҚС-ке өту" }], "");
    if (id === "ask") openChat(SUPPORT_BOT); else if (id === "faq") go("/profile/faq");
  };
  const open = (r: RowDef) => { if (r.to === "/profile/ask") void askFlow(); else if (r.to === "/profile/how") { haptic.tap(); setHow(true); } else go(r.to); };
  const u = tg?.initDataUnsafe?.user as { first_name?: string; last_name?: string; username?: string; photo_url?: string } | undefined;
  const name = u?.first_name ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "Айгерім Нұрланова";
  const handle = u?.username ? "@" + u.username : u?.first_name ? "" : "@aigerim_n";
  return (
    <div className={s.page}>
      <TelegramChrome mode="back" onBack={back} />
      <div className={s.hero}>
        <span className={s.halo} />
        <span className={s.avatar}>{u?.photo_url ? <img src={u.photo_url} alt="" /> : name.slice(0, 1)}</span>
        <h1 className={s.name}>{name}</h1>
        <p className={`t-sub2 ${s.handle}`} style={{ whiteSpace: "pre" }}>{[handle, "Қарағанды"].filter(Boolean).join("  •  ")}</p>
      </div>
      <div className={s.groups}>
        {all.map((g, gi) => (
          <section key={gi} className={`${s.group} rise`} style={{ ["--i" as string]: gi }}>
            {g.header && <h2 className={`t-sub2 w-600 ${s.header}`}>{g.header}</h2>}
            {g.rows.map((r, i) => loading ? (
              <div key={r.title} className={`${s.row} ${r.sub ? "" : s.short}`}>
                <span className="sk" style={{ width: 36, height: 36, borderRadius: 10, flex: "none" }} />
                <span className={s.text}><span className="sk" style={{ display: "block", width: 150, height: 16, borderRadius: 6, margin: "5px 0" }} />{r.sub && <span className="sk" style={{ display: "block", width: 110, height: 12, borderRadius: 6, margin: "4px 0" }} />}</span>
              </div>
            ) : (
              <button key={r.title} className={`${s.row} ${r.sub ? "" : s.short}`} onClick={() => open(r)}>
                {r.tile ? <Tile e={r.tile} size={36} className={s.icon} /> : <img src={r.icon} width={36} height={36} className={s.icon} alt="" />}
                <span className={s.text}><span className={s.title}>{r.title}</span>{r.sub && <span className={s.sub}>{subOf(r)}</span>}</span>
                {r.value && <span className={s.value}>{r.value}</span>}
                {r.badge && unread ? <span className={`t-cap1 w-600 ${s.badge}`}>{unread}</span> : null}
                {i < g.rows.length - 1 && <span className={s.line} />}
              </button>
            ))}
          </section>
        ))}
        <button className={`t-cap1 ${s.version}`} onClick={() => go("/profile/about")}>Medeo v0.1 (MVP)</button>
      </div>
      {how && <HowSheet onClose={() => setHow(false)} />}
      {ask && <Confirm title="Сұрақ қою" text="Алдымен жиі қойылатын сұрақтарды қарап шық: жауап сол жерде болуы мүмкін." cancel="Сұрақ қою" ok="ЖҚС-ке өту"
        onClose={() => setAsk(false)} onOk={() => go("/profile/faq")} onCancel={() => openChat(SUPPORT_BOT)} />}
    </div>
  );
}
