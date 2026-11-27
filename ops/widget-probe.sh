#!/usr/bin/env bash
# Telegram виджеті (Bot API 10.4, sendWidget) біздің ботқа қазір ашық па — нақты тексеру (2026-11-27).
# Иесіне (OWNER_ID не ADMIN_IDS-тегі бірінші ID) бір кішкентай сынақ виджетін жібереді, Telegram-ның ТОЛЫҚ жауабын көрсетеді, сосын хабарды өшіреді.
# Токен экранға шықпайды. Іске қосу (терминал-бот): bash ops/widget-probe.sh
set -uo pipefail
REGION=${REGION:-europe-west3}
SVC=$(gcloud run services describe medeo-api --region "$REGION" --format=json)
# Бот токені — сервистегі MINIAPP_BOT_TOKEN (жоқ болса BOT_TOKEN) құпиясынан
SECRET=$(echo "$SVC" | jq -r '[.spec.template.spec.containers[0].env[] | select(.name=="MINIAPP_BOT_TOKEN" or .name=="BOT_TOKEN")] | sort_by(.name != "MINIAPP_BOT_TOKEN") | .[0].valueFrom.secretKeyRef.name // empty')
[ -n "$SECRET" ] || { echo "Сервисте бот токенінің құпиясы табылмады"; exit 1; }
OWNER=${OWNER_ID:-$(echo "$SVC" | jq -r '.spec.template.spec.containers[0].env[]? | select(.name=="ADMIN_IDS") | .value' | cut -d, -f1 | tr -d ' ')}
[ -n "$OWNER" ] || { echo "OWNER_ID не ADMIN_IDS жоқ"; exit 1; }
TOKEN=$(gcloud secrets versions access latest --secret "$SECRET")
API="https://api.telegram.org/bot$TOKEN"
echo "=== 1) Бот ==="
curl -s "$API/getMe" | jq -c '.result | {username, id}'
echo "=== 2) sendWidget → $OWNER ==="
HTML='<div style="padding:12px;font:600 15px system-ui">Medeo · виджет сынағы ✓</div><script>window.TelegramWidget&&window.TelegramWidget.ready()</script>'
R=$(curl -s -X POST "$API/sendWidget" -H 'Content-Type: application/json' \
  -d "$(jq -nc --argjson c "$OWNER" --arg h "$HTML" '{chat_id:$c, html:$h, chat_data:"{}", height:0, caption:"Medeo: виджет сынағы (өзі өшеді)", disable_notification:true}')")
unset TOKEN
echo "$R" | jq -c '{ok, error_code, description, message_id: .result.message_id}'
if [ "$(echo "$R" | jq -r .ok)" = "true" ]; then
  MID=$(echo "$R" | jq -r .result.message_id)
  sleep 3
  T2=$(gcloud secrets versions access latest --secret "$SECRET")
  curl -s -X POST "https://api.telegram.org/bot$T2/deleteMessage" -H 'Content-Type: application/json' -d "{\"chat_id\":$OWNER,\"message_id\":$MID}" >/dev/null
  unset T2
  echo "✅ ВИДЖЕТ АШЫҚ. Сервер өзі көшеді: келесі жоспарлы тексерісте (15 мин) белсенді пакеттердің мәтіндік карталары виджетке ауысады (6 сағаттық күту бітсе не сервер қайта қосылса)."
else
  echo "⛔ Виджет әлі жабық (жоғарыдағы description). Ештеңе істеудің қажеті жоқ: сервер 6 сағат сайын өзі қайта тексереді."
fi
