const { pool } = require('./db');
const { tgCall, streamRichResponse, sendMainMenu } = require('./telegram');

async function handleMessage(msg) {
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
    return;
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
          keyboard: [[{ text: 'Телефон нөмірді растау', request_contact: true, style: 'primary' }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    } else {
      await sendMainMenu(chatId);
    }
    return;
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
      return;
    }

    const ord = ordCheck.rows[0];

    if (ord.status === 'COMPLETED') {
      await tgCall('sendRichMessage', {
        chat_id: chatId,
        rich_message: {
          html: `<h3>Код бұрын қолданылған</h3><p><b>${ord.order_number}</b> тапсырысы бойынша қызмет бұрын көрсетілген. Қайталап шегеруге жол берілмейді.</p>`
        }
      });
      return;
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
            [{ text: `Табыстауды растау (-1 ${ord.unit_name})`, callback_data: `confirm_handoff_${ord.id}`, style: 'success' }]
          ]
        }
      }
    );
    return;
  }

  // 4. Кез келген мәтіндік сұранысқа ресми жауап
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
          [{ text: 'Менің жазылымдарым', callback_data: 'my_subs', style: 'primary' }]
        ]
      }
    }
  );
}

module.exports = { handleMessage };
