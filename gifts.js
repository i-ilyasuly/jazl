const { pool } = require('./db');
const { tgCall, streamRichResponse } = require('./telegram');

let giftTableChecked = false;
let cachedBotUsername = null;

// 1. Базада gifts кестесін автоматты құру және боттың логинін алу
async function ensureGiftSetup() {
  if (!giftTableChecked) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gifts (
        id SERIAL PRIMARY KEY,
        gift_code VARCHAR(40) UNIQUE NOT NULL,
        sender_id INT REFERENCES users(id),
        sender_tg_id BIGINT NOT NULL,
        sender_name VARCHAR(100),
        catalog_id INT REFERENCES subscriptions_catalog(id),
        recipient_tg_id BIGINT,
        recipient_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'PENDING',
        thanked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        claimed_at TIMESTAMP
      )
    `);
    giftTableChecked = true;
  }

  if (!cachedBotUsername) {
    const me = await tgCall('getMe', {});
    if (me && me.ok && me.result) {
      cachedBotUsername = me.result.username;
    }
  }
}

// 2. Сыйлық батырмаларын өңдеуші (Callback Query)
async function handleGiftCallback(cb) {
  await ensureGiftSetup();
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const tgId = cb.from.id;
  const firstName = cb.from.first_name || 'Пайдаланушы';
  const data = cb.data;

  // А) Сыйлық беру мәзірі (Пакет таңдау + Бұрын жіберілген сыйлықтар)
  if (data === 'gift_menu') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

    const cat = await pool.query(`
      SELECT sc.id, sc.title, sc.package_price, sc.savings_amount, sc.units_total, sc.unit_name, v.name as venue_name, sc.is_promoted
      FROM subscriptions_catalog sc
      JOIN venues v ON sc.venue_id = v.id
      WHERE sc.status = 'ACTIVE'
      ORDER BY sc.is_promoted DESC, sc.id ASC
    `);

    const sentGifts = await pool.query(`
      SELECT g.*, sc.units_total, sc.unit_name, v.name as venue_name
      FROM gifts g
      JOIN subscriptions_catalog sc ON g.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE g.sender_tg_id = $1
      ORDER BY g.id DESC LIMIT 5
    `, [tgId]);

    const catRows = cat.rows.map(item =>
      `<tr><td><b>${item.venue_name}</b></td><td>${item.units_total} ${item.unit_name}</td><td><b>${item.package_price} ₸</b></td><td>+${item.savings_amount} ₸</td></tr>`
    ).join('');

    let historyHtml = '';
    if (sentGifts.rows.length > 0) {
      const hRows = sentGifts.rows.map(g => {
        const st = g.status === 'CLAIMED' ? `Қабылданды (${g.recipient_name || 'Белсенді'})` : 'Күтілуде';
        return `<tr><td><b>${g.venue_name}</b></td><td>${g.units_total} ${g.unit_name}</td><td>${st}</td></tr>`;
      }).join('');
      historyHtml =
        `<h3>Сіз жіберген сыйлықтар</h3>` +
        `<table bordered striped compact>` +
        `<tr><th>Мекеме</th><th>Көлемі</th><th>Мәртебесі</th></tr>` +
        `${hRows}` +
        `</table>`;
    }

    const buttons = cat.rows.map((item, idx) => ([{
      text: `Сыйлау: ${item.venue_name} (${item.units_total} ${item.unit_name} — ${item.package_price} ₸)`,
      callback_data: `gift_create_${item.id}`,
      ...(idx === 0 ? { style: 'primary' } : {})
    }]));

    await streamRichResponse(
      chatId,
      [{ thinking: 'Сыйлыққа қолжетімді жазылым пакеттері мен сертификаттар жүктелуде...' }],
      `<h2>Жазылымды сыйлыққа беру</h2>` +
      `<p>Жақыныңызға немесе әріптесіңізге күнделікті пайдаланатын қызметтің айлық жазылымын сыйлаңыз.</p>` +
      `<table bordered striped compact>` +
      `<caption>Сыйлыққа қолжетімді пакеттер</caption>` +
      `<tr><th>Мекеме</th><th>Көлемі</th><th>Бағасы</th><th>Үнем</th></tr>` +
      `${catRows}` +
      `</table>` +
      `${historyHtml}` +
      `<details><summary>Сыйлық сертификатының шарттары</summary>` +
      `<p>1. Жазылымның 30 күндік мерзімі сатып алынған сәттен емес, <b>алушы сыйлықты қабылдаған сәттен бастап</b> есептеледі.<br/>2. Сыйлықты белсендіру мерзімі — 60 күн.<br/>3. Алушыдан автоматты төлем ұсталмайды.</p>` +
      `</details>`,
      { reply_markup: { inline_keyboard: buttons } }
    );
    return;
  }

  // Ә) Таңдалған пакет бойынша Сыйлық сертификатын жасау
  if (data.startsWith('gift_create_')) {
    const catId = parseInt(data.replace('gift_create_', ''), 10);
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

    const uRes = await pool.query(
      `INSERT INTO users (telegram_id, first_name) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name RETURNING id`,
      [tgId, firstName]
    );
    const catRes = await pool.query(`
      SELECT sc.*, v.name as venue_name FROM subscriptions_catalog sc
      JOIN venues v ON sc.venue_id = v.id WHERE sc.id = $1
    `, [catId]);

    if (catRes.rows.length === 0) return;
    const cat = catRes.rows[0];

    const giftCode = `gift_${Math.floor(100000 + Math.random() * 900000)}`;
    await pool.query(`
      INSERT INTO gifts (gift_code, sender_id, sender_tg_id, sender_name, catalog_id, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
    `, [giftCode, uRes.rows[0].id, tgId, firstName, cat.id]);

    const botUser = cachedBotUsername || 'JazlBot';
    const giftLink = `https://t.me/${botUser}?start=${giftCode}`;
    const shareText = encodeURIComponent(
      `Сізге ${firstName} атынан Jazl арқылы сыйлық жіберілді: ${cat.venue_name} (${cat.units_total} ${cat.unit_name} айлық жазылымы). Сыйлықты қабылдау үшін сілтемені басыңыз:`
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(giftLink)}&text=${shareText}`;

    await streamRichResponse(
      chatId,
      [
        { thinking: 'Сыйлық сертификаты мен жеке белсендіру сілтемесі жасалуда...' }
      ],
      `<h2>Сыйлық сертификаты дайын</h2>` +
      `<table bordered striped compact>` +
      `<tr><th>Өріс</th><th>Мәлімет</th></tr>` +
      `<tr><td>Мекеме</td><td><b>${cat.venue_name}</b></td></tr>` +
      `<tr><td>Пакет құрамы</td><td><b>${cat.units_total} ${cat.unit_name}</b> (${cat.title})</td></tr>` +
      `<tr><td>Жіберуші</td><td>${firstName}</td></tr>` +
      `<tr><td>Мәртебесі</td><td><b>Күтілуде (Қабылдауға дайын)</b></td></tr>` +
      `<tr><td>Сертификат коды</td><td><code>${giftCode}</code></td></tr>` +
      `</table>` +
      `<p>Төмендегі <b>«Досыма Telegram арқылы жіберу»</b> батырмасын басып, контактілер тізімінен алушыны таңдаңыз:</p>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Досыма Telegram арқылы жіберу', url: shareUrl, style: 'primary' }],
            [{ text: 'Сілтемені көшіру', copy_text: { text: giftLink } }],
            [{ text: 'Сынақ: Сыйлықты өзім қабылдап көру', callback_data: `gift_claim_${giftCode}` }]
          ]
        }
      }
    );
    return;
  }

  // Б) Сыйлықты батырма арқылы қабылдау
  if (data.startsWith('gift_claim_')) {
    const giftCode = data.replace('gift_claim_', '');
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
    await claimGiftByCode(chatId, tgId, firstName, giftCode);
    return;
  }

  // В) Сыйлық иесіне алғыс білдіру
  if (data.startsWith('gift_thanks_')) {
    const giftId = parseInt(data.replace('gift_thanks_', ''), 10);
    const gRes = await pool.query(`
      SELECT g.*, sc.units_total, sc.unit_name, v.name as venue_name
      FROM gifts g
      JOIN subscriptions_catalog sc ON g.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE g.id = $1
    `, [giftId]);

    if (gRes.rows.length === 0 || gRes.rows[0].thanked) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: 'Алғыс хабарламасы бұрын жіберілген.',
        show_alert: true
      });
      return;
    }

    const g = gRes.rows[0];
    await pool.query(`UPDATE gifts SET thanked = TRUE WHERE id = $1`, [giftId]);

    await tgCall('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `${g.sender_name} атына сіздің алғысыңыз жіберілді!`,
      show_alert: true
    });

    // Сыйлық жіберген адамға ресми алғыс хабарламасын жеткізу
    await tgCall('sendRichMessage', {
      chat_id: g.sender_tg_id,
      rich_message: {
        html:
          `<h3>Сыйлығыңыз үшін алғыс</h3>` +
          `<p><b>${firstName}</b> сіз сыйлаған <b>${g.venue_name} (${g.units_total} ${g.unit_name})</b> жазылымы үшін сізге алғыс білдірді.</p>`
      }
    });
  }
}

// 3. Deep-Link (/start gift_...) немесе батырма арқылы сыйлықты белсендіру функциясы
async function claimGiftByCode(chatId, recipientTgId, recipientName, giftCode) {
  await ensureGiftSetup();

  const gRes = await pool.query(`
    SELECT g.*, sc.title, sc.units_total, sc.unit_name, sc.package_price, v.name as venue_name
    FROM gifts g
    JOIN subscriptions_catalog sc ON g.catalog_id = sc.id
    JOIN venues v ON sc.venue_id = v.id
    WHERE g.gift_code = $1
  `, [giftCode]);

  if (gRes.rows.length === 0) {
    await tgCall('sendRichMessage', {
      chat_id: chatId,
      rich_message: {
        html: `<h3>Сыйлық сертификаты табылмады</h3><p>Көрсетілген сілтеме жарамсыз немесе қате енгізілген.</p>`
      }
    });
    return;
  }

  const gift = gRes.rows[0];

  if (gift.status === 'CLAIMED') {
    await tgCall('sendRichMessage', {
      chat_id: chatId,
      rich_message: {
        html: `<h3>Сертификат бұрын белсендірілген</h3><p>Бұл сыйлық сертификаты бұрын қабылданып қойған.</p>`
      }
    });
    return;
  }

  // Алушыны базаға тіркеу
  const uRes = await pool.query(
    `INSERT INTO users (telegram_id, first_name) VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name RETURNING id`,
    [recipientTgId, recipientName]
  );
  const recipientUserId = uRes.rows[0].id;

  // Сыйлықты CLAIMED қылу және 30 күндік жазылымды ДӘЛ ОСЫ СӘТТЕ бастау!
  await pool.query(
    `UPDATE gifts SET status = 'CLAIMED', recipient_tg_id = $1, recipient_name = $2, claimed_at = NOW() WHERE id = $3`,
    [recipientTgId, recipientName, gift.id]
  );

  const subIns = await pool.query(`
    INSERT INTO user_subscriptions (user_id, catalog_id, units_remaining, valid_until)
    VALUES ($1, $2, $3, NOW() + INTERVAL '30 days') RETURNING id
  `, [recipientUserId, gift.catalog_id, gift.units_total]);
  const subId = subIns.rows[0].id;

  // Алушыға құттықтау және жазылым төлқұжатын шығару
  await streamRichResponse(
    chatId,
    [{ thinking: 'Сыйлық сертификаты тексерілуде және 30 күндік жазылым белсендірілуде...' }],
    `<h2>Сізге сыйлық жазылым табысталды</h2>` +
    `<p><b>${gift.sender_name}</b> сізге <b>${gift.venue_name}</b> мекемесінің айлық жазылымын сыйлады. Жазылым сіздің аккаунтыңызға қосылды.</p>` +
    `<table bordered striped compact>` +
    `<tr><th>Параметр</th><th>Мәлімет</th></tr>` +
    `<tr><td>Мекеме</td><td><b>${gift.venue_name}</b></td></tr>` +
    `<tr><td>Пакет</td><td>${gift.title}</td></tr>` +
    `<tr><td>Қолжетімді баланс</td><td><b>${gift.units_total} ${gift.unit_name}</b></td></tr>` +
    `<tr><td>Жарамдылық мерзімі</td><td><b>30 күн (Бүгіннен бастап)</b></td></tr>` +
    `<tr><td>Төлем мәртебесі</td><td>Толық төленген (Сыйлық)</td></tr>` +
    `</table>`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Алып кету (12:30 – 13:00)', callback_data: `order_takeaway_${subId}_1230` },
            { text: 'Алып кету (13:00 – 13:30)', callback_data: `order_takeaway_${subId}_1300`, style: 'primary' }
          ],
          [{ text: `${gift.sender_name} атына алғыс білдіру`, callback_data: `gift_thanks_${gift.id}` }]
        ]
      }
    }
  );

  // Сыйлық жіберушіге (егер басқа адам қабылдаса немесе тест жасаса) хабарлама жіберу
  if (String(gift.sender_tg_id) !== String(recipientTgId)) {
    await tgCall('sendRichMessage', {
      chat_id: gift.sender_tg_id,
      rich_message: {
        html:
          `<h3>Сыйлығыңыз қабылданды</h3>` +
          `<p><b>${recipientName}</b> сіз жіберген <b>${gift.venue_name} (${gift.units_total} ${gift.unit_name})</b> сыйлық жазылымын қабылдап, белсендірді.</p>`
      }
    });
  }
}

module.exports = { handleGiftCallback, claimGiftByCode };
