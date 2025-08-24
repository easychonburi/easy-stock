// netlify/functions/telegram.js
exports.handler = async function (event) {
  // เช็คชีวิตฟังก์ชัน
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ping: 'telegram function is alive' })
    };
  }

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Missing envs' }) };
    }

    const payload = JSON.parse(event.body || "{}");
    // payload จากหน้าเว็บ: { branch, mode, date, time, progress, stocks:[{name,value,unit}], orders:[string] }

    // สร้างข้อความ 2 ฉบับ
    const msg1 = buildStocksMessage(payload);  // 📊 รายการคงเหลือที่กรอก
    const msg2 = buildOrdersMessage(payload);  // 🧾 สรุปรายการสั่งเพิ่ม

    // ส่งข้อความ 1 (อาจแตกหลายชิ้นถ้ายาว)
    for (const part of chunkText(msg1, 3500)) {
      await tgSend(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, part);
    }
    // ส่งข้อความ 2
    for (const part of chunkText(msg2, 3500)) {
      await tgSend(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, part);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

/* -------------------------- Helpers -------------------------- */

function headerLines(p, titleEmoji, titleText){
  const modeLabel = p.mode === 'open' ? 'เปิดร้าน' : 'ปิดร้าน';
  return [
    `${titleEmoji} <b>${titleText}</b>`,
    `สาขา: <b>${safe(p.branch)}</b>`,
    `โหมด: <b>${modeLabel}</b>`,
    `เวลา: ${safe(p.date)} ${safe(p.time)}`,
    `ความคืบหน้า: <b>${Number(p.progress||0)}%</b>`
  ];
}

function buildStocksMessage(p){
  const header = headerLines(p, '📊', 'รายการคงเหลือที่กรอก');
  const stocks = Array.isArray(p.stocks) ? p.stocks : [];

  const body = (stocks.length > 0)
    ? stocks.map(s => `• ${safe(s.name)}: <b>${safe(s.value)}</b> ${safe(s.unit)}`)
    : ['• ไม่มีการกรอกจำนวนคงเหลือ'];

  return [...header, '', ...body].join('\n');
}

function buildOrdersMessage(p){
  const header = headerLines(p, '🧾', 'สรุปรายการสั่งเพิ่ม');
  const orders = Array.isArray(p.orders) ? p.orders : [];

  const body = (orders.length > 0)
    ? orders.map(o => `• ${safe(o)}`)
    : ['• ไม่มีรายการสั่งเพิ่ม'];

  return [...header, '', ...body].join('\n');
}

async function tgSend(token, chatId, text){
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description || 'Telegram error');
}

function chunkText(text, maxLen = 3500){
  // ตัดข้อความตามบรรทัด ป้องกันเกิน 4096 ตัวอักษรของ Telegram
  const lines = text.split('\n');
  const parts = [];
  let buf = '';
  for (const line of lines){
    if ((buf + '\n' + line).length > maxLen){
      parts.push(buf);
      buf = line;
    } else {
      buf = buf ? (buf + '\n' + line) : line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

function safe(v){
  if (v == null) return '';
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
