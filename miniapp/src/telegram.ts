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
  const dark = wa?.colorScheme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const page = dark ? "#1d2733" : "#f2f4f7";
  const card = dark ? "#242f3d" : "#fbfcfe";
  if (at("6.9")) { wa?.setHeaderColor?.(card); wa?.setBackgroundColor?.(page); }
  if (at("7.10")) wa?.setBottomBarColor?.(dark ? "#17212b" : "#ffffff");
}

export function initTelegram() {
  document.documentElement.dataset.env = inTelegram ? "telegram" : "browser";
  if (!wa || !inTelegram) return;
  wa.ready();
  wa.expand();
  if (at("7.7")) wa.disableVerticalSwipes?.(); // тізімді айналдырғанда қосымша жабылып қалмасын
  if (at("8.0") && wa.platform !== "tdesktop" && wa.platform !== "weba" && wa.platform !== "webk") {
    try { wa.requestFullscreen?.(); } catch { /* ескі клиент */ }
  }
  applyTheme();
  wa.onEvent?.("themeChanged", applyTheme);
}

export const haptic = {
  tap: () => wa?.HapticFeedback?.impactOccurred("light"),
  select: () => wa?.HapticFeedback?.selectionChanged(),
  success: () => wa?.HapticFeedback?.notificationOccurred("success"),
  error: () => wa?.HapticFeedback?.notificationOccurred("error"),
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

export interface BottomAction { text: string; onClick: () => void; position?: "left" | "bottom" }

/** Нативті төменгі батырмалар: Main оң жақта, Secondary сол жақта (Figma: биіктігі 50, радиусы 8). */
export function useBottomButtons(main: BottomAction, secondary?: BottomAction, enabled = true) {
  useEffect(() => {
    if (!enabled || !inTelegram || !wa?.MainButton) return;
    const dark = wa.colorScheme === "dark";
    wa.MainButton.setParams({ text: main.text, color: "#229af0", text_color: "#ffffff", is_visible: true, is_active: true });
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
