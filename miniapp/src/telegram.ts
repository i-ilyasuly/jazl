// Telegram Mini App ортасы (ресми құжат: core.telegram.org/bots/webapps).
// Telegram ішінде: толық экран, нативті «Артқа», нативті төменгі батырмалар, хаптика.
// Браузерде (Telegram-нан тыс): сол элементтердің көшірмесін өзіміз саламыз,
// сонда экранды Figma кадрымен пиксельдеп салыстыруға болады.
import { useEffect } from "react";

const wa = window.Telegram?.WebApp;
export const tg = wa;
export const inTelegram = Boolean(wa && wa.initData);
const at = (v: string) => Boolean(wa?.isVersionAtLeast?.(v));

function applyTheme() {
  const dark = inTelegram ? wa?.colorScheme === "dark" : Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const page = dark ? "#1d2733" : "#f2f4f7";
  const card = dark ? "#242f3d" : "#fbfcfe";
  if (at("6.9")) { wa?.setHeaderColor?.(card); wa?.setBackgroundColor?.(page); }
  if (at("7.10")) wa?.setBottomBarColor?.(dark ? "#17212b" : "#ffffff");
}

export function initTelegram() {
  document.documentElement.dataset.env = inTelegram ? "telegram" : "browser";
  if (!wa || !inTelegram) {
    applyTheme();
    window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
    return;
  }
  wa.ready();
  wa.expand();
  if (at("7.7")) wa.disableVerticalSwipes?.(); // тізімді айналдырғанда қосымша жабылып қалмасын
  if (at("8.0") && wa.platform !== "tdesktop" && wa.platform !== "weba" && wa.platform !== "webk") {
    try { wa.requestFullscreen?.(); } catch { /* ескі клиент */ }
  }
  applyTheme();
  wa.onEvent?.("themeChanged", applyTheme);
}

/**
 * Нативті діріл ережесі (әр жаңа бетте міндетті):
 * tap/light — карточка, ұяшық, навигация, артқа; soft — парақтарды жабу, жұмсақ әрекет;
 * medium — негізгі әрекет («Төлеу», «Қолдану», «Сыйлау», таңдаулыға қосу, жазылу);
 * heavy — сирек маңызды сәт (QR оқылды); rigid — PIN толық енгізілді, қатаң растау;
 * select — сегмент, таб, чип, көлем, галерея; success/warning/error — нәтиже.
 */
type Impact = "light" | "medium" | "heavy" | "rigid" | "soft";
// Telegram Android клиенті «light» дірілін 7 мс және әлсіз амплитудамен (65/255), «selection»-ды 1 мс-пен береді:
// көп Android (әсіресе Huawei, Xiaomi) телефонында мүлде сезілмейді. Сондықтан Android-та сол нативті
// әдістердің ішінен бір саты күштірегін аламыз: light→soft (10 мс, 175), selection→rigid (3 мс, 225), medium→heavy.
// iOS-та Taptic Engine нәзік дірілдерді жақсы береді, онда түпнұсқа күйі қалады.
const android = wa?.platform === "android";
const boost: Record<Impact, Impact> = android ? { light: "soft", soft: "soft", medium: "heavy", heavy: "heavy", rigid: "rigid" } : { light: "light", soft: "soft", medium: "medium", heavy: "heavy", rigid: "rigid" };
const hf = () => (at("6.1") ? wa?.HapticFeedback : undefined);
const impact = (k: Impact) => () => { hf()?.impactOccurred(boost[k]); };
const notify = (k: "success" | "warning" | "error") => () => { hf()?.notificationOccurred(k); };
/** Сынақ беті үшін: нативті әдісті ешбір күшейтусіз тікелей шақыру. */
export const rawHaptic = (kind: "impact" | "notification" | "selection", v?: string) => {
  const h = hf(); if (!h) return false;
  if (kind === "impact") h.impactOccurred(v as Impact); else if (kind === "notification") h.notificationOccurred(v as "success"); else h.selectionChanged();
  return true;
};
export const hapticInfo = () => ({ inTelegram, platform: wa?.platform ?? "—", version: wa?.version ?? "—", has: Boolean(wa?.HapticFeedback), ok: at("6.1") });
export const haptic = {
  tap: impact("light"),
  soft: impact("soft"),
  medium: impact("medium"),
  heavy: impact("heavy"),
  rigid: impact("rigid"),
  select: () => { if (android) hf()?.impactOccurred("rigid"); else hf()?.selectionChanged(); },
  success: notify("success"),
  warning: notify("warning"),
  error: notify("error"),
};

/** Нативті «Артқа» батырмасы (толық экранда Telegram оны сол жақ жоғарғы бұрышқа өзі салады). */
export function useBackButton(onBack: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled || !inTelegram || !wa?.BackButton) return;
    wa.BackButton.show();
    wa.BackButton.onClick(onBack);
    return () => { wa.BackButton?.offClick(onBack); wa.BackButton?.hide(); };
  }, [onBack, enabled]);
}

export interface BottomAction { text: string; onClick: () => void; position?: "left" | "bottom"; shine?: boolean }

/** Нативті төменгі батырмалар: Main оң жақта, Secondary сол жақта (Figma: биіктігі 50, радиусы 8). */
export function useBottomButtons(main: BottomAction, secondary?: BottomAction, enabled = true) {
  useEffect(() => {
    if (!enabled || !inTelegram || !wa?.MainButton) return;
    const dark = wa.colorScheme === "dark";
    wa.MainButton.setParams({ text: main.text, color: "#229af0", text_color: "#ffffff", is_visible: true, is_active: true, ...(at("7.10") ? { has_shine_effect: Boolean(main.shine) } : {}) });
    wa.MainButton.onClick(main.onClick);
    if (secondary && at("7.10") && wa.SecondaryButton) {
      wa.SecondaryButton.setParams({ text: secondary.text, position: secondary.position ?? "left", color: dark ? "#1e3a52" : "#dbeefd", text_color: dark ? "#cbe6fc" : "#1f73c2", is_visible: true, is_active: true });
      wa.SecondaryButton.onClick(secondary.onClick);
    } else wa.SecondaryButton?.hide();
    return () => {
      wa.MainButton?.offClick(main.onClick); wa.MainButton?.hide();
      if (secondary) { wa.SecondaryButton?.offClick(secondary.onClick); wa.SecondaryButton?.hide(); }
    };
  }, [main, secondary, enabled]);
}

/** Кілт-мән қоймасы: Telegram ішінде нативті CloudStorage (6.9+, құрылғылар арасында синхрондалады),
 *  браузерде localStorage. */
export const kv = {
  get(key: string): Promise<string | null> {
    return new Promise((res) => {
      if (inTelegram && at("6.9") && wa?.CloudStorage) wa.CloudStorage.getItem(key, (err, v) => res(err ? null : v || null));
      else { try { res(localStorage.getItem(key)); } catch { res(null); } }
    });
  },
  set(key: string, value: string) {
    if (inTelegram && at("6.9") && wa?.CloudStorage) wa.CloudStorage.setItem(key, value);
    else { try { localStorage.setItem(key, value); } catch { /* жеке режим */ } }
  },
};

/** Telegram ішіндегі сілтемені (бот, чат) Mini App-ты жаппай ашады. */
export function openChat(username: string) {
  const url = "https://t.me/" + username;
  if (inTelegram && wa?.openTelegramLink) wa.openTelegramLink(url); else window.open(url, "_blank", "noopener");
}

/** Чат/контакт таңдап жіберу — Telegram-ның нативті терезесі.
 *  1) Бот хабарламаны алдын ала дайындаса (savePreparedInlineMessage, Bot API 8.0) — WebApp.shareMessage:
 *     контактілер мен чаттар тізімі, хабарлама сыйлық карточкасы ретінде кетеді, sent=true/false қайтады.
 *  2) Әйтпесе — t.me/share/url: Telegram-ның өз «Кімге жіберу» тізімі (контактілер мен чаттар). */
export function shareToChat(opts: { preparedId?: string | null; url: string; text: string }): Promise<boolean> {
  return new Promise((res) => {
    if (opts.preparedId && inTelegram && wa?.shareMessage && at("8.0")) { wa.shareMessage(opts.preparedId, (sent) => res(Boolean(sent))); return; }
    const link = "https://t.me/share/url?url=" + encodeURIComponent(opts.url) + "&text=" + encodeURIComponent(opts.text);
    if (inTelegram && wa?.openTelegramLink) wa.openTelegramLink(link); else window.open(link, "_blank", "noopener");
    res(true);
  });
}

/** Файлды жүктеу. Telegram 8.0+: нативті «Файлды жүктеу?» терезесі (true — келісті, false — бас тартты).
 *  Браузерде: null — экран өз диалогын көрсетіп, saveFile арқылы жүктейді. */
export function downloadFile(url: string, fileName: string): Promise<boolean | null> {
  return new Promise((res) => {
    if (inTelegram && wa?.downloadFile && at("8.0")) { wa.downloadFile({ url, file_name: fileName }, (ok) => res(Boolean(ok))); return; }
    res(null);
  });
}
/** Браузерде файлды сақтау (<a download>). */
export function saveFile(url: string, fileName: string) {
  const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
}

/** Нативті ескерту терезесі (браузерде жай alert-ке түспейді: үнсіз өтеді). */
export function nativeAlert(message: string) {
  if (inTelegram && at("6.2") && wa?.showAlert) wa.showAlert(message);
}

/** Нативті таңдау терезесі (ең көбі 3 батырма). Браузерде бірден fallback мәні қайтады. */
export function nativePick(title: string, message: string, options: { id: string; text: string }[], fallback: string): Promise<string> {
  return new Promise((res) => {
    if (inTelegram && at("6.2") && wa?.showPopup) wa.showPopup({ title, message, buttons: options.map((o) => ({ id: o.id, type: "default" as const, text: o.text })) }, (id) => res(id || ""));
    else res(fallback);
  });
}

/** Ботқа хабар жазуға рұқсат сұрау (нативті диалог, 6.9+). */
export function askWriteAccess(): Promise<boolean> {
  return new Promise((res) => {
    if (inTelegram && at("6.9") && wa?.requestWriteAccess) wa.requestWriteAccess((ok) => res(ok)); else res(true);
  });
}

/** Бот пайдаланушыға жаза ала ма (initDataUnsafe.user.allows_write_to_pm). Telegram-нан тыс — null (белгісіз). */
export const botCanWrite = (): boolean | null => (inTelegram ? Boolean(wa?.initDataUnsafe?.user?.allows_write_to_pm) : null);

/** Нативті биометрия (BiometricManager, 7.2+): Face ID / саусақ ізі.
 *  Қайтарады: "ok" — расталды, "denied" — пайдаланушы бас тартты, "none" — құрылғыда жоқ, "browser" — Telegram-нан тыс. */
export function biometricAuth(reason: string): Promise<"ok" | "denied" | "none" | "browser"> {
  return new Promise((res) => {
    const bm = wa?.BiometricManager;
    if (!inTelegram || !at("7.2") || !bm) return res("browser");
    const run = () => {
      if (!bm.isBiometricAvailable) return res("none");
      const auth = () => bm.authenticate({ reason }, (ok) => res(ok ? "ok" : "denied"));
      if (bm.isAccessGranted) auth();
      else bm.requestAccess({ reason }, (granted) => (granted ? auth() : res("denied")));
    };
    if (bm.isInited) run(); else bm.init(run);
  });
}
export const biometricKind = () => wa?.BiometricManager?.biometricType ?? "unknown";

/** Пайдаланушының Telegram нөмірін нативті диалогпен сұрау (6.9+). Бермесе немесе браузерде — null. */
export function askPhone(): Promise<string | null> {
  return new Promise((res) => {
    if (inTelegram && at("6.9") && wa?.requestContact) wa.requestContact((ok, r) => res(ok ? r?.responseUnsafe?.contact?.phone_number ?? null : null)); else res(null);
  });
}

/** Орналасуды нативті сұрау (LocationManager, Bot API 8.0): Telegram өз рұқсат диалогын көрсетеді.
 *  Қайтарады: координата, null — бас тартылды, "browser" — Telegram-нан тыс немесе қолдау жоқ. */
export function askLocation(): Promise<{ latitude: number; longitude: number } | null | "browser"> {
  return new Promise((res) => {
    const lm = wa?.LocationManager;
    if (!inTelegram || !at("8.0") || !lm) return res("browser");
    const run = () => (lm.isLocationAvailable ? lm.getLocation((d) => res(d)) : res(null));
    if (lm.isInited) run(); else lm.init(run);
  });
}
/** Сыртқы сілтемені Telegram-ның ішкі браузерінде ашу. */
export function openExternal(url: string) { if (inTelegram && wa?.openLink) wa.openLink(url); else window.open(url, "_blank", "noopener"); }
