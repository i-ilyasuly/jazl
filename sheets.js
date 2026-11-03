// Google Cloud Run ішкі метадатасынан ресми OAuth2 токенін алу
async function getGoogleAccessToken() {
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/spreadsheets',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error(`Metadata token қатесі: ${res.statusText}`);
  const data = await res.json();
  return data.access_token;
}

// Google Sheets API v4 сұрауларын орындайтын әмбебап функция
async function sheetsApiCall(endpoint, method = 'GET', body = null) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.log('SPREADSHEET_ID орнатылмаған. Sheets-ке жазу өткізілді.');
    return null;
  }

  const token = await getGoogleAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${endpoint}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  return res.json();
}

// 1. «Тапсырыстар» парағына жаңа жол қосу
async function appendOrderToSheet(order) {
  try {
    const nowStr = new Date().toLocaleString('kk-KZ', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });
    const row = [
      nowStr,                              // А: Уақыты
      order.order_number,                  // B: Тапсырыс №
      order.venue_name || 'Däm Doner',     // C: Мекеме
      order.address || 'Орталық филиал',   // D: Филиал
      order.client_name || 'Клиент',       // E: Тұтынушы
      `1 × ${order.unit_name || 'донер'}`, // F: Өнім
      order.fulfillment_type || 'Өзі алу', // G: Тәсілі
      order.slot_time || '13:00',          // H: Уақыт слоты
      order.handoff_code,                  // I: Код
      'Күтілуде',                          // J: Мәртебесі
      '+1 350 ₸'                           // K: Мекеме табысы
    ];

    const tabName = encodeURIComponent('Тапсырыстар');
    await sheetsApiCall(`/values/${tabName}!A:K:append?valueInputOption=USER_ENTERED`, 'POST', {
      values: [row]
    });
  } catch (err) {
    console.error('appendOrderToSheet қатесі (бот жұмысына әсер етпейді):', err.message);
  }
}

// 2. «Тапсырыстар» парағындағы мәртебені «Табысталды» деп өзгерту
async function updateOrderStatusInSheet(orderNumber, newStatus = 'Табысталды') {
  try {
    const tabName = encodeURIComponent('Тапсырыстар');
    // B бағанындағы барлық тапсырыс нөмірлерін оқу
    const data = await sheetsApiCall(`/values/${tabName}!B:B`);
    if (!data || !data.values) return;

    // Сәйкес нөмірді іздеу
    const rowIndex = data.values.findIndex(r => r[0] === orderNumber);
    if (rowIndex !== -1) {
      const rowNum = rowIndex + 1; // 1-ден басталатын жол нөмірі
      // J бағаны — Мәртебесі бағаны
      const cellRange = encodeURIComponent(`Тапсырыстар!J${rowNum}`);
      await sheetsApiCall(`/values/${cellRange}?valueInputOption=USER_ENTERED`, 'PUT', {
        values: [[newStatus]]
      });
    }
  } catch (err) {
    console.error('updateOrderStatusInSheet қатесі:', err.message);
  }
}

// 3. «Жазылымдар» парағына сатылған жазылымды тіркеу
async function appendSubscriptionToSheet(sub) {
  try {
    const nowStr = new Date().toLocaleString('kk-KZ', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });
    const row = [
      nowStr,                              // А: Күні
      sub.venue_name || 'Däm Doner',       // B: Мекеме
      sub.title || 'Жазылым',              // C: Пакет атауы
      sub.client_name || 'Клиент',         // D: Клиент
      `${sub.package_price} ₸`,            // E: Төленген баға
      `${sub.units_total} ${sub.unit_name}`, // F: Көлемі
      '30 күн'                             // G: Мерзімі
    ];

    const tabName = encodeURIComponent('Жазылымдар');
    await sheetsApiCall(`/values/${tabName}!A:G:append?valueInputOption=USER_ENTERED`, 'POST', {
      values: [row]
    });
  } catch (err) {
    console.error('appendSubscriptionToSheet қатесі:', err.message);
  }
}

module.exports = {
  appendOrderToSheet,
  updateOrderStatusInSheet,
  appendSubscriptionToSheet
};
