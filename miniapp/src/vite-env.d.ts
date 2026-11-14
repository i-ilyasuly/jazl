/// <reference types="vite/client" />
interface TgBottomButton {
  setParams(p: { text?: string; color?: string; text_color?: string; is_visible?: boolean; is_active?: boolean; has_shine_effect?: boolean; position?: "left" | "right" | "top" | "bottom"; icon_custom_emoji_id?: string }): TgBottomButton;
  onClick(cb: () => void): TgBottomButton;
  offClick(cb: () => void): TgBottomButton;
  show(): TgBottomButton;
  hide(): TgBottomButton;
}
interface TelegramWebApp {
  ready(): void;
  expand(): void;
  initData?: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  isVersionAtLeast?: (v: string) => boolean;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  setBottomBarColor?: (c: string) => void;
  onEvent?: (e: string, cb: () => void) => void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton?: TgBottomButton;
  SecondaryButton?: TgBottomButton;
  HapticFeedback?: { impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void; notificationOccurred(t: "error" | "success" | "warning"): void; selectionChanged(): void };
  initDataUnsafe?: { user?: { first_name?: string; photo_url?: string } };
}
interface Window { Telegram?: { WebApp?: TelegramWebApp } }
