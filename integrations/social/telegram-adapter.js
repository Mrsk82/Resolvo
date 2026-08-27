// Telegram adapter — the one platform in this feature that is fully real and
// testable today with no OAuth flow and no app review: a bot token from
// @BotFather is sufficient (per capability-matrix.js: authType 'bot-token').
//
// Official docs: https://core.telegram.org/bots/api

const https = require('https');
const crypto = require('crypto');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');

const API_BASE = 'https://api.telegram.org';

function _post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = https.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Telegram API returned non-JSON: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Validates the bot token actually works and returns the bot's own identity
// — this is what "Connect" calls right after the admin pastes a token.
async function getBotInfo(botToken) {
  const res = await _post(`${API_BASE}/bot${botToken}/getMe`, null);
  if (!res.ok) throw new Error(res.description || 'Invalid bot token');
  return res.result; // {id, is_bot, first_name, username, ...}
}

// Registers Resolvo's webhook URL with Telegram, and sets a random secret
// token Telegram will echo back in a header on every call — this is
// Telegram's signature-equivalent verification mechanism (Section 11/23).
async function setWebhook(botToken, webhookUrl, secretToken) {
  const res = await _post(`${API_BASE}/bot${botToken}/setWebhook`, {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ['message', 'channel_post', 'edited_message'],
  });
  if (!res.ok) throw new Error(res.description || 'Failed to register webhook with Telegram');
  return res.result;
}

async function deleteWebhook(botToken) {
  return _post(`${API_BASE}/bot${botToken}/deleteWebhook`, null);
}

// Telegram's verification mechanism: a constant-time comparison of the
// secret_token header against the one we registered with setWebhook.
function verifyWebhookSignature(req, expectedSecretToken) {
  const header = req.headers['x-telegram-bot-api-secret-token'];
  if (!header || !expectedSecretToken) return false;
  const a = Buffer.from(String(header));
  const b = Buffer.from(String(expectedSecretToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Telegram Update → UniversalSocialMessage[] (Section 8). A single webhook
// call carries exactly one Update, so this returns an array of 0 or 1.
function normalizeEvent(update, tenantId, channelAccountId, receivedAtIso) {
  const msg = update.message || update.channel_post || update.edited_message;
  if (!msg) return []; // e.g. a callback_query or other update type this adapter doesn't handle yet

  const eventType = update.channel_post ? 'POST' : 'MESSAGE';
  const media = [];
  if (msg.photo) media.push({ type: 'photo', url: '(file_id:' + msg.photo[msg.photo.length - 1].file_id + ')' });
  if (msg.document) media.push({ type: 'document', url: '(file_id:' + msg.document.file_id + ')' });
  if (msg.voice) media.push({ type: 'voice', url: '(file_id:' + msg.voice.file_id + ')' });

  const raw = {
    tenant_id: tenantId,
    channel: 'telegram',
    channel_account_id: channelAccountId,
    event_type: eventType,
    conversation_id: String(msg.chat.id),
    message_id: String(msg.message_id),
    parent_message_id: msg.reply_to_message ? String(msg.reply_to_message.message_id) : null,
    post_id: null,
    customer_id: msg.from ? String(msg.from.id) : String(msg.chat.id),
    sender_id: msg.from ? String(msg.from.id) : String(msg.chat.id),
    sender_name: msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') : null,
    sender_username: msg.from && msg.from.username ? msg.from.username : null,
    message_text: msg.text || msg.caption || '',
    media,
    direction: 'inbound',
    platform_created_at: new Date(msg.date * 1000).toISOString(), // Telegram gives Unix seconds
    platform_received_at: receivedAtIso || nowUtcIso(),
  };
  return [finalizeMessage(raw)];
}

// Universal reply interface implementation (Section 16).
async function sendMessage({ botToken, chatId, text }) {
  const res = await _post(`${API_BASE}/bot${botToken}/sendMessage`, { chat_id: chatId, text });
  if (!res.ok) return { platformMessageId: null, status: 'FAILED', error: res.description };
  return { platformMessageId: String(res.result.message_id), status: 'SENT' };
}

module.exports = {
  platform: 'telegram',
  getBotInfo, setWebhook, deleteWebhook,
  verifyWebhookSignature, normalizeEvent, sendMessage,
};
