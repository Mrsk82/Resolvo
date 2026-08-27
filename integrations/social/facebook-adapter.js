// Facebook Page adapter — same Meta Graph API/OAuth/webhook infra as
// Instagram (see meta-shared.js), different payload shapes (Page feed
// comments + Messenger Platform DMs).
//
// Docs: https://developers.facebook.com/docs/pages-api
//       https://developers.facebook.com/docs/messenger-platform

const meta = require('./meta-shared');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');
const { getCapabilities } = require('./capability-matrix');

const SCOPES = getCapabilities('facebook').requiredScopes;

function getAuthUrl({ appId, redirectUri, state }) {
  return meta.buildOAuthUrl({ appId, redirectUri, state, scopes: SCOPES });
}

async function handleOAuthCallback({ appId, appSecret, redirectUri, code }) {
  const shortLived = await meta.exchangeCodeForToken({ appId, appSecret, redirectUri, code });
  const longLived = await meta.extendToken({ appId, appSecret, shortLivedToken: shortLived.access_token });
  const pages = await meta.graphGet('/me/accounts', longLived.access_token);
  return {
    accessToken: longLived.access_token,
    expiresIn: longLived.expires_in,
    linkedAccounts: (pages.data || []).map(p => ({ pageId: p.id, pageName: p.name, pageAccessToken: p.access_token })),
  };
}

function handleWebhookVerification(req, res, verifyToken) { return meta.handleWebhookVerification(req, res, verifyToken); }
function verifyWebhookSignature(req, appSecret) { return meta.verifyWebhookSignature(req, appSecret); }

// Facebook webhook payload: { object:'page', entry:[{ id, time, changes:[{field:'feed',value}], messaging:[...] }] }
function normalizeEvent(payload, tenantId, receivedAtIso) {
  const out = [];
  for (const entry of (payload.entry || [])) {
    const channelAccountId = entry.id;
    for (const change of (entry.changes || [])) {
      if (change.field === 'feed' && change.value && change.value.item === 'comment') {
        const v = change.value;
        out.push(finalizeMessage({
          tenant_id: tenantId, channel: 'facebook', channel_account_id: channelAccountId,
          event_type: v.parent_id && v.parent_id !== v.post_id ? 'COMMENT_REPLY' : 'COMMENT',
          conversation_id: v.post_id, message_id: v.comment_id, parent_message_id: v.parent_id || null, post_id: v.post_id,
          customer_id: v.from ? v.from.id : 'unknown', sender_id: v.from ? v.from.id : 'unknown',
          sender_name: v.from ? v.from.name : null, sender_username: null,
          message_text: v.message || '', media: [], direction: 'inbound',
          platform_created_at: new Date((entry.time || Date.now() / 1000) * 1000).toISOString(),
          platform_received_at: receivedAtIso || nowUtcIso(),
        }));
      }
    }
    for (const m of (entry.messaging || [])) {
      if (!m.message) continue;
      out.push(finalizeMessage({
        tenant_id: tenantId, channel: 'facebook', channel_account_id: channelAccountId,
        event_type: 'DM', conversation_id: m.sender.id, message_id: m.message.mid, parent_message_id: null, post_id: null,
        customer_id: m.sender.id, sender_id: m.sender.id, sender_name: null, sender_username: null,
        message_text: m.message.text || '', media: (m.message.attachments || []).map(a => ({ type: a.type, url: a.payload && a.payload.url })),
        direction: 'inbound',
        platform_created_at: new Date(m.timestamp).toISOString(),
        platform_received_at: receivedAtIso || nowUtcIso(),
      }));
    }
  }
  return out;
}

async function sendMessage({ pageAccessToken, conversationType, targetId, text }) {
  try {
    if (conversationType === 'comment') {
      const res = await meta.graphPost(`/${targetId}/comments`, pageAccessToken, { message: text });
      return { platformMessageId: res.id, status: 'SENT' };
    }
    const res = await meta.graphPost(`/me/messages`, pageAccessToken, { recipient: { id: targetId }, message: { text } });
    return { platformMessageId: res.message_id, status: 'SENT' };
  } catch (e) {
    return { platformMessageId: null, status: 'FAILED', error: e.message };
  }
}

module.exports = {
  platform: 'facebook',
  getAuthUrl, handleOAuthCallback,
  handleWebhookVerification, verifyWebhookSignature,
  normalizeEvent, sendMessage,
};
