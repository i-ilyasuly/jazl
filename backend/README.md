# Medeo API (backend/)

Мини апп пен мекеме бөлімінің жаңа бэкенді. **Түбірдегі бот кодынан бөлек** — оған тимейді, бір дерекқорда
`app` схемасында қатар тұра алады (ескі боттың `public` кестелері өзгермейді, тестпен тексерілген).

- Стек: TypeScript · Hono · Drizzle ORM · PostgreSQL · Cloud Run (контейнер)
- Кіру: әр сұрау `Authorization: tma <Telegram initData>` — қолтаңбасы бот токенімен тексеріледі
- Ақша — теңгемен бүтін сан; уақыт — UTC (timestamptz)
- Логика мен кезеңдер: Drive «14 Бэкенд логикасы» → «ПЛАТФОРМА ҰСЫНЫСЫ»

## Кезеңдер
| Кезең | Мазмұны | Күйі |
|---|---|---|
| B0 | Негіз: құрылым (14 кесте), миграциялар, initData тексеру, `/health`, `/v1/me` | дайын |
| B1 | Каталог: `GET /v1/catalog` (кірусіз), seed (10 мекеме, 11 ұсыныс), мини апп фонда алады; Профиль → «Жүйе күйі» | дайын |
| B2 | `POST /v1/purchases` (сынақ төлемі, баға серверде, идемпотенттік), `GET /v1/packs`, `GET /v1/receipts/:id`; чек: public + internal | дайын |
| B3 | `POST /v1/redeem` (касса QR), `POST /v1/orders` (now/plan, 4 таңбалы код), бас тарту, `GET /v1/venue/orders`, `POST /v1/venue/orders/verify`; бірлік бұғатпен шегеріледі | дайын (бот хабарламалары — кейін) |
| B4 | `POST /v1/ratings`, `POST /v1/packs/:id/extend` (7 тегін бір рет / 14 / 30), `POST /v1/purchases {fromPackId}` (көшіру, 3 күн), `{gift}` + `/v1/gifts/:code` (accept, cancel, 7 күнде қайту), `POST /v1/packs/:id/refund` | дайын |
| B5 | Мекеме дашборды, басқару сайты | |
| B6 | Нақты төлем, Қазақстандағы хостингке көшу | |

## Жергілікті іске қосу
```bash
cd backend && npm ci
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/medeo DB_SSL=disable BOT_TOKEN=<тест бот токені>
npm run db:migrate && npm run dev        # http://localhost:8080/health
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/medeo_test npm test
```
Құрылым өзгерсе: `src/db/schema.ts` түзетіп, `npm run db:generate -- --name <атауы>` → жаңа миграция `drizzle/` ішінде.

## Google Cloud-қа шығару (бот тұрған жоба)
Төмендегі командаларды жоба иесі (Патша) Cloud Shell-де бір рет орындайды. Құпиялар тек Secret Manager-де.

```bash
PROJECT=<жоба ID>; REGION=<таңдалған аймақ, мысалы europe-central2>   # аймақты gcping.com арқылы Қазақстаннан өлшеп таңдаймыз
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# 1) Дерекқор. Бот қолданып жүрген PostgreSQL-ды қайта пайдаланамыз (жаңа кестелер app схемасында).
#    Егер ол Cloud SQL болса — инстанс атауын білу жеткілікті; болмаса жаңасын ашамыз (ең кіші тариф).
# 2) Құпиялар
printf '%s' "<бот токені>" | gcloud secrets create medeo-bot-token --data-file=-      # бар болса: versions add
printf '%s' "<DATABASE_URL>" | gcloud secrets create medeo-database-url --data-file=-

# 3) Миграция (бір реттік job) және API
gcloud run jobs deploy medeo-migrate --source backend --region $REGION \
  --command node --args dist/db/migrate.js \
  --set-secrets DATABASE_URL=medeo-database-url:latest,BOT_TOKEN=medeo-bot-token:latest
gcloud run jobs execute medeo-migrate --region $REGION --wait

gcloud run deploy medeo-api --source backend --region $REGION --allow-unauthenticated \
  --set-secrets DATABASE_URL=medeo-database-url:latest,BOT_TOKEN=medeo-bot-token:latest \
  --set-env-vars ALLOWED_ORIGINS=https://<мини апп домені>,NODE_ENV=production \
  --min-instances 0 --max-instances 3
# Cloud SQL болса: екеуіне де --add-cloudsql-instances $PROJECT:$REGION:<инстанс> және DATABASE_URL ішінде host=/cloudsql/...
```
`--allow-unauthenticated` — API-ді мини апп шақырады; қорғаныс — initData тексеруі.

## Каталогты толтыру (seed)
`seed/catalog.json` — мини апптағы үлгі деректерден жасалған (`npm run seed:build`). Дерекқорға жазу:
```bash
gcloud run jobs deploy medeo-seed --source backend --region europe-west3 --command node --args dist/db/seed.js \
  --set-secrets DATABASE_URL=medeo-database-url:latest,BOT_TOKEN=medeo-bot-token:latest --max-retries 0
gcloud run jobs execute medeo-seed --region europe-west3 --wait
```
Қайта іске қосуға болады — slug бойынша жаңартады, екі еселемейді.

## Бот хабарламалары (src/notify.ts)
Хабар мини апп ботынан (`MINIAPP_BOT_TOKEN`, жоқ болса `BOT_TOKEN`) жіберіледі; батырма — `t.me/<бот>?startapp=<кілт>` (vo_ тапсырыс, vc_ шағым, pk_ пакет, v_<бет>).
- Бірден: жаңа тапсырыс/жазылу (филиал кассирлері + иесі, «Жаңа тапсырыс» баптауы), тапсырыс дайын (клиентке), QR қолданылды (клиентке),
  жаңа шағым (иесі + басқарушы, әрқашан), шағым шешімі (клиентке), кассир қосылуды сұрады / қабылданды, жаңа пікір («Жаңа пікір»).
- Жоспарлы (`POST /cron/tick`, `X-Cron-Key: $CRON_KEY`, 15 минут сайын): өтінім нәтижесі (күй дерекқорда қолмен өзгерсе де), 22:00 күндік қорытынды (иесіне),
  10:00–21:00 мерзім ескертуі (пакет 3 күннен кейін бітеді). Қайталанбауы — `app.notify_log` кілті.
```bash
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create medeo-cron-key --data-file=-
gcloud run deploy medeo-api --source backend --region europe-west3 --update-secrets CRON_KEY=medeo-cron-key:latest
gcloud scheduler jobs create http medeo-tick --location europe-west3 --schedule "*/15 * * * *" --time-zone Asia/Almaty --http-method POST \
  --uri "$(gcloud run services describe medeo-api --region europe-west3 --format='value(status.url)')/cron/tick" \
  --headers "X-Cron-Key=$(gcloud secrets versions access latest --secret medeo-cron-key)"
```

## Medeo Басқару (src/routes/admin.ts, мини апп /a)
Кіру: `ADMIN_IDS` (Telegram ID, үтірмен) + жеке PIN (scrypt, 3 қате → 15 мин бұғат) → `X-Admin-Token` (12 сағ). Қауіпті әрекеттер (комиссия, тоқтату,
қолмен қайтару, ұзарту, баптаулар) денесіндегі `pin` арқылы қайта расталады; әр өзгеріс `app.admin_log`-қа жазылады.
Баптаулар `app.settings` (maintenance, moderation, graceDays, complaintHours); `maintenance` қосулы болса `/v1/*` 503 (Басқарудан басқасы).
```bash
gcloud run services update medeo-api --region europe-west3 --update-env-vars ADMIN_IDS=<Telegram ID>
```

### Веб-кіру (Басқару тек веб арқылы)
Браузерде `/#/a` → Telegram Login Widget (@Mmedeo_bot, BotFather-де `/setdomain` → мини апп домені) → PIN → «Authorization: adm <userId>.<exp>.<sig>» (12 сағ).
`ADMIN_WEB_URL` — бот хабарламасындағы батырмалар апаратын мекенжай. Нативті қосымша сборкасы: `VITE_NO_ADMIN=1 npm run build` (Басқару бандлға кірмейді).
