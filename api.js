const { pool } = require('./db');
const { tgCall } = require('./telegram');

async function handleMiniAppApi(req, res) {
  const action = req.query.action;

  // 1. Каталог пен филиалдарды алу (GET ?action=catalog)
  if (action === 'catalog') {
    const result = await pool.query(`
      SELECT s.*, v.name as venue_name, v.category, v.description as venue_desc,
             v.halal_org, v.rating, v.reviews_count,
             b.address as branch_address, b.work_hours, b.allows_courier
      FROM subscriptions_catalog s
      JOIN venues v ON s.venue_id = v.id
      LEFT JOIN branches b ON b.venue_id = v.id
      WHERE s.status = 'ACTIVE'
      ORDER BY s.is_promoted DESC, s.id ASC
    `);
    return res.status(200).json({ ok: true, items: result.rows });
  }

  // 2. Клиенттің өз жазылымдары мен тапсырыстарын алу (GET ?action=my_data&tg_id=...)
  if (action === 'my_data' && req.query.tg_id) {
    const tgId = req.query.tg_id;
    const subs = await pool.query(`
      SELECT us.*, sc.title, sc.unit_name, sc.units_total, sc.unit_price,
             v.name as venue_name, v.halal_org, b.address as branch_address
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      LEFT JOIN branches b ON b.venue_id = v.id
      WHERE u.telegram_id = $1 AND us.status = 'ACTIVE'
      ORDER BY us.id DESC
    `, [tgId]);

    const orders = await pool.query(`
      SELECT o.*, sc.unit_name, v.name as venue_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN user_subscriptions us ON o.user_sub_id = us.id
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE u.telegram_id = $1 AND o.status != 'COMPLETED'
      ORDER BY o.id DESC
    `, [tgId]);

    return res.status(200).json({ ok: true, subscriptions: subs.rows, orders: orders.rows });
  }

  // 3. Мини Апп ішінен жазылым сатып алу (POST ?action=buy)
  if (action === 'buy' && req.method === 'POST') {
    const { tg_id, first_name, catalog_id } = req.body || {};
    const uRes = await pool.query(
      `INSERT INTO users (telegram_id, first_name) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name RETURNING id`,
      [tg_id, first_name || 'Пайдаланушы']
    );
    const catRes = await pool.query(`
      SELECT sc.*, v.name as venue_name FROM subscriptions_catalog sc
      JOIN venues v ON sc.venue_id = v.id WHERE sc.id = $1
    `, [catalog_id]);

    if (catRes.rows.length === 0) return res.status(404).json({ ok: false });
    const cat = catRes.rows[0];

    const subIns = await pool.query(`
      INSERT INTO user_subscriptions (user_id, catalog_id, units_remaining, valid_until)
      VALUES ($1, $2, $3, NOW() + INTERVAL '30 days') RETURNING *
    `, [uRes.rows[0].id, cat.id, cat.units_total]);

    await tgCall('sendRichMessage', {
      chat_id: tg_id,
      rich_message: {
        html: `<h2>Жазылым белсендірілді: ${cat.venue_name}</h2><p>${cat.title} (<b>${cat.units_total} ${cat.unit_name}</b>) пакеті аккаунтыңызға қосылды.</p>`
      }
    });

    return res.status(200).json({ ok: true, subscription: subIns.rows[0] });
  }

  // 4. Мини Апп ішінен тапсырыс беру (POST ?action=order)
  if (action === 'order' && req.method === 'POST') {
    const { tg_id, sub_id, fulfillment_type, slot_time } = req.body || {};
    const subCheck = await pool.query(`
      SELECT us.*, sc.unit_name, sc.venue_id, v.name as venue_name
      FROM user_subscriptions us
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id WHERE us.id = $1
    `, [sub_id]);

    if (subCheck.rows.length === 0 || subCheck.rows[0].units_remaining <= 0) {
      return res.status(400).json({ ok: false, error: 'Лимит аяқталған' });
    }
    const sub = subCheck.rows[0];
    const bRes = await pool.query(`SELECT id, address FROM branches WHERE venue_id = $1 LIMIT 1`, [sub.venue_id]);
    const handoffCode = Math.floor(1000 + Math.random() * 9000).toString();
    const orderNumber = `#JZ-${Math.floor(100 + Math.random() * 900)}`;

    const ordIns = await pool.query(`
      INSERT INTO orders (order_number, user_sub_id, user_id, branch_id, fulfillment_type, slot_time, handoff_code, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'READY') RETURNING *
    `, [orderNumber, sub.id, sub.user_id, bRes.rows[0].id, fulfillment_type || 'TAKEAWAY', slot_time || '13:00 - 13:30', handoffCode]);

    const msg = await tgCall('sendRichMessage', {
      chat_id: tg_id,
      rich_message: {
        html: `<h2>Тапсырыс төлқұжаты: ${orderNumber}</h2><p>Мекеме: <b>${sub.venue_name}</b> | Растау коды: <tg-spoiler><b>${handoffCode}</b></tg-spoiler></p>`
      },
      reply_markup: {
        inline_keyboard: [[{ text: `Кодты көшіру: ${handoffCode}`, copy_text: { text: handoffCode }, style: 'primary' }]]
      }
    });
    if (msg && msg.ok && msg.result) {
      await tgCall('pinChatMessage', { chat_id: tg_id, message_id: msg.result.message_id, disable_notification: true });
    }

    return res.status(200).json({ ok: true, order: ordIns.rows[0] });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
}

module.exports = { handleMiniAppApi };
