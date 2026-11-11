// Seeds a throwaway copy of the demo workspace for the Live team screen test: a manager, three agents (one away, one quiet, one busy) and tickets in every state.
// Usage: node live_team_seed.js <db.sqlite> <repo root>     (same scenario as live_team_test.js)
const path = require('path');
const [, , dbFile, ROOT] = process.argv;
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const MIN = 60000, iso = (m) => new Date(Date.now() - m * MIN).toISOString();
const sq = new Dsql(dbFile), hash = bc.hashSync('demo1234', 10);
sq.prepare('DELETE FROM tickets').run();
for (const r of sq.prepare('SELECT id,data FROM users').all()) { const u = JSON.parse(r.data); if (u.email === 'admin@demo.local') { u.passwordHash = hash; u.mustChangePassword = false; u.firstLogin = false; u.availabilityStatus = 'available'; sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r.id); } }
const user = (id, email, name, role, extra) => sq.prepare('INSERT OR REPLACE INTO users(id,data) VALUES(?,?)').run(id, JSON.stringify({ id, email, name, team: 'Support', role, skill: '', slackId: '', maxTickets: 10, active: true, createdDate: iso(100000), passwordHash: hash, firstLogin: false, mustChangePassword: false, availabilityStatus: 'available', ...extra }));
user('U-MIRA', 'mira@demo.local', 'Mira Manager', 'Manager'); user('U-SAM', 'sam@demo.local', 'Sam Agent', 'Agent', { maxTickets: 5 });
user('U-RAVI', 'ravi@demo.local', 'Ravi Away', 'Agent', { availabilityStatus: 'away' }); user('U-TINA', 'tina@demo.local', 'Tina Quiet', 'Agent');
const inc = (id, body, m) => ({ id: 'MI-' + id + '-' + m, type: 'incoming', from: id.toLowerCase() + '@example.test', fromName: 'Cust ' + id, body, timestamp: iso(m), messageId: '<' + id + m + '>' });
const rep = (id, by, m) => ({ id: 'MR-' + id + '-' + m, type: 'reply', from: by, fromName: by, body: 'We are on it', timestamp: iso(m), sentAsEmail: true, deliveryStatus: 'sent' });
const note = (id, by, m) => ({ id: 'MN-' + id + '-' + m, type: 'note', from: by, fromName: by, body: 'checking', timestamp: iso(m) });
const mk = (id, o) => ({ id, subject: 'Subject ' + id, status: 'open', priority: 'Medium', from: id.toLowerCase() + '@example.test', fromName: 'Cust ' + id, assignedTo: '', createdDate: iso(o.created), lastActivity: iso(o.last == null ? o.created : o.last), channel: 'email', tags: [], messageIds: [], thread: o.thread, ...(o.t || {}) });
const T = [
  mk('S1', { created: 50, thread: [inc('S1', 'Where is my order?', 50)], t: { assignedTo: 'sam@demo.local' } }),
  mk('S2', { created: 5, thread: [inc('S2', 'This is unacceptable', 5)], t: { assignedTo: 'sam@demo.local', sentimentLevel: 'negative' } }),
  mk('S3', { created: 40, last: 3, thread: [inc('S3', 'Hi', 40), rep('S3', 'sam@demo.local', 3)], t: { assignedTo: 'sam@demo.local' } }),
  mk('B1', { created: 360, thread: [inc('B1', 'Site is down', 360)], t: { assignedTo: 'sam@demo.local', priority: 'Critical' } }),
  mk('R1', { created: 100, last: 30, thread: [inc('R1', 'Help', 100), rep('R1', 'ravi@demo.local', 60), inc('R1', 'Still waiting', 30)], t: { assignedTo: 'ravi@demo.local' } }),
  mk('T1', { created: 100, last: 40, thread: [inc('T1', 'Refund?', 40), note('T1', 'tina@demo.local', 90)], t: { assignedTo: 'tina@demo.local' } }),
  mk('U1', { created: 12, thread: [inc('U1', 'Hello', 12)] }), mk('U2', { created: 15, thread: [inc('U2', 'Hello', 15)] }),
  mk('U3', { created: 80, thread: [inc('U3', 'VIP here', 80)], t: { isVIP: true, tags: ['VIP'] } }),
  mk('RES', { created: 20, thread: [inc('RES', 'Thanks', 20)], t: { status: 'resolved', resolvedDate: iso(10) } }),
  mk('Y1', { created: 24 * 60 + 30, thread: [inc('Y1', 'Old', 24 * 60 + 30)], t: { status: 'resolved', resolvedDate: iso(24 * 60) } }),
  mk('X', { created: 4320, thread: [inc('X', 'Imported history', 4320)], t: { imported: true, source: 'import' } }),
];
const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'); T.forEach((t) => ins.run(t.id, JSON.stringify(t)));
sq.close();
