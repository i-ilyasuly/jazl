const functions = require('@google-cloud/functions-framework');
const { Pool } = require('pg');

// 1. PostgreSQL Базасына қосылу (Neon.tech DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. Сен айтқан КІТАПХАНАСЫЗ тікелей Telegram API функциясы!
// Telegram-ның кез келген соңғы әдісін тікелей шақырады:
async function tgCall(method, payload) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

// 3. Негізгі Cloud Function (Webhook + Mini App API)
functions.http('jazlWebhook', async (req, res) => {
  // CORS рұқсаттары (Ертең Mini App осы жерден дерек алғанда бұғатталмауы үшін)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    // А) Егер бұл Mini App-тан келген GET сұрауы болса (Каталогты сұрау):
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

    // Ә) Егер бұл Telegram-нан келген Webhook хабарламасы болса:
    const update = req.body;
    if (!update) return res.status(200).send('OK');

    // 1. Хабарлама (Message) келген жағдайда:
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const tgId = msg.from.id;
      const firstName = msg.from.first_name || 'Қонақ';
      const username = msg.from.username || null;

      // Қолданушыны базаға тіркеу немесе жаңарту
      const userCheck = await pool.query(
        `INSERT INTO users (telegram_id, first_name, username)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
         RETURNING *`,
        [tgId, firstName, username]
      );
      const user = userCheck.rows[0];

      // Егер қолданушы телефон нөмірін (Contact) жіберген болса:
      if (msg.contact && msg.contact.user_id === tgId) {
        await pool.query(
          `UPDATE users SET phone_number = $1 WHERE telegram_id = $2`,
          [msg.contact.phone_number, tgId]
        );

        // Нөмір расталған соң мерекелік хабарлама + Mini App батырмасы:
        await tgCall('sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Рақмет, ${firstName}!</b> Нөміріңіз сәтті расталды.\n\nЕнді сіз <b>Jazl</b> арқылы күнделікті тамақ, кофе және автожуу қызметтеріне <b>30%-ға дейін үнеммен</b> жазыла аласыз!`,
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        });

        await sendMainMenu(chatId);
        return res.status(200).send('OK');
      }

      // Егер /start басқан болса:
      if (msg.text && msg.text.startsWith('/start')) {
        // Егер базада телефон нөмірі әлі жоқ болса -> 1 басумен сұраймыз:
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
          // Егер нөмірі бар болса -> Бірден Басты мәзірді шығарамыз:
          await sendMainMenu(chatId);
        }
        return res.status(200).send('OK');
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(200).send('OK'); // Telegram қайта-қайта сұрау жібермеуі үшін 200 қайтарамыз
  }
});

// Басты мәзір мен Mini App ашатын функция
async function sendMainMenu(chatId) {
  const miniAppUrl = process.env.MINI_APP_URL || 'https://jazl-platform.web.app';
  await tgCall('sendMessage', {
    chat_id: chatId,
    text: `🚀 <b>Jazl Маркетплейсі дайын!</b>\n\nТөмендегі батырма арқылы каталогты ашыңыз немесе осы чатта маған тікелей сұрақ қойыңыз:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔵 Jazl Маркетплейсін ашу', web_app: { url: miniAppUrl } }],
        [
          { text: '📦 Менің жазылымдарым', callback_data: 'my_subs' },
          { text: '🏪 Серіктес кабинеті', callback_data: 'merchant_mode' }
        ]
      ]
    }
  });
}
