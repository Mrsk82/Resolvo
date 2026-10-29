// Shopify order lookup for support tickets. Read-only: it never changes anything in the store.
// The store owner creates a custom app in Shopify (read_orders + read_customers) and pastes its Admin API access token into Resolvo.
//
// Safety: the store address is accepted only as <name>.myshopify.com, so an admin cannot point this at an internal address.
// `opts.baseUrl` exists for tests and is only ever set from the SHOPIFY_TEST_BASE environment variable, never from user input.

const https = require('https');
const http = require('http');

const API_VERSION = '2026-07';
const SHOP_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const ORDER_FIELDS = 'id,name,order_number,created_at,cancelled_at,cancel_reason,financial_status,fulfillment_status,total_price,currency,line_items,fulfillments,shipping_address,order_status_url,refunds,email,phone,customer';

// "My-Store", "my-store.myshopify.com", "https://my-store.myshopify.com/admin" -> "my-store.myshopify.com" (or null)
function normalizeShop(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
  if (s && s.indexOf('.') < 0) s += '.myshopify.com';
  return SHOP_RE.test(s) ? s : null;
}

class ShopifyError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status || 0; }
}

// One HTTP call to Shopify. Returns { status, json, headers } or rejects with a ShopifyError.
function call(method, cfg, path, opts, headers, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const base = opts.baseUrl ? new URL(opts.baseUrl) : { protocol: 'https:', hostname: cfg.shop, port: '' };
    const lib = base.protocol === 'http:' ? http : https;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request({
      method, hostname: base.hostname, port: base.port || undefined, path,
      headers: Object.assign({ 'Accept': 'application/json', 'User-Agent': 'Resolvo-Helpdesk/1.0' }, payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}, headers || {}), timeout: opts.timeoutMs || 12000,
    }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (d) => { buf += d; if (buf.length > 4e6) req.destroy(new Error('Response too large')); });
      res.on('end', () => {
        let json = null; try { json = buf ? JSON.parse(buf) : null; } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ status: res.statusCode, json, headers: res.headers });
        reject(explain(res.statusCode, json, res.headers));
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(/timeout/i.test(e.message) ? new ShopifyError('timeout', 'Shopify did not answer in time. Try again in a moment.') : /ENOTFOUND|EAI_AGAIN/.test(String(e.code || e.message)) ? new ShopifyError('store', 'We could not find that store. Check the store address.') : new ShopifyError('network', 'Could not reach Shopify just now. Try again in a moment.')));
    if (payload) req.write(payload);
    req.end();
  });
}

// Stores connected with a permanent token (legacy custom app) use it as is. Apps made in the Shopify Dev Dashboard give a
// Client ID and secret instead; those are exchanged for a token that lasts 24 hours, which we renew when it runs out.
const _tokens = new Map();
async function accessToken(cfg, opts, force) {
  if (cfg.token) return cfg.token;
  if (!cfg.clientId || !cfg.clientSecret) throw new ShopifyError('auth', 'No access token or client credentials are saved for this store.');
  const key = cfg.shop + '|' + cfg.clientId + '|' + require('crypto').createHash('sha256').update(cfg.clientSecret).digest('hex').slice(0, 16), hit = _tokens.get(key);   // the secret is part of the key, so a different secret never reuses a token
  if (!force && hit && hit.exp > Date.now() + 60000) return hit.token;
  let r;
  try { r = await call('POST', cfg, '/admin/oauth/access_token', opts, null, { client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials' }); }
  catch (e) { if (e.kind === 'auth' || e.status === 400) throw new ShopifyError('auth', 'Shopify did not accept the Client ID and secret. Copy both again from your Shopify app, and make sure the app is installed on this store.', e.status); throw e; }
  const t = r.json && r.json.access_token; if (!t) throw new ShopifyError('auth', 'Shopify did not return an access token for those credentials.');
  _tokens.set(key, { token: t, exp: Date.now() + ((r.json.expires_in || 86399) * 1000) });
  return t;
}
async function request(cfg, path, opts) {
  const go = async (force) => call('GET', cfg, '/admin/api/' + (cfg.apiVersion || API_VERSION) + path, opts, { 'X-Shopify-Access-Token': await accessToken(cfg, opts, force) });
  try { return await go(false); }
  catch (e) { if (e.kind === 'auth' && !cfg.token && cfg.clientId) return go(true); throw e; }   // the 24-hour token may have just expired
}

function explain(status, json, headers) {
  if (status === 401) return new ShopifyError('auth', 'Shopify did not accept the access token. Copy it again from your Shopify custom app (it starts with shpat_).', status);
  if (status === 403) return new ShopifyError('scope', 'The token works but is not allowed to read orders. In your Shopify custom app, turn on read_orders and read_customers, then install the app again.', status);
  if (status === 404) return new ShopifyError('store', 'We could not find that store. Check the store address (name.myshopify.com).', status);
  if (status === 402 || status === 423) return new ShopifyError('store', 'This Shopify store is not active (payment due or paused).', status);
  if (status === 429) return new ShopifyError('rate', 'Shopify asked us to slow down. Try again in a few seconds.', status);
  if (status >= 500) return new ShopifyError('network', 'Shopify is having trouble right now. Try again in a moment.', status);
  const detail = json && (json.errors && (typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors)));
  return new ShopifyError('other', 'Shopify returned an error' + (detail ? ': ' + String(detail).slice(0, 140) : '.'), status);
}

async function testConnection(cfg, opts) {
  if (!cfg.token) await accessToken(cfg, opts, true);   // credentials just entered are always checked against Shopify, never taken from the cache
  const r = await request(cfg, '/shop.json?fields=name,domain,myshopify_domain,currency,plan_name', opts);
  const s = (r.json && r.json.shop) || {};
  // shop.json works with almost any scope, so also prove that orders can be read
  await request(cfg, '/orders.json?limit=1&status=any&fields=id', opts);
  return { name: s.name || cfg.shop, domain: s.domain || cfg.shop, currency: s.currency || '' };
}

const money = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
function normalizeOrder(o, shop) {
  const f = (o.fulfillments || []).filter((x) => x.status !== 'cancelled' && x.status !== 'error');
  const tracking = [];
  f.forEach((x) => { const nums = x.tracking_numbers && x.tracking_numbers.length ? x.tracking_numbers : (x.tracking_number ? [x.tracking_number] : []); const urls = x.tracking_urls && x.tracking_urls.length ? x.tracking_urls : (x.tracking_url ? [x.tracking_url] : []); nums.forEach((n, i) => tracking.push({ company: x.tracking_company || '', number: n, url: urls[i] || urls[0] || '' })); });
  const refundTotal = (o.refunds || []).reduce((sum, r) => sum + (r.transactions || []).filter((t) => t.kind === 'refund' && t.status === 'success').reduce((a, t) => a + money(t.amount), 0), 0);
  const a = o.shipping_address || {};
  const status = o.cancelled_at ? 'cancelled' : (o.fulfillment_status === 'fulfilled' ? 'fulfilled' : (o.fulfillment_status === 'partial' ? 'partial' : 'unfulfilled'));
  return {
    id: o.id, name: o.name || ('#' + o.order_number), createdAt: o.created_at, paymentStatus: o.financial_status || '', fulfillment: status, cancelled: !!o.cancelled_at, cancelReason: o.cancel_reason || '',
    total: money(o.total_price), currency: o.currency || '', refunded: refundTotal, items: (o.line_items || []).slice(0, 8).map((i) => ({ title: i.title || i.name || 'Item', qty: i.quantity || 1 })), itemCount: (o.line_items || []).length,
    shipTo: [a.city, a.province].filter(Boolean).join(', '), tracking, adminUrl: shop && o.id ? 'https://' + shop + '/admin/orders/' + o.id : '', statusUrl: o.order_status_url || '',
  };
}

// Plain sentence an agent can drop into a reply. Written as a helper's note, so it is easy to edit before sending.
function summaryLine(o) {
  const d = o.createdAt ? new Date(o.createdAt) : null, when = d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  const head = 'Your order ' + o.name + (when ? ' (placed on ' + when + ')' : '');
  if (o.cancelled) return head + ' was cancelled' + (o.refunded ? ' and ' + fmt(o.refunded, o.currency) + ' has been refunded' : '') + '.';
  let s = head;
  if (o.fulfillment === 'fulfilled' || o.fulfillment === 'partial') {
    s += o.fulfillment === 'partial' ? ' has been partly shipped' : ' has been shipped';
    const t = o.tracking[0]; if (t) s += (t.company ? ' with ' + t.company : '') + '. Tracking number: ' + t.number + (t.url ? ' (' + t.url + ')' : '');
  } else s += o.paymentStatus === 'pending' || o.paymentStatus === 'authorized' ? ' is waiting for payment' : ' is being prepared and has not shipped yet';
  if (o.refunded) s += '. We have refunded ' + fmt(o.refunded, o.currency);
  return s + '.';
}
function fmt(n, cur) { return (cur === 'INR' ? '₹' : (cur ? cur + ' ' : '')) + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

// Find orders for a customer. Any of orderNumber / email / phone may be given; results are merged, newest first.
async function findOrders(cfg, q, opts) {
  const found = new Map(), matched = [];
  const add = (list, how) => { (list || []).forEach((o) => { if (o && o.id != null && !found.has(o.id)) found.set(o.id, { o, how }); }); if (list && list.length && matched.indexOf(how) < 0) matched.push(how); };
  const base = '/orders.json?status=any&limit=5&fields=' + ORDER_FIELDS;
  if (q.orderNumber) { const r = await request(cfg, base + '&name=' + encodeURIComponent('#' + String(q.orderNumber).replace(/^#/, '')), opts); add(r.json && r.json.orders, 'order number'); }
  if (q.email) { const r = await request(cfg, base + '&email=' + encodeURIComponent(q.email), opts); add(r.json && r.json.orders, 'email'); }
  if (q.phone && !found.size) {
    const c = await request(cfg, '/customers/search.json?limit=3&fields=id&query=' + encodeURIComponent('phone:' + q.phone), opts);
    for (const cu of ((c.json && c.json.customers) || []).slice(0, 2)) { const r = await request(cfg, '/customers/' + encodeURIComponent(cu.id) + '/orders.json?status=any&limit=5&fields=' + ORDER_FIELDS, opts); add(r.json && r.json.orders, 'phone'); }
  }
  const orders = [...found.values()].sort((a, b) => String(b.o.created_at).localeCompare(String(a.o.created_at))).slice(0, 5).map((x) => Object.assign(normalizeOrder(x.o, cfg.shop), { matchedBy: x.how }));
  orders.forEach((o) => { o.summary = summaryLine(o); });
  return { orders, matchedBy: matched };
}

// An order number written in a ticket: "#4821", "order no 4821", "order id: 4821"
function orderNumberFrom(text) {
  const t = String(text || '');
  let m = /(?:^|[^\w&])#\s?(\d{3,8})\b/.exec(t) || /\border\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*(\d{3,8})\b/i.exec(t);
  return m ? m[1] : '';
}

module.exports = { API_VERSION, accessToken, normalizeShop, testConnection, findOrders, normalizeOrder, summaryLine, orderNumberFrom, ShopifyError };
