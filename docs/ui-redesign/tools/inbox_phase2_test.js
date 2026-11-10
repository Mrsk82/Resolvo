// Inbox 2.0, Phase 2: search inside messages, new filters (mood, read, VIP, following, waiting, archived), new sorts, Archive, mark read/unread, counts.
// Run: node docs/ui-redesign/tools/inbox_phase2_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3938, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 360) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-p2-')), app = path.join(tmp, 'app');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite');
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();

// The throwaway copy gets a known admin password, so the test does not depend on whatever the local demo account is set to.
function demoLogin(sq) {
  const bc = require(path.join(ROOT, 'node_modules', 'bcryptjs')), row = sq.prepare("SELECT id,data FROM users WHERE json_extract(data,'$.email')='admin@demo.local'").get();
  const u = JSON.parse(row.data); u.passwordHash = bc.hashSync('demo1234', 10); u.mustChangePassword = false; u.firstLogin = false; u.active = true;
  sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), row.id);
}

function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8'));
  o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  const sq = new Dsql(dbFile());
  sq.prepare('DELETE FROM tickets').run();
  demoLogin(sq);
  const inc = (id, body, min) => ({ id: 'M-' + id + '-in', type: 'incoming', from: id + '@example.test', fromName: id, body, timestamp: iso(min), messageId: '<' + id + '>' });
  const out = (id, body, min) => ({ id: 'M-' + id + '-out', type: 'reply', from: 'admin@demo.local', fromName: 'Admin', body, timestamp: iso(min), sentAsEmail: true, deliveryStatus: 'sent' });
  const mk = (id, o, thread) => ({ id, subject: 'Subject ' + id, status: 'open', priority: 'Medium', from: id.toLowerCase() + '@example.test', fromName: id, createdDate: iso(o.age || 60), lastActivity: iso(o.act || 60), channel: 'email', tags: [], messageIds: [], thread, ...o.t });
  const T = [
    mk('A1', { age: 300, act: 10, t: { sentimentLevel: 'negative', priority: 'High', isVIP: true, tags: ['VIP'], status: 'new' } }, [inc('A1', 'My refund has not arrived, this is unacceptable', 300)]),
    mk('A2', { age: 200, act: 100, t: { sentimentLevel: 'positive', status: 'open' } }, [inc('A2', 'Thanks, the invoice looks great', 200), out('A2', 'Glad to hear it', 150)]),
    mk('A3', { age: 100, act: 50, t: { status: 'pending', watchers: ['admin@demo.local'] } }, [inc('A3', 'Can you change my address?', 100)]),
    mk('A4', { age: 500, act: 400, t: { status: 'resolved' } }, [inc('A4', 'Where is the warranty card?', 500), out('A4', 'It is in the box', 450)]),
    mk('A5', { age: 600, act: 20, t: { status: 'closed' } }, [inc('A5', 'Closed old question', 600)]),
    mk('A6', { age: 30, act: 5, t: { status: 'open', priority: 'High' } }, [inc('A6', 'Fresh question about shipping', 30)]),
  ];
  const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'); T.forEach((t) => ins.run(t.id, JSON.stringify(t)));
  sq.close();
}
let srv, srvLog = '';
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, PORT: String(PORT), MAIL_CAPTURE: path.join(tmp, 'mail.jsonl'), EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-400));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const rpc = (tok, fn, ...a) => post('/api/call', { fn, args: a }, tok);

(async () => {
  build(); await start();
  try {
    const tok = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    check('setup: demo admin signs in', !!tok);
    // ---- the pilot switch: off for every plan until the owner overrides it for a workspace ----
    const flagOf = async () => (await rpc(tok, 'getAllFeatureFlags')).flags.INBOX_PLUS_ENABLED;
    const of = path.join(app, 'data', 'owner.json'), oj = JSON.parse(fs.readFileSync(of, 'utf8'));
    const setPlus = (on) => { oj.brands[0].featureOverrides = { ...(oj.brands[0].featureOverrides || {}), INBOX_PLUS_ENABLED: on }; fs.writeFileSync(of, JSON.stringify(oj)); };
    check('pilot: Inbox 2.0 is off by default, even on Enterprise', (await flagOf()) === false);
    check('pilot: archiving is refused while it is off', (await rpc(tok, 'archiveTickets', ['A4'], true)).success === false);
    setPlus(true);
    check('pilot: the owner can switch it on for one workspace', (await flagOf()) === true);
    const list = async (f) => { const r = await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, ...(f || {}) }); return r; };
    const ids = (r) => r.tickets.map((t) => t.id).sort();

    // ---- search reads the message text ----
    check('search: finds a ticket by words inside a message', JSON.stringify(ids(await list({ search: 'warranty card' }))) === '["A4"]');
    check('search: finds a reply the team wrote, not just the customer', JSON.stringify(ids(await list({ search: 'in the box' }))) === '["A4"]');
    check('search: subject, id and sender still work', ids(await list({ search: 'a1' })).includes('A1') && ids(await list({ search: 'subject a3' })).includes('A3'));
    check('search: no match gives an empty list, not an error', (await list({ search: 'zzzz-nothing' })).tickets.length === 0);

    // ---- filters ----
    check('mood: negative', JSON.stringify(ids(await list({ sentiment: 'negative' }))) === '["A1"]');
    check('mood: positive', JSON.stringify(ids(await list({ sentiment: 'positive' }))) === '["A2"]');
    check('VIP: only VIP customers', JSON.stringify(ids(await list({ vip: true }))) === '["A1"]');
    check('following: only tickets this person follows', JSON.stringify(ids(await list({ following: true }))) === '["A3"]');
    const waiting = await list({ status: 'waiting' });
    check('waiting: open tickets where we spoke last or the customer is asked to reply', JSON.stringify(ids(waiting)) === '["A2","A3"]', ids(waiting));
    check('priority: High (open only)', JSON.stringify(ids(await list({ priority: 'High', active: true }))) === '["A1","A6"]');
    const unreadAll = await list({ read: 'unread' });
    check('unread: every ticket with a customer message nobody opened', ids(unreadAll).length === 6, ids(unreadAll));

    // ---- mark read / unread ----
    let r = await rpc(tok, 'markTicketsRead', ['A1', 'A6'], true);
    check('read: marks tickets read for this person', r.success && r.updated === 2, r);
    check('read: the Unread filter no longer shows them, Read does', !ids(await list({ read: 'unread' })).includes('A1') && JSON.stringify(ids(await list({ read: 'read' }))) === '["A1","A6"]');
    check('read: the ticket flag matches', (await list()).tickets.find((t) => t.id === 'A1').unread === false);
    r = await rpc(tok, 'markTicketsRead', ['A1'], false);
    check('unread: puts it back', r.success && (await list()).tickets.find((t) => t.id === 'A1').unread === true);
    check('read: no ids is refused', !(await rpc(tok, 'markTicketsRead', [], true)).success);

    // ---- sorts ----
    const act = (await list({ sort: 'activity' })).tickets.map((t) => t.id);
    check('sort: latest activity puts the most recently touched first', act[0] === 'A6' && act[1] === 'A1', act);
    const wt = (await list({ sort: 'waiting' })).tickets.map((t) => t.id);
    check('sort: waiting longest puts the oldest unanswered customer message first, answered ones last', wt[0] === 'A1' && wt.indexOf('A6') < wt.indexOf('A2') && wt.indexOf('A3') < wt.indexOf('A2'), wt);

    // ---- archive ----
    r = await rpc(tok, 'archiveTickets', ['A1', 'A4', 'A5'], true);
    check('archive: only finished tickets are archived, an open one is skipped and reported', r.success && r.updated === 2 && r.skipped === 1, r);
    check('archive: archived tickets leave every normal view', !ids(await list()).some((x) => ['A4', 'A5'].includes(x)) && ids(await list()).includes('A1'));
    check('archive: they are all found under Archived', JSON.stringify(ids(await list({ status: 'archived' }))) === '["A4","A5"]');
    check('archive: search still finds an archived ticket when the Archived view is open', JSON.stringify(ids(await list({ status: 'archived', search: 'warranty' }))) === '["A4"]');
    let c = (await list()).counts.inbox;
    check('archive: counts leave them out and show how many are archived', c.archived === 2 && c.all === 4 && c.byStatus.resolved === undefined && c.byStatus.closed === undefined, c);
    check('counts: following, high priority and waiting', c.following === 1 && c.high === 2 && c.waiting === 2, [c.following, c.high, c.waiting]);
    check('counts: by status (open work only, no archived)', c.byStatus.open === 2 && c.byStatus.pending === 1 && c.byStatus.new === 1, c.byStatus);
    // the customer writes again to an archived ticket: it comes back by itself
    const sq = new Dsql(dbFile()), row = sq.prepare("SELECT data FROM tickets WHERE id='A4'").get(), t4 = JSON.parse(row.data);
    t4.thread.push({ id: 'M-A4-in2', type: 'incoming', from: 'a4@example.test', fromName: 'A4', body: 'Still no warranty card!', timestamp: new Date(Date.now() + 1000).toISOString(), messageId: '<A4b>' });
    t4.status = 'open'; sq.prepare("UPDATE tickets SET data=? WHERE id='A4'").run(JSON.stringify(t4)); sq.close();
    check('archive: a new customer message brings the ticket back to the inbox by itself', ids(await list()).includes('A4') && !ids(await list({ status: 'archived' })).includes('A4'));
    r = await rpc(tok, 'archiveTickets', ['A5'], false);
    check('unarchive: moves it back', r.success && r.updated === 1 && ids(await list()).includes('A5'), r);
    r = await rpc(tok, 'archiveTickets', ['NOPE'], true);
    check('archive: an unknown ticket is skipped, nothing breaks', r.success && r.updated === 0 && r.skipped === 1, r);
    check('archive: the change is in the ticket history', (await rpc(tok, 'getTicketById', 'A5')).ticket.timeline.some((e) => e.event === 'unarchived'));

    // ---- history: who assigned and who changed the priority ----
    r = await rpc(tok, 'assignTicket', 'A6', 'admin@demo.local');
    let tl = (await rpc(tok, 'getTicketById', 'A6')).ticket.timeline || [];
    check('history: assigning a ticket is recorded with who and to whom', r.success && tl.some((e) => e.event === 'assigned' && /Assigned to/.test(e.detail) && e.by === 'admin@demo.local'), tl);
    await rpc(tok, 'assignTicket', 'A6', 'admin@demo.local');
    tl = (await rpc(tok, 'getTicketById', 'A6')).ticket.timeline || [];
    check('history: assigning to the same person again adds nothing', tl.filter((e) => e.event === 'assigned').length === 1, tl);
    r = await rpc(tok, 'updateTicketPriority', 'A6', 'Critical');
    tl = (await rpc(tok, 'getTicketById', 'A6')).ticket.timeline || [];
    check('history: a priority change is recorded with the old and new value', r.success && tl.some((e) => e.event === 'priority_changed' && /High .* Critical/.test(e.detail)), tl);
    await rpc(tok, 'updateTicketPriority', 'A6', 'Critical');
    check('history: setting the same priority again adds nothing', ((await rpc(tok, 'getTicketById', 'A6')).ticket.timeline || []).filter((e) => e.event === 'priority_changed').length === 1);

    // ---- rollback: switching the pilot off brings archived tickets straight back ----
    await rpc(tok, 'archiveTickets', ['A5'], true);
    check('rollback: before switching off, the ticket is archived and hidden', !ids(await list()).includes('A5'));
    setPlus(false);
    const back = await list();
    check('rollback: with the switch off, archived tickets show in the normal list again', ids(back).includes('A5') && back.counts.inbox.archived === 0, [ids(back), back.counts.inbox.archived]);
    check('rollback: the switch reads off again', (await flagOf()) === false);

    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-300));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
