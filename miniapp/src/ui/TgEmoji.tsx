// Telegram анимациялық эмодзилері (Патша, 2026-11-21). Файлдар Telegram-ның өз «AnimatedEmojies» жиынтығынан,
// біздің сервер арқылы ресми Bot API-мен алынады (/v1/emoji/:name) — репоға салынбайды.
// Жүктелгенше (не сервер қолжетімсіз болса) орнында кәдімгі эмодзи таңбасы тұрады — бос орын болмайды.
// Ереже: 2 рет ойнайды да тоқтайды, сосын әр 7 с сайын бір рет қайта қимылдайды; экраннан тыс — кідіреді.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_URL } from "../api";

export const TG_EMOJI = { point_right: "👉", point_down: "👇", point_up: "👆", bell: "🔔", fire: "🔥", phone: "📱", star: "⭐", money: "💰",
  target: "🎯", rocket: "🚀", pin: "📍", cheap: "🏷️", gem: "💎", sparkles: "✨",
  you: "🫵", rich: "🤑", thumbs: "👍", partyface: "🥳" } as const;
export type TgEmojiName = keyof typeof TG_EMOJI;

type Lottie = typeof import("lottie-web/build/player/lottie_light");
let player: Promise<Lottie> | null = null;
const cache = new Map<TgEmojiName, Promise<object>>();
/** Алдын ала жүктеу: эмодзи көрінетін сәтке дейін дайын тұрады */
export function preloadTgEmoji(name: TgEmojiName) {
  player ??= import("lottie-web/build/player/lottie_light");
  let d = cache.get(name);
  if (!d) {
    d = fetch(`${API_URL}/v1/emoji/${name}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<object>; });
    d.catch(() => cache.delete(name)); // сәтсіз болса — келесі жолы қайта көреміз
    cache.set(name, d);
  }
  return Promise.all([player, d]);
}

type Anim = { destroy(): void; play(): void; pause(): void; goToAndPlay(v: number, f: boolean): void; goToAndStop(v: number, f: boolean): void; totalFrames: number; addEventListener(e: string, f: () => void): void };

export function TgEmoji({ name, size = 32, tilt = 0, className, style, play, once = false, tap = false, every }: {
  name: TgEmojiName; size?: number; tilt?: number; className?: string; style?: CSSProperties;
  /** Сырттан ойнату (мысалы, батырма басылғанда): мән өзгерген сайын бір рет ойнайды */
  play?: unknown;
  /** Бір рет ойнап, соңғы кадрда тоқтайды (мысалы, бағалау жұлдыздары) */
  once?: boolean;
  /** Өзі ойнамайды: тыныш тұрады, тек `play` өзгергенде (басылғанда) бір рет ойнайды (Патша, 2026-11-21) */
  tap?: boolean;
  /** Экранда көрініп тұрғанда ойнап, `every` мс үзіліспен қайталай береді; көрінбесе — тоқтайды.
   *  Әр эмодзи өзінің көрінуіне ғана қарайды (бір-біріне тәуелсіз). Патша, 2026-11-21 */
  every?: number;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const anim = useRef<Anim | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false; let io: IntersectionObserver | undefined; let t: number | undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    void preloadTgEmoji(name).then(([m, data]) => {
      if (dead || !box.current) return;
      const a = m.default.loadAnimation({ container: box.current, renderer: "svg", loop: false, autoplay: false, animationData: data }) as unknown as Anim;
      anim.current = a; setReady(true);
      if (still || tap) { a.goToAndStop(0, true); return; }
      if (every) {
        let seen = false; let playing = false;
        const start = () => { if (!seen || playing || t !== undefined) return; playing = true; a.goToAndPlay(0, true); };
        a.addEventListener("complete", () => { playing = false; t = window.setTimeout(() => { t = undefined; if (seen && !document.hidden) start(); }, every); });
        io = new IntersectionObserver(([e]) => {
          seen = e.isIntersecting;
          if (seen) start();
          else { window.clearTimeout(t); t = undefined; if (playing) { playing = false; a.goToAndStop(0, true); } }
        }, { threshold: 0.6 });
        io.observe(box.current);
        a.goToAndStop(0, true);
        return;
      }
      let runs = 0; let visible = true;
      a.addEventListener("complete", () => {
        runs++;
        if (once) { runs = 2; return; } // соңғы кадрда тұрып қалады
        if (runs < 2) { a.goToAndPlay(0, true); return; }
        t = window.setTimeout(() => { if (visible && !document.hidden) a.goToAndPlay(0, true); else runs = 1; }, 7000);
      });
      io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && runs < 2) a.play(); else if (!visible) a.pause(); });
      io.observe(box.current);
      a.play();
    }).catch(() => undefined);
    return () => { dead = true; io?.disconnect(); window.clearTimeout(t); anim.current?.destroy(); anim.current = null; };
  }, [name, once, tap, every]);
  useEffect(() => { if (play !== undefined && anim.current) anim.current.goToAndPlay(0, true); }, [play]);
  return (
    <span aria-hidden className={className} style={{ display: "inline-block", position: "relative", width: size, height: size, rotate: tilt ? `${tilt}deg` : undefined, flex: "none", pointerEvents: "none", ...style }}>
      <span ref={box} style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: "opacity 0.2s ease" }} />
      {!ready && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.78, lineHeight: 1 }}>{TG_EMOJI[name]}</span>}
    </span>
  );
}
