// Medeo терминал-боты (Патша, 2026-11-27): Telegram-нан Cloud Shell сияқты команда орындау — ноутбуксыз.
// Әр хабарлама = bash скрипт (көп жолды да болады). Шығысы тірі жаңарып тұрады, соңында коды, уақыты, толық логы.
// Қорғау: тек OWNER_ID (жеке чат), Telegram webhook құпия тақырыбы, қауіпті командаға растау.
// Тәуелділік жоқ (Node 18+ fetch). Орнату: ops/termbot/setup.sh, сипаттама: ops/termbot/README.md.
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
if (!TOKEN || !OWNER || !HOOK) { console.error("BOT_TOKEN, OWNER_ID, HOOK_SECRET керек"); process.exit(1); }

// ── Telegram Bot API ──
async function api(method, body) {
  const r = await fetch(`${TG}/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, description: "bad json" }));
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
const tryApi = (m, b) => api(m, b).catch((e) => { if (!/not modified/.test(e.message)) console.error(e.message); return null; });
async function sendFile(chat_id, name, text, caption, reply_to) {
  const fd = new FormData();
  fd.append("chat_id", String(chat_id));
  fd.append("document", new Blob([text], { type: "text/plain" }), name);
  if (caption) { fd.append("caption", caption); fd.append("parse_mode", "HTML"); }
  if (reply_to) fd.append("reply_parameters", JSON.stringify({ message_id: reply_to, allow_sending_without_reply: true }));
  const r = await fetch(`${TG}/bot${TOKEN}/sendDocument`, { method: "POST", body: fd }).catch(() => null);
  if (r && !(await r.json().catch(() => ({}))).ok) console.error("sendDocument failed");
}

// ── Мәтін ──
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const clean = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
const tail = (s, n) => (s.length > n ? "…" + s.slice(-n) : s);
const dur = (ms) => (ms < 1000 ? `${ms} мс` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} с` : `${Math.floor(ms / 60_000)} мин ${Math.round((ms % 60_000) / 1000)} с`);
const short = (cmd) => { const l = cmd.trim().split("\n"); return l[0].slice(0, 80) + (l.length > 1 || l[0].length > 80 ? " …" : ""); };

// ── Дайын командалар (мәзір мен батырмалар) ──
const CRON = `URL=$(gcloud run services describe medeo-api --region ${REGION} --format='value(status.url)')
curl -s -X POST "$URL/cron/tick" -H "X-Cron-Key: $(gcloud secrets versions access latest --secret medeo-cron-key)" | jq .`;
const PRESETS = {
  deploy: { title: "🚀 Орнату", desc: "main → миграция + medeo-api", cmd: `set -e
git fetch -q origin main && git reset -q --hard origin/main && git log --oneline -1
gcloud run jobs deploy medeo-migrate --source backend --region ${REGION} --quiet
gcloud run jobs execute medeo-migrate --region ${REGION} --wait
gcloud run deploy medeo-api --source backend --region ${REGION} --quiet
gcloud run services describe medeo-api --region ${REGION} --format='value(status.latestReadyRevisionName)'` },
  tick: { title: "⏱ Кезек", desc: "cron/tick қазір іске қосу", cmd: CRON },
  fiscal: { title: "🧾 Чектер", desc: "re:Kassa логы (3 сағат)", cmd: `gcloud logging read 'resource.labels.service_name="medeo-api" AND textPayload:"fiscal"' --freshness=3h --limit=30 --format='value(timestamp,textPayload)'` },
  logs: { title: "📜 Лог", desc: "medeo-api соңғы жазбалары (1 сағат)", cmd: `gcloud logging read 'resource.labels.service_name="medeo-api" AND textPayload!=""' --freshness=1h --limit=40 --format='value(timestamp,textPayload)'` },
  status: { title: "ℹ️ Күй", desc: "нұсқа, URL, соңғы коммит", cmd: `gcloud run services describe medeo-api --region ${REGION} --format='value(status.url,status.latestReadyRevisionName)'
git fetch -q origin main && git log --oneline -3 origin/main` },
  pull: { title: "⬇️ Pull", desc: "репоны main-ге жаңарту", cmd: `git fetch -q origin main && git reset -q --hard origin/main && git log --oneline -1` },
};
const BY_TITLE = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [p.title, k]));
const KEYBOARD = { keyboard: [[{ text: PRESETS.deploy.title }, { text: PRESETS.tick.title }, { text: PRESETS.fiscal.title }], [{ text: PRESETS.logs.title }, { text: PRESETS.status.title }, { text: PRESETS.pull.title }]],
  is_persistent: true, resize_keyboard: true, input_field_placeholder: "Команда жаз — bash орындайды" };

// Қауіпті командалар — бір рет растау (жылдамдыққа кедергі болмайтындай, тек анық жою әрекеттері)
const DANGER = /\b(rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r|drop\s+(table|schema|database)|truncate\s+|delete\s+from|gcloud\s+[^\n]*\b(delete|remove-iam-policy-binding)\b|projects\s+delete|dd\s+if=|mkfs)/i;

// ── Жұмыстар ──
const jobs = new Map(); // id → { proc, out, chat, msg, from, cmd, started, done, code }
const pending = new Map(); // растауды күткен командалар
let seq = 0;

async function ensureRepo() {
  if (fs.existsSync(`${DIR}/.git`)) return;
  fs.mkdirSync(WORK, { recursive: true });
  await new Promise((res) => spawn("git", ["clone", "-q", "--depth", "50", REPO, DIR], { stdio: "ignore" }).on("close", res));
}

function buttons(j) {
  if (!j.done) return { inline_keyboard: [[{ text: "⏹ Тоқтату", callback_data: `stop:${j.id}` }]] };
  return { inline_keyboard: [[{ text: "🔁 Қайталау", callback_data: `again:${j.id}` }, { text: "📄 Толық лог", callback_data: `log:${j.id}` }],
    [{ text: "📋 Команданы көшіру", copy_text: { text: j.cmd.slice(0, 256) } }]] };
}
function render(j) {
  const head = j.done
    ? `${j.code === 0 ? "✅" : j.killed ? "⏹" : "❌"} <b>${j.code === 0 ? "Орындалды" : j.killed ? "Тоқтатылды" : `Қате · код ${j.code}`}</b> · ${dur(j.done - j.started)}`
    : `⏳ <b>Орындалуда</b> · ${dur(Date.now() - j.started)}`;
  const cmd = `<blockquote expandable><code>${esc(tail(j.cmd, 600))}</code></blockquote>`;
  const out = clean(j.out).trimEnd();
  const body = out ? `<pre><code class="language-bash">${esc(tail(out, 3200))}</code></pre>` : `<i>${j.done ? "шығыс жоқ" : "күтуде…"}</i>`;
  return `${head}\n${cmd}\n${body}`;
}
async function show(j) {
  await tryApi("editMessageText", { chat_id: j.chat, message_id: j.msg, text: render(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: buttons(j) });
}

async function run(chat, cmd, from) {
  const j = { id: ++seq, chat, cmd, from, out: "", started: Date.now(), done: 0, code: null, killed: false };
  jobs.set(j.id, j);
  if (jobs.size > 30) jobs.delete(Math.min(...jobs.keys()));
  if (from) tryApi("setMessageReaction", { chat_id: chat, message_id: from, reaction: [{ type: "emoji", emoji: "👀" }] });
  tryApi("sendChatAction", { chat_id: chat, action: "typing" });
  const m = await api("sendMessage", { chat_id: chat, text: render(j), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: buttons(j),
    ...(from ? { reply_parameters: { message_id: from, allow_sending_without_reply: true } } : {}) });
  j.msg = m.message_id;
  await ensureRepo();
  console.log(JSON.stringify({ audit: "run", id: j.id, cmd: j.cmd }));
  j.proc = spawn("bash", ["-lc", cmd], { cwd: fs.existsSync(DIR) ? DIR : WORK, detached: true, env: { ...process.env, BOT_TOKEN: "", HOOK_SECRET: "", TERM: "dumb", CLOUDSDK_CORE_DISABLE_PROMPTS: "1" } });
  const add = (b) => { j.out += b.toString(); if (j.out.length > 2_000_000) j.out = j.out.slice(-1_000_000); };
  j.proc.stdout.on("data", add); j.proc.stderr.on("data", add);
  const tick = setInterval(() => { show(j); tryApi("sendChatAction", { chat_id: chat, action: "typing" }); }, 1500);
  const limit = setTimeout(() => { j.out += `\n⏰ ${dur(LIMIT_MS)} өтті — тоқтатылды`; kill(j); }, LIMIT_MS);
  j.proc.on("close", async (code) => {
    clearInterval(tick); clearTimeout(limit);
    j.done = Date.now(); j.code = code ?? -1;
    console.log(JSON.stringify({ audit: "done", id: j.id, code: j.code, ms: j.done - j.started }));
    await show(j);
    if (from) tryApi("setMessageReaction", { chat_id: chat, message_id: from, reaction: [{ type: "emoji", emoji: j.code === 0 ? "👍" : "👎" }] });
    if (clean(j.out).length > 3200) await sendFile(chat, `out-${j.id}.txt`, clean(j.out), `📄 Толық шығыс · #${j.id}`, j.msg);
  });
}
function kill(j) { if (j.done || !j.proc) return; j.killed = true; try { process.kill(-j.proc.pid, "SIGTERM"); } catch { /* бітіп қалған */ } setTimeout(() => { try { process.kill(-j.proc.pid, "SIGKILL"); } catch { /* */ } }, 5000); }

// ── Хабарламалар ──
async function onMessage(msg) {
  const chat = msg.chat.id; const text = (msg.text ?? "").trim();
  if (!text) return;
  if (text === "/start" || text === "/help") {
    await setup(chat);
    const list = Object.entries(PRESETS).map(([k, p]) => `/${k} — ${p.desc}`).join("\n");
    return api("sendMessage", { chat_id: chat, parse_mode: "HTML", reply_markup: KEYBOARD,
      text: `<b>Medeo терминалы</b>\nКез келген хабарлама bash болып орындалады (көп жол да болады). Жұмыс қалтасы — репо (<code>jazl</code>, main).\nӘр хабарлама жеке қабықта орындалады: <code>cd</code> мен айнымалылар келесіге өтпейді.\n\n${esc(list)}\n/jobs — жұмыс істеп тұрғандар`,
      ...(msg.message_id ? { message_effect_id: "5046509860389126442" } : {}) }).catch(() => api("sendMessage", { chat_id: chat, text: "Medeo терминалы дайын", reply_markup: KEYBOARD }));
  }
  if (text === "/jobs") {
    const act = [...jobs.values()].filter((j) => !j.done);
    return api("sendMessage", { chat_id: chat, parse_mode: "HTML", text: act.length ? act.map((j) => `#${j.id} · ${dur(Date.now() - j.started)} · <code>${esc(short(j.cmd))}</code>`).join("\n") : "Жұмыс жоқ" });
  }
  const preset = text.startsWith("/") ? text.slice(1).split(/[\s@]/)[0] : BY_TITLE[text];
  const cmd = preset && PRESETS[preset] ? PRESETS[preset].cmd : text;
  if (DANGER.test(cmd)) {
    const id = ++seq; pending.set(id, { cmd, from: msg.message_id });
    return api("sendMessage", { chat_id: chat, parse_mode: "HTML", reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      text: `⚠️ <b>Жою әрекеті сияқты.</b> Орындайын ба?\n<pre><code class="language-bash">${esc(tail(cmd, 1500))}</code></pre>`,
      reply_markup: { inline_keyboard: [[{ text: "✅ Иә, орында", callback_data: `ok:${id}` }, { text: "✖️ Жоқ", callback_data: `no:${id}` }]] } });
  }
  return run(chat, cmd, msg.message_id);
}

async function onCallback(q) {
  const [act, idS] = String(q.data ?? "").split(":"); const id = Number(idS);
  const chat = q.message?.chat.id; const j = jobs.get(id);
  const answer = (text) => tryApi("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text } : {}) });
  if (act === "stop") { if (j && !j.done) { kill(j); return answer("Тоқтатылуда…"); } return answer("Бітіп қалған"); }
  if (act === "again") { await answer(); return j ? run(chat, j.cmd, null) : null; }
  if (act === "log") { await answer(); return j ? sendFile(chat, `out-${j.id}.txt`, clean(j.out) || "(бос)", `📄 #${j.id}`, j.msg) : null; }
  if (act === "ok" || act === "no") {
    const p = pending.get(id); pending.delete(id); await answer(act === "ok" ? "Орындалуда" : "Бас тартылды");
    await tryApi("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (act === "ok" && p) return run(chat, p.cmd, p.from);
    return null;
  }
  return answer();
}

// Мәзір, сипаттама, командалар — тек иесінің чатында
let didSetup = false;
async function setup(chat) {
  if (didSetup) return; didSetup = true;
  const commands = [...Object.entries(PRESETS).map(([k, p]) => ({ command: k, description: p.desc.slice(0, 256) })), { command: "jobs", description: "жұмыс істеп тұрғандар" }, { command: "help", description: "көмек" }];
  await tryApi("setMyCommands", { commands, scope: { type: "chat", chat_id: chat } });
  await tryApi("setChatMenuButton", { chat_id: chat, menu_button: { type: "commands" } });
  await tryApi("setMyShortDescription", { short_description: "Medeo — жеке терминал" });
  await tryApi("setMyDescription", { description: "Medeo серверін басқаруға арналған жеке терминал. Тек иесі қолдана алады." });
}

// ── Webhook ──
http.createServer((req, res) => {
  if (req.method === "GET") { res.writeHead(200).end("ok"); return; }
  if (req.method !== "POST" || req.url !== "/hook" || req.headers["x-telegram-bot-api-secret-token"] !== HOOK) { res.writeHead(404).end(); return; }
  let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on("end", () => {
    res.writeHead(200).end("ok"); // Telegram күтпесін; жұмыс фонда (Cloud Run: --no-cpu-throttling)
    let u; try { u = JSON.parse(raw); } catch { return; }
    const from = u.message?.from?.id ?? u.callback_query?.from?.id;
    const chatType = u.message?.chat?.type ?? u.callback_query?.message?.chat?.type;
    if (from !== OWNER || chatType !== "private") { console.log(JSON.stringify({ audit: "denied", from })); return; }
    (u.message ? onMessage(u.message) : u.callback_query ? onCallback(u.callback_query) : Promise.resolve()).catch((e) => console.error("handler", e.message));
  });
}).listen(PORT, () => console.log(`termbot :${PORT}`));
