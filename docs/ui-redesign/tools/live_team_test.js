// Live team (supervisor board), on the server: the live numbers, what is left out, per-agent cards, the "needs a hand" list, alert limits, moving tickets,
// nudges, the bell, the alert job (no repeats), history and speed. Throwaway copy on :3945; email goes to a capture file.
// Run: node docs/ui-redesign/tools/live_team_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3945, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 380) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-live-')), app = path.join(tmp, 'app'), mailFile = path.join(tmp, 'mail.jsonl');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite'), ownerFile = () => path.join(app, 'data', 'owner.json');
const MIN = 60000, iso = (minAgo) => new Date(Date.now() - minAgo * MIN).toISOString();

function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8')); o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = [];
  o.brands[0].featureOverrides = { ...(o.brands[0].featureOverrides || {}), INBOX_PLUS_ENABLED: true };
  fs.writeFileSync(ownerFile(), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  const sq = new Dsql(dbFile()), hash = bc.hashSync('demo1234', 10);
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
    mk('Y1', { created: 24 * 60 + 30, thread: [inc('Y1', 'Old', 24 * 60 + 30)], t: { status: 'resolved', resolvedDate: iso(24 * 60) } }), mk('Y2', { created: 24 * 60 + 40, thread: [inc('Y2', 'Old', 24 * 60 + 40)], t: { status: 'resolved', resolvedDate: iso(24 * 60) } }),
    // left out of every number:
    mk('X', { created: 4320, thread: [inc('X', 'Imported history', 4320)], t: { imported: true, source: 'import' } }),
    mk('M', { created: 90, thread: [inc('M', 'a public post', 90)], t: { channel: 'listening', noSLA: true } }),
    mk('P', { created: 60, thread: [inc('P', 'Unsubscribe at the bottom. newsletter', 60)], t: { from: 'newsletter@mail.example.test', isBulk: true } }),
    mk('SNZ', { created: 200, thread: [inc('SNZ', 'later', 200)], t: { snoozedUntil: iso(-600) } }),
    mk('ARC', { created: 4000, thread: [inc('ARC', 'done', 4000)], t: { status: 'closed', archived: true, archivedAt: iso(3000) } }),
  ];
  const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'); T.forEach((t) => ins.run(t.id, JSON.stringify(t)));
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
const mails = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean) : []).filter((l) => /Live team/.test(l));
const setPlus = (on) => { const o = JSON.parse(fs.readFileSync(ownerFile(), 'utf8')); o.brands[0].featureOverrides.INBOX_PLUS_ENABLED = on; fs.writeFileSync(ownerFile(), JSON.stringify(o)); };
const sqlite = (f) => { const d = new Dsql(dbFile()); try { return f(d); } finally { d.close(); } };

(async () => {
  build(); await start();
  try {
    const login = async (e) => (await post('/api/login', { email: e, password: 'demo1234' })).token;
    const admin = await login('admin@demo.local'), mira = await login('mira@demo.local'), sam = await login('sam@demo.local');
    check('setup: admin, manager and agent sign in', !!admin && !!mira && !!sam);
    const fresh = async (tok) => { await rpc(admin, 'saveLiveBoardConfig', (await rpc(admin, 'getLiveBoardConfig')).config); return rpc(tok || admin, 'getLiveBoard'); };   // saving the limits also clears the 8-second cache

    // ---- who may see it ----
    check('access: an agent cannot open it', (await rpc(sam, 'getLiveBoard')).success === false);
    check('access: neither history, assigning, nudging nor limits for an agent', !(await rpc(sam, 'getLiveHistory')).success && !(await rpc(sam, 'liveBoardAssign', ['U1'], 'sam@demo.local')).success && !(await rpc(sam, 'nudgeAgent', 'admin@demo.local', '', 'hi')).success && !(await rpc(sam, 'getLiveBoardConfig')).success);
    setPlus(false); let r = await rpc(admin, 'getLiveBoard');
    check('access: with the Inbox 2.0 pilot off even an admin gets "not switched on"', r.success === false && r.off === true, r); setPlus(true);
    r = await fresh(mira);
    check('access: a manager can open it', r.success === true && Array.isArray(r.agents), r.error);

    // ---- the numbers ----
    const b = await fresh(), t = b.tiles;
    check('tiles: customers waiting for a first reply (no reply yet), not those already answered or waiting on the customer', t.waitingFirst === 7, t);
    check('tiles: waiting for any reply counts R1 (customer wrote again) but not S3 (we spoke last)', t.waitingNow === 8, t.waitingNow);
    check('tiles: longest wait is the six-hour-old ticket, named, in minutes', t.longest && t.longest.id === 'B1' && t.longest.min >= 359 && t.longest.min <= 362, t.longest);
    check('tiles: past SLA counts the overdue critical ticket', t.slaBreached === 1, t);
    check('tiles: no-owner count leaves out imported history, public mentions, promotions, archived and snoozed', t.unassigned === 3, t.unassigned);
    check('tiles: new in the last hour, compared with the same hour yesterday', t.arrivals.last60 === 6 && t.arrivals.prev60 === 2, t.arrivals);
    check('tiles: available agents (the away one is not counted)', t.available.n === 4 && t.available.total === 5, t.available);

    // ---- agent cards ----
    const A = (e) => b.agents.find((x) => x.email === e);
    check('agents: Sam has 4 open of 5, 3 waiting on him, and the 6-hour ticket is his longest', A('sam@demo.local').open === 4 && A('sam@demo.local').max === 5 && A('sam@demo.local').pct === 80 && A('sam@demo.local').waiting === 3 && A('sam@demo.local').oldest.id === 'B1', A('sam@demo.local'));
    check('agents: Sam was active a few minutes ago (his reply), so he is not flagged quiet', A('sam@demo.local').lastActiveMin <= 5 && A('sam@demo.local').quiet === false, A('sam@demo.local'));
    check('agents: Ravi is away but still holds an open ticket, so he is flagged', A('ravi@demo.local').status === 'away' && A('ravi@demo.local').awayWithTickets === true && A('ravi@demo.local').open === 1, A('ravi@demo.local'));
    check('agents: Tina is available, has a customer waiting and has been silent for over an hour, so she is flagged quiet', A('tina@demo.local').quiet === true && A('tina@demo.local').lastActiveMin >= 85, A('tina@demo.local'));
    check('agents: a person with nothing open shows zero and is not flagged', A('mira@demo.local').open === 0 && !A('mira@demo.local').awayWithTickets && !A('mira@demo.local').quiet);
    check('agents: the busiest are listed first', b.agents[0].email === 'sam@demo.local', b.agents.map((x) => x.email));
    await rpc(sam, 'heartbeatTicketView', 'S1');
    check('agents: who is looking at which ticket right now', (await fresh()).agents.find((x) => x.email === 'sam@demo.local').viewing.id === 'S1');

    // ---- needs a hand ----
    const H = b.hot, id = (x) => H.findIndex((h) => h.id === x);
    check('hot list: the overdue critical ticket comes first', H[0].id === 'B1' && H[0].reasons.includes('Past SLA'), H.map((h) => h.id));
    check('hot list: a VIP waiting with no owner shows both reasons', H[id('U3')] && H[id('U3')].reasons.includes('VIP') && H[id('U3')].reasons.includes('No owner'), H[id('U3')]);
    check('hot list: an unhappy customer is listed even before the wait limit', H[id('S2')] && H[id('S2')].reasons.includes('Unhappy'), H[id('S2')]);
    check('hot list: tickets we already answered, imported, mentions, promotions, snoozed and archived never appear', ['S3', 'X', 'M', 'P', 'SNZ', 'ARC', 'RES'].every((x) => id(x) === -1), H.map((h) => h.id));
    check('hot list: each row has what the screen needs (title, customer, wait, owner)', H.every((h) => h.subject && h.from && 'assignedTo' in h && Array.isArray(h.reasons) && h.reasons.length));

    // ---- alert limits ----
    check('alerts: nothing is wrong with the default limits', b.alerts.length === 0 && b.cfg.waitMin === 10 && b.cfg.waitingCount === 10 && b.cfg.queueDepth === 20, [b.alerts, b.cfg]);
    check('limits: only an admin can change them', !(await rpc(mira, 'saveLiveBoardConfig', { ...b.cfg })).success);
    for (const bad of [{ waitMin: 0 }, { waitMin: 241 }, { waitMin: 'abc' }, { waitingCount: 0 }, { waitingCount: 501 }, { queueDepth: 0 }, { queueDepth: 1001 }]) check('limits: refuses ' + JSON.stringify(bad), !(await rpc(admin, 'saveLiveBoardConfig', { ...b.cfg, ...bad })).success);
    r = await rpc(admin, 'saveLiveBoardConfig', { ...b.cfg, waitingCount: 5, queueDepth: 3, notifyEmail: true });
    check('limits: an admin can save them', r.success && r.config.waitingCount === 5 && r.config.queueDepth === 3 && r.config.notifyEmail === true, r);
    const c2 = await rpc(admin, 'getLiveBoard');
    check('alerts: crossing the limits raises the alerts, in plain words', c2.alerts.length === 2 && c2.alerts.some((a) => a.key === 'wait' && /7 customers have waited more than 10 minutes/.test(a.text)) && c2.alerts.some((a) => a.key === 'queue' && /3 tickets have no owner/.test(a.text)), c2.alerts);
    check('limits: the board is served from a short cache (same answer within 8 seconds)', (await rpc(admin, 'getLiveBoard')).at === c2.at);

    // ---- the bell ----
    const bell = await rpc(admin, 'getInAppNotifications');
    check('bell: supervisors see the live alerts', bell.notifications.some((n) => n.title === 'Live team' && /waited more than/.test(n.body)), bell.notifications.map((n) => n.title));
    check('bell: an agent does not', !(await rpc(sam, 'getInAppNotifications')).notifications.some((n) => n.title === 'Live team'));

    // ---- the alert job: tell supervisors once, not every two minutes ----
    const before = mails().length;
    await rpc(admin, 'runLiveAlertsNow'); const first = mails().length - before;
    check('alert job: both supervisors are emailed about both alerts (2 people x 2 alerts)', first === 4, first);
    await rpc(admin, 'runLiveAlertsNow');
    check('alert job: running again straight away sends nothing (no repeats)', mails().length - before === 4, mails().length - before);
    sqlite((d) => { const row = d.prepare("SELECT value FROM kv WHERE key='liveAlertState'").get(), st = JSON.parse(row.value); Object.keys(st).forEach((k) => (st[k] = Date.now() - 31 * MIN)); d.prepare("UPDATE kv SET value=? WHERE key='liveAlertState'").run(JSON.stringify(st)); });
    await rpc(admin, 'runLiveAlertsNow');
    check('alert job: after 30 minutes a still-true alert is repeated', mails().length - before === 8, mails().length - before);
    r = await rpc(admin, 'saveLiveBoardConfig', { ...c2.cfg, alertsOn: false });
    sqlite((d) => d.prepare("UPDATE kv SET value='{}' WHERE key='liveAlertState'").run()); const m1 = mails().length; await rpc(admin, 'runLiveAlertsNow');
    check('alert job: with alerts switched off nothing is sent, and the board shows no alert bar', mails().length === m1 && (await rpc(admin, 'getLiveBoard')).alerts.length === 0);
    sqlite((d) => { for (const r2 of d.prepare("SELECT id,data FROM users").all()) { const u = JSON.parse(r2.data); u.availabilityStatus = 'away'; d.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r2.id); } });
    await rpc(admin, 'saveLiveBoardConfig', { ...c2.cfg, alertsOn: true, waitingCount: 50, queueDepth: 50 });
    const none = await rpc(admin, 'getLiveBoard');
    check('alerts: when nobody is available and customers are waiting, it is the high-level alert', none.alerts.length === 1 && none.alerts[0].key === 'none' && none.alerts[0].level === 'high', none.alerts);
    sqlite((d) => { for (const r2 of d.prepare("SELECT id,data FROM users").all()) { const u = JSON.parse(r2.data); u.availabilityStatus = u.email === 'ravi@demo.local' ? 'away' : 'available'; d.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r2.id); } });
    await rpc(admin, 'saveLiveBoardConfig', { ...c2.cfg, alertsOn: true, waitingCount: 10, queueDepth: 20 });
    check('test alert: a supervisor can check that phone alerts reach them (no device is registered here, so none)', (await rpc(admin, 'testLiveAlert')).success === true && (await rpc(admin, 'testLiveAlert')).sent === 0);

    // ---- moving tickets ----
    r = await rpc(admin, 'liveBoardAssign', ['U1', 'U2', 'NOPE'], 'sam@demo.local');
    check('assign: moves the tickets, counts what could not be moved', r.success && r.assigned === 2 && r.skipped === 1, r);
    const u1 = (await rpc(admin, 'getTicketById', 'U1')).ticket;
    check('assign: it is a normal assignment (owner set, written in the ticket history)', u1.assignedTo === 'sam@demo.local' && u1.timeline.some((e) => e.event === 'assigned'), u1.timeline);
    check('assign: the no-owner count drops straight away', (await rpc(admin, 'getLiveBoard')).tiles.unassigned === 1);
    check('assign: refuses a stranger, an empty list, and more than 50 tickets', !(await rpc(admin, 'liveBoardAssign', ['U3'], 'nobody@example.org')).success && !(await rpc(admin, 'liveBoardAssign', [], 'sam@demo.local')).success && !(await rpc(admin, 'liveBoardAssign', Array.from({ length: 51 }, (_, i) => 'X' + i), 'sam@demo.local')).success);

    // ---- nudges ----
    r = await rpc(admin, 'nudgeAgent', 'sam@demo.local', 'S1', 'Please pick up <b>S1</b> now');
    check('nudge: sent', r.success === true, r);
    const sb = await rpc(sam, 'getInAppNotifications'), nd = sb.notifications.find((n) => /nudged you/.test(n.title));
    check('nudge: it appears in that person\'s bell with the message (markup stripped) and the ticket', nd && /Please pick up/.test(nd.body) && /S1/.test(nd.body) && !/[<>]/.test(nd.body) && nd.ticketId === 'S1', nd);
    check('nudge: nobody else sees it', !(await rpc(mira, 'getInAppNotifications')).notifications.some((n) => /nudged you/.test(n.title)));
    check('nudge: an empty message or an unknown person is refused', !(await rpc(admin, 'nudgeAgent', 'sam@demo.local', '', '   ')).success && !(await rpc(admin, 'nudgeAgent', 'nobody@example.org', '', 'hi')).success);
    for (let i = 0; i < 4; i++) await rpc(admin, 'nudgeAgent', 'sam@demo.local', '', 'again ' + i);
    check('nudge: at most 5 an hour to the same person', (await rpc(admin, 'nudgeAgent', 'sam@demo.local', '', 'sixth')).success === false);

    // ---- history ----
    const hs = await rpc(admin, 'getLiveHistory');
    const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
    check('history: 24 hourly slots and 7 daily ones', hs.success && hs.hours.length === 24 && hs.days.length === 7, [hs.hours && hs.hours.length, hs.days && hs.days.length]);
    check('history: the hours add up to the tickets that really arrived (imported, mentions and promotions left out)', sum(hs.hours, 'created') === 11, sum(hs.hours, 'created'));
    check('history: team replies are counted by hour', sum(hs.hours, 'replies') >= 2, sum(hs.hours, 'replies'));
    check('history: the days include the older tickets and solved ones', sum(hs.days, 'created') >= 13 && sum(hs.days, 'resolved') >= 3, [sum(hs.days, 'created'), sum(hs.days, 'resolved')]);
    check('history: names the busiest hour', hs.busiestHour != null && hs.busiestHourCount >= 1, [hs.busiestHour, hs.busiestHourCount]);

    // ---- speed ----
    sqlite((d) => { const ins = d.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'), who = ['sam@demo.local', 'ravi@demo.local', 'tina@demo.local', ''];
      d.transaction(() => { for (let i = 0; i < 5000; i++) { const m = 5 + (i % 3000); ins.run('BIG' + i, JSON.stringify({ id: 'BIG' + i, subject: 'Bulk ' + i, status: i % 5 === 0 ? 'resolved' : 'open', priority: 'Medium', from: 'b' + (i % 700) + '@example.test', fromName: 'B', assignedTo: who[i % 4], createdDate: iso(m), lastActivity: iso(m), channel: 'email', tags: [], messageIds: [], thread: [{ id: 'MB' + i, type: 'incoming', from: 'b@example.test', body: 'x'.repeat(300), timestamp: iso(m) }] })); } })(); });
    const t0 = Date.now(); const big = await fresh(); const ms = Date.now() - t0, t1 = Date.now(); const bh = await rpc(admin, 'getLiveHistory'); const hms = Date.now() - t1;
    check('speed: the board with 5,000 more tickets answers in ' + ms + ' ms', big.success && ms < 2500, ms);
    check('speed: history with 5,000 more tickets answers in ' + hms + ' ms', bh.success && hms < 2500, hms);
    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-300));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
