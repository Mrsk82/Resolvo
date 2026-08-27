// WhatsApp Business adapter — deliberately a THIN WRAPPER around Resolvo's
// existing Twilio-based WhatsApp integration (whatsappConfig, the
// /api/whatsapp/webhook route, and the Twilio send call already used by
// replyToTicket). Building a second, competing WhatsApp integration here
// would violate the "reuse existing functionality" mandate for no benefit —
// the existing one already works end-to-end (Section 6, Section 29).
//
// This file exists only so WhatsApp participates in the universal adapter
// interface (capability matrix, gateway dedup log, Social Channels settings
// UI) alongside the other platforms — the actual send/receive plumbing is
// still the pre-existing Twilio code in server.js.

const { finalizeMessage, nowUtcIso } = require('./base-adapter');

// No OAuth here — "connecting" WhatsApp in the Social Channels UI reads the
// status of the EXISTING whatsappConfig rather than starting a new flow.
function getConnectionStatus(db) {
  const cfg = db.whatsappConfig || {};
  return {
    connected: !!(cfg.enabled && cfg.accountSid && cfg.authToken && cfg.number),
    number: cfg.number || null,
    note: 'Managed under Settings → Email & Ticketing → WhatsApp — this panel reflects that connection rather than starting a separate one.',
  };
}

// The existing WhatsApp webhook (server.js) already creates/updates tickets
// directly rather than going through the gateway — this normalizer exists
// for parity/testing and for the day that webhook is migrated to also call
// gateway.processEvent(), but is not currently wired into the live path to
// avoid changing already-working production behavior.
function normalizeEvent(twilioPayload, tenantId, receivedAtIso) {
  const { From, Body, ProfileName, WaId } = twilioPayload;
  if (!From || !Body) return [];
  return [finalizeMessage({
    tenant_id: tenantId, channel: 'whatsapp', channel_account_id: WaId || From,
    event_type: 'MESSAGE', conversation_id: From, message_id: twilioPayload.MessageSid || `${From}-${Date.now()}`,
    parent_message_id: null, post_id: null,
    customer_id: From, sender_id: From, sender_name: ProfileName || null, sender_username: null,
    message_text: Body, media: [], direction: 'inbound',
    platform_created_at: nowUtcIso(), // Twilio's webhook doesn't carry the original send time separately from receipt
    platform_received_at: receivedAtIso || nowUtcIso(),
  })];
}

module.exports = { platform: 'whatsapp', getConnectionStatus, normalizeEvent };
