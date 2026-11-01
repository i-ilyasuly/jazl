const functions = require('@google-cloud/functions-framework');
const { stoppedDrafts } = require('./telegram');
const { handleMiniAppApi } = require('./api');
const { handleCallbackQuery } = require('./callbacks');
const { handleMessage } = require('./messages');

functions.http('jazlWebhook', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    // 1. Егер Mini App API сұрауы болса (?action=...)
    if (req.query.action) {
      return await handleMiniAppApi(req, res);
    }

    // 2. Егер Telegram Webhook жаңартуы болса
    const update = req.body;
    if (!update) return res.status(200).send('OK');

    if (update.stopped_message_generation) {
      stoppedDrafts.add(update.stopped_message_generation.draft_id);
      return res.status(200).send('OK');
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return res.status(200).send('OK');
    }

    if (update.message) {
      await handleMessage(update.message);
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(200).send('OK');
  }
});
