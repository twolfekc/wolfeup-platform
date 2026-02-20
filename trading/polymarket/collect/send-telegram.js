// send-telegram.js — Telegram notification helper
'use strict';

const https = require('https');

const BOT_TOKEN = '8205224341:AAHroFbCW2r1d_ICq9DCQxLx9Jc3cl2EkHE';
const CHAT_ID = '5381591231';

/**
 * Send a message via Telegram bot API
 * @param {string} message - Message text (supports HTML parse mode)
 * @returns {Promise<object>} API response
 */
function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve(parsed);
          } else {
            console.error('[Telegram] API error:', parsed.description);
            resolve(parsed); // Don't reject — non-fatal
          }
        } catch (e) {
          console.error('[Telegram] Parse error:', e.message);
          resolve({ ok: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Telegram] Request error:', e.message);
      resolve({ ok: false, error: e.message }); // Don't reject — non-fatal
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error('[Telegram] Request timeout');
      resolve({ ok: false, error: 'timeout' });
    });

    req.write(body);
    req.end();
  });
}

module.exports = { sendTelegram };
