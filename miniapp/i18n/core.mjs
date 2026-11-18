// Medeo i18n өзегі (Патша, 2026-11-18: орыс тілі). Бастапқы мәтін — қазақша, ол кілт ретінде қолданылады.
// Vite плагині (i18n/plugin.mjs) құрастыру кезінде қазақша жолдарды __t("…") / __tt("…{0}…", [x]) шақыруына орайды;
// extract.mjs — сол ережемен барлық кілттерді жинайды (аудармасы жоқтарын табу үшін).
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default ?? _traverse;

export const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
// Салыстыру мен includes/replace аргументтері ДЕ аударылады: олар әдетте мини апптың өз (аударылған) мәтінімен салыстырылады.
// Тек сақтау кілттері мен селекторлар аударылмайды.
const SKIP_CALLS = new Set(["getItem", "setItem", "removeItem", "querySelector", "querySelectorAll", "localeCompare"]);
const SKIP_FN = new Set(["__t", "__tt", "raw", "kk", "require"]);

/** Аударылмайтын орын ба (салыстыру, кілт, импорт, типтер) */
export function skipPath(p) {
  const par = p.parentPath; const n = par?.node; if (!n) return true;
  if (n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration" || n.type === "ImportExpression") return true;
  if ((n.type === "ObjectProperty" || n.type === "ObjectMethod" || n.type === "ClassProperty") && n.key === p.node && !n.computed) return true;
  if (n.type === "TSLiteralType" || n.type === "TSEnumMember") return true;
  if (n.type === "BinaryExpression" && n.operator === "in") return true;
  if (n.type === "MemberExpression" && n.property === p.node) return true;
  if (n.type === "CallExpression" || n.type === "NewExpression") {
    const c = n.callee;
    if (c.type === "MemberExpression" && c.property.type === "Identifier" && SKIP_CALLS.has(c.property.name)) return true;
    if (c.type === "Identifier" && SKIP_FN.has(c.name)) return true;
    if (c.type === "Identifier" && c.name === "RegExp") return true;
  }
  if (n.type === "TaggedTemplateExpression") return true;
  if (n.type === "JSXAttribute" && n.name?.name && ["key", "className", "id", "href", "src", "type", "name", "role", "data-k"].includes(n.name.name)) return true;
  // Массив элементі салыстырудағы тізім болса: ["a","b"].includes(x)
  if (n.type === "ArrayExpression" && par.parentPath?.node?.type === "MemberExpression" && par.parentPath.parentPath?.node?.type === "CallExpression") {
    const m = par.parentPath.node; if (m.property?.type === "Identifier" && SKIP_CALLS.has(m.property.name)) return true;
  }
  return false;
}

/** Файлдағы аударылатын жолдар: {kind, start, end, key, exprs} */
export function scan(code, file) {
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  const out = [];
  traverse(ast, {
    StringLiteral(p) {
      const v = p.node.value; if (!CYR.test(v) || skipPath(p)) return;
      const inAttr = p.parentPath.node.type === "JSXAttribute";
      out.push({ kind: inAttr ? "attr" : "str", start: p.node.start, end: p.node.end, key: v });
    },
    JSXText(p) {
      const raw = p.node.value; if (!CYR.test(raw)) return;
      const lead = raw.match(/^\s*/)[0]; const trail = raw.match(/\s*$/)[0];
      const key = raw.trim().replace(/\s+/g, " ");
      out.push({ kind: "jsx", start: p.node.start + lead.length, end: p.node.end - trail.length, key });
    },
    TemplateLiteral(p) {
      if (!p.node.quasis.some((q) => CYR.test(q.value.cooked ?? q.value.raw)) || skipPath(p)) return;
      let key = ""; p.node.quasis.forEach((q, i) => { key += (q.value.cooked ?? q.value.raw).replace(/[{}]/g, (m) => m + m); if (i < p.node.expressions.length) key += `{${i}}`; });
      // Өрнектердің ішіндегі жолдар да аударылады (мысалы `Құлып: ${on ? "қосулы" : "өшірулі"}`) — plugin.mjs оларды ішкі ауқымда өңдейді
      out.push({ kind: "tpl", start: p.node.start, end: p.node.end, key, exprs: p.node.expressions.map((e) => [e.start, e.end]) });
    },
  });
  return out.sort((a, b) => a.start - b.start);
}

/** Кодты аудару шақыруларымен қайта жинау: ішкі (шаблон өрнегіндегі) жолдар да өңделеді */
export function rewrite(code, items) {
  const emit = (from, to, list) => {
    let res = ""; let pos = from;
    for (let i = 0; i < list.length; i++) {
      const x = list[i]; if (x.start < pos || x.end > to) continue;
      const inner = list.filter((y) => y !== x && y.start >= x.start && y.end <= x.end);
      res += code.slice(pos, x.start);
      const k = JSON.stringify(x.key);
      if (x.kind === "tpl") res += `__tt(${k}, [${x.exprs.map(([a, b]) => emit(a, b, inner)).join(", ")}])`;
      else res += x.kind === "str" ? `__t(${k})` : `{__t(${k})}`;
      pos = x.end;
    }
    return res + code.slice(pos, to);
  };
  return emit(0, code.length, items);
}
