#!/usr/bin/env bash
# Medeo терминал-ботын бір рет орнату (Cloud Shell-де): bash ops/termbot/setup.sh
# Қайта іске қосуға болады — бар нәрсені қайта жасамайды, тек ботты жаңартады.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=$(gcloud config get-value project 2>/dev/null)
REGION=europe-west3
SVC=medeo-termbot
SA="medeo-termbot@${PROJECT}.iam.gserviceaccount.com"
echo "Жоба: $PROJECT"
# 0) gcloud аккаунты таңдалған ба (Cloud Shell кейде рұқсатсыз ашылады) — токенді сұрамас бұрын тексереміз
if [ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]; then
  echo "gcloud аккаунты таңдалмаған. Алдымен: gcloud auth login  (сілтемені ашып, кодты қойыңыз), сосын осы скриптті қайта іске қосыңыз."
  exit 1
fi
[ -n "$PROJECT" ] || { echo "Жоба таңдалмаған: gcloud config set project jazl-platform"; exit 1; }

# 1) Бот токені (BotFather) және webhook құпиясы — Secret Manager-де
if ! gcloud secrets describe medeo-termbot-token >/dev/null 2>&1; then
  read -r -s -p "BotFather берген жаңа боттың токені: " T; echo
  printf '%s' "$T" | gcloud secrets create medeo-termbot-token --data-file=- >/dev/null; unset T
fi
if ! gcloud secrets describe medeo-termbot-hook >/dev/null 2>&1; then
  openssl rand -hex 24 | tr -d '\n' | gcloud secrets create medeo-termbot-hook --data-file=- >/dev/null
fi

# 2) Иесі: medeo-api-дегі ADMIN_IDS-тің біріншісі (болмаса — сұрайды)
OWNER=${OWNER_ID:-$(gcloud run services describe medeo-api --region $REGION --format=json 2>/dev/null \
  | jq -r '.spec.template.spec.containers[0].env[]? | select(.name=="ADMIN_IDS") | .value' | cut -d, -f1 | tr -d ' ')}
[ -n "$OWNER" ] || read -r -p "Сіздің Telegram ID: " OWNER
echo "Иесі (Telegram ID): $OWNER"

# 3) Боттың жеке сервис аккаунты (Cloud Shell-дегідей кең құқық — Патша шешімі, 2026-11-27)
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create medeo-termbot --display-name "Medeo terminal bot" >/dev/null
for R in roles/editor roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.admin \
         roles/resourcemanager.projectIamAdmin roles/cloudbuild.builds.editor roles/logging.viewer roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$R" --condition=None --quiet >/dev/null
done

# 4) Сервис: CPU әрдайым (жұмыс жауаптан кейін фонда жүреді), бір инстанс (жұмыстар тізімі бір жерде), 0-ге дейін ұйықтайды
gcloud run deploy $SVC --source . --region $REGION --service-account "$SA" --allow-unauthenticated \
  --no-cpu-throttling --min-instances 0 --max-instances 1 --concurrency 20 --memory 1Gi --cpu 1 --timeout 3600 \
  --set-env-vars "OWNER_ID=$OWNER,REGION=$REGION,CLOUDSDK_CORE_PROJECT=$PROJECT" \
  --set-secrets "BOT_TOKEN=medeo-termbot-token:latest,HOOK_SECRET=medeo-termbot-hook:latest" --quiet

# 5) Webhook (құпия тақырыппен; тек хабарлама мен батырма оқиғалары)
URL=$(gcloud run services describe $SVC --region $REGION --format='value(status.url)')
TOKEN=$(gcloud secrets versions access latest --secret medeo-termbot-token)
HOOKS=$(gcloud secrets versions access latest --secret medeo-termbot-hook)
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook" -d "url=${URL}/hook" -d "secret_token=${HOOKS}" \
  -d 'allowed_updates=["message","callback_query"]' -d "drop_pending_updates=true" -d "max_connections=10" | jq -c .
unset TOKEN HOOKS
echo "Дайын. Ботқа /start жазыңыз."
