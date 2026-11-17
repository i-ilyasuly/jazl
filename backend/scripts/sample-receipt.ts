// Үлгі чек PDF-ін жасайды (дизайнды тексеру үшін): npx tsx scripts/sample-receipt.ts <шығыс.pdf>
import { writeFileSync } from "node:fs";
import { receiptPdf } from "../src/receipt/pdf";
const b = await receiptPdf({ no: "MD-100001", total: 10000, status: "Төленді", title: "Пакет сатып алынды", dateLocal: "17.11.2026, 03:50",
  seller: { name: "Qala Coffee", address: "Әлиханов 5", bin: null }, item: { title: "Американо · 10 кесе", units: 10, unitName: "кесе", pricePerUnit: 1000, regularPricePerUnit: 1300, regularTotal: 13000, saving: 3000, discountPct: 23 },
  payment: { label: "Kaspi Pay", ref: "test_69f57e9e-2113-4c5e-9f0a", mode: "test" }, pack: { validFrom: "17.11.2026, 03:50", validUntil: "17.12.2026, 03:50", validDays: 30, howToUse: "Мекемеде «Medeo бойынша» деп айтып, кассадағы QR-ды сканерле немесе алдын ала тапсырыс бер" },
  verifyUrl: "https://t.me/Mmedeo_bot?startapp=rc_100001" });
writeFileSync(process.argv[2] ?? "sample-receipt.pdf", b);
console.log("bytes", b.length);
