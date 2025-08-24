// netlify/functions/telegram.js
exports.handler = async function (event) {
  // Health check (ไม่ยิงข้อความจริงตอน GET)
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ping: 'telegram function is alive' }) };
  }

  try {
    const TELEGRAM_TOKEN     = process.env.TELEGRAM_TOKEN;

    // Fallback (เผื่อยังไม่ได้ตั้งครบ 3 ห้อง)
    const CHAT_ID_FALLBACK   = process.env.TELEGRAM_CHAT_ID || null;

    // 3 ห้องตามต้องการ
    const CHAT_ID_OPEN       = process.env.TELEGRAM_CHAT_ID_OPEN   || null; // ห้องเช็คสต๊อก "เปิดร้าน"
    const CHAT_ID_ORDERS     = process.env.TELEGRAM_CHAT_ID_ORDERS || null; // ห้องแจ้ง "สั่งเพิ่ม"
    const CHAT_ID_STOCKS     = process.env.TELEGRAM_CHAT_ID_STOCKS || null; // ห้อง "รายการคงเหลือ"

    if (!TELEGRAM_TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing env: TELEGRAM_TOKEN' }) };
    }

    const payload = JSON.parse(event.body || "{}");
    const isOpen = payload.mode === 'open';

    // เตรียมข้อความ
    const msgStocks = buildStocksMessage(payload); // 📊 รายการคงเหลือที่กรอก
    const msgOrders = buildOrdersMessage(payload); // 🧾 สรุปรายการสั่งเพิ่ม

    // เลือกห้องสำหรับ "รายการคงเหลือ"
    const stocksChatId = isOpen
      ? (CHAT_ID_OPEN || CHAT_ID_STOCKS || CHAT_ID_FALLBACK)
      : (CHAT_ID_STOCKS || CHAT_ID_OPEN || CHAT_ID_FALLBACK);

    if (!stocksChatId) {
      throw new Error('No chat id for stocks message. Please set TELEGRAM_CHAT_ID_OPEN or TELEGRAM_CHAT_ID_STOCKS (or TELEGRAM_CHAT_ID fallback).');
    }

    // ส่ง "รายการคงเหลือ" เสมอ (โหมดเปิด/ปิด)
    for (const part of chunkText(msgStocks, 3500)) {
      await tgSend(TELEGRAM_TOKEN, stocksChatId, part);
    }

    // โหมด "ปิดร้าน" เท่านั้น ส่ง "สั่งเพิ่ม" ไปห้องสั่งเพิ่ม
    if (!isOpen) {
      const ordersChatId = (CHAT_ID_ORDERS || CHAT_ID_FALLBACK);
      if (!ordersChatId) {
        // ถ้าไม่ได้ตั้งห้องสั่งเพิ่มไว้ ก็ข้าม (ไม่ error เพื่อให้เปิดใช้งานได้)
        console.warn('No chat id for orders message. Set TELEGRAM_CHAT_ID_ORDERS or TELEGRAM_CHAT_ID to receive orders.');
      } else {
        for (const part of chunkText(msgOrders, 3500)) {
          await tgSend(TELEGRAM_TOKEN, ordersChatId, part);
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
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
  // ถ้าอยากให้หัวข้อห้อง "เปิดร้าน" ชัดๆ กว่านี้ สามารถแยกได้ เช่น:
  // const title = (p.mode === 'open') ? 'เช็คสต๊อก (เปิดร้าน)' : 'รายการคงเหลือที่กรอก';
  const title = (p.mode === 'open') ? 'เช็คสต๊อก (เปิดร้าน)' : 'รายการคงเหลือที่กรอก';
  const header = headerLines(p, '📊', title);
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
  const lines = text.split('\n');
  const parts = [];
  let buf = '';
  for (const line of lines){
    const next = buf ? (buf + '\n' + line) : line;
    if (next.length > maxLen){
      if (buf) parts.push(buf);
      buf = line;
    } else {
      buf = next;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

function safe(v){
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
