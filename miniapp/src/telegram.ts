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
};

/** Нативті «Артқа» батырмасы (толық экранда Telegram оны сол жақ жоғарғы бұрышқа өзі салады). */
export function useBackButton(onBack: () => void) {
  useEffect(() => {
    if (!inTelegram || !wa?.BackButton) return;
    wa.BackButton.show();
    wa.BackButton.onClick(onBack);
    return () => { wa.BackButton?.offClick(onBack); wa.BackButton?.hide(); };
  }, [onBack]);
}

export interface BottomAction { text: string; onClick: () => void }

/** Нативті төменгі батырмалар: Main оң жақта, Secondary сол жақта (Figma: биіктігі 50, радиусы 8). */
export function useBottomButtons(main: BottomAction, secondary?: BottomAction) {
  useEffect(() => {
    if (!inTelegram || !wa?.MainButton) return;
    const dark = wa.colorScheme === "dark";
    wa.MainButton.setParams({ text: main.text, color: "#229af0", text_color: "#ffffff", is_visible: true, is_active: true });
    wa.MainButton.onClick(main.onClick);
    if (secondary && at("7.10") && wa.SecondaryButton) {
      wa.SecondaryButton.setParams({ text: secondary.text, position: "left", color: dark ? "#1e3a52" : "#dbeefd", text_color: dark ? "#cbe6fc" : "#1f73c2", is_visible: true, is_active: true });
      wa.SecondaryButton.onClick(secondary.onClick);
    }
    return () => {
      wa.MainButton?.offClick(main.onClick); wa.MainButton?.hide();
      if (secondary) { wa.SecondaryButton?.offClick(secondary.onClick); wa.SecondaryButton?.hide(); }
    };
  }, [main, secondary]);
}
