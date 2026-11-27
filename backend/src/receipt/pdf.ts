// Чектің PDF нұсқасы (Патша, 2026-11-17: «байсалды әрі өте әдемі»). Шрифт — Medeo (статик нұсқалары: assets/fonts, OFL).
// Құрылымы: көк бас (бренд, мекеме) → тесік жиек → сома мен мәртебе → тармақтар (нүктелі сызықпен) → үнем →
// мекеме, төлем, мерзім → «билет» кесігі → тексеру QR-ы → заң ескертпесі. Ақпарат — чектің public бөлігі ғана.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { fileURLToPath } from "node:url";

const font = (n: string) => fileURLToPath(new URL(`../../assets/fonts/${n}.ttf`, import.meta.url));
export interface PublicReceipt {
  no: string; total: number; status: string; title: string; dateLocal: string; kind?: string; left?: number; via?: string; extra?: { amount: number; note: string } | null;
  seller: { name: string; address: string | null; bin: string | null; kind?: string };
  item: { title: string; units: number; unitName: string; pricePerUnit: number; regularPricePerUnit?: number; regularTotal?: number; saving?: number; discountPct?: number };
  /** Тек сатып алу чегінде; қолдану/тапсырыс чегінде жоқ */
  payment?: { label: string; ref: string; mode: string };
  pack?: { validFrom: string; validUntil: string; validDays: number; howToUse: string };
  verifyUrl: string;
  /** Онлайн-кассаның фискалдық чегі (src/fiscal): шықса — ОФД сілтемесі бар QR */
  fiscal?: { status: "ok"; qrUrl: string | null; number: string | null; offline: boolean } | { status: "pending" } | null;
}

const C = { ink: "#111A26", sub: "#5F6B7A", line: "#E3E8EF", blue: "#229AF0", blueDark: "#1F73C2", green: "#1B6B2E", greenBg: "#E5F6E9", amber: "#8A5A00", amberBg: "#FFF4D6", paper: "#FFFFFF", page: "#F2F4F7" };
const money = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₸";

export async function receiptPdf(r: PublicReceipt): Promise<Buffer> {
  const fq = r.fiscal?.status === "ok" ? r.fiscal : null;
  const W = 340, H = 906 + (fq?.qrUrl ? 98 : 0), P = 24;
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `Medeo чек ${r.no}`, Author: "Medeo", Subject: r.item.title } });
  doc.registerFont("R", font("MedeoSans-Regular")); doc.registerFont("S", font("MedeoSans-SemiBold"));
  doc.registerFont("B", font("MedeoSans-Bold")); doc.registerFont("M", font("MedeoMono-Medium"));
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  // Фон және бас (көк градиент)
  doc.rect(0, 0, W, H).fill(C.page);
  const g = doc.linearGradient(0, 0, W, 132); g.stop(0, C.blue).stop(1, C.blueDark);
  doc.rect(0, 0, W, 132).fill(g);
  doc.font("B").fontSize(20).fillColor("#FFFFFF").text("Medeo.", P, 22);
  doc.font("S").fontSize(9).fillColor("#FFFFFF").opacity(0.85).text("ЭЛЕКТРОНДЫҚ ЧЕК", P, 30, { width: W - 2 * P, align: "right", characterSpacing: 1 }).opacity(1);
  doc.font("B").fontSize(16).fillColor("#FFFFFF").text(r.seller.name, P, 62, { width: W - 2 * P });
  if (r.seller.address) doc.font("R").fontSize(10).fillColor("#FFFFFF").opacity(0.85).text(r.seller.address, P, 84).opacity(1);
  doc.font("M").fontSize(9).fillColor("#FFFFFF").opacity(0.85).text(r.no + "  ·  " + r.dateLocal, P, 102).opacity(1);

  // Қағаз парақ (тесік жиекпен)
  const x = 12, y0 = 120, w = W - 24;
  doc.roundedRect(x, y0, w, H - y0 - 14, 14).fill(C.paper);
  for (let cx = x + 10; cx < x + w - 6; cx += 14) doc.circle(cx, y0, 4).fill(C.blueDark);

  let y = y0 + 26;
  doc.font("S").fontSize(10).fillColor(C.sub).text(r.title, x, y, { width: w, align: "center" }); y += 18;
  // Қолдану чегінде ақша емес, дана көрсетіледі (Патша: кассир мен клиентке қолдануда баға көрсетілмейді)
  const buy = Boolean(r.payment && r.pack);
  doc.font("B").fontSize(34).fillColor(C.ink).text(buy ? money(r.total) : `${r.item.units} ${r.item.unitName}`, x, y, { width: w, align: "center" }); y += 46;
  // Мәртебе белгісі
  const st = r.status.toUpperCase(); doc.font("B").fontSize(9);
  const sw = doc.widthOfString(st, { characterSpacing: 1.2 }) + 22;
  doc.roundedRect((W - sw) / 2, y, sw, 20, 10).fill(C.greenBg);
  doc.fillColor(C.green).text(st, (W - sw) / 2, y + 6, { width: sw, align: "center", characterSpacing: 1.2 }); y += 34;

  const section = (t: string) => { y += 6; doc.font("S").fontSize(8).fillColor(C.sub).text(t.toUpperCase(), x + 16, y, { characterSpacing: 1.2 }); y += 16; };
  const row = (k: string, v: string, mono = false) => {
    doc.font("R").fontSize(10).fillColor(C.sub); const kw = doc.widthOfString(k);
    doc.text(k, x + 16, y);
    doc.font(mono ? "M" : "S").fontSize(10).fillColor(C.ink); const vw = doc.widthOfString(v);
    doc.text(v, x + w - 16 - vw, y, { lineBreak: false });
    const a = x + 16 + kw + 6, b = x + w - 16 - vw - 6;
    if (b > a) doc.moveTo(a, y + 9).lineTo(b, y + 9).dash(1, { space: 2.5 }).lineWidth(0.8).strokeColor(C.line).stroke().undash();
    y += 20;
  };

  if (buy) {
    section("Сатып алынды");
    row("Пакет", r.item.title);
    row("Көлемі", `${r.item.units} ${r.item.unitName}`);
    row("1 бірлік бағасы", money(r.item.pricePerUnit));
    row("Бөлек алғанда", `${money(r.item.regularPricePerUnit ?? 0)} / ${r.item.unitName}`);
    row("Бөлек алғандағы сомасы", money(r.item.regularTotal ?? 0));
    // Үнем — жасыл жолақ
    y += 4; doc.roundedRect(x + 16, y, w - 32, 34, 8).fill(C.greenBg);
    doc.font("S").fontSize(10).fillColor(C.green).text("Сіздің үнеміңіз", x + 28, y + 11);
    doc.font("B").fontSize(13).fillColor(C.green).text(`${money(r.item.saving ?? 0)} · ${r.item.discountPct ?? 0}%`, x + 16, y + 9, { width: w - 44, align: "right" });
    y += 46;
  } else {
    section("Қолданылды");
    row("Пакет", r.item.title);
    row("Көлемі", `${r.item.units} ${r.item.unitName}`);
    if (r.left != null) row("Пакетте қалды", `${r.left} ${r.item.unitName}`);
    if (r.via) row("Тәсілі", r.via);
    if (r.extra?.amount) row("Қосымша", `${money(r.extra.amount)} · кассада бөлек`);
    row("Уақыты", r.dateLocal);
    row("Чек №", r.no, true);
  }

  section("Мекеме");
  row("Атауы", r.seller.name);
  if (r.seller.address) row("Мекенжайы", r.seller.address);
  if (r.seller.bin) row("БСН", r.seller.bin, true);

  if (r.payment && r.pack) {
    section("Төлем");
    row("Тәсілі", r.payment.label);
    row("Уақыты", r.dateLocal);
    row("Чек №", r.no, true);
    row("Транзакция", r.payment.ref.slice(0, 22), true);

    section("Пакет мерзімі");
    row("Басталды", r.pack.validFrom);
    row("Аяқталады", r.pack.validUntil);
    row("Мерзімі", `${r.pack.validDays} күн`);
  }

  // «Билет» кесігі: екі жақта жарты шеңбер + үзік сызық
  y += 8; doc.circle(x, y, 9).fill(C.page); doc.circle(x + w, y, 9).fill(C.page);
  doc.moveTo(x + 16, y).lineTo(x + w - 16, y).dash(4, { space: 4 }).lineWidth(1).strokeColor(C.line).stroke().undash(); y += 18;

  // Тексеру QR-ы (және болса — фискалдық чек QR-ы)
  const qrBlock = (url: string, title: string, note: string, tail: string) => {
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const n = qr.modules.size, cell = 84 / n, qx = x + 16, qy = y;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) doc.rect(qx + j * cell, qy + i * cell, cell + 0.15, cell + 0.15).fill(C.ink);
    doc.font("S").fontSize(10).fillColor(C.ink).text(title, qx + 98, qy + 10);
    doc.font("R").fontSize(9).fillColor(C.sub).text(note, qx + 98, qy + 26, { width: w - 130, lineGap: 1 });
    doc.font("M").fontSize(9).fillColor(C.blueDark).text(tail, qx + 98, qy + 68);
    y += 98;
  };
  qrBlock(r.verifyUrl, "Чекті тексеру", "QR-ды Telegram камерасымен сканерлесеңіз, чектің түпнұсқасы Medeo ботында ашылады.", r.no);
  if (fq?.qrUrl) qrBlock(fq.qrUrl, "Фискалдық чек", "QR-ды телефон камерасымен сканерлесеңіз, чек фискалдық деректер операторының сайтында ашылады.", fq.number ? `№ ${fq.number}` : "");

  if (r.payment?.mode === "test") {
    doc.roundedRect(x + 16, y, w - 32, 26, 8).fill(C.amberBg);
    doc.font("S").fontSize(9).fillColor(C.amber).text("Сынақ төлемі — ақша алынған жоқ", x + 16, y + 9, { width: w - 32, align: "center" }); y += 36;
  }
  doc.font("R").fontSize(8).fillColor(C.sub).text(`${r.pack ? r.pack.howToUse + ". " : ""}Medeo — агент: пакет мекемеден Medeo сервисі арқылы алынды. ${fq ? "Фискалдық чекті Medeo онлайн-кассасы берді." : "Бұл — электрондық түбіртек; фискалдық чекті мекеме не төлем жүйесі береді."}`, x + 16, y, { width: w - 32, lineGap: 1.5, align: "center" });

  doc.end();
  return done;
}
