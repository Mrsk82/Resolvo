// Seeds a throwaway copy of the demo workspace for the Live team 2 screen test (same scenario as live_more_test.js):
// an incident ("payment failed", 7 customers), SLA tickets, a silent WhatsApp channel, history for the forecast, a manager, agents in two teams.
// Usage: node live_more_seed.js <db.sqlite> <repo root>
const path = require('path');
const [, , dbFile0, ROOT] = process.argv;
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const MIN = 60000, iso = (minAgo) => new Date(Date.now() - minAgo * MIN).toISOString();
const dbFile = () => dbFile0;
const sq = new Dsql(dbFile()), hash = bc.hashSync('demo1234', 10);
sq.prepare('DELETE FROM tickets').run();
for (const r of sq.prepare('SELECT id,data FROM users').all()) { const u = JSON.parse(r.data); if (u.email === 'admin@demo.local') { u.passwordHash = hash; u.mustChangePassword = false; u.firstLogin = false; u.availabilityStatus = 'available'; sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r.id); } }
const user = (id, email, name, role, extra) => sq.prepare('INSERT OR REPLACE INTO users(id,data) VALUES(?,?)').run(id, JSON.stringify({ id, email, name, team: 'Alpha', role, skill: '', slackId: '', maxTickets: 10, active: true, createdDate: iso(100000), passwordHash: hash, firstLogin: false, mustChangePassword: false, availabilityStatus: 'available', ...extra }));
user('U-MIRA', 'mira@demo.local', 'Mira Manager', 'Manager'); user('U-SAM', 'sam@demo.local', 'Sam Agent', 'Agent', { maxTickets: 5 });
user('U-RAVI', 'ravi@demo.local', 'Ravi Away', 'Agent', { availabilityStatus: 'away' }); user('U-TINA', 'tina@demo.local', 'Tina Beta', 'Agent', { team: 'Beta' });
const inc = (id, subj, body, m, who) => ({ id: 'MI-' + id + '-' + m, type: 'incoming', from: (who || id.toLowerCase()) + '@example.test', fromName: 'Cust ' + (who || id), body, timestamp: iso(m), messageId: '<' + id + m + '>' });
const rep = (id, by, m, extra) => ({ id: 'MR-' + id + '-' + m, type: 'reply', from: by, fromName: by, body: 'We are on it', timestamp: iso(m), sentAsEmail: true, deliveryStatus: 'sent', ...(extra || {}) });
const mk = (id, subj, o) => ({ id, subject: subj, status: 'open', priority: 'Medium', from: ((o.who || id)).toLowerCase() + '@example.test', fromName: 'Cust ' + (o.who || id), assignedTo: '', createdDate: iso(o.created), lastActivity: iso(o.last == null ? o.created : o.last), channel: o.channel || 'email', tags: [], messageIds: [], thread: o.thread || [inc(id, subj, o.body || subj, o.created, o.who)], ...(o.t || {}) });
const T = [];
// --- an incident in the last 40 minutes: 7 customers, "payment failed" in different words
const pay = ['Payment failed at checkout', 'My payment failed but money was charged', 'payment failed again', 'Checkout payment failed, order not placed', 'Card payment failed twice', 'Payment failed - please fix', 'Payment failed on mobile app'];
pay.forEach((s, i) => T.push(mk('PAY' + i, s, { created: 5 + i * 5, body: s + '. The payment failed and I was charged.' })));
// --- left out of detection: imported history, a newsletter, the same customer many times, too few customers
T.push(mk('PIMP', 'Payment failed at checkout', { created: 20, t: { imported: true, source: 'import' } }));
T.push(mk('PNEWS', 'Payment failed newsletter', { created: 20, t: { from: 'newsletter@mail.example.test', isBulk: true } }));
for (let i = 0; i < 5; i++) T.push(mk('REF' + i, 'Refund status please', { created: 10 + i, who: i < 3 ? 'same' : 'other', body: 'Where is my refund status' }));
for (let i = 0; i < 4; i++) T.push(mk('CRA' + i, 'App crashes on startup', { created: 30 + i, body: 'The app crashes on startup' }));
// --- normal traffic over the last days (the baseline) with varied topics, two of them about payments
const topics = ['Invoice copy needed', 'Change my delivery address', 'Cancel my subscription', 'Warranty claim for headphones', 'Bulk pricing request', 'Coupon code not working', 'Login help', 'Wrong size delivered', 'Product stopped working', 'Payment method update'];
for (let i = 0; i < 24; i++) T.push(mk('OLD' + i, topics[i % topics.length], { created: 6 * 60 + i * 5 * 60, body: topics[i % topics.length] + ' please', t: { status: 'resolved', resolvedDate: iso(6 * 60 + i * 5 * 60 - 30) } }));
// --- the people-and-SLA scenario
T.push(mk('S1', 'Where is my parcel', { created: 50, t: { assignedTo: 'sam@demo.local' } }));
T.push(mk('S3', 'Thanks', { created: 40, last: 3, thread: [inc('S3', 'Thanks', 'Hi', 40), rep('S3', 'sam@demo.local', 3)], t: { assignedTo: 'sam@demo.local', firstResponseAt: iso(3), firstResponseMinutes: 37 } }));
T.push(mk('B1', 'Site is down', { created: 360, t: { assignedTo: 'sam@demo.local', priority: 'Critical' } }));
T.push(mk('H1', 'Dashboard slow', { created: 470, t: { assignedTo: 'tina@demo.local', priority: 'High' } }));
T.push(mk('RESS', 'Solved one', { created: 100, t: { status: 'resolved', resolvedDate: iso(10), assignedTo: 'sam@demo.local' } }));
T.push(mk('RES2', 'Solved fast', { created: 90, t: { status: 'resolved', resolvedDate: iso(15), assignedTo: 'ravi@demo.local', firstResponseAt: iso(20), firstResponseMinutes: 5 } }));
T.push(mk('FAILD', 'Reply that failed', { created: 120, last: 100, thread: [inc('FAILD', 'Reply that failed', 'hello', 120), rep('FAILD', 'sam@demo.local', 100, { deliveryStatus: 'failed' })], t: { assignedTo: 'tina@demo.local' } }));
// --- WhatsApp: busy at these hours every day, then silent for 5 hours today
for (let d = 1; d <= 7; d++) for (let off = 1; off <= 6; off++) for (let k = 0; k < 2; k++) { const m = d * 24 * 60 + off * 60 + k * 7; T.push(mk('WA' + d + '_' + off + '_' + k, 'WhatsApp chat', { created: m, channel: 'whatsapp', t: { status: 'resolved', resolvedDate: iso(m - 20) } })); }
T.push(mk('WA_TODAY', 'WhatsApp chat today', { created: 330, channel: 'whatsapp', t: { status: 'resolved', resolvedDate: iso(300) } }));
const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'); T.forEach((t) => ins.run(t.id, JSON.stringify(t)));
const kv = sq.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
kv.run('whatsappConfig', JSON.stringify({ number: '+15550001', accountSid: 'ACx', authToken: 'x' })); kv.run('emailTicketing', JSON.stringify({ enabled: true, host: 'imap.example.test', user: 'support@example.test', pass: 'x' }));
sq.close();
