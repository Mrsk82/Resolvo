// YouTube adapter (Phase 2). No webhook support in the YouTube Data API for
// comment events — this adapter polls on an interval instead of receiving
// pushes, unlike every Phase 1 platform (capability-matrix.js: webhooks:false,
// pollingRequired:true). Docs: https://developers.google.com/youtube/v3

const https = require('https');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function getAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    access_type: 'offline', prompt: 'consent', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function _get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Polling entry point — call on an interval per connected channel (e.g. every
// 5-10 minutes) rather than per-request, to stay well inside the daily quota.
async function pollComments({ accessToken, channelId, tenantId, sinceIso }) {
  const url = `${API_BASE}/commentThreads?part=snippet&allThreadsRelatedToChannelId=${channelId}&order=time&access_token=${encodeURIComponent(accessToken)}`;
  const res = await _get(url);
  if (res.error) throw new Error(res.error.message || 'YouTube comment poll failed');
  const receivedAt = nowUtcIso();
  const out = [];
  for (const item of (res.items || [])) {
    const c = item.snippet.topLevelComment.snippet;
    if (sinceIso && new Date(c.publishedAt) <= new Date(sinceIso)) continue;
    out.push(finalizeMessage({
      tenant_id: tenantId, channel: 'youtube', channel_account_id: channelId,
      event_type: 'COMMENT', conversation_id: item.snippet.videoId, message_id: item.id,
      parent_message_id: null, post_id: item.snippet.videoId,
      customer_id: c.authorChannelId ? c.authorChannelId.value : 'unknown',
      sender_id: c.authorChannelId ? c.authorChannelId.value : 'unknown',
      sender_name: c.authorDisplayName, sender_username: null,
      message_text: c.textDisplay, media: [], direction: 'inbound',
      platform_created_at: c.publishedAt, platform_received_at: receivedAt,
    }));
  }
  return out;
}

async function sendMessage({ accessToken, parentCommentId, text }) {
  // POST /commentThreads or /comments (reply) — requires youtube.force-ssl scope
  const body = JSON.stringify({ snippet: { parentId: parentCommentId, textOriginal: text } });
  return new Promise((resolve) => {
    const req = https.request(`${API_BASE}/comments?part=snippet&access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) resolve({ platformMessageId: null, status: 'FAILED', error: parsed.error.message });
          else resolve({ platformMessageId: parsed.id, status: 'SENT' });
        } catch (e) { resolve({ platformMessageId: null, status: 'FAILED', error: 'Invalid response' }); }
      });
    });
    req.on('error', e => resolve({ platformMessageId: null, status: 'FAILED', error: e.message }));
    req.write(body); req.end();
  });
}

module.exports = { platform: 'youtube', getAuthUrl, pollComments, sendMessage };
