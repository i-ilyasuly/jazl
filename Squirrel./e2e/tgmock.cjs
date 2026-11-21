// Telegram WebApp жалған нысаны: MainButton/SecondaryButton күйін жазып отырады
module.exports = `
(() => {
  const mk = (n) => ({ n, params: {}, visible: false, cbs: [], setParams(p) { Object.assign(this.params, p); if ('is_visible' in p) this.visible = p.is_visible; }, show() { this.visible = true; }, hide() { this.visible = false; }, onClick(f) { this.cbs.push(f); }, offClick() {}, setText(t) { this.params.text = t; }, enable() {}, disable() {}, showProgress() {}, hideProgress() {} });
  const ev = {};
  window.Telegram = { WebApp: { initData: 'query_id=x&user=%7B%22id%22%3A1%7D&auth_date=1&hash=x', initDataUnsafe: { user: { id: 1, first_name: 'T' } }, version: '8.0', platform: 'android', colorScheme: 'light', themeParams: {}, isVersionAtLeast: () => true,
    MainButton: mk('main'), SecondaryButton: mk('sec'), BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, SettingsButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }, CloudStorage: { getItem: (k, cb) => cb(null, k === 'medeo_onboarded' ? '1' : ''), setItem: (k, v, cb) => cb && cb(null, true), getItems: (ks, cb) => cb(null, {}), removeItem: (k, cb) => cb && cb(null, true) },
    ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, enableClosingConfirmation() {}, disableClosingConfirmation() {}, disableVerticalSwipes() {}, requestFullscreen() {}, lockOrientation() {},
    onEvent(e, f) { (ev[e] ||= []).push(f); }, offEvent() {}, close() {}, openLink() {}, openTelegramLink() {}, showPopup(p, cb) { cb && cb('ok'); }, showConfirm(m, cb) { cb && cb(true); }, sendData() {}, safeAreaInset: { top: 0, bottom: 0 }, contentSafeAreaInset: { top: 0, bottom: 0 }, viewportHeight: 839, viewportStableHeight: 839, isExpanded: true } };
  window.__btn = () => ({ main: window.Telegram.WebApp.MainButton.visible ? window.Telegram.WebApp.MainButton.params.text : '-', sec: window.Telegram.WebApp.SecondaryButton.visible ? window.Telegram.WebApp.SecondaryButton.params.text : '-' });
})();`;
