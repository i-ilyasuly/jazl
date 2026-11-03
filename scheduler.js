const { pool } = require('./db');
const { tgCall, streamRichResponse } = require('./telegram');

// 1. Күнделікті 11:30 Автопилот хабарламасын жіберу функциясы
async function sendDailyAutopilotPrompt(targetTgId = null) {
  const query = `
    SELECT us.*, u.telegram_id, u.first_name,
           sc.title, sc.unit_name, sc.units_total, v.name as venue_name, b.address
    FROM user_subscriptions us
    JOIN users u ON us.user_id = u.id
    JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
    JOIN venues v ON sc.venue_id = v.id
    LEFT JOIN branches b ON b.venue_id = v.id
    WHERE us.status = 'ACTIVE' AND us.units_remaining > 0
    ${targetTgId ? 'AND u.telegram_id = $1' : ''}
    ORDER BY us.id DESC LIMIT 10
  `;

  const res = await pool.query(query, targetTgId ? [targetTgId] : []);
  let sentCount = 0;

  for (const sub of res.rows) {
    await tgCall('sendRichMessage', {
      chat_id: sub.telegram_id,
      rich_message: {
        html:
          `<h2>Күнделікті жоспарлау: ${sub.venue_name}</h2>` +
          `<p>Қайырлы күн, <b>${sub.first_name || 'Пайдаланушы'}</b>. Сізде белсенді жазылым бойынша қолжетімді лимит бар. Бүгінге тапсырысты алдын ала бекітуді ұсынамыз:</p>` +
          `<table bordered striped compact>` +
          `<tr><th>Көрсеткіш</th><th>Мәлімет</th></tr>` +
          `<tr><td>Пакет</td><td>${sub.title}</td></tr>` +
          `<tr><td>Қолжетімді қалдық</td><td><b>${sub.units_remaining} / ${sub.units_total} ${sub.unit_name}</b></td></tr>` +
          `<tr><td>Филиал мекенжайы</td><td>${sub.address || 'Орталық филиал'}</td></tr>` +
          `</table>`
      },
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Алып кету (12:30 – 13:00)', callback_data: `order_takeaway_${sub.id}_1230` },
            { text: 'Алып кету (13:00 – 13:30)', callback_data: `order_takeaway_${sub.id}_1300`, style: 'primary' }
          ],
          [{ text: 'Бүгін өткізіп жіберу', callback_data: `sched_skip_${sub.id}` }]
        ]
      }
    });
    sentCount++;
  }
  return sentCount;
}

// 2. Мерзім аяқталуы және «Қалдықты көшіру (Rollover +1)» ескертуін жіберу
async function sendExpiryRolloverPrompt(targetTgId = null) {
  const query = `
    SELECT us.*, u.telegram_id, u.first_name,
           sc.title, sc.unit_name, sc.units_total, sc.package_price, sc.savings_amount,
           v.name as venue_name
    FROM user_subscriptions us
    JOIN users u ON us.user_id = u.id
    JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
    JOIN venues v ON sc.venue_id = v.id
    WHERE us.status = 'ACTIVE' AND us.units_remaining > 0
    ${targetTgId ? 'AND u.telegram_id = $1' : ''}
    ORDER BY us.id DESC LIMIT 5
  `;

  const res = await pool.query(query, targetTgId ? [targetTgId] : []);
  let sentCount = 0;

  for (const sub of res.rows) {
    const rolloverUnits = Math.min(1, sub.units_remaining);
    const totalAfterRenew = sub.units_total + rolloverUnits;

    await tgCall('sendRichMessage', {
      chat_id: sub.telegram_id,
      rich_message: {
        html:
          `<h2>Жазылым мерзімін ұзарту және қалдықты сақтау</h2>` +
          `<p>Құрметті <b>${sub.first_name || 'Пайдаланушы'}</b>, сіздің <b>${sub.venue_name}</b> мекемесіндегі жазылымыңызда пайдаланылмаған <b>${sub.units_remaining} ${sub.unit_name}</b> бар.</p>` +
          `<table bordered striped compact>` +
          `<caption>Қалдықты келесі айға көшіру есебі (Rollover)</caption>` +
          `<tr><th>Көрсеткіш</th><th>Мәні</th></tr>` +
          `<tr><td>Ағымдағы қалдық</td><td>${sub.units_remaining} ${sub.unit_name}</td></tr>` +
          `<tr><td>Тегін көшірілетін көлем</td><td><b>+${rolloverUnits} ${sub.unit_name} (Күймей сақталады)</b></td></tr>` +
          `<tr><td>Жаңа айлық пакет</td><td>+${sub.units_total} ${sub.unit_name} (${sub.package_price} ₸)</td></tr>` +
          `<tr><td>Ұзартқаннан кейінгі баланс</td><td><b>${totalAfterRenew} ${sub.unit_name} (30 күнге)</b></td></tr>` +
          `</table>` +
          `<details><summary>Қалдықты сақтау ережесі</summary>` +
          `<p>Жазылым мерзімі аяқталған сәттен бастап 3 күн ішінде жаңа кезеңге ұзартсаңыз, пайдаланылмаған 1 ${sub.unit_name} күймейді және жаңа пакетке тегін қосылады.</p>` +
          `</details>`
      },
      reply_markup: {
        inline_keyboard: [
          [{
            text: `Ұзарту және +${rolloverUnits} ${sub.unit_name} сақтап қалу (${sub.package_price} ₸)`,
            callback_data: `sched_renew_${sub.id}`,
            style: 'primary'
          }]
        ]
      }
    });
    sentCount++;
  }
  return sentCount;
}

// 3. Бот ішіндегі Автопилот батырмаларын өңдеуші
async function handleSchedulerCallback(cb) {
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const tgId = cb.from.id;
  const data = cb.data;

  // А) Автопилот басқару және тестілеу панелі
  if (data === 'sched_panel') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

    await streamRichResponse(
      chatId,
      [{ thinking: 'Автопилот және триггерлік хабарламалар модулі жүктелуде...' }],
      `<h2>Автопилот және Ақылды ескертулер</h2>` +
      `<p>Бұл модуль Google Cloud Scheduler арқылы автоматты түрде немесе төмендегі батырмалар арқылы іске қосылады:</p>` +
      `<table bordered striped compact>` +
      `<tr><th>Триггер түрі</th><th>Уақыты</th><th>Қызметі</th></tr>` +
      `<tr><td><b>Күнделікті сұрау</b></td><td>11:30</td><td>Мини Аппқа кірмей 1 басумен бүгінге тапсырыс алу</td></tr>` +
      `<tr><td><b>Қалдықты құтқару</b></td><td>Мерзімге 3 күн</td><td>Ұзарту кезінде +1 бірлікті күйдірмей жаңа айға көшіру</td></tr>` +
      `</table>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Тексеру: Күнделікті 11:30 хабарламасы', callback_data: 'sched_test_daily', style: 'primary' }],
            [{ text: 'Тексеру: Қалдықты сақтау (Rollover +1)', callback_data: 'sched_test_expiry' }]
          ]
        }
      }
    );
    return;
  }

  // Ә) Күнделікті 11:30 сұрауын дәл қазір тексеру
  if (data === 'sched_test_daily') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
    const count = await sendDailyAutopilotPrompt(tgId);
    if (count === 0) {
      await tgCall('sendRichMessage', {
        chat_id: chatId,
        rich_message: {
          html: `<h3>Белсенді жазылым табылмады</h3><p>Алдымен «Менің жазылымдарым» бөлімінен кемінде бір пакетті қосыңыз.</p>`
        }
      });
    }
    return;
  }

  // Б) Қалдықты сақтау (Rollover) триггерін дәл қазір тексеру
  if (data === 'sched_test_expiry') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
    const count = await sendExpiryRolloverPrompt(tgId);
    if (count === 0) {
      await tgCall('sendRichMessage', {
        chat_id: chatId,
        rich_message: {
          html: `<h3>Белсенді жазылым табылмады</h3><p>Алдымен «Менің жазылымдарым» бөлімінен кемінде бір пакетті қосыңыз.</p>`
        }
      });
    }
    return;
  }

  // В) «Бүгін өткізіп жіберу» басылғанда
  if (data.startsWith('sched_skip_')) {
    await tgCall('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Бүгінгі күнге тапсырыс өткізілді. Сіздің балансыңыз толық сақтаулы.'
    });
    await tgCall('editMessageText', {
      chat_id: chatId,
      message_id: msgId,
      rich_message: {
        html: `<p>Бүгінгі күнге жоспарлау өткізіп жіберілді. Жазылым балансыңыз өзгеріссіз сақталды.</p>`
      }
    });
    return;
  }

  // Г) Жазылымды ұзарту және +1 бірлік қалдықты жаңа айға тегін қосу (Rollover Execution)
  if (data.startsWith('sched_renew_')) {
    const subId = parseInt(data.replace('sched_renew_', ''), 10);
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

    const subRes = await pool.query(`
      SELECT us.*, sc.title, sc.unit_name, sc.units_total, sc.package_price, v.name as venue_name
      FROM user_subscriptions us
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE us.id = $1
    `, [subId]);

    if (subRes.rows.length === 0) return;
    const sub = subRes.rows[0];

    const rolloverBonus = Math.min(1, sub.units_remaining);
    const newBalance = sub.units_total + rolloverBonus;

    await pool.query(`
      UPDATE user_subscriptions
      SET units_remaining = $1, valid_until = NOW() + INTERVAL '30 days', status = 'ACTIVE'
      WHERE id = $2
    `, [newBalance, subId]);

    await streamRichResponse(
      chatId,
      [{ thinking: 'Жазылым мерзімі ұзартылуда және сақталған қалдық жаңа балансқа қосылуда...' }],
      `<h2>Жазылым сәтті ұзартылды: ${sub.venue_name}</h2>` +
      `<table bordered striped compact>` +
      `<caption>Жаңартылған баланс есебі</caption>` +
      `<tr><th>Көрсеткіш</th><th>Мәні</th></tr>` +
      `<tr><td>Жаңа пакет көлемі</td><td>${sub.units_total} ${sub.unit_name}</td></tr>` +
      `<tr><td>Өткен айдан сақталған бонус</td><td><b>+${rolloverBonus} ${sub.unit_name} (Тегін көшірілді)</b></td></tr>` +
      `<tr><td>Жалпы қолжетімді баланс</td><td><b>${newBalance} ${sub.unit_name}</b></td></tr>` +
      `<tr><td>Жаңа жарамдылық мерзімі</td><td>30 күн</td></tr>` +
      `</table>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Менің жазылымдарым', callback_data: 'my_subs', style: 'primary' }]
          ]
        }
      }
    );
  }
}

// 4. Google Cloud Scheduler үшін сыртқы HTTP Cron өңдеушісі (?action=cron_daily | cron_expiry)
async function handleCronRequest(req, res) {
  const action = req.query.action;
  if (action === 'cron_daily') {
    const count = await sendDailyAutopilotPrompt();
    return res.status(200).json({ ok: true, trigger: 'cron_daily', sent: count });
  }
  if (action === 'cron_expiry') {
    const count = await sendExpiryRolloverPrompt();
    return res.status(200).json({ ok: true, trigger: 'cron_expiry', sent: count });
  }
  return res.status(400).json({ ok: false });
}

module.exports = { handleSchedulerCallback, handleCronRequest };
