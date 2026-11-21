// Анимациялық үйрек стикерлері (Telegram TGS → Lottie). Әр стикер Figma-дағы «Стикер орны (duck TGS)»
// суретіне сәйкес келетін дәл сол анимация. Файл мен ойнатқыш керек кезде ғана жүктеледі.
import { useEffect, useRef, useState } from "react";
import { whenVisible } from "./lazyVisible";

export type StickerName = "egg" | "search" | "love" | "cry" | "sleep" | "stop" | "shop" | "wait" | "think" | "empty" | "lock" | "offline" | "party" | "phone" | "gift" | "hello" | "bags" | "archive" | "clean" | "sad" | "repair"
  // Мекеме бөлімі (Figma «Стикер кітапханасы (мекеме)»; design/sticker-packs: HalloDuck, UtyaDuck)
  | "chart" | "race" | "team" | "chef" | "city" | "money" | "clock" | "partyhat" | "painter" | "headset" | "reader" | "trophy" | "disco";
const files = import.meta.glob("../assets/stickers/*.json", { import: "default" }) as Record<string, () => Promise<object>>;

type Lottie = typeof import("lottie-web/build/player/lottie_light");
let player: Promise<Lottie> | null = null;
const cache = new Map<string, Promise<object>>();
// Өнімділік (Патша, 2026-11-21): бет айналып жатқанда барлық Lottie анимациясы (стикерлер мен Telegram эмодзилері — бір ойнатқыш)
// бір сәтке тоқтайды, айналу біткенде жалғасады. Әйтпесе әр кадрда SVG қайта салынып, айналдыру қатады.
addEventListener("medeo:scroll-start", () => { void player?.then((m) => (m.default as unknown as { freeze(): void }).freeze()); });
// Mini App жасырылса (басқа чатқа өтсе) — бәрі тоқтайды
addEventListener("visibilitychange", () => { void player?.then((m) => { const l = m.default as unknown as { freeze(): void; unfreeze(): void }; if (document.hidden) l.freeze(); else l.unfreeze(); }); });
addEventListener("medeo:scroll-end", () => { void player?.then((m) => (m.default as unknown as { unfreeze(): void }).unfreeze()); });
/** Стикерді (ойнатқышымен бірге) алдын ала жүктеп қояды: кейін көрсеткенде орны бос тұрмайды.
 *  Мысалы, бағалау парағы ашылғанда — жұлдыз қойылғаннан кейінгі «love» стикері (Патша, 2026-11-16). */
export function preloadSticker(name: StickerName) {
  player ??= import("lottie-web/build/player/lottie_light");
  let d = cache.get(name);
  if (!d) { d = files[`../assets/stickers/${name}.json`](); cache.set(name, d); }
  return Promise.all([player, d]);
}

// ЕРЕЖЕ (Патша, 2026-11-21): стикер ШЕКСІЗ қайталанып ойнайды (экраннан тыс болса — кідіреді).
// Тек мекеменің басты бетінде (venue/Home) `once` — бір рет ойнап, соңғы кадрда тоқтайды, басқанда қайта ойнайды.
type Anim = { destroy(): void; play(): void; pause(): void; goToAndPlay(v: number, f: boolean): void; goToAndStop(v: number, f: boolean): void; totalFrames: number; isPaused: boolean; addEventListener(e: string, f: () => void): void };
// Бетке қайта оралғанда (мысалы, мәзірде табтан табқа) стикер қайта ойнамайды — бірден соңғы кадрда тұрады (Патша, 2026-11-17)
const seen = new Set<string>();
export function Sticker({ name, size = 120, className, once = false }: { name: StickerName; size?: number; className?: string; once?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const anim = useRef<Anim | null>(null);
  const [ready, setReady] = useState(false);
  const [instant, setInstant] = useState(false);
  useEffect(() => {
    let dead = false; let io: IntersectionObserver | undefined; let played = false;
    const key = window.location.hash.split("?")[0] + "|" + name;
    const again = seen.has(key);
    setReady(false);
    let cancelVis: (() => void) | undefined;
    const build = () => void preloadSticker(name).then(([m, data]) => {
      if (dead || !box.current) return;
      const a = m.default.loadAnimation({ container: box.current, renderer: "svg", loop: !once, autoplay: false, animationData: data }) as unknown as Anim;
      anim.current = a;
      if (!once) {
        setReady(true);
        // Патша (2026-11-21): тек көзге көрініп тұрғанда ойнайды (кемінде 35%-ы экранда), әйтпесе тоқтап тұрады
        io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !document.hidden) a.play(); else a.pause(); }, { threshold: 0.35 });
        io.observe(box.current);
        return;
      }
      a.addEventListener("complete", () => { played = true; seen.add(key); });
      if (again) { played = true; a.goToAndStop(a.totalFrames - 1, true); setInstant(true); setReady(true); return; }
      setReady(true);
      // Бірінші рет экранға шыққанда ойнайды (бет төменде болса — көрінген сәтте), бір рет қана
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !played) a.play(); else if (!e.isIntersecting && !played) a.pause(); }, { threshold: 0.35 });
      io.observe(box.current);
    });
    // Экранға шыққанда және браузер бос кезде ғана құрамыз (артқа қайту мен сипау қатпауы үшін)
    if (box.current) cancelVis = whenVisible(box.current, build);
    return () => { dead = true; cancelVis?.(); io?.disconnect(); anim.current?.destroy(); anim.current = null; };
  }, [name, once]);
  const replay = () => { const a = anim.current; if (a && a.isPaused) a.goToAndPlay(0, true); };
  return <span ref={box} className={className} aria-hidden onClick={replay} style={{ cursor: "pointer", display: "block", width: size, height: size, opacity: ready ? 1 : 0, transform: ready ? "none" : "scale(0.85)", transition: instant ? "none" : "opacity 0.3s ease, transform 0.4s cubic-bezier(0.3, 1.4, 0.5, 1)" }} />;
}
