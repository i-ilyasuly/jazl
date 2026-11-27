// Medeo терминал-боты (Патша, 2026-11-27): Telegram-нан Cloud Shell сияқты команда орындау — ноутбуксыз.
// Әр хабарлама = bash скрипт (көп жолды да болады). Bot API 10.x мүмкіндіктері:
//  • Rich Messages (sendRichMessage, HTML): тақырып, <details>, кесте, <tg-button-row> түсті батырмалар, <footer>, <tg-time>
//  • Ағынды жоба (sendRichMessageDraft): <tg-thinking> «ойлану» көрінісі + тірі шығыс, Telegram-ның өз «Тоқтату» батырмасы
//    (can_stop → stopped_message_generation жаңартуы → процесс тоқтайды)
//  • Түсті батырмалар (style: primary/success/danger/link), ажыратылған батырма (disabled), copy_text
//  • Жеке чаттағы тақырыптар (setMySettings: has_topics_enabled, has_topic_sidebar) — /topics
//  • Реакциялар 👀→👍/👎, хабарлама эффектісі, ұзын шығыс — файл
// Rich API қолжетімсіз болса — ескі тәсілге (editMessageText) өздігінен ауысады.
// Қорғау: тек OWNER_ID (жеке чат), webhook құпия тақырыбы, қауіпті командаға растау. Тәуелділік жоқ (Node 18+).
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const TOKEN = process.env.BOT_TOKEN ?? "";
const OWNER = Number(process.env.OWNER_ID ?? 0);
const HOOK = process.env.HOOK_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8080);
const TG = process.env.TG_API ?? "https://api.telegram.org";
const REGION = process.env.REGION ?? "europe-west3";
const REPO = process.env.REPO_URL ?? "https://github.com/i-ilyasuly/jazl.git";
const WORK = process.env.WORK_DIR ?? "/workspace";
const DIR = `${WORK}/jazl`;
const LIMIT_MS = Number(process.env.CMD_TIMEOUT_MS ?? 30 * 60_000);
const ALLOWED = ["message", "callback_query", "stopped_message_generation"];
if (!TOKEN || !OWNER || !HOOK) { console.error("BOT_TOKEN, OWNER_ID, HOOK_SECRET керек"); process.exit(1); }

// ── Telegram Bot API (429 болса — retry_after күтіп, қайталайды) ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, body, tries = 3) {
  for (let i = 0; ; i++) {
    const r = await fetch(`${TG}/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false, description: "bad json" }));
    if (j.ok) return j.result;
    const wait = j.parameters?.retry_after;
    if (wait && i < tries - 1) { await sleep(wait * 1000 + 200); continue; }
    const e = new Error(`${method}: ${j.description}`); e.code = j.error_code; e.retryAfter = wait; throw e;
  }
}
const quiet = (m, b) => api(m, b, 1).catch((e) => { if (!/not modified/.test(e.message)) console.error(e.message); return null; });
const sure = (m, b) => api(m, b, 4).catch((e) => { console.error(e.message); return null; });
async function sendFile(chat, thread, name, text, caption, reply_to) {
  const fd = new FormData();
  fd.append("chat_id", String(chat));
  if (thread) fd.append("message_thread_id", String(thread));
  fd.append("document", new Blob([text], { type: "text/plain" }), name);
  if (caption) { fd.append("caption", caption); fd.append("parse_mode", "HTML"); }
  if (reply_to) fd.append("reply_parameters", JSON.stringify({ message_id: reply_to, allow_sending_without_reply: true }));
  const r = await fetch(`${TG}/bot${TOKEN}/sendDocument`, { method: "POST", body: fd }).catch(() => null);
  if (r && !(await r.json().catch(() => ({}))).ok) console.error("sendDocument failed");
}

// ── Мәтін ──
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clean = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
const tail = (s, n) => (s.length > n ? "…" + s.slice(-n) : s);
const lastLines = (s, n) => { const l = s.split("\n"); return l.length > n ? "…\n" + l.slice(-n).join("\n") : s; };
const dur = (ms) => (ms < 1000 ? `${ms} мс` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} с` : `${Math.floor(ms / 60_000)} мин ${Math.round((ms % 60_000) / 1000)} с`);
const short = (cmd) => { const l = cmd.trim().split("\n"); return l[0].slice(0, 80) + (l.length > 1 || l[0].length > 80 ? " …" : ""); };
const unix = (ms) => Math.floor(ms / 1000);
const btn = (text, attrs) => `<tg-button ${Object.entries(attrs).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(" ")}>${esc(text)}</tg-button>`;

// ── Дайын командалар ──
const PRESETS = {
  deploy: { title: "🚀 Орнату", style: "primary", desc: "main → бір рет жинау → миграция → medeo-api", cmd: `set -e
git fetch -q origin main && git reset -q --hard origin/main && git log --oneline -1
P=$(gcloud config get-value project 2>/dev/null)
IMG=${REGION}-docker.pkg.dev/$P/cloud-run-source-deploy/medeo-api:$(git rev-parse --short HEAD)
echo "▶ Жинау: $IMG"
gcloud builds submit backend --tag "$IMG" --quiet --suppress-logs
echo "▶ Миграция"
gcloud run jobs update medeo-migrate --image "$IMG" --region ${REGION} --quiet >/dev/null
gcloud run jobs execute medeo-migrate --region ${REGION} --wait --quiet
echo "▶ medeo-api"
gcloud run deploy medeo-api --image "$IMG" --region ${REGION} --quiet
gcloud run services describe medeo-api --region ${REGION} --format='value(status.latestReadyRevisionName)'` },
  tick: { title: "⏱ Кезек", style: "success", desc: "cron/tick қазір іске қосу", cmd: `URL=$(gcloud run services describe medeo-api --region ${REGION} --format='value(status.url)')
curl -s -X POST "$URL/cron/tick" -H "X-Cron-Key: $(gcloud secrets versions access latest --secret medeo-cron-key)" | jq .` },
  fiscal: { title: "🧾 Чектер", desc: "re:Kassa логы (3 сағат)", cmd: `gcloud logging read 'resource.labels.service_name="medeo-api" AND textPayload:"fiscal"' --freshness=3h --limit=30 --format='value(timestamp,textPayload)'` },
  widget: { title: "🧩 Виджет", desc: "Telegram виджеті ашық па (сынақ виджеті + жауап)", cmd: `git fetch -q origin main && git reset -q --hard origin/main && bash ops/widget-probe.sh` },
  logs: { title: "📜 Лог", desc: "medeo-api соңғы жазбалары (1 сағат)", cmd: `gcloud logging read 'resource.labels.service_name="medeo-api" AND textPayload!=""' --freshness=1h --limit=40 --format='value(timestamp,textPayload)'` },
  status: { title: "ℹ️ Күй", desc: "нұсқа, URL, соңғы коммит", cmd: `gcloud run services describe medeo-api --region ${REGION} --format='value(status.url,status.latestReadyRevisionName)'
git fetch -q origin main && git log --oneline -3 origin/main` },
  pull: { title: "⬇️ Pull", desc: "репоны main-ге жаңарту", cmd: `git fetch -q origin main && git reset -q --hard origin/main && git log --oneline -1` },
  selfupdate: { title: "🤖 Ботты жаңарту", style: "danger", desc: "терминал-боттың өзін жаңарту", cmd: `git fetch -q origin main && git reset -q --hard origin/main
echo "Бот жаңаруда — жаңа нұсқа іске қосылғанда бұл хабарлама үзілуі мүмкін, ол қалыпты."
gcloud run deploy medeo-termbot --source ops/termbot --region ${REGION} --quiet` },
};
const BY_TITLE = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [p.title, k]));
const kb = (k) => ({ text: PRESETS[k].title, ...(PRESETS[k].style ? { style: PRESETS[k].style } : {}) });
const KEYBOARD = { keyboard: [[kb("deploy"), kb("tick"), kb("fiscal")], [kb("logs"), kb("status"), kb("pull")]],
  is_persistent: true, resize_keyboard: true, input_field_placeholder: "Команда жаз — bash орындайды" };

// Анық жою командалары — бір рет растау
const DANGER = /\b(rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r|drop\s+(table|schema|database)|truncate\s+|delete\s+from|gcloud\s+[^\n]*\b(delete|remove-iam-policy-binding)\b|projects\s+delete|dd\s+if=|mkfs)/i;

// ── Жұмыстар ──
const jobs = new Map(); // id → жұмыс
const pending = new Map();
let seq = Math.floor(Date.now() / 1000) % 100000; // draft_id нөлден өзгеше әрі қайта іске қосылғанда қайталанбасын
let RICH = process.env.RICH !== "0"; // Rich/Draft API — қате болса ескі тәсілге көшеміз

async function ensureRepo() {
  if (fs.existsSync(`${DIR}/.git`)) return;
  fs.mkdirSync(WORK, { recursive: true });
  await new Promise((res) => spawn("git", ["clone", "-q", "--depth", "50", REPO, DIR], { stdio: "ignore" }).on("close", res));
}
const target = (j) => ({ chat_id: j.chat, ...(j.thread ? { message_thread_id: j.thread } : {}) });

// Rich: ағын (draft) және соңғы хабарлама
function draftHtml(j) {
  const out = clean(j.out).trimEnd();
  return `<tg-thinking>⚙️ Орындалуда · ${esc(dur(Date.now() - j.started))}</tg-thinking>
<details><summary>Команда</summary><pre><code class="language-bash">${esc(tail(j.cmd, 1500))}</code></pre></details>
${out ? `<pre><code class="language-bash">${esc(tail(lastLines(out, 40), 6000))}</code></pre>` : "<p><i>шығыс күтілуде…</i></p>"}`;
}
function finalHtml(j) {
  const out = clean(j.out).trimEnd();
  const ok = j.code === 0;
  const head = ok ? "✅ Орындалды" : j.killed ? "⏹ Тоқтатылды" : `❌ Қате · код ${j.code}`;
  const shown = lastLines(out, 60);
  const full = out.length > shown.length ? `<details><summary>Толық шығыс (${out.split("\n").length} жол)</summary><pre><code class="language-bash">${esc(tail(out, 22000))}</code></pre></details>` : "";
  return `<h3>${head}</h3>
<table bordered compact><tr><td><b>Уақыты</b></td><td>${esc(dur(j.done - j.started))}</td></tr><tr><td><b>Басталды</b></td><td><tg-time unix="${unix(j.started)}" format="t">${new Date(j.started).toISOString().slice(11, 16)}</tg-time></td></tr><tr><td><b>Код</b></td><td><code>${j.code}</code></td></tr></table>
<details><summary>Команда</summary><pre><code class="language-bash">${esc(tail(j.cmd, 3000))}</code></pre></details>
${out ? `<pre><code class="language-bash">${esc(tail(shown, 8000))}</code></pre>${full}` : "<p><i>шығыс жоқ</i></p>"}
<tg-button-row align="left">${btn("🔁 Қайталау", { type: "callback_data", data: `again:${j.id}`, style: "primary" })}${btn("📄 Файл", { type: "callback_data", data: `log:${j.id}` })}${btn("📋 Көшіру", { type: "copy_text", text: j.cmd.slice(0, 256) })}</tg-button-row>
<footer>#${j.id} · Medeo терминалы</footer>`;
}

// Ескі тәсіл (Rich жоқ болса)
function legacyText(j) {
  const head = j.done ? `${j.code === 0 ? "✅" : j.killed ? "⏹" : "❌"} <b>${j.code === 0 ? "Орындалды" : j.killed ? "Тоқтатылды" : `Қате · код ${j.code}`}</b> · ${dur(j.done - j.started)}`
    : `⏳ <b>Орындалуда</b> · ${dur(Date.now() - j.started)}`;
  const out = clean(j.out).trimEnd();
  return `${head}\n<blockquote expandable><code>${esc(tail(j.cmd, 600))}</code></blockquote>\n${out ? `<pre><code class="language-bash">${esc(tail(out, 3200))}</code></pre>` : `<i>${j.done ? "шығыс жоқ" : "күтуде…"}</i>`}`;
}
const legacyButtons = (j) => (!j.done ? { inline_keyboard: [[{ text: "⏹ Тоқтату", callback_data: `stop:${j.id}`, style: "danger" }]] }
  : { inline_keyboard: [[{ text: "🔁 Қайталау", callback_data: `again:${j.id}`, style: "primary" }, { text: "📄 Толық лог", callback_data: `log:${j.id}` }], [{ text: "📋 Команданы көшіру", copy_text: { text: j.cmd.slice(0, 256) } }]] });

async function progress(j) {
  if (j.done || j.busy) return;
  j.busy = true;
  try {
    if (j.rich) {
      try { await api("sendRichMessageDraft", { ...target(j), draft_id: j.id, rich_message: { html: draftHtml(j), skip_entity_detection: true }, can_stop: true, keep_on_stop: true }, 1); }
      catch (e) { if (e.retryAfter) j.pauseUntil = Date.now() + e.retryAfter * 1000; else { console.error(e.message); await toLegacy(j); } }
    } else if (j.msg) {
      try { await api("editMessageText", { chat_id: j.chat, message_id: j.msg, text: legacyText(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: legacyButtons(j) }, 1); }
      catch (e) { if (e.retryAfter) j.pauseUntil = Date.now() + e.retryAfter * 1000; else if (!/not modified/.test(e.message)) console.error(e.message); }
    }
  } finally { j.busy = false; }
}
async function toLegacy(j) {
  if (!j.rich) return;
  j.rich = false; RICH = false; console.error("Rich API қолжетімсіз — ескі тәсіл");
  const m = await sure("sendMessage", { ...target(j), text: legacyText(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: legacyButtons(j),
    ...(j.from ? { reply_parameters: { message_id: j.from, allow_sending_without_reply: true } } : {}) });
  j.msg = m?.message_id;
}

async function run(chat, thread, cmd, from) {
  const j = { id: ++seq, chat, thread, cmd, from, out: "", started: Date.now(), done: 0, code: null, killed: false, rich: RICH, pauseUntil: 0 };
  jobs.set(j.id, j);
  if (jobs.size > 30) jobs.delete(Math.min(...jobs.keys()));
  if (from) quiet("setMessageReaction", { chat_id: chat, message_id: from, reaction: [{ type: "emoji", emoji: "👀" }] });
  if (j.rich) {
    try { await api("sendRichMessageDraft", { ...target(j), draft_id: j.id, rich_message: { html: `<tg-thinking>⚙️ Іске қосылуда…</tg-thinking>` }, can_stop: true, keep_on_stop: true }, 1); }
    catch (e) { console.error(e.message); await toLegacy(j); }
  } else {
    j.msg = (await sure("sendMessage", { ...target(j), text: legacyText(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: legacyButtons(j),
      ...(from ? { reply_parameters: { message_id: from, allow_sending_without_reply: true } } : {}) }))?.message_id;
  }
  await ensureRepo();
  console.log(JSON.stringify({ audit: "run", id: j.id, cmd: j.cmd }));
  j.proc = spawn("bash", ["-lc", cmd], { cwd: fs.existsSync(DIR) ? DIR : WORK, detached: true,
    env: { ...process.env, BOT_TOKEN: "", HOOK_SECRET: "", TERM: "dumb", CLOUDSDK_CORE_DISABLE_PROMPTS: "1" } });
  const add = (b) => { j.out += b.toString(); if (j.out.length > 2_000_000) j.out = j.out.slice(-1_000_000); };
  j.proc.stdout.on("data", add); j.proc.stderr.on("data", add);
  // Жоба 30 секундта жоғалады — жиі жаңартамыз; 429 болса Telegram айтқанша күтеміз
  const tick = setInterval(() => { if (Date.now() >= j.pauseUntil) progress(j); }, j.rich ? 1200 : 2500);
  const limit = setTimeout(() => { j.out += `\n⏰ ${dur(LIMIT_MS)} өтті — тоқтатылды`; kill(j); }, LIMIT_MS);
  j.proc.on("close", async (code) => {
    clearInterval(tick); clearTimeout(limit);
    j.done = Date.now(); j.code = code ?? -1;
    while (j.busy) await sleep(100);
    console.log(JSON.stringify({ audit: "done", id: j.id, code: j.code, ms: j.done - j.started }));
    const effect = j.code === 0 && /medeo-api --image/.test(j.cmd) ? { message_effect_id: "5046509860389126442" } : {}; // 🎉 сәтті орнату
    let sent = null;
    if (j.rich) {
      sent = await api("sendRichMessage", { ...target(j), rich_message: { html: finalHtml(j), skip_entity_detection: true }, ...effect,
        ...(j.from ? { reply_parameters: { message_id: j.from, allow_sending_without_reply: true } } : {}) }, 4)
        .catch(async (e) => { console.error(e.message); return api("sendRichMessage", { ...target(j), rich_message: { html: finalHtml(j), skip_entity_detection: true } }, 4).catch(() => null); });
      if (!sent) { j.rich = false; RICH = false; }
    }
    if (!sent) {
      if (j.msg) await sure("editMessageText", { chat_id: j.chat, message_id: j.msg, text: legacyText(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: legacyButtons(j) });
      else await sure("sendMessage", { ...target(j), text: legacyText(j), parse_mode: "HTML", reply_markup: legacyButtons(j) });
    }
    j.msg = sent?.message_id ?? j.msg;
    if (j.from) quiet("setMessageReaction", { chat_id: chat, message_id: j.from, reaction: [{ type: "emoji", emoji: j.code === 0 ? "👍" : "👎" }] });
    if (clean(j.out).length > 22000 || (!j.rich && clean(j.out).length > 3200)) await sendFile(chat, thread, `out-${j.id}.txt`, clean(j.out), `📄 Толық шығыс · #${j.id}`, j.msg);
  });
}
function kill(j) { if (j.done || !j.proc) return; j.killed = true; try { process.kill(-j.proc.pid, "SIGTERM"); } catch { /* бітіп қалған */ } setTimeout(() => { try { process.kill(-j.proc.pid, "SIGKILL"); } catch { /* */ } }, 5000); }

// ── Хабарламалар ──
async function onMessage(msg) {
  const chat = msg.chat.id; const thread = msg.is_topic_message ? msg.message_thread_id : undefined; const text = (msg.text ?? "").trim();
  if (!text) return;
  const T = { chat_id: chat, ...(thread ? { message_thread_id: thread } : {}) };
  if (text === "/start" || text === "/help") {
    await setup(chat);
    const rows = Object.entries(PRESETS).map(([k, p]) => `<tr><td>/${k}</td><td>${esc(p.desc)}</td></tr>`).join("");
    const html = `<h2>Medeo терминалы</h2>
<p>Кез келген хабарлама <b>bash</b> болып орындалады (көп жол да болады). Жұмыс қалтасы — репо <code>jazl</code> (main). Әр хабарлама жеке қабықта: <code>cd</code> мен айнымалылар келесіге өтпейді.</p>
<table bordered striped compact><tr><th>Команда</th><th>Не істейді</th></tr>${rows}<tr><td>/jobs</td><td>жұмыс істеп тұрғандар</td></tr><tr><td>/topics</td><td>тақырыптар (Орнату, Чектер, Терминал)</td></tr></table>
<footer>Тек иесіне жауап береді · жою командалары растауды сұрайды</footer>`;
    await api("sendRichMessage", { ...T, rich_message: { html, skip_entity_detection: true }, message_effect_id: "5046509860389126442" })
      .catch(() => api("sendRichMessage", { ...T, rich_message: { html, skip_entity_detection: true } }))
      .catch(() => api("sendMessage", { ...T, text: "Medeo терминалы дайын. Кез келген хабарлама bash болып орындалады." }));
    return api("sendMessage", { ...T, text: "⌨️ Төмендегі батырмалар — дайын командалар", reply_markup: KEYBOARD });
  }
  if (text === "/topics") {
    await quiet("setMySettings", { has_topics_enabled: true, allows_users_to_create_topics: true, has_topic_sidebar: true });
    const made = [];
    for (const [name, color] of [["🚀 Орнату", 7322096], ["🧾 Чектер", 9367192], ["💻 Терминал", 16766590]]) {
      const t = await quiet("createForumTopic", { chat_id: chat, name, icon_color: color });
      if (t) made.push(name);
    }
    return api("sendMessage", { chat_id: chat, text: made.length ? `Тақырыптар дайын: ${made.join(", ")}. Әр тақырыпқа жазған команданың нәтижесі сол тақырыпқа келеді.` : "Тақырыптар қосылмады (Telegram қолдамауы мүмкін)." });
  }
  if (text === "/jobs") {
    const act = [...jobs.values()].filter((j) => !j.done);
    if (!act.length) return api("sendMessage", { ...T, text: "Жұмыс жоқ" });
    return api("sendMessage", { ...T, parse_mode: "HTML", text: act.map((j) => `#${j.id} · ${dur(Date.now() - j.started)} · <code>${esc(short(j.cmd))}</code>`).join("\n"),
      reply_markup: { inline_keyboard: act.map((j) => [{ text: `⏹ #${j.id} тоқтату`, callback_data: `stop:${j.id}`, style: "danger" }]) } });
  }
  const preset = text.startsWith("/") ? text.slice(1).split(/[\s@]/)[0] : BY_TITLE[text];
  const cmd = preset && PRESETS[preset] ? PRESETS[preset].cmd : text;
  if (DANGER.test(cmd)) {
    const id = ++seq; pending.set(id, { cmd, from: msg.message_id, thread });
    return api("sendMessage", { ...T, parse_mode: "HTML", reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      text: `⚠️ <b>Жою әрекеті сияқты.</b> Орындайын ба?\n<pre><code class="language-bash">${esc(tail(cmd, 1500))}</code></pre>`,
      reply_markup: { inline_keyboard: [[{ text: "Иә, орында", callback_data: `ok:${id}`, style: "danger" }, { text: "Жоқ", callback_data: `no:${id}`, style: "success" }]] } });
  }
  return run(chat, thread, cmd, msg.message_id);
}

async function onCallback(q) {
  const [act, idS] = String(q.data ?? "").split(":"); const id = Number(idS);
  const chat = q.message?.chat?.id ?? OWNER; const thread = q.message?.is_topic_message ? q.message.message_thread_id : undefined;
  const j = jobs.get(id);
  const answer = (text) => quiet("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text } : {}) });
  if (act === "stop") { if (j && !j.done) { kill(j); return answer("Тоқтатылуда…"); } return answer("Бітіп қалған"); }
  if (act === "again") { await answer(); return j ? run(chat, j.thread ?? thread, j.cmd, null) : answer("Жұмыс табылмады"); }
  if (act === "log") { await answer(); return j ? sendFile(chat, j.thread ?? thread, `out-${j.id}.txt`, clean(j.out) || "(бос)", `📄 #${j.id}`, j.msg) : null; }
  if (act === "ok" || act === "no") {
    const p = pending.get(id); pending.delete(id); await answer(act === "ok" ? "Орындалуда" : "Бас тартылды");
    if (q.message) await quiet("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: act === "ok" ? "✅ Расталды" : "✖️ Бас тартылды", disabled: {} }]] } });
    if (act === "ok" && p) return run(chat, p.thread, p.cmd, p.from);
    return null;
  }
  return answer();
}

// Пайдаланушы жобадағы «Тоқтату» батырмасын басты (sendRichMessageDraft can_stop)
function onStopped(s) {
  const j = jobs.get(Number(s.draft_id));
  if (j && !j.done) { j.out += "\n⏹ Telegram-да тоқтатылды"; kill(j); }
}

// Мәзір, сипаттама, командалар — тек иесінің чатында
let didSetup = false;
async function setup(chat) {
  if (didSetup) return; didSetup = true;
  const commands = [...Object.entries(PRESETS).map(([k, p]) => ({ command: k, description: p.desc.slice(0, 256) })),
    { command: "jobs", description: "жұмыс істеп тұрғандар" }, { command: "topics", description: "тақырыптарды қосу" }, { command: "help", description: "көмек" }];
  await quiet("setMyCommands", { commands, scope: { type: "chat", chat_id: chat } });
  await quiet("setChatMenuButton", { chat_id: chat, menu_button: { type: "commands" } });
  await quiet("setMyShortDescription", { short_description: "Medeo — жеке терминал" });
  await quiet("setMyDescription", { description: "Medeo серверін басқаруға арналған жеке терминал. Тек иесі қолдана алады." });
  await quiet("setMySettings", { can_join_groups: false, supports_inline_queries: false });
}
// Webhook жаңартулар тізімінде «stopped_message_generation» болсын (ескі орнатуда жоқ)
async function ensureWebhook() {
  const w = await quiet("getWebhookInfo", {});
  if (w?.url && !ALLOWED.every((x) => (w.allowed_updates ?? []).includes(x))) await quiet("setWebhook", { url: w.url, secret_token: HOOK, allowed_updates: ALLOWED, max_connections: 10 });
}

// ── Webhook ──
http.createServer((req, res) => {
  if (req.method === "GET") { res.writeHead(200).end("ok"); return; }
  if (req.method !== "POST" || req.url !== "/hook" || req.headers["x-telegram-bot-api-secret-token"] !== HOOK) { res.writeHead(404).end(); return; }
  let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on("end", () => {
    res.writeHead(200).end("ok"); // Telegram күтпесін; жұмыс фонда (Cloud Run: --no-cpu-throttling)
    let u; try { u = JSON.parse(raw); } catch { return; }
    const s = u.stopped_message_generation;
    const from = u.message?.from?.id ?? u.callback_query?.from?.id ?? (s ? s.chat?.id : undefined);
    const chatType = u.message?.chat?.type ?? u.callback_query?.message?.chat?.type ?? s?.chat?.type ?? "private";
    if (from !== OWNER || chatType !== "private") { console.log(JSON.stringify({ audit: "denied", from })); return; }
    (u.message ? onMessage(u.message) : u.callback_query ? onCallback(u.callback_query) : s ? Promise.resolve(onStopped(s)) : Promise.resolve())
      .catch((e) => console.error("handler", e.message));
  });
}).listen(PORT, () => { console.log(`termbot :${PORT}`); ensureWebhook(); });
