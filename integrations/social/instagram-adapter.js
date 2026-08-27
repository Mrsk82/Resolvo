// Instagram Professional/Business adapter. Requires a real Meta App
// (developers.facebook.com) with Instagram + Facebook Login for Business
// products added, and a Facebook Page linked to the Instagram account —
// Instagram has no standalone OAuth path independent of a Page (Section 32
// note: verify this is still true before go-live, it has been Meta's model
// for several years).
//
// Docs: https://developers.facebook.com/docs/instagram-platform

const meta = require('./meta-shared');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');
const { getCapabilities } = require('./capability-matrix');

const SCOPES = getCapabilities('instagram').requiredScopes;

function getAuthUrl({ appId, redirectUri, state }) {
  return meta.buildOAuthUrl({ appId, redirectUri, state, scopes: SCOPES });
}

async function handleOAuthCallback({ appId, appSecret, redirectUri, code }) {
  const shortLived = await meta.exchangeCodeForToken({ appId, appSecret, redirectUri, code });
  const longLived = await meta.extendToken({ appId, appSecret, shortLivedToken: shortLived.access_token });
  // Find the Page(s) this user manages, then the Instagram Business account linked to each
  const pages = await meta.graphGet('/me/accounts', longLived.access_token);
  const results = [];
  for (const page of (pages.data || [])) {
    const igInfo = await meta.graphGet(`/${page.id}?fields=instagram_business_account`, longLived.access_token).catch(() => null);
    if (igInfo && igInfo.instagram_business_account) {
      const igAccount = await meta.graphGet(`/${igInfo.instagram_business_account.id}?fields=id,username,name`, longLived.access_token);
      results.push({ pageId: page.id, pageName: page.name, instagramAccountId: igAccount.id, username: igAccount.username, name: igAccount.name });
    }
  }
  return { accessToken: longLived.access_token, expiresIn: longLived.expires_in, linkedAccounts: results };
}

function handleWebhookVerification(req, res, verifyToken) {
  return meta.handleWebhookVerification(req, res, verifyToken);
}
function verifyWebhookSignature(req, appSecret) {
  return meta.verifyWebhookSignature(req, appSecret);
}

// Instagram webhook payload shape: { object:'instagram', entry:[{ id, time, changes:[{field, value}] }] }
// field is typically 'comments' or 'messages' (via Messaging webhook for DMs).
function normalizeEvent(payload, tenantId, receivedAtIso) {
  const out = [];
  for (const entry of (payload.entry || [])) {
    const channelAccountId = entry.id;
    for (const change of (entry.changes || [])) {
      if (change.field === 'comments') {
        const v = change.value;
        out.push(finalizeMessage({
          tenant_id: tenantId, channel: 'instagram', channel_account_id: channelAccountId,
          event_type: v.parent_id ? 'COMMENT_REPLY' : 'COMMENT',
          conversation_id: v.media ? v.media.id : v.id,
          message_id: v.id, parent_message_id: v.parent_id || null, post_id: v.media ? v.media.id : null,
          customer_id: v.from ? v.from.id : 'unknown', sender_id: v.from ? v.from.id : 'unknown',
          sender_name: v.from ? v.from.username : null, sender_username: v.from ? v.from.username : null,
          message_text: v.text || '', media: [], direction: 'inbound',
          platform_created_at: new Date().toISOString(), // Instagram comment webhooks don't include a created_time field; best available is receipt time
          platform_received_at: receivedAtIso || nowUtcIso(),
        }));
      }
      // Messaging (DM) events arrive via a separate 'messaging' entry shape handled by
      // messaging_handovers/messages — left as a documented gap: wire up once a real
      // app is in Advanced Access, since the exact payload requires live testing against
      // Meta's servers to confirm field names for this app's approved scope set.
    }
    if (entry.messaging) {
      for (const m of entry.messaging) {
        if (!m.message) continue;
        out.push(finalizeMessage({
          tenant_id: tenantId, channel: 'instagram', channel_account_id: channelAccountId,
          event_type: 'DM', conversation_id: m.sender.id, message_id: m.message.mid, parent_message_id: null, post_id: null,
          customer_id: m.sender.id, sender_id: m.sender.id, sender_name: null, sender_username: null,
          message_text: m.message.text || '', media: (m.message.attachments || []).map(a => ({ type: a.type, url: a.payload && a.payload.url })),
          direction: 'inbound',
          platform_created_at: new Date(m.timestamp).toISOString(),
          platform_received_at: receivedAtIso || nowUtcIso(),
        }));
      }
    }
  }
  return out;
}

// Comment reply and DM both go through the Graph API, different endpoints.
async function sendMessage({ accessToken, conversationType, targetId, text }) {
  try {
    let res;
    if (conversationType === 'comment') {
      res = await meta.graphPost(`/${targetId}/replies`, accessToken, { message: text });
      return { platformMessageId: res.id, status: 'SENT' };
    }
    // DM
    res = await meta.graphPost(`/me/messages`, accessToken, { recipient: { id: targetId }, message: { text } });
    return { platformMessageId: res.message_id, status: 'SENT' };
  } catch (e) {
    return { platformMessageId: null, status: 'FAILED', error: e.message };
  }
}

module.exports = {
  platform: 'instagram',
  getAuthUrl, handleOAuthCallback,
  handleWebhookVerification, verifyWebhookSignature,
  normalizeEvent, sendMessage,
};
