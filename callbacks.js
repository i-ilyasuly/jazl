const { pool } = require('./db');
const { tgCall, streamRichResponse } = require('./telegram');

async function handleCallbackQuery(cb) {
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
        SELECT sc.id, sc.title, sc.package_price, sc.unit_price, sc.savings_amount, sc.units_total, sc.unit_name, v.name as venue_name, sc.is_promoted
        FROM subscriptions_catalog sc JOIN venues v ON sc.venue_id = v.id WHERE sc.status = 'ACTIVE'
        ORDER BY sc.is_promoted DESC, sc.id ASC
      `);

      const tableRows = cat.rows.map(item =>
        `<tr><td><b>${item.venue_name}</b></td><td>${item.units_total} ${item.unit_name}</td><td><b>${item.package_price} ₸</b></td><td>+${item.savings_amount} ₸</td></tr>`
      ).join('');

      const buttons = cat.rows.map((item, idx) => ([{
        text: `Қосу: ${item.venue_name} (${item.units_total} ${item.unit_name} — ${item.package_price} ₸)`,
        callback_data: `buy_demo_${item.id}`,
        ...(idx === 0 ? { style: 'primary' } : {})
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
      return;
    }

    for (const sub of subs.rows) {
      const halalText = sub.halal_org !== 'NONE' ? `Расталған (${sub.halal_org})` : 'Стандартты';

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
                { text: 'Өзім алып кетемін (13:00)', callback_data: `order_takeaway_${sub.id}`, style: 'primary' },
                { text: 'Курьермен жеткізу (13:00)', callback_data: `order_courier_${sub.id}` }
              ],
              [{ text: 'Басқа пакет қосу', callback_data: 'show_demo_catalog' }]
            ]
          }
        }
      );
    }
    return;
  }

  // 2. Пакеттер тізімін көрсету
  if (data === 'show_demo_catalog') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
    const cat = await pool.query(`
      SELECT sc.id, sc.package_price, sc.units_total, sc.unit_name, v.name as venue_name
      FROM subscriptions_catalog sc JOIN venues v ON sc.venue_id = v.id WHERE sc.status = 'ACTIVE'
      ORDER BY sc.is_promoted DESC, sc.id ASC
    `);
    const buttons = cat.rows.map((item, idx) => ([{
      text: `Қосу: ${item.venue_name} (${item.units_total} ${item.unit_name} — ${item.package_price} ₸)`,
      callback_data: `buy_demo_${item.id}`,
      ...(idx === 0 ? { style: 'primary' } : {})
    }]));

    await tgCall('sendRichMessage', {
      chat_id: chatId,
      rich_message: {
        html: `<h3>Қосымша жазылым пакетін таңдау</h3><p>Төмендегі тізімнен қажетті қызмет түрін таңдаңыз:</p>`
      },
      reply_markup: { inline_keyboard: buttons }
    });
    return;
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
                { text: 'Өзім алып кетемін (13:00)', callback_data: `order_takeaway_${subId}`, style: 'primary' },
                { text: 'Курьермен жеткізу (13:00)', callback_data: `order_courier_${subId}` }
              ],
              [{ text: 'Менің жазылымдарым', callback_data: 'my_subs' }]
            ]
          }
        }
      );
    }
    return;
  }

  // 4. Тапсырыс беру
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
      return;
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
            [{ text: `Кодты көшіру: ${handoffCode}`, copy_text: { text: handoffCode }, style: 'primary' }],
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
    return;
  }

  // 5. Кешігу туралы ескерту
  if (data.startsWith('late_')) {
    const ordNum = data.replace('late_', '');
    await tgCall('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `Хабарлама қабылданды. ${ordNum} тапсырысы филиалдың термо-сөресінде сақталады.`,
      show_alert: true
    });
    return;
  }

  // 6. Кассирдің беруді растауы
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
      return;
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
      }
    });

    await tgCall('unpinAllChatMessages', { chat_id: chatId });

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
          { text: '5', callback_data: 'rate_5', style: 'primary' }
        ]]
      }
    });
    return;
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
  }
}

module.exports = { handleCallbackQuery };
