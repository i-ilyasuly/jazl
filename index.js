const functions = require('@google-cloud/functions-framework');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Кітапханасыз тікелей Telegram API функциясы
async function tgCall(method, payload) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

functions.http('jazlWebhook', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    // А) Mini App үшін Каталогты базадан беру (Тексеру үшін браузерден де ашуға болады!)
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

    // Ә) Telegram Webhook
    const update = req.body;
    if (!update) return res.status(200).send('OK');

    // 1. Инлайн батырмалар басылғанда (Callback Query):
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const tgId = cb.from.id;

      await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

      if (cb.data === 'my_subs') {
        const subs = await pool.query(`
          SELECT us.*, sc.title, sc.unit_name, v.name as venue_name
          FROM user_subscriptions us
          JOIN users u ON us.user_id = u.id
          JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
          JOIN venues v ON sc.venue_id = v.id
          WHERE u.telegram_id = $1 AND us.status = 'ACTIVE'
        `, [tgId]);

        if (subs.rows.length === 0) {
          await tgCall('sendMessage', {
            chat_id: chatId,
            text: `📭 <b>Сізде әзірге белсенді жазылым жоқ.</b>\n\nКаталогты ашып, алғашқы жазылымыңызды 30%-ға дейін үнеммен таңдаңыз!`,
            parse_mode: 'HTML'
          });
        }
      }
      return res.status(200).send('OK');
    }

    // 2. Қарапайым хабарлама немесе Контакт келгенде:
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const tgId = msg.from.id;
      const firstName = msg.from.first_name || 'Қонақ';
      const username = msg.from.username || null;

      const userCheck = await pool.query(
        `INSERT INTO users (telegram_id, first_name, username)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
         RETURNING *`,
        [tgId, firstName, username]
      );
      const user = userCheck.rows[0];

      // Контакт (телефон нөмірі) келгенде:
      if (msg.contact && msg.contact.user_id === tgId) {
        await pool.query(
          `UPDATE users SET phone_number = $1 WHERE telegram_id = $2`,
          [msg.contact.phone_number, tgId]
        );

        await tgCall('sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Рақмет, ${firstName}!</b> Нөміріңіз (${msg.contact.phone_number}) сәтті расталды.`,
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        });

        await sendMainMenu(chatId);
        return res.status(200).send('OK');
      }

      // /start командасы келгенде:
      if (msg.text && msg.text.startsWith('/start')) {
        if (!user.phone_number) {
          await tgCall('sendMessage', {
            chat_id: chatId,
            text: `👋 <b>Ассалаумағалейкүм, ${firstName}!</b>\n\n<b>Jazl</b> — күнделікті қажетіңізге (тағам, кофе, автожуу, барбер) тиімді жазылымдар маркетплейсі.\n\n<blockquote expandable>💡 <b>Jazl қалай жұмыс істейді?</b>\n1. Сүйікті мекемеңіздің айлық пакетін (мысалы, 4 донер немесе 10 кофе) үлкен жеңілдікпен аласыз.\n2. Кезексіз өзіңіз алып кетесіз немесе жеке курьермен (1 рейс = 1 тапсырыс) алдыртасыз.\n3. Балансыңыз тек тағам қолыңызға тигенде ғана шегеріледі!</blockquote>\n\nЖұмысты бастау үшін төмендегі батырманы басып, телефон нөміріңізді растаңыз 👇`,
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[{ text: '📱 Телефон нөмірімді растау', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          });
        } else {
          await sendMainMenu(chatId);
        }
        return res.status(200).send('OK');
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(200).send('OK');
  }
});

async function sendMainMenu(chatId) {
  const miniAppUrl = process.env.MINI_APP_URL || 'https://google.com';
  await tgCall('sendMessage', {
    chat_id: chatId,
    text: `🚀 <b>Jazl Маркетплейсі дайын!</b>\n\nТөмендегі батырма арқылы каталогты ашыңыз немесе жазылымдарыңызды тексеріңіз:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔵 Jazl Маркетплейсін ашу', web_app: { url: miniAppUrl } }],
        [{ text: '📦 Менің жазылымдарым', callback_data: 'my_subs' }]
      ]
    }
  });
}
