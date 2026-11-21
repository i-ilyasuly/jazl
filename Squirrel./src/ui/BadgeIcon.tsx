// Карточка белгілерінің иконка нұсқасы (Патша, 2026-11-21: krisha.kz үлгісімен — түрлі-түсті дөңгелек, ішінде ақ белгі,
// бір-бірінің үстіне аздап түсіп тұрады). Анимациялық эмодзидің орнына Профиль → Анимациялар бетінде таңдалады.
// Бәрі бір жүйеде: бірдей дөңгелек, бірдей жарық түсуі, бірдей ақ жиек, белгілер 24×24 торда бірдей қалыңдықпен салынған.
import type { ReactNode } from "react";
import type { Badge } from "./badges";

export type BadgeIconName = "fire" | "top" | "rocket" | "hourglass" | "zap" | "new" | "star";

type Spec = { c1: string; c2: string; glyph: ReactNode };
const W = "#fff";

const SPEC: Record<BadgeIconName, Spec> = {
  // 🔥 Ыстық — қызыл, жалын
  fire: { c1: "#FF6A55", c2: "#E8262B", glyph: <>
    <path fill={W} d="M12.4 3.2c.6 2.7-.7 4.4-2 5.9-1.4 1.6-2.9 3.2-2.9 5.7A4.6 4.6 0 0 0 12 19.5a4.6 4.6 0 0 0 4.6-4.8c0-2-.9-3.6-2-4.9-.2 1.3-.8 2.2-1.7 2.7.4-3-.3-6.4-.5-9.3z" />
    <path fill="#F0383A" d="M12 19.5a2.4 2.4 0 0 1-2.4-2.5c0-1.5 1.3-2.4 2-3.6.4.9 1 1.3 1.6 1.5.8.5 1.2 1.2 1.2 2.1a2.4 2.4 0 0 1-2.4 2.5z" />
  </> },
  // 🔝 ТОП — қызғылт сары, жоғары жебе
  top: { c1: "#FFA12E", c2: "#F26A00", glyph: <>
    <path fill={W} stroke={W} strokeWidth={1.2} strokeLinejoin="round" d="M12 4.6 18 11.4h-3.6v6.8H9.6v-6.8H6z" />
  </> },
  // 🚀 Хит — алтын, тәж
  rocket: { c1: "#FFC93D", c2: "#F29A00", glyph: <>
    <path fill={W} stroke={W} strokeWidth={1.1} strokeLinejoin="round" d="M5.2 15.6 4.4 8.2l4.1 3.2L12 5.6l3.5 5.8 4.1-3.2-.8 7.4z" />
    <rect x={5.4} y={16.9} width={13.2} height={2.3} rx={1.15} fill={W} />
  </> },
  // ⏳ Аяқталуға жақын — көк, құм сағат
  hourglass: { c1: "#5AA2FF", c2: "#2267F0", glyph: <>
    <path fill="none" stroke={W} strokeWidth={2} strokeLinecap="round" d="M7.4 4.6h9.2M7.4 19.4h9.2" />
    <path fill="none" stroke={W} strokeWidth={1.8} strokeLinejoin="round" d="M8.6 4.6c0 3.6 6.8 4.2 6.8 7.4s-6.8 3.8-6.8 7.4M15.4 4.6c0 3.6-6.8 4.2-6.8 7.4s6.8 3.8 6.8 7.4" />
    <path fill={W} d="M9.6 18.6c.4-1.6 1.6-2.4 2.4-2.9.8.5 2 1.3 2.4 2.9zM10.6 7.4h2.8c-.3.7-.8 1.1-1.4 1.5-.6-.4-1.1-.8-1.4-1.5z" />
  </> },
  // ⚡ Аз қалды — қызғылт, найзағай
  zap: { c1: "#FF6FAE", c2: "#E6267A", glyph: <>
    <path fill={W} stroke={W} strokeWidth={1} strokeLinejoin="round" d="M13.6 3.6 6.6 13.4h4.9l-1.1 7 7-9.8h-4.9z" />
  </> },
  // 🆕 Жаңа — жасыл, жарқыл
  new: { c1: "#3FD47E", c2: "#0FA453", glyph: <>
    <path fill={W} d="M11 5.2c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5z" />
    <path fill={W} d="M17 13.6c.25 1.7.9 2.35 2.6 2.6-1.7.25-2.35.9-2.6 2.6-.25-1.7-.9-2.35-2.6-2.6 1.7-.25 2.35-.9 2.6-2.6z" />
  </> },
  // ⭐ Жоғары рейтинг — күлгін, жұлдыз
  star: { c1: "#A98BFF", c2: "#6C47F0", glyph: <>
    <path fill={W} stroke={W} strokeWidth={1.4} strokeLinejoin="round" d="m12 4.8 2.2 4.5 4.9.7-3.6 3.5.9 4.9L12 16.1l-4.4 2.3.9-4.9-3.6-3.5 4.9-.7z" />
  </> },
};

/** Бір белгі-иконка: түрлі-түсті дөңгелек, үстінен жұмсақ жарық, ішінде ақ белгі */
export function BadgeIcon({ name, size = 26 }: { name: Badge["emo"]; size?: number }) {
  const s = SPEC[name as BadgeIconName];
  if (!s) return null;
  const id = `bi-${name}`;
  return (
    // Сыртында карточка түстес 2px жиек — қабаттасқанда бір-бірінен таза бөлініп тұрады
    <svg width={size} height={size} viewBox="-2 -2 28 28" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={s.c1} />
          <stop offset="1" stopColor={s.c2} />
        </linearGradient>
      </defs>
      <circle cx={12} cy={12} r={14} fill="var(--surface-card, #fff)" />
      <circle cx={12} cy={12} r={12} fill={`url(#${id})`} />
      {/* жоғарғы жағындағы жұмсақ жылтыр — бәріне бірдей */}
      <ellipse cx={12} cy={6.2} rx={8.4} ry={4.6} fill={W} opacity={0.14} />
      <g transform="translate(12 12) scale(0.74) translate(-12 -12)">{s.glyph}</g>
    </svg>
  );
}
