const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// 2. Ресми Ағынды жауап және Ойлану блогы (Bot API 10.1 - 10.3)
async function streamRichResponse(chatId, thinkingStages, finalRichHtml, extraOptions = {}) {
  const draftId = Math.floor(100000 + Math.random() * 900000);

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

  const finalRes = await tgCall('sendRichMessage', {
    chat_id: chatId,
    rich_message: { html: finalRichHtml },
    ...extraOptions
  });

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

// 3. Негізгі басқару панелін жіберу
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
          [{ text: 'Jazl Маркетплейсін ашу', web_app: { url: miniAppUrl }, style: 'primary' }],
          [{ text: 'Менің жазылымдарым', callback_data: 'my_subs' }]
        ]
      }
    }
  );
}

module.exports = { tgCall, streamRichResponse, sendMainMenu, stoppedDrafts };
