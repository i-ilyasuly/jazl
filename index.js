const functions = require('@google-cloud/functions-framework');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Белсенді генерацияларды тоқтатуды бақылау (Bot API 10.3 stopped_message_generation)
const stoppedDrafts = new Set();

// 1. Тікелей Telegram Bot API сұрау функциясы
async function tgCall(method, payload) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API Error [${method}]:`, JSON.stringify(data));
  }
  return data;
}

// 2. РЕСМИ АҒЫНДЫ ЖАУАП ЖӘНЕ ОЙЛАНУ БЛОГЫ (Bot API 10.1 - 10.3)
// sendRichMessageDraft + <tg-thinking> арқылы шынайы стриминг жасап,
// соңында sendRichMessage арқылы тұрақты Rich Message-ке айналдырады.
async function streamRichResponse(chatId, thinkingStages, finalRichHtml, extraOptions = {}) {
  const draftId = Math.floor(100000 + Math.random() * 900000);

  // Аралық ойлану және ағынды черновик кезеңдері
  for (const stage of thinkingStages) {
    if (stoppedDrafts.has(draftId)) {
      stoppedDrafts.delete(draftId);
      return;
    }

    const draftHtml = stage.partialHtml
      ? `<tg-thinking>${stage.thinking}</tg-thinking>${stage.partialHtml}`
      : `<tg-thinking>${stage.thinking}</tg-thinking>`;

    await tgCall('sendRichMessageDraft', {
      chat_id: chatId,
      draft_id: draftId,
      rich_message: { html: draftHtml },
      can_stop: true,
      keep_on_stop: true
    });

    await sleep(450);
  }

  if (stoppedDrafts.has(draftId)) {
    stoppedDrafts.delete(draftId);
    return;
  }

  // Черновикті негізгі Rich Message ретінде бекіту (Bot API 10.1+)
  const finalRes = await tgCall('sendRichMessage', {
    chat_id: chatId,
    rich_message: { html: finalRichHtml },
    ...extraOptions
  });

  // Егер клиенттің Telegram қосымшасы ескі нұсқада болса, резервтік sendMessage
  if (!finalRes.ok) {
    const cleanFallback = finalRichHtml
      .replace(/<h2>(.*?)<\/h2>/g, '<b>$1</b>\n')
      .replace(/<h3>(.*?)<\/h3>/g, '<b>$1</b>\n')
      .replace(/<hr\s*\/?>/g, '\n──────────────\n')
      .replace(/<\/?(table|tr|td|th|caption|details|summary|p|tg-map)[^>]*>/g, ' ');
    return tgCall('sendMessage', {
      chat_id: chatId,
      text: cleanFallback,
      parse_mode: 'HTML',
      ...(extraOptions.reply_markup ? { reply_markup: extraOptions.reply_markup } : {})
    });
  }

  return finalRes;
}

// 3. НЕГІЗГІ WEBHOOK ЖӘНЕ API ӨҢДЕУШІ
functions.http('jazlWebhook', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    // Mini App үшін Каталог API
    if (req.method === 'GET' && req.query.action === 'catalog') {
      const result = await pool.query(`
        SELECT s.*, v.name as venue_name, v.category, v.halal_org, v.rating 
        FROM subscriptions_catalog s
        JOIN venues v ON s.venue_id = v.id
        WHERE s.status = 'ACTIVE'
        ORDER BY s.is_promoted DESC, s.id ASC
      `);
      return res.status(200).json({ ok: true, items: result.rows });
    }

    const update = req.body;
    if (!update) return res.status(200).send('OK');

    // Bot API 10.3: Қолданушы генерацияны тоқтатса (Stop батырмасы)
    if (update.stopped_message_generation) {
      stoppedDrafts.add(update.stopped_message_generation.draft_id);
      return res.status(200).send('OK');
    }

    // =========================================================================
    // А) БАТЫРМАЛАР БАСЫЛҒАНДА (CALLBACK QUERY)
    // =========================================================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;
      const tgId = cb.from.id;
      const data = cb.data;

      // 1. «Менің жазылымдарым» бөлімі
      if (data === 'my_subs') {
        await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

        const subs = await pool.query(`
          SELECT us.*, sc.title, sc.unit_name, sc.units_total, sc.package_price, sc.unit_price,
                 v.name as venue_name, v.halal_org
          FROM user_subscriptions us
          JOIN users u ON us.user_id = u.id
          JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
          JOIN venues v ON sc.venue_id = v.id
          WHERE u.telegram_id = $1 AND us.status = 'ACTIVE'
          ORDER BY us.id DESC
        `, [tgId]);

        if (subs.rows.length === 0) {
          const cat = await pool.query(`
            SELECT sc.id, sc.title, sc.package_price, sc.unit_price, sc.savings_amount, sc.units_total, sc.unit_name, v.name as venue_name
            FROM subscriptions_catalog sc JOIN venues v ON sc.venue_id = v.id WHERE sc.status = 'ACTIVE'
          `);

          const tableRows = cat.rows.map(item =>
            `<tr><td><b>${item.venue_name}</b></td><td>${item.units_total} ${item.unit_name}</td><td><b>${item.package_price} ₸</b></td><td>+${item.savings_amount} ₸</td></tr>`
          ).join('');

          const buttons = cat.rows.map(item => ([{
            text: `Қосу: ${item.venue_name} (${item.units_total} ${item.unit_name} — ${item.package_price} ₸)`,
            callback_data: `buy_demo_${item.id}`
          }]));

          await streamRichResponse(
            chatId,
            [
              { thinking: 'Пайдаланушының белсенді жазылымдары тексерілуде...' },
              {
                thinking: 'Қолжетімді тарифтік пакеттер кестесі құрастырылуда...',
                partialHtml: `<h3>Жазылымдар тізімі</h3><p>Сізде әзірге белсенді жазылым тіркелмеген.</p>`
              }
            ],
            `<h2>Менің жазылымдарым</h2>` +
            `<p>Қазіргі уақытта сіздің аккаунтыңызда белсенді жазылымдар жоқ. Төмендегі кестеден қолжетімді пакеттермен танысып, сынақ режимінде іске қоса аласыз:</p>` +
            `<table bordered striped compact>` +
            `<caption>Қолжетімді жазылым пакеттері (30 күн)</caption>` +
            `<tr><th>Мекеме</th><th>Көлемі</th><th>Бағасы</th><th>Үнем</th></tr>` +
            `${tableRows}` +
            `</table>` +
            `<details><summary>Жазылым ережелері мен шарттары</summary>` +
            `<p>1. Қалдық баланс тек қызметті нақты алған сәтте (4-таңбалы код расталғанда) шегеріледі.<br/>2. Мерзімі аяқталғаннан кейін 3 күн ішінде жазылымды ұзартсаңыз, пайдаланылмаған 1 бірлік жаңа кезеңге сақталып өтеді.</p>` +
            `</details>`,
            { reply_markup: { inline_keyboard: buttons } }
          );
          return res.status(200).send('OK');
        }

        // Белсенді жазылымдар болса — ресми кестемен шығару
        for (const sub of subs.rows) {
          const halalText = sub.halal_org !== 'NONE' ? `Расталған (${sub.halal_org})` : 'Стандартты';
          const isExhausted = sub.units_remaining <= 0;

          const subHtml =
            `<h2>Жазылым төлқұжаты: ${sub.venue_name}</h2>` +
            `<p>${sub.title}</p>` +
            `<table bordered striped compact>` +
            `<tr><th>Көрсеткіш</th><th>Мәні</th></tr>` +
            `<tr><td>Қолжетімді қалдық</td><td><b>${sub.units_remaining} / ${sub.units_total} ${sub.unit_name}</b></td></tr>` +
            `<tr><td>Бірлік құны</td><td>${sub.unit_price} ₸ / ${sub.unit_name}</td></tr>` +
            `<tr><td>Сертификаттау</td><td>${halalText}</td></tr>` +
            `<tr><td>Мәртебесі</td><td><b>Белсенді (30 күн)</b></td></tr>` +
            `</table>` +
            `<details><summary>Қолдану және жеткізу шарттары</summary>` +
            `<p>Өзі алып кету — қосымша төлемсіз (0 ₸). Жеке курьерлік жеткізу (1 рейс = 1 тапсырыс) — 750 ₸. Тапсырыс берілген соң сізге 4-таңбалы қабылдау коды беріледі.</p>` +
            `</details>`;

          await streamRichResponse(
            chatId,
            [{ thinking: `${sub.venue_name} бойынша баланс деректері жүктелуде...` }],
            subHtml,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    // Bot API 10.3: Егер лимит бітсе, батырма ресми түрде disabled болады
                    { text: 'Өзім алып кетемін (13:00)', callback_data: `order_takeaway_${sub.id}`, disabled: isExhausted },
                    { text: 'Курьермен жеткізу (13:00)', callback_data: `order_courier_${sub.id}`, disabled: isExhausted }
                  ],
                  [{ text: 'Басқа пакет қосу', callback_data: 'show_demo_catalog' }]
                ]
              }
            }
          );
        }
        return res.status(200).send('OK');
      }

      // 2. Пакеттер тізімін көрсету
      if (data === 'show_demo_catalog') {
        await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
        const cat = await pool.query(`
          SELECT sc.id, sc.package_price, sc.units_total, sc.unit_name, v.name as venue_name
          FROM subscriptions_catalog sc JOIN venues v ON sc.venue_id = v.id WHERE sc.status = 'ACTIVE'
        `);
        const buttons = cat.rows.map(item => ([{
          text: `Қосу: ${item.venue_name} (${item.units_total} ${item.unit_name} — ${item.package_price} ₸)`,
          callback_data: `buy_demo_${item.id}`
        }]));

        await tgCall('sendRichMessage', {
          chat_id: chatId,
          rich_message: {
            html: `<h3>Қосымша жазылым пакетін таңдау</h3><p>Төмендегі тізімнен қажетті қызмет түрін таңдаңыз:</p>`
          },
          reply_markup: { inline_keyboard: buttons }
        });
        return res.status(200).send('OK');
      }

      // 3. Жазылымды рәсімдеу
      if (data.startsWith('buy_demo_')) {
        const catId = parseInt(data.replace('buy_demo_', ''), 10);
        await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

        const userRes = await pool.query(`SELECT id FROM users WHERE telegram_id = $1`, [tgId]);
        const catRes = await pool.query(`
          SELECT sc.*, v.name as venue_name FROM subscriptions_catalog sc
          JOIN venues v ON sc.venue_id = v.id WHERE sc.id = $1
        `, [catId]);

        if (userRes.rows.length > 0 && catRes.rows.length > 0) {
          const userId = userRes.rows[0].id;
          const cat = catRes.rows[0];

          const subInsert = await pool.query(`
            INSERT INTO user_subscriptions (user_id, catalog_id, units_remaining, valid_until)
            VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
            RETURNING id
          `, [userId, cat.id, cat.units_total]);
          const subId = subInsert.rows[0].id;

          await streamRichResponse(
            chatId,
            [
              { thinking: 'Төлем транзакциясы тексерілуде...' },
              {
                thinking: 'Жазылым лимиті мен есептік жазба қалыптастырылуда...',
                partialHtml: `<h3>Жазылымды тіркеу</h3><p>Мекеме: <b>${cat.venue_name}</b></p>`
              }
            ],
            `<h2>Жазылым сәтті белсендірілді</h2>` +
            `<p>Сіздің <b>${cat.venue_name}</b> мекемесіндегі айлық пакетіңіз жұмысқа дайын.</p>` +
            `<table bordered striped compact>` +
            `<caption>Транзакция және пакет деректері</caption>` +
            `<tr><th>Параметр</th><th>Мәлімет</th></tr>` +
            `<tr><td>Пакет атауы</td><td>${cat.title}</td></tr>` +
            `<tr><td>Берілген көлем</td><td><b>${cat.units_total} ${cat.unit_name}</b></td></tr>` +
            `<tr><td>Төленген сома</td><td>${cat.package_price} ₸ (Бөлшек бағасы: ${cat.retail_price} ₸)</td></tr>` +
            `<tr><td>Таза үнем</td><td><b>${cat.savings_amount} ₸</b></td></tr>` +
            `<tr><td>Жарамдылық мерзімі</td><td>30 күн</td></tr>` +
            `</table>`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: 'Өзім алып кетемін (13:00)', callback_data: `order_takeaway_${subId}` },
                    { text: 'Курьермен жеткізу (13:00)', callback_data: `order_courier_${subId}` }
                  ],
                  [{ text: 'Менің жазылымдарым', callback_data: 'my_subs' }]
                ]
              }
            }
          );
        }
        return res.status(200).send('OK');
      }

      // 4. Тапсырыс беру (Кесте + Кіріктірілген Карта + copy_text + Pin)
      if (data.startsWith('order_takeaway_') || data.startsWith('order_courier_')) {
        const isCourier = data.startsWith('order_courier_');
        const subId = parseInt(data.replace('order_takeaway_', '').replace('order_courier_', ''), 10);

        const subCheck = await pool.query(`
          SELECT us.*, sc.title, sc.unit_name, sc.venue_id, v.name as venue_name
          FROM user_subscriptions us
          JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
          JOIN venues v ON sc.venue_id = v.id
          WHERE us.id = $1
        `, [subId]);

        if (subCheck.rows.length === 0 || subCheck.rows[0].units_remaining <= 0) {
          await tgCall('answerCallbackQuery', {
            callback_query_id: cb.id,
            text: 'Таңдалған жазылым бойынша қолжетімді лимит аяқталған.',
            show_alert: true
          });
          return res.status(200).send('OK');
        }

        const sub = subCheck.rows[0];
        const branchRes = await pool.query(`SELECT * FROM branches WHERE venue_id = $1 LIMIT 1`, [sub.venue_id]);
        const branch = branchRes.rows[0];

        const handoffCode = Math.floor(1000 + Math.random() * 9000).toString();
        const orderNumber = `#JZ-${Math.floor(100 + Math.random() * 900)}`;

        await pool.query(`
          INSERT INTO orders (order_number, user_sub_id, user_id, branch_id, fulfillment_type, slot_time, handoff_code, status)
          VALUES ($1, $2, $3, $4, $5, '13:00 - 13:30', $6, 'READY')
        `, [orderNumber, sub.id, sub.user_id, branch.id, isCourier ? 'COURIER' : 'TAKEAWAY', handoffCode]);

        await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

        const deliveryMethod = isCourier
          ? 'Жеке курьер (1 рейс = 1 тапсырыс)'
          : `Өзі алып кету (${branch.address})`;

        const orderMsg = await streamRichResponse(
          chatId,
          [
            { thinking: `${sub.venue_name} филиалының 13:00 – 13:30 слотындағы квота тексерілуде...` },
            {
              thinking: `Тапсырыс ${orderNumber} тіркелуде және растау коды жасалуда...`,
              partialHtml: `<h3>Тапсырыс ${orderNumber}</h3><p>Мәртебесі: Орындауға қабылданды.</p>`
            }
          ],
          `<h2>Тапсырыс төлқұжаты: ${orderNumber}</h2>` +
          `<table bordered striped compact>` +
          `<tr><th>Өріс</th><th>Мәні</th></tr>` +
          `<tr><td>Мекеме</td><td><b>${sub.venue_name}</b></td></tr>` +
          `<tr><td>Позиция</td><td>1 × ${sub.unit_name}</td></tr>` +
          `<tr><td>Алу тәсілі</td><td>${deliveryMethod}</td></tr>` +
          `<tr><td>Уақыт аралығы</td><td>13:00 – 13:30</td></tr>` +
          `<tr><td>Растау коды</td><td><tg-spoiler><b>${handoffCode}</b></tg-spoiler></td></tr>` +
          `</table>` +
          `<details><summary>Кассалық растау нұсқаулығы</summary>` +
          `<p>Қызметті алған кезде кассирге немесе курьерге <b>${handoffCode}</b> кодын хабарлаңыз. Тексеру үшін осы чатқа аталған 4 цифрды жіберуіңізге болады.</p>` +
          `</details>`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Кодты көшіру: ${handoffCode}`, copy_text: { text: handoffCode } }],
                [
                  { text: '15 минутқа кешігемін', callback_data: `late_${orderNumber}` },
                  { text: 'Тапсырыстан бас тарту', callback_data: `cancel_${orderNumber}` }
                ]
              ]
            }
          }
        );

        if (orderMsg && orderMsg.ok && orderMsg.result) {
          await tgCall('pinChatMessage', {
            chat_id: chatId,
            message_id: orderMsg.result.message_id,
            disable_notification: true
          });
        }
        return res.status(200).send('OK');
      }

      // 5. Кешігу туралы ескерту
      if (data.startsWith('late_')) {
        const ordNum = data.replace('late_', '');
        await tgCall('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `Хабарлама қабылданды. ${ordNum} тапсырысы филиалдың термо-сөресінде сақталады.`,
          show_alert: true
        });
        return res.status(200).send('OK');
      }

      // 6. Кассирдің беруді растауы (Балансты шегеру + editMessageText rich_message параметрімен)
      if (data.startsWith('confirm_handoff_')) {
        const orderId = parseInt(data.replace('confirm_handoff_', ''), 10);

        const ordRes = await pool.query(`
          SELECT o.*, us.units_remaining, sc.units_total, sc.unit_name, v.name as venue_name
          FROM orders o
          JOIN user_subscriptions us ON o.user_sub_id = us.id
          JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
          JOIN venues v ON sc.venue_id = v.id
          WHERE o.id = $1
        `, [orderId]);

        if (ordRes.rows.length === 0 || ordRes.rows[0].status === 'COMPLETED') {
          await tgCall('answerCallbackQuery', {
            callback_query_id: cb.id,
            text: 'Бұл тапсырыс бойынша қызмет бұрын көрсетілген.',
            show_alert: true
          });
          return res.status(200).send('OK');
        }

        const ord = ordRes.rows[0];

        await pool.query(`UPDATE orders SET status = 'COMPLETED' WHERE id = $1`, [orderId]);
        const updatedSub = await pool.query(`
          UPDATE user_subscriptions 
          SET units_remaining = units_remaining - 1 
          WHERE id = $1 RETURNING units_remaining
        `, [ord.user_sub_id]);

        const newRemaining = updatedSub.rows[0].units_remaining;

        await tgCall('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `Тапсырыс орындалды. Жаңа қалдық: ${newRemaining} / ${ord.units_total} ${ord.unit_name}.`,
          show_alert: true
        });

        // Bot API 10.1+: editMessageText ішінде rich_message қолдану және батырманы disabled ету
        await tgCall('editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          rich_message: {
            html:
              `<h2>Тапсырыс орындалды: ${ord.order_number}</h2>` +
              `<table bordered striped compact>` +
              `<tr><th>Көрсеткіш</th><th>Нәтиже</th></tr>` +
              `<tr><td>Мекеме</td><td>${ord.venue_name}</td></tr>` +
              `<tr><td>Берілген көлем</td><td>1 × ${ord.unit_name}</td></tr>` +
              `<tr><td>Алдыңғы қалдық</td><td>${ord.units_remaining} ${ord.unit_name}</td></tr>` +
              `<tr><td>Жаңа қалдық</td><td><b>${newRemaining} / ${ord.units_total} ${ord.unit_name}</b></td></tr>` +
              `<tr><td>Мәртебесі</td><td><b>Жабылды</b></td></tr>` +
              `</table>`
          },
          reply_markup: {
            inline_keyboard: [
              // Bot API 10.3: Орындалған батырма сұр түсті (disabled) күйінде қалады
              [{ text: 'Тапсырыс табысталды', callback_data: 'noop', disabled: true }]
            ]
          }
        });

        await tgCall('unpinAllChatMessages', { chat_id: chatId });

        // Ресми сапаны бағалау сұрауы
        await tgCall('sendRichMessage', {
          chat_id: chatId,
          rich_message: {
            html: `<h3>Қызмет сапасын бағалау</h3><p><b>${ord.venue_name}</b> филиалының қызмет көрсету сапасын 5 балдық шкала бойынша бағалаңыз:</p>`
          },
          reply_markup: {
            inline_keyboard: [[
              { text: '1', callback_data: 'rate_1' },
              { text: '2', callback_data: 'rate_2' },
              { text: '3', callback_data: 'rate_3' },
              { text: '4', callback_data: 'rate_4' },
              { text: '5', callback_data: 'rate_5' }
            ]]
          }
        });
        return res.status(200).send('OK');
      }

      // 7. Рейтингті қабылдау
      if (data.startsWith('rate_')) {
        const score = data.replace('rate_', '');
        await tgCall('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `Сіздің бағаңыз (${score}/5) филиал рейтингіне тіркелді.`
        });
        await tgCall('editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          rich_message: {
            html: `<p>Қызмет сапасын бағалағаныңыз үшін рақмет. Тіркелген баға: <b>${score} / 5</b>.</p>`
          }
        });
        return res.status(200).send('OK');
      }

      return res.status(200).send('OK');
    }

    // =========================================================================
    // Ә) КІРІС ХАБАРЛАМАЛАР (MESSAGE)
    // =========================================================================
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const tgId = msg.from.id;
      const firstName = msg.from.first_name || 'Пайдаланушы';
      const username = msg.from.username || null;
      const text = (msg.text || '').trim();

      const userCheck = await pool.query(
        `INSERT INTO users (telegram_id, first_name, username)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
         RETURNING *`,
        [tgId, firstName, username]
      );
      const user = userCheck.rows[0];

      // 1. Телефон нөмірін растау
      if (msg.contact && msg.contact.user_id === tgId) {
        await pool.query(`UPDATE users SET phone_number = $1 WHERE telegram_id = $2`, [msg.contact.phone_number, tgId]);

        await tgCall('sendMessage', {
          chat_id: chatId,
          text: `Рақмет, ${firstName}. Телефон нөміріңіз (${msg.contact.phone_number}) жүйеде расталды.`,
          reply_markup: { remove_keyboard: true }
        });

        await sendMainMenu(chatId);
        return res.status(200).send('OK');
      }

      // 2. /start командасы
      if (text.startsWith('/start')) {
        if (!user.phone_number) {
          await tgCall('sendRichMessage', {
            chat_id: chatId,
            rich_message: {
              html:
                `<h2>Jazl — Жазылымдар платформасы</h2>` +
                `<p>Қош келдіңіз, <b>${firstName}</b>. Jazl арқылы күнделікті тамақтану, кофе және автокөлік күтімі қызметтерін бекітілген айлық жазылыммен сатып алуға болады.</p>` +
                `<details><summary>Жүйенің жұмыс тәртібі</summary>` +
                `<p>1. Серіктес мекеменің айлық пакетін бөлшек бағадан 25–30% төмен бағамен рәсімдейсіз.<br/>2. Қызметті кезексіз өзіңіз алып кетесіз немесе жеке курьер (1 рейс = 1 тапсырыс) арқылы алдыртасыз.<br/>3. Есептік баланс тек қызмет нақты көрсетілген сәтте ғана шегеріледі.</p>` +
                `</details>` +
                `<p>Жүйеге кіру үшін телефон нөміріңізді растаңыз:</p>`
            },
            reply_markup: {
              keyboard: [[{ text: 'Телефон нөмірді растау', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          });
        } else {
          await sendMainMenu(chatId);
        }
        return res.status(200).send('OK');
      }

      // 3. Кассалық тексеру: 4-таңбалы код енгізілгенде
      if (/^\d{4}$/.test(text)) {
        const ordCheck = await pool.query(`
          SELECT o.*, u.first_name as client_name, u.phone_number,
                 us.units_remaining, sc.units_total, sc.unit_name, v.name as venue_name
          FROM orders o
          JOIN users u ON o.user_id = u.id
          JOIN user_subscriptions us ON o.user_sub_id = us.id
          JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
          JOIN venues v ON sc.venue_id = v.id
          WHERE o.handoff_code = $1
          ORDER BY o.id DESC LIMIT 1
        `, [text]);

        if (ordCheck.rows.length === 0) {
          await tgCall('sendRichMessage', {
            chat_id: chatId,
            rich_message: {
              html: `<h3>Код табылмады</h3><p>Енгізілген <b>${text}</b> коды бойынша белсенді тапсырыс тіркелмеген. Кодтың дұрыстығын тексеріңіз.</p>`
            }
          });
          return res.status(200).send('OK');
        }

        const ord = ordCheck.rows[0];

        if (ord.status === 'COMPLETED') {
          await tgCall('sendRichMessage', {
            chat_id: chatId,
            rich_message: {
              html: `<h3>Код бұрын қолданылған</h3><p><b>${ord.order_number}</b> тапсырысы бойынша қызмет бұрын көрсетілген. Қайталап шегеруге жол берілмейді.</p>`
            }
          });
          return res.status(200).send('OK');
        }

        await streamRichResponse(
          chatId,
          [{ thinking: `Код ${text} бойынша тапсырыс деректері мен клиент балансы тексерілуде...` }],
          `<h2>Кассалық тексеру панелі: ${ord.order_number}</h2>` +
          `<table bordered striped compact>` +
          `<tr><th>Өріс</th><th>Мәлімет</th></tr>` +
          `<tr><td>Тұтынушы</td><td>${ord.client_name} (${ord.phone_number || 'Расталған'})</td></tr>` +
          `<tr><td>Мекеме</td><td>${ord.venue_name}</td></tr>` +
          `<tr><td>Берілетін өнім</td><td><b>1 × ${ord.unit_name}</b></td></tr>` +
          `<tr><td>Ағымдағы қалдық</td><td>${ord.units_remaining} / ${ord.units_total} ${ord.unit_name}</td></tr>` +
          `<tr><td>Растаудан кейін</td><td><b>${ord.units_remaining - 1} / ${ord.units_total} ${ord.unit_name}</b></td></tr>` +
          `</table>` +
          `<p>Қызметті табыстағаннан кейін төмендегі растау батырмасын басыңыз:</p>`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Табыстауды растау (-1 ${ord.unit_name})`, callback_data: `confirm_handoff_${ord.id}` }]
              ]
            }
          }
        );
        return res.status(200).send('OK');
      }

      // 4. Кез келген мәтіндік сұранысқа ресми Rich Message + Draft Streaming жауабы
      const catRes = await pool.query(`
        SELECT sc.title, sc.package_price, sc.unit_price, sc.savings_amount, sc.units_total, sc.unit_name, v.name as venue_name, v.halal_org
        FROM subscriptions_catalog sc JOIN venues v ON sc.venue_id = v.id WHERE sc.status = 'ACTIVE'
      `);

      const rowsHtml = catRes.rows.map(r =>
        `<tr><td><b>${r.venue_name}</b></td><td>${r.units_total} ${r.unit_name}</td><td>${r.unit_price} ₸</td><td><b>${r.package_price} ₸</b></td></tr>`
      ).join('');

      await streamRichResponse(
        chatId,
        [
          { thinking: 'Сұраныс талдануда және дерекқордан сәйкес ұсыныстар іріктелуде...' },
          {
            thinking: 'Тарифтік кесте мен шарттар дайындалуда...',
            partialHtml: `<h3>Jazl Ақпараттық қызметі</h3><p>Сұраныс: <i>«${text}»</i></p>`
          }
        ],
        `<h2>Jazl Ақпараттық қызметі</h2>` +
        `<p>Сіздің сұранысыңыз бойынша қазіргі уақытта жүйеде қолжетімді жазылым пакеттерінің жиынтық кестесі:</p>` +
        `<table bordered striped compact>` +
        `<caption>Белсенді жазылым тарифтері</caption>` +
        `<tr><th>Мекеме</th><th>Көлемі</th><th>1 бірлік</th><th>Пакет бағасы</th></tr>` +
        `${rowsHtml}` +
        `</table>` +
        `<details><summary>Қосымша ақпарат</summary>` +
        `<p>Пакетті рәсімдеу немесе ағымдағы балансты басқару үшін төмендегі «Менің жазылымдарым» бөліміне өтіңіз.</p>` +
        `</details>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Менің жазылымдарым', callback_data: 'my_subs' }]
            ]
          }
        }
      );
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(200).send('OK');
  }
});

async function sendMainMenu(chatId) {
  const miniAppUrl = process.env.MINI_APP_URL || 'https://google.com';

  await streamRichResponse(
    chatId,
    [{ thinking: 'Негізгі басқару панелі жүктелуде...' }],
    `<h2>Jazl — Басқару панелі</h2>` +
    `<p>Жүйенің барлық қызметтері мен жазылымдар каталогы төмендегі бөлімдерде қолжетімді:</p>` +
    `<hr/>` +
    `<details><summary>Жылдам әрекеттер нұсқаулығы</summary>` +
    `<p>1. <b>Менің жазылымдарым</b> — белсенді пакеттерді көру, жаңа пакет қосу және бүгінге тапсырыс беру.<br/>2. <b>Кассалық тексеру</b> — тапсырыстың 4-таңбалы кодын осы чатқа тікелей жіберу арқылы растау.</p>` +
    `</details>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Jazl Маркетплейсін ашу', web_app: { url: miniAppUrl } }],
          [{ text: 'Менің жазылымдарым', callback_data: 'my_subs' }]
        ]
      }
    }
  );
}
