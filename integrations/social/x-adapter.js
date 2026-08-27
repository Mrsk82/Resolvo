// X (Twitter) adapter — Phase 3 "prepare", not "implement" (Section 31,
// Stage 11). Real blocker: mentions + DMs require a paid API tier (Basic or
// above) — this is a budget decision for you to make, not something code can
// route around (capability-matrix.js). No webhook option at accessible
// tiers, so this polls once activated.
//
// Docs: https://docs.x.com/x-api/introduction

const https = require('https');
const crypto = require('crypto');

function getAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
    scope: 'tweet.read tweet.write users.read dm.read dm.write offline.access',
    code_challenge: codeChallenge, code_challenge_method: 'S256',
  });
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function exchangeCodeForToken({ clientId, redirectUri, code, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri,
    client_id: clientId, code_verifier: codeVerifier,
  }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.twitter.com/2/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Not wired to run until a paid API tier covering mentions+DMs is confirmed
// active on the connected developer account.
async function pollMentions(/* { accessToken, userId, tenantId } */) {
  throw new Error('Mentions/DM endpoints require a paid X API tier (Basic or above) — confirm the connected developer account has one before enabling. See capability-matrix.js.');
}

module.exports = { platform: 'x', getAuthUrl, generatePkcePair, exchangeCodeForToken, pollMentions };
