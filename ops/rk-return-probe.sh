#!/usr/bin/env bash
# re:Kassa қайтару чегін тікелей тексеру (2026-11-27): кезектегі бір қайтаруды API-ға жіберіп, ТОЛЫҚ жауапты көрсетеді.
# Сол X-Request-ID қолданылады (кезектегі чекпен бірдей) — re:Kassa ауысым ішінде қайталанбайды, қос чек шықпайды.
# Құпиялар экранға шықпайды. Іске қосу (терминал-бот): bash ops/rk-return-probe.sh
set -uo pipefail
REGION=europe-west3
echo "=== 1) Сервердегі нұсқа ==="
gcloud run services describe medeo-api --region $REGION --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'
echo "репо main: $(git log --oneline -1 origin/main 2>/dev/null || git log --oneline -1)"

DB="$(gcloud secrets versions access latest --secret medeo-database-url)"
ROW=$(psql "$DB" -At -F'|' -c "select r.request_id, s.ticket_id, r.amount, r.title from app.fiscal_receipts r
  join app.fiscal_receipts s on s.payment_id = r.payment_id and s.kind = 'sell' and s.status in ('ok','offline')
  where r.kind = 'sell_return' and r.status = 'pending' order by r.created_at desc limit 1")
[ -n "$ROW" ] || { echo "Кезекте қайтару жоқ"; exit 0; }
IFS='|' read -r RID SID AMT TITLE <<< "$ROW"
echo "=== 2) Қайтару: $RID · $AMT ₸ · бастапқы чек id=$SID ==="

KEY=$(gcloud secrets versions access latest --secret medeo-rekassa-test-key)
PASS=$(gcloud secrets versions access latest --secret medeo-rekassa-test-password)
ZNM=$(gcloud run services describe medeo-api --region $REGION --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name=="REKASSA_NUMBER") | .value')
B=https://app-test.rekassa.kz/partner
L=$(curl -s -X POST "$B/api/auth/login?apiKey=$KEY&format=json" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg n "$ZNM" --arg p "$PASS" '{number:$n,password:$p}')")
T=$(echo "$L" | jq -r '.token // empty'); ID=$(echo "$L" | jq -r '.id // empty')
unset KEY PASS
[ -n "$T" ] || { echo "Кіру сәтсіз:"; echo "$L" | jq 'del(.token,.cashRegisterPassword)'; exit 1; }
echo "Касса id=$ID"

echo "=== 3) Бастапқы чек (re:Kassa-дан) ==="
P=$(curl -s "$B/api/crs/$ID/tickets/$SID" -H "Authorization: Bearer $T")
echo "$P" | jq -c '{ticketNumber, offlineTicketNumber, messageTime, offline, status, total: .data.ticket.amounts.total, rnm: .data.service.regInfo.kkm.fnsKkmId, op: .data.ticket.operation, payments: .data.ticket.payments}'

BODY=$(echo "$P" | TZ=Asia/Almaty jq -c --arg title "$TITLE" --argjson amt "$AMT" '
  (.messageTime | capture("^(?<y>\\d{4})-(?<mo>\\d{2})-(?<d>\\d{2})T(?<h>\\d{2}):(?<mi>\\d{2}):(?<s>\\d{2})")) as $t
  | {bills: ($amt|tostring), coins: 0} as $sum
  | {operation: "OPERATION_SELL_RETURN",
     dateTime: (now | strflocaltime("%Y %m %d %H %M %S") | split(" ") | {date:{year:.[0],month:(.[1]|tonumber|tostring),day:(.[2]|tonumber|tostring)},time:{hour:(.[3]|tonumber|tostring),minute:(.[4]|tonumber|tostring),second:(.[5]|tonumber|tostring)}}),
     domain: {type: "DOMAIN_SERVICES"},
     items: [{type: "ITEM_TYPE_COMMODITY", commodity: {name: $title[0:128], sectionCode: "1", quantity: 1000, price: $sum, sum: $sum, measureUnitCode: "796", auxiliary: [{key: "UNIT_TYPE", value: "PIECE"}]}}],
     payments: [{type: "PAYMENT_CARD", sum: $sum}],
     amounts: {total: $sum, taken: $sum, change: {bills: "0", coins: 0}},
     parentTicket: {parentTicketNumber: (.ticketNumber // .offlineTicketNumber),
       parentTicketDataTime: {date: {year: $t.y, month: ($t.mo|tonumber|tostring), day: ($t.d|tonumber|tostring)}, time: {hour: ($t.h|tonumber|tostring), minute: ($t.mi|tonumber|tostring), second: ($t.s|tonumber|tostring)}},
       kgdKkmId: .data.service.regInfo.kkm.fnsKkmId, parentTicketTotal: .data.ticket.amounts.total, parentTicketIsOffline: (.offline // false)}}')
echo "=== 4) Жіберілетін дене ==="
echo "$BODY" | jq .

echo "=== 5) re:Kassa жауабы (толық) ==="
R=$(curl -s -w '\nHTTP %{http_code}' -X POST "$B/api/crs/$ID/tickets" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -H "X-Request-ID: $RID" -d "$BODY")
echo "$R" | head -c 6000
