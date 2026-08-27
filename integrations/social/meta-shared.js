// Shared Meta (Instagram + Facebook) plumbing — both platforms use the same
// Graph API, the same OAuth flow (Facebook Login for Business), and the same
// webhook signature scheme, so this is factored out rather than duplicated
// across instagram-adapter.js and facebook-adapter.js.
//
// Official docs (verify current version before activating in production —
// Section 32): https://developers.facebook.com/docs/graph-api
//              https://developers.facebook.com/docs/messenger-platform
//              https://developers.facebook.com/docs/instagram-platform

const https = require('https');
const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0'; // confirm this is still current before go-live — Meta deprecates versions ~2yrs after release
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function _request(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(u, {
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function buildOAuthUrl({ appId, redirectUri, state, scopes }) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken({ appId, appSecret, redirectUri, code }) {
  const url = `${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const { body } = await _request('GET', url);
  if (body.error) throw new Error(body.error.message || 'Meta OAuth token exchange failed');
  return body; // {access_token, token_type, expires_in}
}

// Short-lived user token -> long-lived token (~60 days), per Meta's standard flow.
async function extendToken({ appId, appSecret, shortLivedToken }) {
  const url = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
  const { body } = await _request('GET', url);
  if (body.error) throw new Error(body.error.message || 'Token extension failed');
  return body;
}

async function graphGet(path, accessToken) {
  const { body } = await _request('GET', `${GRAPH_BASE}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`);
  if (body.error) throw new Error(body.error.message || 'Graph API GET failed: ' + path);
  return body;
}

async function graphPost(path, accessToken, payload) {
  const { body } = await _request('POST', `${GRAPH_BASE}${path}?access_token=${encodeURIComponent(accessToken)}`, payload);
  if (body.error) throw new Error(body.error.message || 'Graph API POST failed: ' + path);
  return body;
}

// Meta's webhook subscription verification handshake (Section 11) — Meta
// calls this GET with hub.challenge once, when the webhook URL is first
// registered in the App Dashboard.
function handleWebhookVerification(req, res, verifyToken) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
    return true;
  }
  res.sendStatus(403);
  return false;
}

// Meta signs every webhook POST body with HMAC-SHA256 of the app secret,
// delivered in X-Hub-Signature-256 — this is the real per-request
// verification (separate from the one-time handshake above).
function verifyWebhookSignature(req, appSecret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  GRAPH_VERSION, GRAPH_BASE,
  buildOAuthUrl, exchangeCodeForToken, extendToken,
  graphGet, graphPost,
  handleWebhookVerification, verifyWebhookSignature,
};
