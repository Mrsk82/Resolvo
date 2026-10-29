// Tests integrations/shopify against a fake Shopify server. Run: node docs/ui-redesign/tools/shopify_module_test.js
const http = require('http');
const S = require('../../../integrations/shopify');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d ? '  -> ' + JSON.stringify(d).slice(0, 200) : '')); };

const ORDER_SHIPPED = { id: 1001, name: '#4821', order_number: 4821, created_at: '2026-10-20T10:00:00+05:30', financial_status: 'paid', fulfillment_status: 'fulfilled', total_price: '1499.00', currency: 'INR',
  line_items: [{ title: 'Ceramic planter', quantity: 2 }, { title: 'Brass tray', quantity: 1 }], shipping_address: { city: 'Pune', province: 'Maharashtra' }, order_status_url: 'https://shop.example/status/1',
  fulfillments: [{ status: 'success', tracking_company: 'Delhivery', tracking_numbers: ['DLV123456'], tracking_urls: ['https://track.example/DLV123456'] }], refunds: [] };
const ORDER_CANCELLED = { id: 1002, name: '#4700', order_number: 4700, created_at: '2026-10-01T09:00:00+05:30', cancelled_at: '2026-10-02T09:00:00+05:30', financial_status: 'refunded', fulfillment_status: null, total_price: '799.00', currency: 'INR',
  line_items: [{ title: 'Cotton bedsheet', quantity: 1 }], fulfillments: [], refunds: [{ transactions: [{ kind: 'refund', status: 'success', amount: '799.00' }] }] };
const ORDER_NEW = { id: 1003, name: '#4900', order_number: 4900, created_at: '2026-10-27T09:00:00+05:30', financial_status: 'pending', fulfillment_status: null, total_price: '250.50', currency: 'INR', line_items: [{ title: 'Soap', quantity: 3 }], fulfillments: [], refunds: [] };

const calls = []; let issued = 0, validDyn = null, tokenCalls = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let tok = req.headers['x-shopify-access-token']; calls.push(req.method + ' ' + u.pathname + u.search);
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'POST' && u.pathname === '/admin/oauth/access_token') {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { let j = {}; try { j = JSON.parse(b); } catch (e) {} tokenCalls++;
      if (j.client_id === 'cid' && j.client_secret === 'sec' && j.grant_type === 'client_credentials') { validDyn = 'shpat_dyn' + (++issued); return send(200, { access_token: validDyn, scope: 'read_orders', expires_in: 86399 }); }
      send(400, { error: 'invalid_client' }); });
    return;
  }
  if (tok && tok.startsWith('shpat_dyn')) { if (tok !== validDyn) return send(401, { errors: 'expired' }); tok = 'good'; }
  if (tok === 'bad') return send(401, { errors: 'Invalid API key or access token' });
  if (tok === 'rate') return send(429, { errors: 'Throttled' });
  if (tok === 'down') return send(503, {});
  const p = u.pathname.replace(/^\/admin\/api\/[^/]+/, '');
  if (p === '/shop.json') return send(200, { shop: { name: 'Brightkart', domain: 'brightkart.in', currency: 'INR' } });
  if (tok === 'noscope' && p.startsWith('/orders')) return send(403, { errors: 'This action requires merchant approval for read_orders scope.' });
  if (p === '/orders.json') {
    if (u.searchParams.get('name') === '#4821') return send(200, { orders: [ORDER_SHIPPED] });
    if (u.searchParams.get('email') === 'vikram@example.com') return send(200, { orders: [ORDER_CANCELLED, ORDER_SHIPPED, ORDER_NEW] });
    return send(200, { orders: [] });
  }
  if (p === '/customers/search.json') return send(200, { customers: u.searchParams.get('query') === 'phone:+919876543210' ? [{ id: 55 }] : [] });
  if (p === '/customers/55/orders.json') return send(200, { orders: [ORDER_NEW] });
  send(404, { errors: 'Not Found' });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, o = { baseUrl: base };
  const cfg = (token) => ({ shop: 'brightkart.myshopify.com', token });
  // shop address safety
  check('plain store name is accepted', S.normalizeShop('Brightkart') === 'brightkart.myshopify.com');
  check('full admin URL is cleaned', S.normalizeShop('https://brightkart.myshopify.com/admin/orders?x=1') === 'brightkart.myshopify.com');
  check('internal and look-alike addresses are refused', [S.normalizeShop('127.0.0.1'), S.normalizeShop('localhost:3000'), S.normalizeShop('evil.com'), S.normalizeShop('a.myshopify.com.evil.com'), S.normalizeShop('169.254.169.254'), S.normalizeShop('')].every((x) => x === null), [S.normalizeShop('127.0.0.1'), S.normalizeShop('evil.com')]);
  // order number detection
  const ex = { '#4821': '4821', 'Refund for order #4897': '4897', 'where is my order no 5123?': '5123', 'Order ID: 6001 not arrived': '6001', 'order 77': '', 'call me on 9876543210': '', 'issue #12': '' };
  check('order numbers are picked out of ticket text', Object.entries(ex).every(([t, w]) => S.orderNumberFrom(t) === w), Object.fromEntries(Object.entries(ex).map(([t]) => [t, S.orderNumberFrom(t)])));
  // connection test
  const t = await S.testConnection(cfg('good'), o);
  check('connection test returns the store name', t.name === 'Brightkart' && t.currency === 'INR', t);
  for (const [tok, kind] of [['bad', 'auth'], ['noscope', 'scope'], ['rate', 'rate'], ['down', 'network']]) {
    let e = null; try { await S.testConnection(cfg(tok), o); } catch (x) { e = x; }
    check('connection test: ' + tok + ' gives a plain "' + kind + '" error', e && e.kind === kind && e.message.length > 20 && !/\bundefined\b/.test(e.message), e && e.message);
  }
  let dead = null; try { await S.testConnection(cfg('good'), { baseUrl: 'http://127.0.0.1:9' }); } catch (x) { dead = x; }
  check('unreachable store gives a network error', dead && dead.kind === 'network', dead && dead.message);
  // lookups
  let r = await S.findOrders(cfg('good'), { orderNumber: '4821' }, o);
  check('find by order number', r.orders.length === 1 && r.orders[0].name === '#4821' && r.matchedBy[0] === 'order number', r.matchedBy);
  const a = r.orders[0];
  check('shipped order has items, city and tracking', a.fulfillment === 'fulfilled' && a.items.length === 2 && a.items[0].qty === 2 && a.shipTo === 'Pune, Maharashtra' && a.tracking[0].number === 'DLV123456' && a.tracking[0].company === 'Delhivery' && a.total === 1499, a);
  check('admin link points at the store', a.adminUrl === 'https://brightkart.myshopify.com/admin/orders/1001', a.adminUrl);
  check('reply sentence mentions tracking', /shipped with Delhivery\. Tracking number: DLV123456/.test(a.summary) && a.summary.startsWith('Your order #4821'), a.summary);
  r = await S.findOrders(cfg('good'), { email: 'vikram@example.com' }, o);
  check('find by email: newest first, three orders', r.orders.map((x) => x.name).join() === '#4900,#4821,#4700', r.orders.map((x) => x.name));
  const c = r.orders.find((x) => x.name === '#4700'), n = r.orders.find((x) => x.name === '#4900');
  check('cancelled order shows the refund', c.cancelled && c.refunded === 799 && /was cancelled and ₹799 has been refunded/.test(c.summary), c.summary);
  check('unpaid new order says waiting for payment', /waiting for payment/.test(n.summary) && n.fulfillment === 'unfulfilled', n.summary);
  r = await S.findOrders(cfg('good'), { email: 'nobody@example.com' }, o);
  check('unknown customer gives an empty list, not an error', r.orders.length === 0);
  const before = calls.length;
  r = await S.findOrders(cfg('good'), { orderNumber: '4821', email: 'vikram@example.com' }, o);
  check('order number and email are merged without duplicates', r.orders.length === 3 && new Set(r.orders.map((x) => x.id)).size === 3 && r.matchedBy.length === 2, r.matchedBy);
  r = await S.findOrders(cfg('good'), { phone: '+919876543210' }, o);
  check('find by phone through the customer record', r.orders.length === 1 && r.orders[0].name === '#4900' && r.matchedBy[0] === 'phone', r);
  r = await S.findOrders(cfg('good'), { email: 'nobody@example.com', phone: '+919999999999' }, o);
  check('phone is only tried when email found nothing, and an unknown number is empty', r.orders.length === 0);
  let e2 = null; try { await S.findOrders(cfg('bad'), { email: 'x@y.com' }, o); } catch (x) { e2 = x; }
  check('lookup with a revoked token says so', e2 && e2.kind === 'auth', e2 && e2.message);
    // Dev Dashboard apps: Client ID and secret are exchanged for a 24-hour token
  const cc = { shop: 'brightkart.myshopify.com', clientId: 'cid', clientSecret: 'sec' };
  const tc = await S.testConnection(cc, o);
  check('client credentials connect and return the store name', tc.name === 'Brightkart', tc);
  await S.findOrders(cc, { orderNumber: '4821' }, o); await S.findOrders(cc, { email: 'vikram@example.com' }, o);
  check('the token is reused, not requested for every call', tokenCalls === 1, tokenCalls);
  validDyn = 'shpat_expired_now';   // Shopify expires the token
  r = await S.findOrders(cc, { orderNumber: '4821' }, o);
  check('an expired token is renewed once and the lookup still works', r.orders.length === 1 && tokenCalls === 2, { tokenCalls, n: r.orders.length });
  let e3 = null; try { await S.testConnection({ shop: 'other.myshopify.com', clientId: 'cid', clientSecret: 'wrong' }, o); } catch (x) { e3 = x; }
  check('wrong client secret gives a plain error naming the Client ID and secret', e3 && e3.kind === 'auth' && /Client ID and secret/.test(e3.message), e3 && e3.message);
  // a secret that failed is not rescued by a token cached for a different secret on the same Client ID
  let e4 = null; try { await S.testConnection({ shop: 'brightkart.myshopify.com', clientId: 'cid', clientSecret: 'not-the-secret' }, o); } catch (x) { e4 = x; }
  check('a wrong secret is refused even right after the right one connected', e4 && e4.kind === 'auth', e4 && e4.message);
  check('requests are read-only apart from the token exchange', calls.filter((c) => c.startsWith('POST')).every((c) => c.includes('/admin/oauth/access_token')));
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
