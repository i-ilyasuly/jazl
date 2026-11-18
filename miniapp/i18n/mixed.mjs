// Сөз реті қауіпті орындар: JSX мәтіні {өрнекпен} көрші тұрған жерлер (орысшада сөз реті өзгеруі мүмкін)
import fs from "node:fs"; import path from "node:path";
import { parse } from "@babel/parser"; import _t from "@babel/traverse"; const traverse = _t.default ?? _t;
import { CYR } from "./core.mjs";
const root = path.resolve(import.meta.dirname, "../src"); const ru = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "ru.json"), "utf8"));
const files = []; (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes("/i18n")) w(p); } else if (/\.tsx$/.test(f)) files.push(p); } })(root);
for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  traverse(ast, { JSXElement(p) {
    const ch = p.node.children.filter((c) => !(c.type === "JSXText" && !c.value.trim()));
    const hasText = ch.some((c) => c.type === "JSXText" && CYR.test(c.value));
    const hasExpr = ch.some((c) => c.type === "JSXExpressionContainer" && c.expression.type !== "JSXEmptyExpression");
    if (hasText && hasExpr) {
      const line = code.slice(0, p.node.start).split("\n").length;
      const parts = ch.map((c) => c.type === "JSXText" ? `"${c.value.trim().replace(/\s+/g, " ")}"→"${ru[c.value.trim().replace(/\s+/g, " ")] ?? "?"}"` : c.type === "JSXExpressionContainer" ? "{" + code.slice(c.expression.start, c.expression.end).slice(0, 30) + "}" : "<" + (c.openingElement?.name?.name ?? "el") + ">");
      console.log(path.relative(root, f) + ":" + line + "  " + parts.join(" "));
    }
  } });
}
