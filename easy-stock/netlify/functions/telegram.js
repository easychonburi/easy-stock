// ใช้ Node.js fetch (Netlify runtime รองรับแล้ว ไม่ต้อง install เพิ่ม)
exports.handler = async function (event) {
  // ✅ รองรับทดสอบด้วย GET: เปิดใน browser จะได้เช็คว่า function ยังทำงานอยู่
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
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'Missing environment variables' })
      };
    }

    // ข้อมูลที่มาจาก index.html
    const payload = JSON.parse(event.body || "{}");

    // จัดข้อความสวยๆ
    const lines = [
      '📦 รายงานการเช็คสต๊อก',
      `สาขา: ${payload.branch || '-'}`,
      `โหมด: ${payload.mode === 'open' ? 'เปิดร้าน' : 'ปิดร้าน'}`,
      `เวลา: ${payload.time || ''}`,
      `ความคืบหน้า: ${payload.progress ?? 0}%`,
    ];

    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    if (orders.length > 0) {
      lines.push('— รายการสั่งเพิ่ม —', ...orders.map(x => `• ${x}`));
    } else {
      lines.push('— ไม่มีรายการสั่งเพิ่ม —');
    }

    // ยิงไปหา Telegram API
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: lines.join('\n')
      })
    });

    const data = await resp.json();
    if (!data.ok) throw new Error(data.description || 'Telegram error');

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
