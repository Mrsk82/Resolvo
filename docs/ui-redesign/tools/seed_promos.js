// Test helper: adds (or removes) a few newsletter-style tickets and one real customer ticket to the LOCAL demo brand.
// Usage: node seed_promos.js            add them
//        node seed_promos.js --remove   delete them again
const path = require('path');
const Database = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3'));
const db = new Database(path.join(__dirname, '..', '..', '..', 'data', 'brands', 'demo', 'db.sqlite'));
const IDS = ['TKT-PROMO-1', 'TKT-PROMO-2', 'TKT-PROMO-3', 'TKT-PROMO-4', 'TKT-REAL-1'];
if (process.argv.includes('--remove')) { IDS.forEach(id => db.prepare('DELETE FROM tickets WHERE id=?').run(id)); console.log('removed'); process.exit(0); }
const now = Date.now(), iso = h => new Date(now - h * 3600000).toISOString();
const mk = (id, from, name, subj, body, h) => ({ id, subject: subj, from, fromName: name, body, status: 'new', priority: 'Medium', assignedTo: '', createdDate: iso(h), lastActivity: iso(h), channel: 'email', source: 'email', tags: [], type: '', cc: [],
  thread: [{ id: 'MSG-' + id, type: 'incoming', from, fromName: name, body, timestamp: iso(h) }] });
const rows = [
  mk('TKT-PROMO-1', 'news@mail.apollo.io', 'Apollo', 'Your weekly product update', 'Big news this week. Unsubscribe any time at the bottom of this email.', 30),
  mk('TKT-PROMO-2', 'noreply@uptimerobot.com', 'UptimeRobot', 'Monitor is DOWN', 'We detected an incident on your monitor.', 20),
  mk('TKT-PROMO-3', 'team@producthunt.com', 'Product Hunt Weekly', 'Pull my paw', 'Read this in your browser. To stop receiving these emails, update your email preferences.', 10),
  mk('TKT-PROMO-4', 'hello@bigbrand.example', 'BigBrand', 'Autumn offers', 'You are receiving this email because you signed up. Unsubscribe here.', 8),
  mk('TKT-REAL-1', 'priya.test@gmail.com', 'Priya Test', 'Where is my order 4821?', 'Hi, my order has not arrived and I need it by Friday. Can you check?', 2)
];
rows.forEach(r => db.prepare('INSERT OR REPLACE INTO tickets(id,data) VALUES(?,?)').run(r.id, JSON.stringify(r)));
console.log('added', rows.length);
