// Өнімділік (Патша, 2026-11-21: «артқа қайту баяу», «сипағанда қатады»). Lottie анимациясын құру (JSON талдау + салу)
// негізгі ағынды едәуір алады. Сондықтан анимация тек элемент экранға шыққанда және браузер бос болғанда құрылады:
// бет ауысуы кезінде (артқа қайтқанда) ешнәрсе салынбайды — бет бірден ашылады.
export function whenVisible(el: Element, cb: () => void): () => void {
  let done = false; let idle: number | undefined;
  const ric = (f: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(f, { timeout: 400 }) : globalThis.setTimeout(f, 120));
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || done) return;
    done = true; io.disconnect();
    idle = ric(() => cb()) as unknown as number;
  }, { rootMargin: "0px", threshold: 0.01 }); // экранға шықпайынша құрылмайды
  // Бет ауысу анимациясы (≈0.3 с) біткен соң ғана бақылай бастаймыз
  const t = window.setTimeout(() => io.observe(el), 320);
  return () => { done = true; window.clearTimeout(t); io.disconnect(); if (idle !== undefined) { if ("cancelIdleCallback" in window) window.cancelIdleCallback(idle); else globalThis.clearTimeout(idle); } };
}
