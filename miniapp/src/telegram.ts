// Telegram Mini App ортасы (ресми құжат: core.telegram.org/bots/webapps).
// Telegram ішінде: толық экран, нативті «Артқа», нативті төменгі батырмалар, хаптика.
// Браузерде (Telegram-нан тыс): сол элементтердің көшірмесін өзіміз саламыз,
// сонда экранды Figma кадрымен пиксельдеп салыстыруға болады.
import { useEffect, useRef } from "react";

const wa = window.Telegram?.WebApp;
export const tg = wa;
export const inTelegram = Boolean(wa && wa.initData);
export const isIOS = inTelegram ? wa?.platform === "ios" : /iPhone|iPad|iPod/.test(navigator.userAgent);
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
// СЕБЕБІ (2026-11-16, Патша: P30 lite-та тек notification сезіледі): Telegram Android клиенті дірілді
// BotWebViewVibrationEffect арқылы береді. Телефонда амплитуда басқаруы болмаса (Vibrator.hasAmplitudeControl() = false,
// көп Huawei/EMUI), ол «fallback» уақыттарын VibrationEffect.createWaveform(timings, -1) ретінде жібереді. Android-та бұл
// массивтің 1-элементі — КҮТУ уақыты. impact/selection үлгілері бір элементті ({60}, {70}, {80}, {50}, {55}, {30}) —
// телефон тек күтеді, дірілдемейді. notification үлгілері көп элементті (күту, діріл, ...) — сондықтан тек солар сезіледі.
// ШЕШІМ: Android-та жеңіл дірілдерді WebView-дің өз Vibration API-імен (navigator.vibrate, Telegram-да VIBRATE рұқсаты бар)
// береміз; ол жоқ не бас тартса — Telegram-ның нативті әдісі. iOS-та тек нативті Taptic Engine.
const android = wa?.platform === "android";
const ms: Record<Impact | "select", number> = { light: 12, soft: 16, rigid: 14, medium: 24, heavy: 36, select: 10 };
let vibeOk: boolean | null = null; // соңғы navigator.vibrate нәтижесі (сынақ беті үшін)
function vibe(p: number | number[]): boolean {
  if (!android || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try { vibeOk = navigator.vibrate(p); } catch { vibeOk = false; }
  return vibeOk;
}
const hf = () => (at("6.1") ? wa?.HapticFeedback : undefined);
const impact = (k: Impact) => () => { if (!vibe(ms[k])) hf()?.impactOccurred(k); };
const notify = (k: "success" | "warning" | "error") => () => { hf()?.notificationOccurred(k); };
/** Сынақ беті үшін: нативті әдісті тікелей шақыру. */
export const rawHaptic = (kind: "impact" | "notification" | "selection", v?: string) => {
  const h = hf(); if (!h) return false;
  if (kind === "impact") h.impactOccurred(v as Impact); else if (kind === "notification") h.notificationOccurred(v as "success"); else h.selectionChanged();
  return true;
};
/** Сынақ беті үшін: WebView Vibration API-ін тікелей шақыру. Қайтарады: true/false, «жоқ» — API жоқ. */
export const rawVibrate = (p: number | number[]): boolean | "none" => {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return "none";
  try { return navigator.vibrate(p); } catch { return false; }
};
export const hapticInfo = () => ({ inTelegram, platform: wa?.platform ?? "—", version: wa?.version ?? "—", has: Boolean(wa?.HapticFeedback), ok: at("6.1"),
  vibrateApi: typeof navigator !== "undefined" && typeof navigator.vibrate === "function", android, lastVibe: vibeOk });
export const haptic = {
  tap: impact("light"),
  soft: impact("soft"),
  medium: impact("medium"),
  heavy: impact("heavy"),
  rigid: impact("rigid"),
  select: () => { if (!vibe(ms.select)) hf()?.selectionChanged(); },
  success: notify("success"),
  warning: notify("warning"),
  error: notify("error"),
};

/** Нативті «Артқа» батырмасы (толық экранда Telegram оны сол жақ жоғарғы бұрышқа өзі салады). */
let backOwners = 0;
let hideCount = 0;
/** Ағымдағы беттің «артқа» әрекеттері (соңғысы — белсенді). iOS-тағы шеттен сипау қимылы осыны шақырады. */
export const backHandlers: (() => void)[] = [];
export function useBackButton(onBack: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    backHandlers.push(onBack);
    return () => { const i = backHandlers.lastIndexOf(onBack); if (i >= 0) backHandlers.splice(i, 1); };
  }, [onBack, enabled]);
  useEffect(() => {
    if (!enabled || !inTelegram || !wa?.BackButton) return;
    backOwners++;
    if (!hideCount) wa.BackButton.show();
    wa.BackButton.onClick(onBack);
    return () => { backOwners--; wa.BackButton?.offClick(onBack); if (!backOwners) wa.BackButton?.hide(); };
  }, [onBack, enabled]);
}

/** Құлып экраны сияқты толық беттер: астыңғы беттің нативті батырмаларын (Main, Secondary, Back) уақытша жасырады
 *  (Патша, 2026-11-16: «құлыптаулы бетте нативті батырмалар қыдырып жүр»). Жабылғанда — бұрынғысы қалпына келеді. */
export function useHideNativeButtons(active = true) {
  useEffect(() => {
    if (!active || !inTelegram || !wa) return;
    hideCount++; applyButtons(); wa.BackButton?.hide();
    return () => { hideCount--; applyButtons(); if (!hideCount && backOwners > 0) wa?.BackButton?.show(); };
  }, [active]);
}

/** disabled — батырма жасырылмайды, сұр түсте белсенді емес болып тұрады (форма толмағанда). */
export interface BottomAction { text: string; onClick: () => void; position?: "left" | "bottom"; shine?: boolean; disabled?: boolean }

/** Нативті төменгі батырмалар: Main оң жақта, Secondary сол жақта (Figma: биіктігі 50, радиусы 8). */
// ШЕШІМ (Патша, 2026-11-16: «төлем әдісін ауыстырғанда қатып барып ауысады»): бұрын батырманың мәтіні/әрекеті өзгерген сайын
// MainButton мен SecondaryButton жасырылып, қайта көрсетілетін — Telegram терезенің биіктігін екі рет өзгертіп, бет секіретін.
// Енді: басу өңдегіші бір рет тіркеледі (ref арқылы соңғы әрекетті шақырады), тек мәтін/күй өзгергенде setParams,
// жасыру — бет шынымен жабылғанда ғана (келесі бет батырманы алса, жасырылмайды → беттер арасында да жыпылықтамайды).
// Бір уақытта бірнеше иесі болуы мүмкін (бет + үстіндегі парақ): соңғы ашылғаны ғана басқарады, ол жабылса — алдыңғысы қалпына келеді.
type BtnEntry = { main: { current: BottomAction }; sec: { current: BottomAction | undefined } };
const btnStack: BtnEntry[] = [];
let btnBound = false;
let hideTimer = 0;
function applyButtons() {
  if (!wa?.MainButton) return;
  const top = btnStack[btnStack.length - 1];
  clearTimeout(hideTimer);
  if (hideCount) { wa.MainButton.hide(); wa.SecondaryButton?.hide(); return; }
  if (!top) { hideTimer = window.setTimeout(() => { if (!btnStack.length) { wa?.MainButton?.hide(); wa?.SecondaryButton?.hide(); } }, 200); return; } // келесі бет батырманы алса — жасырмаймыз
  const m = top.main.current, sc = top.sec.current;
  const dark = wa.colorScheme === "dark";
  const off = Boolean(m.disabled);
  wa.MainButton.setParams({ text: m.text, color: off ? (dark ? "#3b4a5d" : "#c4cdd6") : "#229af0", text_color: off ? (dark ? "#8a98a8" : "#ffffff") : "#ffffff", is_visible: true, is_active: !off, ...(at("7.10") ? { has_shine_effect: Boolean(m.shine) && !off } : {}) });
  if (sc && at("7.10") && wa.SecondaryButton) wa.SecondaryButton.setParams({ text: sc.text, position: sc.position ?? "left", color: dark ? "#1e3a52" : "#dbeefd", text_color: dark ? "#cbe6fc" : "#1f73c2", is_visible: true, is_active: true });
  else wa.SecondaryButton?.hide();
}
export function useBottomButtons(main: BottomAction, secondary?: BottomAction, enabled = true) {
  const mainRef = useRef(main); mainRef.current = main;
  const secRef = useRef(secondary); secRef.current = secondary;
  const entry = useRef<BtnEntry>({ main: mainRef, sec: secRef }).current;
  const live = enabled && inTelegram && Boolean(wa?.MainButton);
  useEffect(() => {
    if (!live || !wa?.MainButton) return;
    if (!btnBound) {
      btnBound = true;
      wa.MainButton.onClick(() => btnStack[btnStack.length - 1]?.main.current.onClick());
      if (at("7.10")) wa.SecondaryButton?.onClick(() => btnStack[btnStack.length - 1]?.sec.current?.onClick());
    }
    btnStack.push(entry); applyButtons();
    return () => { const i = btnStack.indexOf(entry); if (i >= 0) btnStack.splice(i, 1); applyButtons(); };
  }, [live, entry]);
  useEffect(() => { if (live && btnStack[btnStack.length - 1] === entry) applyButtons(); },
    [live, entry, main.text, main.shine, main.disabled, secondary?.text, secondary?.position, Boolean(secondary)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Кілт-мән қоймасы: Telegram ішінде нативті CloudStorage (6.9+, құрылғылар арасында синхрондалады),
 *  браузерде localStorage. */
export const kv = {
  get(key: string): Promise<string | null> {
    const raw = (k: string) => new Promise<string | null>((res) => {
      if (inTelegram && at("6.9") && wa?.CloudStorage) wa.CloudStorage.getItem(k, (err, v) => res(err ? null : v || null));
      else { try { res(localStorage.getItem(k)); } catch { res(null); } }
    });
    // Medeo. атауына ауысу (2026-11-17): кілттер medeo_* болды. Ескі @oylarbot ішінде сақталған jazl_* мәні (тіркелу, PIN, таңдаулылар,
    // Kaspi нөмірі) жоғалмауы үшін — жаңасы жоқ болса, ескісін оқып, жаңа кілтке көшіреміз.
    return raw(key).then(async (v) => {
      if (v !== null || !key.startsWith("medeo_")) return v;
      const oldKey = "jazl_" + key.slice(6);
      const old = await raw(oldKey);
      if (old !== null) { kv.set(key, old); kv.set(oldKey, ""); } // бір рет көшіріп, ескісін тазартамыз — бос мән кейін «тірілмейді»
      return old;
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

/** Мәтінді көшіру: Telegram-да буферге жазатын нативті әдіс жоқ (тек readTextFromClipboard), сондықтан WebView-дің
 *  Clipboard API-і, болмаса ескі execCommand жолы. Қайтарады: көшірілді ме. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ескі WebView */ }
  try {
    const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch { return false; }
}

/** Нативті QR сканерін бірден ашады — бет ауыспай тұрып (Патша, 2026-11-16: «QR бірден ашылсын, бет қайта шығып кіргендей болмасын»).
 *  null — нативті сканер жоқ (браузер не компьютер); string — оқылған QR мәтіні; false — пайдаланушы жапты. */
export function scanQrNative(text = "Кассадағы терминал экранындағы QR-ды рамкаға келтір"): Promise<string | false> | null {
  if (!inTelegram || !wa?.showScanQrPopup || !at("6.4")) return null;
  const w = wa as unknown as { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void };
  return new Promise((res) => {
    let got = false;
    const onClosed = () => { w.offEvent?.("scanQrPopupClosed", onClosed); if (!got) res(false); };
    w.onEvent?.("scanQrPopupClosed", onClosed);
    wa.showScanQrPopup!({ text }, (data) => { got = true; w.offEvent?.("scanQrPopupClosed", onClosed); res(String(data ?? "")); return true; });
  });
}
