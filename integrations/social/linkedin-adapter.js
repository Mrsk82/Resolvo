// LinkedIn Company Page adapter — Phase 3 "prepare", not "implement" per
// Section 31 (Stage 11 explicitly separates LinkedIn/X preparation from the
// Phase 1/2 builds). Real blocker: organization social endpoints require
// LinkedIn Marketing Developer Platform partner approval, and DM capture/
// reply is unsupported by any generally-available API (capability-matrix.js).
// This adapter is OAuth + comment polling only, ready to activate once/if
// that approval is granted.
//
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/

const https = require('https');
const { finalizeMessage, nowUtcIso } = require('./base-adapter');

function getAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
    scope: 'r_organization_social w_organization_social rw_organization_admin',
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri,
    client_id: clientId, client_secret: clientSecret,
  }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Comment polling — NOT wired to run automatically until Marketing Developer
// Platform approval is confirmed for the connecting app; calling this without
// that approval will return a permissions error, by design of LinkedIn's API.
async function pollComments(/* { accessToken, organizationUrn, tenantId } */) {
  throw new Error('LinkedIn organization social endpoints require Marketing Developer Platform partner approval — not yet available for this app. See capability-matrix.js.');
}

module.exports = { platform: 'linkedin', getAuthUrl, exchangeCodeForToken, pollComments };
