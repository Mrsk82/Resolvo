// WhatsApp Cloud API adapter — DIRECT Meta integration (the "Tech Provider"
// model), as an alternative to the existing Twilio-based integration
// (whatsapp-adapter.js). Twilio is a BSP (Business Solution Provider) that
// resells Meta's WhatsApp API with its own markup on top of Meta's
// per-conversation fee; this adapter talks to Meta's Graph API directly, so
// a brand on this path only ever pays Meta's fee. This is the sanctioned,
// Meta-approved way to avoid the Twilio markup — NOT an unofficial
// WhatsApp-Web-automation library, which would risk the number being banned.
//
// Requires the platform owner's own Meta Business Verification and a Meta
// App with the WhatsApp product added (see .env.example for
// WHATSAPP_META_APP_ID/SECRET/CONFIG_ID) — until those exist, every function
// here that needs them fails with an honest "not configured yet" error
// rather than a broken OAuth redirect (same pattern as x-adapter.js for
// platforms still pending approval).
//
// Onboarding uses Meta's "Embedded Signup" flow, not the generic OAuth
// dialog other platforms here use: the frontend loads Meta's JS SDK and
// calls FB.login with a WhatsApp-specific config_id (from the Meta App
// Dashboard) instead of a scope list. That still returns a `code` the same
// way OAuth does — exchanged below via the same meta-shared helpers — but
// the WABA id and phone number id come back through the client-side SDK
// callback, not this server-side exchange, so the frontend must pass them
// through alongside the code (see connectWhatsAppCloud in server.js).
//
// Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup
//       https://developers.facebook.com/docs/whatsapp/cloud-api

const meta = require('./meta-shared');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');

function isConfigured() {
  return !!(process.env.WHATSAPP_META_APP_ID && process.env.WHATSAPP_META_APP_SECRET);
}

// Exchanges the Embedded Signup code for a long-lived System User-style
// token. Same OAuth token dance as Instagram/Facebook (meta-shared handles
// both identically since it's the same Graph API underneath).
async function handleEmbeddedSignupCallback({ redirectUri, code }) {
  if (!isConfigured()) throw new Error('WhatsApp direct (Meta) integration is not configured yet — add WHATSAPP_META_APP_ID/SECRET once Meta Business Verification is approved.');
  const appId = process.env.WHATSAPP_META_APP_ID;
  const appSecret = process.env.WHATSAPP_META_APP_SECRET;
  const shortLived = await meta.exchangeCodeForToken({ appId, appSecret, redirectUri, code });
  const longLived = await meta.extendToken({ appId, appSecret, shortLivedToken: shortLived.access_token });
  return { accessToken: longLived.access_token, expiresIn: longLived.expires_in };
}

async function discoverPhoneNumbers({ wabaId, accessToken }) {
  const res = await meta.graphGet(`/${wabaId}/phone_numbers`, accessToken);
  return (res.data || []).map(p => ({ id: p.id, displayNumber: p.display_phone_number, verifiedName: p.verified_name, qualityRating: p.quality_rating }));
}

// Registers the number for Cloud API sending (one-time per number, needs the
// 6-digit PIN the customer set during Embedded Signup) and subscribes this
// Meta App to the WABA's webhook events — without this second call, no
// messages/status webhooks ever arrive for the number.
async function registerPhoneNumber({ phoneNumberId, wabaId, accessToken, pin }) {
  await meta.graphPost(`/${phoneNumberId}/register`, accessToken, { messaging_product: 'whatsapp', pin });
  await meta.graphPost(`/${wabaId}/subscribed_apps`, accessToken, {});
  return { registered: true };
}

function handleWebhookVerification(req, res, verifyToken) {
  return meta.handleWebhookVerification(req, res, verifyToken);
}
function verifyWebhookSignature(req, appSecret) {
  return meta.verifyWebhookSignature(req, appSecret);
}

// Cloud API webhook shape: { object:'whatsapp_business_account',
// entry:[{ id: wabaId, changes:[{ field:'messages', value:{
//   messages:[...], contacts:[...], metadata:{phone_number_id} } }] }] }
// Kept for parity with the other adapters' normalizeEvent interface and for
// the universal social gateway; the live webhook route in server.js talks to
// handleIncomingWhatsAppMessage() directly instead, so WhatsApp's existing
// bot-rule/spam/sentiment logic applies identically regardless of provider.
function normalizeEvent(payload, tenantId, receivedAtIso) {
  const out = [];
  for (const entry of (payload.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'messages') continue;
      const v = change.value || {};
      const phoneNumberId = v.metadata ? v.metadata.phone_number_id : null;
      const contact = (v.contacts || [])[0];
      for (const m of (v.messages || [])) {
        out.push(finalizeMessage({
          tenant_id: tenantId, channel: 'whatsapp', channel_account_id: phoneNumberId,
          event_type: 'MESSAGE', conversation_id: m.from, message_id: m.id, parent_message_id: null, post_id: null,
          customer_id: m.from, sender_id: m.from, sender_name: contact?.profile?.name || null, sender_username: null,
          message_text: m.text ? m.text.body : (m.button ? m.button.text : ''),
          media: m.image ? [{ type: 'image', id: m.image.id }] : m.document ? [{ type: 'document', id: m.document.id }] : [],
          direction: 'inbound',
          platform_created_at: m.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000).toISOString() : nowUtcIso(),
          platform_received_at: receivedAtIso || nowUtcIso(),
        }));
      }
    }
  }
  return out;
}

// Direct Cloud API send — the Meta-side equivalent of twilio.messages.create().
// Text-only for now; template messages (required to initiate a conversation
// outside the 24h customer-service window) are a documented gap until a real
// WABA has at least one approved template — same "honest gap" approach as
// the rest of this integration.
async function sendMessage({ phoneNumberId, accessToken, to, text }) {
  try {
    const res = await meta.graphPost(`/${phoneNumberId}/messages`, accessToken, {
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text },
    });
    return { platformMessageId: res.messages ? res.messages[0].id : null, status: 'SENT' };
  } catch (e) {
    return { platformMessageId: null, status: 'FAILED', error: e.message };
  }
}

module.exports = {
  platform: 'whatsapp-cloud',
  isConfigured,
  handleEmbeddedSignupCallback, discoverPhoneNumbers, registerPhoneNumber,
  handleWebhookVerification, verifyWebhookSignature,
  normalizeEvent, sendMessage,
};
