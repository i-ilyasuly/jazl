const { pool } = require('./db');
const { tgCall, streamRichResponse } = require('./telegram');

// Базада клиент хабарламасының ID-ін сақтайтын баған бар екеніне көз жеткізу (автоматты)
let columnChecked = false;
async function ensureClientMsgColumn() {
  if (columnChecked) return;
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_msg_id BIGINT`);
  columnChecked = true;
}

async function handleMerchantCallback(cb) {
  await ensureClientMsgColumn();
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const data = cb.data;

  // 1. Мекеменің басты панелі («Бүгінгі жоспар» мен статистика)
  if (data === 'merchant_panel') {
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });

    // Бүгінгі барлық тапсырыстарды алу
    const ordersRes = await pool.query(`
      SELECT o.*, u.first_name as client_name, sc.unit_name, v.name as venue_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN user_subscriptions us ON o.user_sub_id = us.id
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE o.created_at::date = CURRENT_DATE
      ORDER BY o.id DESC
    `);

    const all = ordersRes.rows;
    const scheduled = all.filter(o => o.status === 'SCHEDULED').length;
    const preparing = all.filter(o => o.status === 'PREPARING').length;
    const ready = all.filter(o => o.status === 'READY').length;
    const completed = all.filter(o => o.status === 'COMPLETED').length;

    const statusLabel = {
      SCHEDULED: 'Күтілуде',
      PREPARING: 'Дайындалуда',
      READY: 'Сөреде дайын',
      COMPLETED: 'Табысталды'
    };

    const activeOrders = all.filter(o => o.status !== 'COMPLETED');
    const tableRows = activeOrders.length > 0
      ? activeOrders.map(o =>
          `<tr><td><b>${o.order_number}</b></td><td>1 × ${o.unit_name}</td><td>${o.slot_time}</td><td><b>${statusLabel[o.status] || o.status}</b></td></tr>`
        ).join('')
      : `<tr><td colspan="4">Қазіргі сәтте кезекте тұрған белсенді тапсырыстар жоқ</td></tr>`;

    // Әр белсенді тапсырысты басқару батырмалары
    const actionButtons = activeOrders.slice(0, 5).map(o => {
      if (o.status === 'SCHEDULED') {
        return [{
          text: `${o.order_number} (${o.unit_name} · ${o.slot_time}) — Дайындауды бастау`,
          callback_data: `merchant_prep_${o.id}`,
          style: 'primary'
        }];
      }
      if (o.status === 'PREPARING') {
        return [{
          text: `${o.order_number} (${o.unit_name}) — Дайын, сөреге қойылды`,
          callback_data: `merchant_ready_${o.id}`,
          style: 'success'
        }];
      }
      return [{
        text: `${o.order_number} — Сөреде тұр (Клиенттен 4-таңбалы код күтілуде)`,
        callback_data: `merchant_info_${o.id}`
      }];
    });

    actionButtons.push([{ text: 'Кестені жаңарту', callback_data: 'merchant_panel' }]);

    await streamRichResponse(
      chatId,
      [{ thinking: 'Мекеменің бүгінгі тапсырыстар кестесі мен асүй жүктемесі есептелуде...' }],
      `<h2>Мекеме кабинеті: Бүгінгі жоспар</h2>` +
      `<table bordered striped compact>` +
      `<caption>Күндік жиынтық көрсеткіштер</caption>` +
      `<tr><th>Күтілуде</th><th>Дайындалуда</th><th>Сөреде</th><th>Табысталды</th></tr>` +
      `<tr><td><b>${scheduled}</b></td><td><b>${preparing}</b></td><td><b>${ready}</b></td><td><b>${completed}</b></td></tr>` +
      `</table>` +
      `<h3>Кезектегі белсенді тапсырыстар</h3>` +
      `<table bordered striped compact>` +
      `<tr><th>Нөмірі</th><th>Позиция</th><th>Уақыты</th><th>Мәртебесі</th></tr>` +
      `${tableRows}` +
      `</table>` +
      `<details><summary>Қызметкерге арналған нұсқаулық</summary>` +
      `<p>1. Тапсырыс уақыты жақындағанда <b>«Дайындауды бастау»</b> батырмасын басыңыз.<br/>2. Өнім дайын болғанда <b>«Дайын, сөреге қойылды»</b> батырмасын басыңыз (клиентке хабарлама барады).<br/>3. Клиент келгенде оның 4-таңбалы кодын осы чатқа жазып, табыстауды растаңыз.</p>` +
      `</details>`,
      { reply_markup: { inline_keyboard: actionButtons } }
    );
    return;
  }

  // 2. Аспаз «Дайындауды бастау» басқанда (SCHEDULED ──> PREPARING)
  if (data.startsWith('merchant_prep_')) {
    const orderId = parseInt(data.replace('merchant_prep_', ''), 10);
    await pool.query(`UPDATE orders SET status = 'PREPARING' WHERE id = $1`, [orderId]);

    const ordRes = await pool.query(`
      SELECT o.*, u.telegram_id as client_tg_id, sc.unit_name, v.name as venue_name, b.address
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN user_subscriptions us ON o.user_sub_id = us.id
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.id = $1
    `, [orderId]);

    if (ordRes.rows.length > 0) {
      const ord = ordRes.rows[0];
      await tgCall('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `${ord.order_number} мәртебесі «Дайындалуда» күйіне ауыстырылды.`
      });

      // Клиенттің чатындағы тапсырыс төлқұжатын ТІРІДЕЙ жаңарту!
      if (ord.client_msg_id) {
        await tgCall('editMessageText', {
          chat_id: ord.client_tg_id,
          message_id: ord.client_msg_id,
          rich_message: {
            html:
              `<h2>Тапсырыс төлқұжаты: ${ord.order_number}</h2>` +
              `<table bordered striped compact>` +
              `<tr><th>Өріс</th><th>Мәні</th></tr>` +
              `<tr><td>Мекеме</td><td><b>${ord.venue_name}</b></td></tr>` +
              `<tr><td>Позиция</td><td>1 × ${ord.unit_name}</td></tr>` +
              `<tr><td>Филиал</td><td>${ord.address}</td></tr>` +
              `<tr><td>Уақыт аралығы</td><td>${ord.slot_time}</td></tr>` +
              `<tr><td>Мәртебесі</td><td><b>Дайындалуда (Асүйде)</b></td></tr>` +
              `<tr><td>Растау коды</td><td><tg-spoiler><b>${ord.handoff_code}</b></tg-spoiler></td></tr>` +
              `</table>`
          },
          reply_markup: {
            inline_keyboard: [
              [{ text: `Кодты көшіру: ${ord.handoff_code}`, copy_text: { text: ord.handoff_code }, style: 'primary' }],
              [{ text: '15 минутқа кешігемін', callback_data: `late_${ord.order_number}` }]
            ]
          }
        });
      }
    }

    // Панельді қайта жаңарту
    cb.data = 'merchant_panel';
    return handleMerchantCallback(cb);
  }

  // 3. Аспаз «Дайын, сөреге қойылды» басқанда (PREPARING ──> READY)
  if (data.startsWith('merchant_ready_')) {
    const orderId = parseInt(data.replace('merchant_ready_', ''), 10);
    await pool.query(`UPDATE orders SET status = 'READY' WHERE id = $1`, [orderId]);

    const ordRes = await pool.query(`
      SELECT o.*, u.telegram_id as client_tg_id, sc.unit_name, v.name as venue_name, b.address
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN user_subscriptions us ON o.user_sub_id = us.id
      JOIN subscriptions_catalog sc ON us.catalog_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.id = $1
    `, [orderId]);

    if (ordRes.rows.length > 0) {
      const ord = ordRes.rows[0];
      await tgCall('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `${ord.order_number} дайын! Клиентке хабарлама жіберілді.`
      });

      // Клиенттің төлқұжатын жаңарту
      if (ord.client_msg_id) {
        await tgCall('editMessageText', {
          chat_id: ord.client_tg_id,
          message_id: ord.client_msg_id,
          rich_message: {
            html:
              `<h2>Тапсырыс дайын: ${ord.order_number}</h2>` +
              `<table bordered striped compact>` +
              `<tr><th>Өріс</th><th>Мәні</th></tr>` +
              `<tr><td>Мекеме</td><td><b>${ord.venue_name}</b></td></tr>` +
              `<tr><td>Позиция</td><td>1 × ${ord.unit_name}</td></tr>` +
              `<tr><td>Мекенжайы</td><td>${ord.address}</td></tr>` +
              `<tr><td>Мәртебесі</td><td><b>Сөреде дайын (Алып кетуге болады)</b></td></tr>` +
              `<tr><td>Растау коды</td><td><b>${ord.handoff_code}</b></td></tr>` +
              `</table>`
          },
          reply_markup: {
            inline_keyboard: [
              [{ text: `Кодты көшіру: ${ord.handoff_code}`, copy_text: { text: ord.handoff_code }, style: 'primary' }]
            ]
          }
        });
      }

      // Клиентке жедел Push-хабарлама жіберу
      await tgCall('sendRichMessage', {
        chat_id: ord.client_tg_id,
        rich_message: {
          html: `<h3>Тапсырысыңыз дайын: ${ord.order_number}</h3><p><b>${ord.venue_name}</b> (${ord.address}) филиалында сіздің <b>1 × ${ord.unit_name}</b> тапсырысыңыз дайын тұр. Кассаға <b>${ord.handoff_code}</b> кодын көрсетіп, кезексіз алып кете аласыз.</p>`
        }
      });
    }

    cb.data = 'merchant_panel';
    return handleMerchantCallback(cb);
  }

  // 4. Сөреде тұрған тапсырыс туралы ескертпе
  if (data.startsWith('merchant_info_')) {
    await tgCall('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Бұл тапсырыс сөреде дайын тұр. Клиент келгенде оның 4-таңбалы кодын осы чатқа жазып жіберіңіз.',
      show_alert: true
    });
  }
}

module.exports = { handleMerchantCallback, ensureClientMsgColumn };
