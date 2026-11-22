// Мекеме жапсырмасы (Патша, 2026-11-22): филиалдың тұрақты QR-ы. Түсі — мини апптағы көк (#229af0), градиентсіз, фоны ақ.
// QR — Telegram стилінде: модульдер жалғасқан, бос бұрыштары дөңгеленген, іздеу көздері дөңгелек, ортасында логотип (H деңгейі — 30% қалпына келеді).
import QR from "qrcode";

export const BLUE = "#229af0";
const INK = "#0b1b2b";
const GREY = "#5d6b7a";

/** QR модульдерінің жолы (Path2D/SVG үшін), бірлік — бір модуль */
export function qrShape(text: string) {
  const q = QR.create(text, { errorCorrectionLevel: "H" });
  const n = q.modules.size;
  const m = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && Boolean(q.modules.get(r, c));
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const hole = Math.round(n * 0.22) | 1, h0 = (n - hole) >> 1;
  const inHole = (r: number, c: number) => r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole;
  const ok = (r: number, c: number) => m(r, c) && !finder(r, c) && !inHole(r, c);
  const R = 0.5;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!ok(r, c)) continue;
    const t = ok(r - 1, c), b = ok(r + 1, c), l = ok(r, c - 1), rt = ok(r, c + 1);
    const tl = !t && !l ? R : 0, tr = !t && !rt ? R : 0, br = !b && !rt ? R : 0, bl = !b && !l ? R : 0;
    const x = c, y = r;
    d += `M${x + tl},${y}H${x + 1 - tr}${tr ? `A${tr},${tr} 0 0 1 ${x + 1},${y + tr}` : ""}V${y + 1 - br}${br ? `A${br},${br} 0 0 1 ${x + 1 - br},${y + 1}` : ""}H${x + bl}${bl ? `A${bl},${bl} 0 0 1 ${x},${y + 1 - bl}` : ""}V${y + tl}${tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : ""}Z`;
  }
  return { n, d, hole, h0 };
}

const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

/** QR-ды canvas-қа салады: (x, y) — сол жақ жоғарғы бұрыш, size — QR өлшемі (тыныш аймақсыз) */
export function drawQr(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const { n, d, hole, h0 } = qrShape(text);
  const u = size / n;
  g.save(); g.translate(x, y); g.scale(u, u); g.fillStyle = BLUE; g.strokeStyle = BLUE;
  g.fill(new Path2D(d));
  for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    g.lineWidth = 1; rr(g, ex + 0.5, ey + 0.5, 6, 6, 2); g.stroke();
    rr(g, ex + 2, ey + 2, 3, 3, 1); g.fill();
  }
  rr(g, h0 + 0.15, h0 + 0.15, hole - 0.3, hole - 0.3, hole * 0.28); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `800 ${hole * 0.6}px "Medeo Sans", system-ui, sans-serif`;
  g.fillText("S.", n / 2 + hole * 0.03, n / 2 + hole * 0.04);
  g.restore();
}

/** Мәтінді ені бойынша жолдарға бөледі */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}

export interface StickerData { url: string; venue: string; address: string; code: string }

/** A6 жапсырма (105×148 мм, 300 dpi = 1240×1748). Ақ фон, бір көк түс, көлемді заманауи мәтін. */
export async function drawSticker(cv: HTMLCanvasElement, s: StickerData, W = 1240) {
  const H = Math.round(W * 1.41);
  const k = W / 1240;
  cv.width = W; cv.height = H;
  try { await document.fonts.load(`800 40px "Medeo Sans"`); await document.fonts.load(`600 40px "Medeo Sans"`); } catch { /* жүйелік қаріп */ }
  const g = cv.getContext("2d")!;
  const F = (w: number, px: number) => `${w} ${px * k}px "Medeo Sans", system-ui, sans-serif`;
  const pad = 96 * k;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  // Бренд
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.font = F(800, 76); g.fillStyle = INK; g.fillText("Squirrel", pad, 170 * k);
  const bw = g.measureText("Squirrel").width; g.fillStyle = BLUE; g.fillText(".", pad + bw, 170 * k);
  // Код (оң жақта, кассир мен қолдау үшін)
  g.font = F(700, 34); g.textAlign = "right"; g.fillStyle = BLUE;
  const cw = g.measureText(s.code).width + 44 * k;
  rr(g, W - pad - cw, 118 * k, cw, 66 * k, 33 * k); g.fillStyle = "#e9f5fe"; g.fill();
  g.fillStyle = BLUE; g.fillText(s.code, W - pad - 22 * k, 163 * k);
  // Тақырып
  g.textAlign = "left"; g.font = F(800, 84); g.fillStyle = INK;
  let y = 300 * k;
  for (const l of wrap(g, "Жазылымыңызды осында қолданыңыз", W - pad * 2)) { g.fillText(l, pad, y); y += 96 * k; }
  // QR
  const qs = 780 * k, qx = (W - qs) / 2, qy = y - 6 * k;
  drawQr(g, s.url, qx, qy, qs);
  y = qy + qs + 96 * k;
  // Мекеме
  g.font = F(800, 58); g.fillStyle = INK; g.textAlign = "center";
  g.fillText(wrap(g, s.venue, W - pad * 2)[0] ?? "", W / 2, y);
  g.font = F(600, 38); g.fillStyle = GREY; g.fillText(wrap(g, s.address, W - pad * 2)[0] ?? "", W / 2, y + 58 * k);
  // Қадамдар
  y += 150 * k;
  const steps = ["Сканерлеңіз", "«Қолдану» басыңыз", "Экранды кассирге көрсетіңіз"];
  const colW = (W - pad * 2) / 3;
  steps.forEach((t, i) => {
    const cx = pad + colW * i + colW / 2;
    g.beginPath(); g.arc(cx, y, 34 * k, 0, Math.PI * 2); g.fillStyle = BLUE; g.fill();
    g.fillStyle = "#fff"; g.font = F(800, 38); g.textAlign = "center"; g.fillText(String(i + 1), cx, y + 13 * k);
    g.fillStyle = INK; g.font = F(700, 30);
    wrap(g, t, colW - 24 * k).forEach((l, j) => g.fillText(l, cx, y + 92 * k + j * 36 * k));
  });
  // Ескерту
  g.font = F(600, 26); g.fillStyle = GREY; g.textAlign = "center";
  g.fillText("Сканерлегенде тек Squirrel. ашылуы керек", W / 2, H - 70 * k);
  return cv;
}

export async function stickerPng(s: StickerData): Promise<Blob> {
  const cv = await drawSticker(document.createElement("canvas"), s);
  return new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
}
