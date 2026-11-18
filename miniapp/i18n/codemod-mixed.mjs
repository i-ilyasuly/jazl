// Бір рет қолданылатын түрлендіру: <b>{n} күн қалды</b> → <b>{`${n} күн қалды`}</b>
// (мәтін мен қарапайым өрнек бір жолда араласқан жерлер; тұтас сөйлем бір кілт болып аударылады, сөз реті сақталады)
import fs from "node:fs"; import path from "node:path";
import { parse } from "@babel/parser"; import _t from "@babel/traverse"; const traverse = _t.default ?? _t;
import { CYR } from "./core.mjs";
const root = path.resolve(import.meta.dirname, "../src");
const files = []; (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes("/i18n")) w(p); } else if (/\.tsx$/.test(f)) files.push(p); } })(root);
const okExpr = (e) => {
  let ok = true;
  traverse(parse("(" + e + ")", { plugins: ["typescript", "jsx"] }), { JSXElement() { ok = false; }, JSXFragment() { ok = false; }, LogicalExpression(p) { if (p.node.operator === "&&") ok = false; } });
  return ok;
};
let total = 0;
for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  const edits = [];
  traverse(ast, { JSXElement(p) {
    const all = p.node.children; if (!all.length) return;
    const ch = all;
    if (!ch.every((c) => c.type === "JSXText" || (c.type === "JSXExpressionContainer" && c.expression.type !== "JSXEmptyExpression"))) return;
    if (!ch.some((c) => c.type === "JSXText" && CYR.test(c.value)) || !ch.some((c) => c.type === "JSXExpressionContainer")) return;
    if (ch.some((c) => c.type === "JSXText" && c.value.includes("\n"))) return; // көпжолды — қолмен
    const exprs = ch.filter((c) => c.type === "JSXExpressionContainer").map((c) => code.slice(c.expression.start, c.expression.end));
    if (!exprs.every(okExpr)) return;
    let t = "";
    for (const c of ch) t += c.type === "JSXText" ? c.value.replace(/[`$\\]/g, (m) => "\\" + m) : "${" + code.slice(c.expression.start, c.expression.end) + "}";
    edits.push([ch[0].start, ch[ch.length - 1].end, "{`" + t + "`}"]);
  } });
  if (!edits.length) continue;
  let out = code; for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + r + out.slice(b);
  fs.writeFileSync(f, out); total += edits.length; console.log(path.relative(root, f), edits.length);
}
console.log("total", total);
