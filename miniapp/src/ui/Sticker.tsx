// Анимациялық үйрек стикерлері (Telegram TGS → Lottie). Әр стикер Figma-дағы «Стикер орны (duck TGS)»
// суретіне сәйкес келетін дәл сол анимация. Файл мен ойнатқыш керек кезде ғана жүктеледі.
import { useEffect, useRef, useState } from "react";

export type StickerName = "egg" | "search" | "love" | "cry" | "sleep" | "stop" | "shop" | "wait" | "think" | "empty" | "lock" | "offline" | "party" | "phone" | "gift" | "hello" | "bags" | "archive" | "clean" | "sad" | "repair";
const files = import.meta.glob("../assets/stickers/*.json", { import: "default" }) as Record<string, () => Promise<object>>;

type Lottie = typeof import("lottie-web/build/player/lottie_light");
let player: Promise<Lottie> | null = null;
const cache = new Map<string, Promise<object>>();
/** Стикерді (ойнатқышымен бірге) алдын ала жүктеп қояды: кейін көрсеткенде орны бос тұрмайды.
 *  Мысалы, бағалау парағы ашылғанда — жұлдыз қойылғаннан кейінгі «love» стикері (Патша, 2026-11-16). */
export function preloadSticker(name: StickerName) {
  player ??= import("lottie-web/build/player/lottie_light");
  let d = cache.get(name);
  if (!d) { d = files[`../assets/stickers/${name}.json`](); cache.set(name, d); }
  return Promise.all([player, d]);
}

// ЕРЕЖЕ (Патша, 2026-11-16): ешбір стикер бір ойнап, қатып тоқтап қалмайды — барлығы үздіксіз қайталанады.
export function Sticker({ name, size = 120, className }: { name: StickerName; size?: number; className?: string }) {
  const loop = true;
  const box = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false; let anim: { destroy(): void; play(): void; pause(): void } | undefined; let io: IntersectionObserver | undefined;
    setReady(false);
    void preloadSticker(name).then(([m, data]) => {
      if (dead || !box.current) return;
      anim = m.default.loadAnimation({ container: box.current, renderer: "svg", loop, autoplay: true, animationData: data });
      setReady(true);
      // Экраннан тыс қалғанда анимация тоқтап тұрады (батарея мен өнімділік үшін)
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? anim?.play() : anim?.pause()));
      io.observe(box.current);
    });
    return () => { dead = true; io?.disconnect(); anim?.destroy(); };
  }, [name, loop]);
  return <span ref={box} className={className} aria-hidden style={{ display: "block", width: size, height: size, opacity: ready ? 1 : 0, transform: ready ? "none" : "scale(0.85)", transition: "opacity 0.3s ease, transform 0.4s cubic-bezier(0.3, 1.4, 0.5, 1)" }} />;
}
