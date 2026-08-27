// Contract every platform adapter implements. Plain JS (this codebase has no
// TypeScript/build step), so this is documentation + shared helpers, not a
// compiler-enforced interface — but the gateway (gateway.js) only ever calls
// these method names, so every adapter must implement them.
//
// Adapter contract:
//   platform            — string key matching capability-matrix.js
//   getAuthUrl(brand, state)          — build the OAuth consent URL (oauth platforms only)
//   handleOAuthCallback(code, state)  — exchange code for tokens, return account info
//   verifyWebhookSignature(req)       — return true/false; platform-specific
//   handleWebhookVerification(req,res)— for platforms with a handshake step (Meta/hub.challenge); return true if handled
//   normalizeEvent(rawPayload)        — return an array of UniversalSocialMessage objects (Section 8), or [] if nothing actionable
//   sendMessage({account, conversationId, recipientId, text, media}) — returns {platformMessageId, status}
//   disconnect(account)               — best-effort token/webhook revocation
//
// UniversalSocialMessage shape (Section 8) — every adapter's normalizeEvent()
// must return objects matching this shape so the gateway never needs
// platform-specific branching:
/**
 * @typedef {Object} UniversalSocialMessage
 * @property {string} tenant_id
 * @property {string} channel                 - platform key, e.g. 'instagram'
 * @property {string} channel_account_id       - the connected account's platform-native id
 * @property {'POST'|'COMMENT'|'COMMENT_REPLY'|'MENTION'|'DM'|'DM_REPLY'|'MESSAGE'|'REACTION'|'OTHER'} event_type
 * @property {string} conversation_id          - platform-native thread/conversation id where available
 * @property {string} message_id               - platform-native message/comment id
 * @property {string|null} parent_message_id
 * @property {string|null} post_id
 * @property {string} customer_id              - resolved Resolvo customer identifier (see identity.js)
 * @property {string} sender_id                 - platform-native sender id
 * @property {string|null} sender_name
 * @property {string|null} sender_username
 * @property {string} message_text
 * @property {Array<{type:string,url:string}>} media
 * @property {'inbound'|'outbound'} direction
 * @property {string} platform_created_at      - ISO 8601 UTC
 * @property {string} platform_received_at     - ISO 8601 UTC (when Resolvo's webhook endpoint received it)
 * @property {string} resolvio_processed_at     - ISO 8601 UTC (when the gateway finished processing it)
 * @property {number} processing_delay_ms       - resolvio_processed_at - platform_created_at
 */

function nowUtcIso() {
  return new Date().toISOString();
}

// Every adapter's normalizeEvent() should call this right before returning,
// so processing_delay_ms and resolvio_processed_at are computed consistently.
function finalizeMessage(msg) {
  const processedAt = nowUtcIso();
  const createdMs = new Date(msg.platform_created_at).getTime();
  const processedMs = new Date(processedAt).getTime();
  return {
    ...msg,
    resolvio_processed_at: processedAt,
    processing_delay_ms: isFinite(createdMs) ? (processedMs - createdMs) : null,
  };
}

module.exports = { nowUtcIso, finalizeMessage };
