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
