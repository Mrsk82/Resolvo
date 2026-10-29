// A fake Shopify store for testing the order lookup against the showcase workspace. Run: node mock_shopify.js [port]
// The Resolvo server must be started with SHOPIFY_TEST_BASE=http://127.0.0.1:<port> so its Shopify calls come here.
const http = require('http');
const PORT = +process.argv[2] || 4599;
const addr = (city, province) => ({ city, province });
const orders = [
  { id: 9001, name: '#4821', order_number: 4821, created_at: '2026-10-20T10:00:00+05:30', financial_status: 'paid', fulfillment_status: 'fulfilled', total_price: '1499.00', currency: 'INR', email: 'vikram.chopra@mailbox.example',
    line_items: [{ title: 'Ceramic planter (large)', quantity: 2 }, { title: 'Brass tray', quantity: 1 }], shipping_address: addr('Pune', 'Maharashtra'), refunds: [],
    fulfillments: [{ status: 'success', tracking_company: 'Delhivery', tracking_numbers: ['DLV8821450'], tracking_urls: ['https://www.delhivery.com/track/package/DLV8821450'] }] },
  { id: 9002, name: '#4897', order_number: 4897, created_at: '2026-10-12T09:00:00+05:30', cancelled_at: '2026-10-14T09:00:00+05:30', financial_status: 'refunded', fulfillment_status: null, total_price: '799.00', currency: 'INR', email: 'vikram.bhatt@mailbox.example',
    line_items: [{ title: 'Cotton bedsheet', quantity: 1 }], shipping_address: addr('Mumbai', 'Maharashtra'), fulfillments: [], refunds: [{ transactions: [{ kind: 'refund', status: 'success', amount: '799.00' }] }] },
  { id: 9003, name: '#4895', order_number: 4895, created_at: '2026-10-21T10:00:00+05:30', financial_status: 'paid', fulfillment_status: null, total_price: '2250.00', currency: 'INR', email: 'sanjay.kapoor@mailbox.example',
    line_items: [{ title: 'Diwali gift hamper', quantity: 1 }], shipping_address: addr('Delhi', 'Delhi'), fulfillments: [], refunds: [] },
  { id: 9004, name: '#4893', order_number: 4893, created_at: '2026-10-21T08:00:00+05:30', financial_status: 'paid', fulfillment_status: 'partial', total_price: '3100.00', currency: 'INR', email: 'tanvi.bose@mailbox.example',
    line_items: [{ title: 'Scented candles', quantity: 4 }, { title: 'Wooden coasters', quantity: 2 }], shipping_address: addr('Kolkata', 'West Bengal'), refunds: [],
    fulfillments: [{ status: 'success', tracking_company: 'Blue Dart', tracking_numbers: ['BD55120'], tracking_urls: ['https://www.bluedart.com/tracking?BD55120'] }] },
  { id: 9005, name: '#4650', order_number: 4650, created_at: '2026-09-02T08:00:00+05:30', financial_status: 'paid', fulfillment_status: 'fulfilled', total_price: '599.00', currency: 'INR', email: 'tanvi.bose@mailbox.example',
    line_items: [{ title: 'Incense set', quantity: 1 }], shipping_address: addr('Kolkata', 'West Bengal'), refunds: [], fulfillments: [{ status: 'success', tracking_company: 'India Post', tracking_numbers: ['EE123IN'], tracking_urls: [] }] },
  { id: 9006, name: '#4880', order_number: 4880, created_at: '2026-10-25T08:00:00+05:30', financial_status: 'paid', fulfillment_status: null, total_price: '12500.00', currency: 'INR', email: 'arjun@example.com',
    line_items: [{ title: 'Corporate gift box (set of 20)', quantity: 1 }], shipping_address: addr('Gurugram', 'Haryana'), fulfillments: [], refunds: [] },
];
let dyn = null, tokens = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let tok = req.headers['x-shopify-access-token'];
  const send = (c, b) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (req.method === 'POST' && u.pathname === '/admin/oauth/access_token') { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { let j = {}; try { j = JSON.parse(b); } catch (e) {} if (j.client_id === 'democlient1' && j.client_secret === 'demosecret123') { dyn = 'shpat_dynamic' + (++tokens); return send(200, { access_token: dyn, expires_in: 86399 }); } send(400, { error: 'invalid_client' }); }); return; }
  if (tok && tok.startsWith('shpat_dynamic')) tok = tok === dyn ? 'shpat_demotoken000000' : 'expired';
  if (tok !== 'shpat_demotoken000000') return send(401, { errors: 'Invalid API key or access token' });
  const p = u.pathname.replace(/^\/admin\/api\/[^/]+/, '');
  if (p === '/shop.json') return send(200, { shop: { name: 'Brightkart', domain: 'brightkart.in', currency: 'INR' } });
  if (p === '/orders.json') {
    const name = u.searchParams.get('name'), email = (u.searchParams.get('email') || '').toLowerCase();
    return send(200, { orders: orders.filter((o) => (name && o.name === name) || (email && o.email === email)) });
  }
  if (p === '/customers/search.json') return send(200, { customers: /919871965129/.test(u.searchParams.get('query') || '') ? [{ id: 77 }] : [] });
  if (p === '/customers/77/orders.json') return send(200, { orders: [orders[5]] });
  send(404, { errors: 'Not Found' });
}).listen(PORT, '127.0.0.1', () => console.log('mock Shopify on ' + PORT));
