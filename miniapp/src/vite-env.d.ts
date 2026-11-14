/// <reference types="vite/client" />
interface TgBottomButton {
  setParams(p: { text?: string; color?: string; text_color?: string; is_visible?: boolean; is_active?: boolean; has_shine_effect?: boolean; position?: "left" | "right" | "top" | "bottom"; icon_custom_emoji_id?: string }): TgBottomButton;
  onClick(cb: () => void): TgBottomButton;
  offClick(cb: () => void): TgBottomButton;
  show(): TgBottomButton;
  showProgress?(leaveActive?: boolean): TgBottomButton;
  hideProgress?(): TgBottomButton;
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
  showScanQrPopup?: (params: { text?: string }, cb?: (data: string) => boolean | void) => void;
  closeScanQrPopup?: () => void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton?: TgBottomButton;
  SecondaryButton?: TgBottomButton;
  HapticFeedback?: { impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void; notificationOccurred(t: "error" | "success" | "warning"): void; selectionChanged(): void };
  CloudStorage?: { setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void; getItem(key: string, cb: (err: string | null, value?: string) => void): void };
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string; photo_url?: string; language_code?: string } };
  openTelegramLink?: (url: string) => void;
  requestContact?: (cb?: (shared: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void;
  showAlert?: (message: string, cb?: () => void) => void;
  showPopup?: (p: { title?: string; message: string; buttons?: { id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }[] }, cb?: (id: string) => void) => void;
  requestWriteAccess?: (cb?: (granted: boolean) => void) => void;
  BiometricManager?: {
    isInited: boolean; isBiometricAvailable: boolean; biometricType: "finger" | "face" | "unknown"; isAccessRequested: boolean; isAccessGranted: boolean;
    init(cb?: () => void): void;
    requestAccess(p: { reason?: string }, cb?: (granted: boolean) => void): void;
    authenticate(p: { reason?: string }, cb?: (ok: boolean, token?: string) => void): void;
    openSettings(): void;
  };
}
interface Window { Telegram?: { WebApp?: TelegramWebApp } }
declare module "lottie-web/build/player/lottie_light" {
  const lottie: { loadAnimation(p: { container: Element; renderer: "svg"; loop: boolean; autoplay: boolean; animationData: object }): { destroy(): void; play(): void; pause(): void } };
  export default lottie;
}
