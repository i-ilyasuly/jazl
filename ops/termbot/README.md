# Medeo терминал-боты

Telegram-нан Cloud Shell сияқты команда орындау: ноутбук керек емес (Патша шешімі, 2026-11-27 — қауіпті өз мойнына алды).

## Қалай жұмыс істейді
- Жеке Cloud Run сервисі `medeo-termbot` (gcloud, git, node, jq, psql бар бейне), жеке сервис аккаунты `medeo-termbot@…`.
- Әр хабарлама — bash скрипт (көп жолды да болады), жұмыс қалтасы — репоның көшірмесі (`/workspace/jazl`, main).
- Шығыс хабарламада тірі жаңарады (1,5 с), соңында: ✅/❌, коды, уақыты; ұзын болса — `out-N.txt` файлы.
- Батырмалар: ⏹ Тоқтату · 🔁 Қайталау · 📄 Толық лог · 📋 Команданы көшіру. Реакция: 👀 → 👍/👎.
- Дайын командалар (мәзір + тұрақты пернетақта): /deploy /tick /fiscal /logs /status /pull, /jobs, /help.
- Әр хабарлама жеке қабықта орындалады: `cd` мен айнымалылар келесі хабарламаға өтпейді.

## Қорғау
- Тек `OWNER_ID` (жеке чат); басқалар үнсіз еленбейді (логта `audit: denied`).
- Telegram webhook құпия тақырыбы (`X-Telegram-Bot-Api-Secret-Token`), құпиялар — Secret Manager-де.
- Анық жою командаларына (rm -rf, drop/truncate, gcloud … delete т.б.) бір рет «Иә» растауы.
- Әр команда Cloud Logging-те (`audit: run/done`). Бір команда ең көбі 30 минут.

## Орнату (бір рет, Cloud Shell — телефондағы Google Cloud қосымшасынан да болады)
1. Telegram → @BotFather → `/newbot` → токенді көшіру.
2. `cd ~/jazl && git pull && bash ops/termbot/setup.sh` → токенді енгізу (экранда көрінбейді).
3. Жаңа ботқа `/start`.

Ботты жаңарту: ботқа `/selfupdate` (немесе Cloud Shell-де `bash ops/termbot/setup.sh`).
Bot API 10.x: Rich Messages, ағынды жоба + `<tg-thinking>`, Telegram «Тоқтату» батырмасы, түсті батырмалар, жеке чат тақырыптары (/topics). Rich қолжетімсіз болса — ескі тәсіл.
Өшіру: `gcloud run services delete medeo-termbot --region europe-west3` (немесе BotFather-де токенді /revoke).
