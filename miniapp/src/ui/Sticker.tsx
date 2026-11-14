// Анимациялық үйрек стикерлері (Telegram TGS → Lottie). Әр стикер Figma-дағы «Стикер орны (duck TGS)»
// суретіне сәйкес келетін дәл сол анимация. Файл мен ойнатқыш керек кезде ғана жүктеледі.
import { useEffect, useRef, useState } from "react";

export type StickerName = "egg" | "search" | "love" | "cry" | "sleep" | "stop" | "shop" | "wait" | "think" | "empty" | "lock" | "offline" | "party" | "phone" | "gift" | "hello" | "bags" | "archive" | "clean" | "sad" | "repair";
// Жұмыртқадағы балапанның TGS файлы әлі қолда жоқ: табылғанша орнында сәлемдескен үйрек тұрады
const alias: Partial<Record<StickerName, StickerName>> = { egg: "hello" };
const files = import.meta.glob("../assets/stickers/*.json", { import: "default" }) as Record<string, () => Promise<object>>;

export function Sticker({ name, size = 120, loop = true, className }: { name: StickerName; size?: number; loop?: boolean; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false; let anim: { destroy(): void; play(): void; pause(): void } | undefined; let io: IntersectionObserver | undefined;
    setReady(false);
    void Promise.all([import("lottie-web/build/player/lottie_light"), files[`../assets/stickers/${alias[name] ?? name}.json`]()]).then(([m, data]) => {
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
