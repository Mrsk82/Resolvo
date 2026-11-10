// Ticket import, on the server: preview, batches, silent history (no SLA, no unread, no escalation or automation, no queue assignment, no email),
// duplicates, limits, permissions, and removing an import. Throwaway copy on :3941; email goes to a capture file.
// Run: node docs/ui-redesign/tools/ticket_import_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3941, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 360) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-imp-')), app = path.join(tmp, 'app'), mailFile = path.join(tmp, 'mail.jsonl');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite');
const iso = (hAgo) => new Date(Date.now() - hAgo * 3600000).toISOString();

function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8')); o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  const sq = new Dsql(dbFile()), hash = bc.hashSync('demo1234', 10);
  sq.prepare('DELETE FROM tickets').run();
  for (const r of sq.prepare('SELECT id,data FROM users').all()) { const u = JSON.parse(r.data); if (u.email === 'admin@demo.local') { u.passwordHash = hash; u.mustChangePassword = false; u.firstLogin = false; sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r.id); } }
  const agent = { id: 'USR-AGENT01', email: 'sam@demo.local', name: 'Sam Agent', team: 'Support', role: 'Agent', skill: '', slackId: '', maxTickets: 10, active: true, createdDate: iso(1000), passwordHash: hash, firstLogin: false, mustChangePassword: false, availabilityStatus: 'available' };
  sq.prepare('INSERT OR REPLACE INTO users(id,data) VALUES(?,?)').run(agent.id, JSON.stringify(agent));
  const mk = (id, extra) => ({ id, subject: 'Normal ticket ' + id, status: 'open', priority: 'Medium', from: id.toLowerCase() + '@example.test', fromName: id, createdDate: iso(100), lastActivity: iso(100), channel: 'email', tags: [], messageIds: [], thread: [{ id: 'M' + id, type: 'incoming', from: id.toLowerCase() + '@example.test', body: 'Hi', timestamp: iso(100), messageId: '<' + id + '>' }], ...extra });
  const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)');
  ins.run('CTRL1', JSON.stringify(mk('CTRL1'))); ins.run('CTRL2', JSON.stringify(mk('CTRL2', { status: 'new' })));
  const kv = sq.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  kv.run('escalationRules', JSON.stringify([{ id: 'ESC1', name: 'Escalate old', enabled: true, afterHours: 1, action: 'mark_escalated' }]));
  kv.run('automationRules', JSON.stringify([{ id: 'AUT1', name: 'Assign old', enabled: true, trigger: { type: 'ticket_age', afterHours: 1 }, conditions: [], actions: [{ type: 'assign_agent', mode: 'specific', agentEmail: 'sam@demo.local' }] }]));
  kv.run('queueConfig', JSON.stringify({ enabled: true, agents: [{ email: 'sam@demo.local', inQueue: true }, { email: 'admin@demo.local', inQueue: true }] }));
  sq.close();
}
let srv, srvLog = '';
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, PORT: String(PORT), MAIL_CAPTURE: mailFile, EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-400));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const rpc = (tok, fn, ...a) => post('/api/call', { fn, args: a }, tok);
const mails = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean) : []);

const MAP = { externalId: 'id', subject: 'subject', email: 'requester email', name: 'requester', body: 'description', status: 'status', priority: 'priority', created: 'requested', updated: 'updated', resolved: 'solved at', assignee: 'assignee', tags: 'tags' };
const mkRows = (n, from) => Array.from({ length: n }, (_, i) => { const k = (from || 0) + i; return { id: String(1000 + k), subject: 'Imported question ' + k, 'requester email': 'cust' + (k % 700) + '@example.org', requester: 'Customer ' + (k % 700), description: k % 3 ? '<p>Where is my order ' + k + '?</p>' : '', status: ['open', 'pending', 'solved', 'closed', 'new', 'hold'][k % 6], priority: ['low', 'normal', 'high', 'urgent'][k % 4], requested: '15/01/2023 10:30', updated: '16/01/2023 09:00', 'solved at': k % 6 === 2 ? '16/01/2023 09:00' : '', assignee: k === 0 ? 'Sam Agent' : (k === 1 ? 'Someone Else' : ''), tags: 'old-system vip' }; });
async function importAll(tok, rows, meta, map, opts) {
  const st = await rpc(tok, 'startTicketImport', { total: rows.length, source: 'zendesk', fileName: 'tickets.csv', ...(meta || {}) });
  if (!st.success) return { st };
  let created = 0, skipped = 0, dupes = 0;
  for (let i = 0; i < rows.length; i += 300) { const b = await rpc(tok, 'importTicketBatch', st.importId, rows.slice(i, i + 300), map || MAP, opts || { dateOrder: 'dmy' }); if (!b.success) return { st, b }; created += b.created; skipped += b.skipped; dupes += b.duplicates; }
  const fin = await rpc(tok, 'finishTicketImport', st.importId);
  return { st, fin, created, skipped, dupes, id: st.importId };
}

(async () => {
  build(); await start();
  try {
    const tok = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    const agentTok = (await post('/api/login', { email: 'sam@demo.local', password: 'demo1234' })).token;
    check('setup: admin and agent sign in', !!tok && !!agentTok);

    // ---- permissions and basic validation ----
    for (const [fn, a] of [['getTicketImports', []], ['detectTicketImport', [['a']]], ['previewTicketImport', [[{ a: 1 }], MAP, {}]], ['startTicketImport', [{ total: 5 }]], ['importTicketBatch', ['x', [], MAP, {}]], ['undoTicketImport', ['x']]]) {
      const r = await rpc(agentTok, fn, ...a);
      check('permission: an agent cannot use ' + fn, r.success === false, r);
    }
    let r = await rpc(tok, 'detectTicketImport', ['ID', 'Requester', 'Requester email', 'Subject', 'Status', 'Solved at']);
    check('detect: Zendesk columns are recognised and mapped', r.success && r.source === 'zendesk' && r.map.email === 'Requester email' && r.map.resolved === 'Solved at', r);
    r = await rpc(tok, 'previewTicketImport', mkRows(3), { ...MAP, email: '' }, {});
    check('preview: no email column chosen is refused with a clear message', !r.success && /email/i.test(r.error), r);

    // ---- preview ----
    const rows = mkRows(12); rows.push({ id: '9001', subject: 'No email here', 'requester email': '', requester: 'Nobody', status: 'open' }); rows.push({ id: '9002', subject: 'Odd status', 'requester email': 'odd@example.org', status: 'Brand New Thing', requested: 'garbage' }); rows.push({ id: '9003', subject: 'Spam', 'requester email': 'sp@example.org', status: 'spam' });
    r = await rpc(tok, 'previewTicketImport', rows, MAP, { source: 'zendesk', dateOrder: 'dmy' });
    check('preview: counts what would import and what would be skipped, and why', r.success && r.ok === 13 && r.skipped['no customer email'] === 1 && r.skipped['spam or deleted'] === 1 && r.total === 15, r);
    check('preview: reports unknown statuses, unreadable dates and rows without message text', r.unknownStatus['Brand New Thing'] === 1 && r.noDate === 1 && r.noBody >= 4, [r.unknownStatus, r.noDate, r.noBody]);
    check('preview: shows the first rows as Resolvo will see them (dates in India time)', r.sample.length === 6 && r.sample[0].created === '2023-01-15 10:30' && r.sample[0].status === 'open' && r.sample[0].priority === 'Low', r.sample[0]);
    check('preview: saves nothing', (await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 50 })).total === 2);
    check('preview: too many rows is flagged', (await rpc(tok, 'previewTicketImport', Array.from({ length: 20001 }, () => ({ 'requester email': 'a@b.co' })), MAP, {})).tooMany === true);

    // ---- start rules ----
    r = await rpc(tok, 'startTicketImport', { total: 0 }); check('start: an empty file is refused', !r.success, r);
    r = await rpc(tok, 'startTicketImport', { total: 20001 }); check('start: more than 20,000 rows is refused with the limit stated', !r.success && /20000/.test(r.error), r);

    // ---- a real import ----
    const imp = await importAll(tok, mkRows(30), {});
    check('import: 30 rows become 30 tickets, nothing skipped', imp.fin && imp.fin.success && imp.created === 30 && imp.skipped === 0 && imp.dupes === 0 && imp.fin.import.status === 'done', [imp.created, imp.skipped, imp.dupes, imp.b]);
    const all = await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, tag: 'imported' });
    const T = all.tickets, one = (k) => T.find((t) => t.externalId === String(1000 + k));
    check('tickets: arrive tagged imported, marked imported, in the normal inbox (not in promotions)', all.total === 30 && T.every((t) => t.imported && t.tags.includes('imported') && t.tags.includes('old-system') && !t.isPromo), [all.total, T[0] && T[0].tags]);
    check('tickets: history is IST dated and kept (created, last update, solved)', one(2).createdDate.startsWith('2023-01-15T10:30') && one(2).status === 'resolved' && one(2).resolvedDate && one(2).resolvedDate.startsWith('2023-01-16T09:00'), [one(2).createdDate, one(2).resolvedDate]);
    check('tickets: status words are mapped (open, pending, resolved, closed, new, on-hold)', ['open', 'pending', 'resolved', 'closed', 'new', 'on-hold'].every((s, i) => one(i).status === s), [0, 1, 2, 3, 4, 5].map((i) => one(i).status));
    check('tickets: priority words are mapped', one(0).priority === 'Low' && one(1).priority === 'Medium' && one(2).priority === 'High' && one(3).priority === 'Critical');
    const full = (await rpc(tok, 'getTicketById', one(1).id)).ticket, full3 = (await rpc(tok, 'getTicketById', one(3).id)).ticket;
    check('tickets: the customer message is plain text; a missing message gets a note saying so', full.thread[0].type === 'incoming' && /Where is my order 1/.test(full.thread[0].body) && !/</.test(full.thread[0].body) && full3.thread[0].type === 'note' && /no message text/.test(full3.thread[0].body), [full.thread[0], full3.thread[0]]);
    check('tickets: the history shows where it came from and the old ticket number', full.timeline[0].event === 'imported' && /Zendesk/.test(full.timeline[0].detail) && /1001/.test(full.timeline[0].detail), full.timeline);
    const t0 = (await rpc(tok, 'getTicketById', one(0).id)).ticket;
    check('agent: matched to a real team member by name, never to someone unknown (kept as text)', t0.assignedTo === 'sam@demo.local' && !one(1).assignedTo && full.importedAgent === 'Someone Else', [t0.assignedTo, full.importedAgent]);
    check('search: an old ticket is found by its number in the old help desk', (await rpc(tok, 'getTickets', { status: 'all', promo: 'all', search: '1007', limit: 50 })).tickets.some((t) => t.externalId === '1007'));

    // ---- silent: no clock, no unread, no automations, no queue, no mail ----
    check('silent: no response-time clock (never breached, even years later)', T.every((t) => t.slaBreached === false && !t.slaRisk), T.find((t) => t.slaBreached));
    check('silent: not unread for anyone', T.every((t) => t.unread === false) && (await rpc(agentTok, 'getTickets', { status: 'all', promo: 'all', limit: 100, tag: 'imported' })).tickets.every((t) => t.unread === false));
    const counts = (await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 5 })).counts.inbox;
    check('counts: imported open tickets are real pending work and are counted', counts.all === 32 && counts.unassigned >= 20, counts);
    const esc = await rpc(tok, 'runEscalationCheck');
    check('silent: the escalation rule fires for an old normal ticket but not for imported history', esc.success && esc.escalated === 2 && (await rpc(tok, 'getTicketById', 'CTRL1')).ticket.status === 'escalated' && (await rpc(tok, 'getTicketById', one(0).id)).ticket.status === 'open', esc);
    const aut = await rpc(tok, 'runAutomationCheck');
    check('silent: the age automation fires for normal tickets but not for imported history', aut.success && aut.fired === 2 && !(await rpc(tok, 'getTicketById', one(1).id)).ticket.automationFired, aut);
    const dist = await rpc(tok, 'distributeUnassignedTickets');
    const newOnes = (await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, tag: 'imported' })).tickets.filter((t) => t.status === 'new');
    check('silent: the assignment queue never hands imported history to an agent', newOnes.length > 0 && newOnes.every((t) => !t.assignedTo || t.assignedTo === 'sam@demo.local' && t.externalId === '1000'), [dist, newOnes.map((t) => [t.externalId, t.assignedTo])]);
    check('silent: no email went to any imported customer', !mails().some((l) => /example\.org/.test(l)), mails().filter((l) => /example\.org/.test(l)).slice(0, 2));
    const notes = await rpc(tok, 'getInAppNotifications');
    check('silent: no alert about imported tickets in the bell', !notes.notifications.some((n) => /Imported question/.test(n.body || '')), notes.notifications.map((n) => n.title));

    // ---- again: no duplicates ----
    const again = await importAll(tok, mkRows(30), {});
    check('duplicates: importing the same file again creates nothing new', again.created === 0 && again.dupes === 30, [again.created, again.dupes]);
    const more = await importAll(tok, mkRows(40), {});
    check('duplicates: a bigger file with the same first rows only adds the new ones', more.created === 10 && more.dupes === 30, [more.created, more.dupes]);

    // ---- batch rules ----
    const st2 = await rpc(tok, 'startTicketImport', { total: 600, source: 'zendesk', fileName: 'x.csv' });
    check('start: a 600-row import can start', st2.success, st2);
    const blocked = await rpc(tok, 'startTicketImport', { total: 5 });
    check('start: a second import cannot start while one is still running', !blocked.success && /still running/.test(blocked.error), blocked);
    check('batch: more than 500 rows in one step is refused', (await rpc(tok, 'importTicketBatch', st2.importId, mkRows(501, 5000), MAP, {})).success === false);
    check('batch: a step for an import that is not running is refused', (await rpc(tok, 'importTicketBatch', 'IMP-NOPE', mkRows(2), MAP, {})).success === false);
    await rpc(tok, 'finishTicketImport', st2.importId);

    // ---- a big file ----
    const t0ms = Date.now(), big = await importAll(tok, mkRows(5000, 100000), {});
    const secs = (Date.now() - t0ms) / 1000;
    check('big file: 5,000 tickets in 17 steps, all created, in ' + secs.toFixed(1) + ' s', big.created === 5000 && secs < 40, [big.created, secs]);
    const lt = Date.now(), lst = await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 25 }); const lms = Date.now() - lt;
    check('big file: the inbox list is still fast (' + lms + ' ms)', lst.success && lms < 2500 && lst.total >= 5000, lms);

    // ---- removing an import ----
    const ours = (await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, search: '1010' })).tickets.find((t) => t.externalId === '1010');
    await rpc(tok, 'replyToTicket', ours.id, 'We are checking', true);   // the team added a note: this one must survive the removal
    const listBefore = (await rpc(tok, 'getTicketImports')).imports;
    check('log: past imports are listed with their numbers', listBefore.length >= 4 && listBefore.some((x) => x.id === imp.id && x.created === 30 && x.fileName === 'tickets.csv'), listBefore.map((x) => [x.id, x.created, x.status]));
    const un = await rpc(tok, 'undoTicketImport', imp.id);
    check('remove: deletes what the import created, keeps a ticket the team has worked on', un.success && un.removed === 29 && un.kept === 1 && un.import.status === 'removed', un);
    const after = await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, search: '1010' });
    check('remove: the worked-on ticket is still there, the others are gone, normal tickets are untouched', after.tickets.some((t) => t.externalId === '1010') && !(await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100, search: '1011' })).tickets.some((t) => t.externalId === '1011') && (await rpc(tok, 'getTicketById', 'CTRL1')).success);
    const un2 = await rpc(tok, 'undoTicketImport', imp.id);
    check('remove: removing twice is harmless', un2.success && un2.removed === 0, un2);
    const re = await importAll(tok, mkRows(5), {});
    check('remove: after removal the same rows can be imported again', re.created >= 4, [re.created, re.dupes]);

    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-300));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
