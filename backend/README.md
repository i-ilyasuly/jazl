# Jazl+ API (backend/)

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
| B1 | Каталог: мекеме, филиал, ұсыныс → мини апп моктары нақты API-ге | келесі |
| B2 | Сатып алу (сынақ төлемі), пакет, чек | |
| B3 | Қолдану: QR, тапсырыс, жоспар, кассир растауы, бот хабарламалары | |
| B4 | Сыйлық, көшіру, қайтару, бағалау | |
| B5 | Мекеме дашборды, басқару сайты | |
| B6 | Нақты төлем, Қазақстандағы хостингке көшу | |

## Жергілікті іске қосу
```bash
cd backend && npm ci
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/jazl DB_SSL=disable BOT_TOKEN=<тест бот токені>
npm run db:migrate && npm run dev        # http://localhost:8080/health
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/jazl_test npm test
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
printf '%s' "<бот токені>" | gcloud secrets create jazl-bot-token --data-file=-      # бар болса: versions add
printf '%s' "<DATABASE_URL>" | gcloud secrets create jazl-database-url --data-file=-

# 3) Миграция (бір реттік job) және API
gcloud run jobs deploy jazl-migrate --source backend --region $REGION \
  --command node --args dist/db/migrate.js \
  --set-secrets DATABASE_URL=jazl-database-url:latest,BOT_TOKEN=jazl-bot-token:latest
gcloud run jobs execute jazl-migrate --region $REGION --wait

gcloud run deploy jazl-api --source backend --region $REGION --allow-unauthenticated \
  --set-secrets DATABASE_URL=jazl-database-url:latest,BOT_TOKEN=jazl-bot-token:latest \
  --set-env-vars ALLOWED_ORIGINS=https://<мини апп домені>,NODE_ENV=production \
  --min-instances 0 --max-instances 3
# Cloud SQL болса: екеуіне де --add-cloudsql-instances $PROJECT:$REGION:<инстанс> және DATABASE_URL ішінде host=/cloudsql/...
```
`--allow-unauthenticated` — API-ді мини апп шақырады; қорғаныс — initData тексеруі.
