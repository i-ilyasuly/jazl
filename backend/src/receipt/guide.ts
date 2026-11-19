// «Кассаға нұсқау» (Figma 14012:9387) — кассаның жанына басып қоятын A6 парақ: 4 қадам және мини апптың QR-ы.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { fileURLToPath } from "node:url";

const font = (n: string) => fileURLToPath(new URL(`../../assets/fonts/${n}.ttf`, import.meta.url));
export const GUIDE_STEPS = ["Клиент «Medeo бойынша» дейді", "Пакетті таңда, QR шығар", "Клиент сканерлейді, төлем өтті", "Қосымша тауарды бөлек төлет (қолма-қол / басқа банк)"];

export async function guidePdf(venue: string, appUrl: string): Promise<Buffer> {
  const W = 298, H = 420, P = 22; // A6
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `Medeo кассаға нұсқау — ${venue}`, Author: "Medeo" } });
  doc.registerFont("R", font("MedeoSans-Regular")); doc.registerFont("B", font("MedeoSans-Bold"));
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.rect(0, 0, W, H).fill("#FFFFFF");
  doc.font("B").fontSize(20).fillColor("#111A26").text("Medeo бойынша төлем", P, P, { width: W - 2 * P });
  doc.font("R").fontSize(10).fillColor("#5F6B7A").text(`${venue} · кассир үшін 3 қадам`, P, P + 28);
  let y = P + 58;
  GUIDE_STEPS.forEach((t, i) => {
    doc.circle(P + 11, y + 8, 11).fill("#229AF0");
    doc.font("B").fontSize(11).fillColor("#FFFFFF").text(i < 3 ? String(i + 1) : "+", P, y + 2, { width: 22, align: "center" });
    doc.font("R").fontSize(12).fillColor("#111A26").text(t, P + 32, y + 1, { width: W - 2 * P - 32 }); y += i === 3 ? 44 : 32;
  });
  const qr = QRCode.create(appUrl, { errorCorrectionLevel: "M" }); const n = qr.modules.size, cell = 96 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) doc.rect(P + j * cell, y + 8 + i * cell, cell + 0.15, cell + 0.15).fill("#111A26");
  doc.font("R").fontSize(10).fillColor("#5F6B7A").text("Клиент қолданбаны осы QR-мен жүктей алады", P + 112, y + 40, { width: W - 2 * P - 112 });
  doc.end();
  return done;
}

/** Кассаға/үстелге қоятын клиентке арналған тақтайша (A5, Хормози: мекеме — ең арзан тарату арнасы; Патша, 2026-11-19).
 *  Үлкен уәде (нақты ең үлкен жеңілдік), 3 қадам, мекеме бетіне апаратын QR және кассирдің бір сөйлемі. */
export async function tentPdf(venue: string, maxPct: number, url: string): Promise<Buffer> {
  const W = 420, H = 595, P = 32; // A5
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `Medeo тақтайша — ${venue}`, Author: "Medeo" } });
  doc.registerFont("R", font("MedeoSans-Regular")); doc.registerFont("B", font("MedeoSans-Bold"));
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.rect(0, 0, W, H).fill("#FFFFFF");
  doc.rect(0, 0, W, 8).fill("#229AF0");
  doc.font("B").fontSize(13).fillColor("#229AF0").text(`MEDEO · ${venue}`, P, P);
  const head = maxPct > 0 ? `Пакетпен ${maxPct}%-ға дейін арзан` : "Пакетпен арзанырақ";
  doc.font("B").fontSize(34).fillColor("#111A26").text(head, P, P + 30, { width: W - 2 * P, lineGap: 2 });
  let y = doc.y + 10;
  doc.font("R").fontSize(15).fillColor("#5F6B7A").text("Әр келгенде төлемейсің — пакетті бір рет ал, кассада QR-ды көрсет.", P, y, { width: W - 2 * P }); y = doc.y + 22;
  ["QR-ды телефонмен сканерле", "Пакетті таңда, төле", "Келесі жолы кассада «Medeo» деп айт"].forEach((t, i) => {
    doc.circle(P + 13, y + 10, 13).fill("#229AF0");
    doc.font("B").fontSize(13).fillColor("#FFFFFF").text(String(i + 1), P, y + 3, { width: 26, align: "center" });
    doc.font("R").fontSize(15).fillColor("#111A26").text(t, P + 38, y + 2, { width: W - 2 * P - 38 }); y += 36;
  });
  const size = 170; const qr = QRCode.create(url, { errorCorrectionLevel: "M" }); const n = qr.modules.size, cell = size / n;
  const qx = (W - size) / 2, qy = y + 14;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) doc.rect(qx + j * cell, qy + i * cell, cell + 0.15, cell + 0.15).fill("#111A26");
  doc.font("R").fontSize(11).fillColor("#5F6B7A").text("Ақшаң күймейді: қолданылмаған бірлік Medeo бонусына айналады", P, qy + size + 16, { width: W - 2 * P, align: "center" });
  doc.font("B").fontSize(11).fillColor("#229AF0").text("Пакеттің ақысын Telegram ішінде төлейсің", P, H - P - 14, { width: W - 2 * P, align: "center" });
  doc.end();
  return done;
}
