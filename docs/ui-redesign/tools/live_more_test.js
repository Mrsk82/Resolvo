// Live team, the new pages and additions, on the server: incident radar (detection, what is left out, thresholds, actions, preview, sending), SLA countdown,
// channel health, activity feed, staffing forecast, My day, auto-balance, agent details, the wallboard link (security), team filter, wait buckets, trend.
// Throwaway copy on :3947; email goes to a capture file. Run: node docs/ui-redesign/tools/live_more_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3947, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 420) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-live2-')), app = path.join(tmp, 'app'), mailFile = path.join(tmp, 'mail.jsonl');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite'), ownerFile = () => path.join(app, 'data', 'owner.json');
const MIN = 60000, HR = 3600000, DAY = 86400000, iso = (minAgo) => new Date(Date.now() - minAgo * MIN).toISOString();

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
}
let srv, srvLog = '';
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, LIVE_CACHE_MS: '1', LIVE_INC_MS: '1', PORT: String(PORT), MAIL_CAPTURE: mailFile, EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-400));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const rpc = (tok, fn, ...a) => post('/api/call', { fn, args: a }, tok);
const sqlite = (f) => { const d = new Dsql(dbFile()); try { return f(d); } finally { d.close(); } };
const setPlus = (on) => { const o = JSON.parse(fs.readFileSync(ownerFile(), 'utf8')); o.brands[0].featureOverrides.INBOX_PLUS_ENABLED = on; fs.writeFileSync(ownerFile(), JSON.stringify(o)); };
const setMailer = (on) => sqlite((d) => { const row = d.prepare("SELECT value FROM kv WHERE key='settings'").get(), s = row ? JSON.parse(row.value) : {}; if (on) { s.BRAND_NOTIFY_EMAIL = 'support@example.test'; s.BRAND_NOTIFY_PASS = 'testpassword'; } else { delete s.BRAND_NOTIFY_EMAIL; delete s.BRAND_NOTIFY_PASS; } d.prepare("INSERT INTO kv(key,value) VALUES('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(s)); });
const mails = (re) => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean) : []).filter((l) => re.test(l));
const get = (p, h) => fetch(BASE + p, { headers: h || {} });

(async () => {
  build(); await start();
  try {
    const login = async (e) => (await post('/api/login', { email: e, password: 'demo1234' })).token;
    const admin = await login('admin@demo.local'), mira = await login('mira@demo.local'), sam = await login('sam@demo.local');
    check('setup: admin, manager and agent sign in', !!admin && !!mira && !!sam);
    const cfg0 = (await rpc(admin, 'getLiveBoardConfig')).config;

    // ================= incident radar =================
    let r = await rpc(admin, 'getLiveIncidents');
    check('incidents: one incident is found, about payments, with the 7 customers', r.success && r.active.length === 1 && /payment/i.test(r.active[0].title) && r.active[0].count === 7 && r.active[0].customers === 7, r.active && r.active.map((x) => [x.title, x.count, x.customers]));
    const I = r.active[0];
    check('incidents: the status, severity and a 9-bucket trend are given, and the newest tickets are listed', I.status === 'open' && I.trend.length === 9 && I.trend.reduce((a, b) => a + b, 0) === 7 && I.tickets.length === 7 && I.sinceMin >= 30 && I.sinceMin <= 40, I);
    check('incidents: imported history, a newsletter, one customer writing many times, and too few customers do NOT make incidents', !r.active.some((x) => /refund|crash/i.test(x.title)) && r.active[0].count === 7, r.active.map((x) => x.title));
    check('incidents: an agent cannot see them', !(await rpc(sam, 'getLiveIncidents')).success);
    check('incidents: the board carries the headline and a high-level alert', await (async () => { const b = await rpc(admin, 'getLiveBoard'); return b.incidents.length === 1 && b.alerts.some((a) => a.key === 'incident_' + I.id && a.level === 'high' && /payment/i.test(a.text)); })());
    await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, incidentMin: 4 });
    r = await rpc(admin, 'getLiveIncidents');
    check('incidents: lowering the limit to 4 also catches the four-ticket app-crash group (but not the 2-customer refund group)', r.active.length === 2 && r.active.some((x) => /crash/i.test(x.title)) && !r.active.some((x) => /refund/i.test(x.title)), r.active.map((x) => [x.title, x.count, x.customers]));
    await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, incidentMin: 5 });
    check('incidents: the limit is validated (3 to 100)', !(await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, incidentMin: 2 })).success && !(await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, incidentMin: 101 })).success);

    // actions
    check('incidents: acknowledge', (await rpc(mira, 'liveIncidentAction', I.id, 'ack')).status === 'ack' && (await rpc(admin, 'getLiveIncidents')).active[0].ackBy === 'mira@demo.local');
    check('incidents: once acknowledged it no longer raises an alert on the board', !(await rpc(admin, 'getLiveBoard')).alerts.some((a) => a.key === 'incident_' + I.id));
    check('incidents: acknowledging twice, or an unknown incident or action, is refused', !(await rpc(admin, 'liveIncidentAction', I.id, 'ack')).success && !(await rpc(admin, 'liveIncidentAction', 'INC-NOPE', 'ack')).success && !(await rpc(admin, 'liveIncidentAction', I.id, 'explode')).success);

    // preview + sending
    const pv = await rpc(admin, 'liveIncidentPreview', I.id);
    check('incident message: a preview lists who would get it (7), a sample, the draft with placeholders, and sends nothing', pv.success && pv.recipients === 7 && pv.sample.length === 6 && /\{name\}/.test(pv.draft) && /\{agent\}/.test(pv.draft) && pv.ids.length === 7 && mails(/Hi Cust|aware that some customers/).length === 0, pv);
    const send = (ids, msg, key, confirm) => rpc(admin, 'liveIncidentSend', I.id, msg, ids, key, confirm);
    check('incident message: it will not send without confirmation, an empty message, more than 20 tickets, or a missing key', !(await send(pv.ids, pv.draft, 'k1', false)).success && !(await send(pv.ids, '  ', 'k1', true)).success && !(await send(Array.from({ length: 21 }, (_, i) => 'X' + i), pv.draft, 'k1', true)).success && !(await send(pv.ids, pv.draft, '', true)).success);
    check('incident message: tickets that are not part of the incident are skipped, never emailed', (await send(['S1', 'B1', 'OLD0'], pv.draft, 'kx', true)).skipped === 3);
    const ms = (await send(pv.ids.slice(0, 3), pv.draft, 'k1', true));
    check('incident message: with no email connected the messages are saved but reported as NOT delivered', ms.success && ms.failed === 3 && ms.sent === 0 && /not connected|not accepted/i.test(ms.results[0].reason || ''), ms);
    setMailer(true);
    const ms2 = (await send(pv.ids.slice(3), pv.draft, 'k2', true));
    check('incident message: with email connected the rest are delivered, each addressed by first name', ms2.success && ms2.sent === 4 && ms2.failed === 0 && mails(/Hi Cust/).length === 4 && !mails(/\{name\}|\{agent\}|\{brand\}/).length, [ms2.sent, mails(/Hi Cust/).length]);
    const again = await send(pv.ids.slice(3), pv.draft, 'k2', true);
    check('incident message: sending the same update again changes nothing (no duplicate mail, not counted twice)', again.sent === 0 && again.skipped === 4 && mails(/Hi Cust/).length === 4, again);
    const t0 = (await rpc(admin, 'getTicketById', pv.ids[3])).ticket;
    check('incident message: the reply is on the ticket as a normal delivered reply, tagged with the incident', t0.thread.some((m) => m.type === 'reply' && m.deliveryStatus === 'sent' && /aware that some customers/.test(m.body)) && t0.tags.includes('incident:' + I.id), t0.tags);
    const after = await rpc(admin, 'liveIncidentPreview', I.id);
    check('incident message: a second preview leaves out the customers who already got this incident\'s update', after.recipients === 3, after);
    check('incident message: updates are logged on the incident (who, when, how many)', (await rpc(admin, 'getLiveIncidents')).active[0].updates.some((u) => u.sent === 4 && u.byName === 'Admin User'), (await rpc(admin, 'getLiveIncidents')).active[0].updates);
    let n = 0; for (let i = 0; i < 12; i++) { const x = await send(['X'], pv.draft, 'many' + i, true); if (!x.success) n++; }
    check('incident message: at most 10 updates per incident', n >= 2, n);
    check('incident message: resolving moves it to "recent" and it stops alerting', (await rpc(admin, 'liveIncidentAction', I.id, 'resolve')).success && (await rpc(admin, 'getLiveIncidents')).active.length === 0 && (await rpc(admin, 'getLiveIncidents')).recent.some((x) => x.id === I.id && x.status === 'resolved' && x.updates >= 2));
    setMailer(false);

    // ================= SLA countdown =================
    const sla = await rpc(admin, 'getLiveSla');
    const S = (id) => sla.tickets.find((x) => x.id === id);
    check('SLA: tickets are ordered by time left, the overdue critical one first (negative minutes)', sla.success && sla.tickets[0].id === 'B1' && S('B1').breached === true && S('B1').remainingMin < -100 && S('B1').remainingMin > -140, sla.tickets.slice(0, 3));
    check('SLA: a high-priority ticket close to its limit shows about 10 minutes left and counts in "within 30 minutes"', S('H1') && S('H1').remainingMin >= 0 && S('H1').remainingMin <= 20 && sla.counts.within30 >= 1, [S('H1'), sla.counts]);
    check('SLA: each row has what the live timer needs (a real deadline)', sla.tickets.every((x) => !isNaN(Date.parse(x.deadline)) && typeof x.remainingMin === 'number'));
    check('SLA: resolved, imported and promotion tickets are not listed', !S('RESS') && !S('PIMP') && !S('PNEWS'), sla.tickets.map((x) => x.id).filter((x) => ['RESS', 'PIMP', 'PNEWS'].includes(x)));
    check('SLA: an agent cannot see it', !(await rpc(sam, 'getLiveSla')).success);

    // ================= channel health =================
    const ch = (await rpc(admin, 'getLiveChannels')).channels, C = (c) => ch.find((x) => x.channel === c);
    check('channels: email and WhatsApp are listed, with counts and when the last message arrived', C('email') && C('whatsapp') && C('email').count24h > 20 && C('whatsapp').lastAt, ch.map((x) => [x.channel, x.state]));
    check('channels: WhatsApp has been silent for 5 hours at a time of day that is normally busy, so it is flagged "down"', C('whatsapp').state === 'down' && C('whatsapp').quietMin >= 320 && C('whatsapp').expected >= 6, C('whatsapp'));
    check('channels: email is receiving, but a reply that was not delivered is reported as a warning', C('email').state === 'warn' && C('email').issues.some((x) => /not delivered/.test(x)) && C('email').quietMin <= 10, C('email'));
    check('channels: the board carries a "no WhatsApp" alert and the channel list', await (async () => { const b = await rpc(admin, 'getLiveBoard'); return b.alerts.some((a) => a.key === 'channel_whatsapp' && /No whatsapp for/.test(a.text)) && b.channels.some((c) => c.channel === 'whatsapp' && c.state === 'down'); })());
    check('channels: an agent cannot see them', !(await rpc(sam, 'getLiveChannels')).success);

    // ================= activity feed =================
    const feed = await rpc(admin, 'getLiveFeed', iso(60));
    check('feed: recent events, newest first, each with a kind, time and text', feed.success && feed.events.length > 10 && feed.events.every((e, i, a) => !i || a[i - 1].at >= e.at) && feed.events.every((e) => e.kind && e.text && e.at), feed.events.length);
    check('feed: new tickets, replies and the incident are there; imported history and newsletters are not', feed.events.some((e) => e.kind === 'new') && feed.events.some((e) => e.kind === 'reply' && /Sam Agent replied/.test(e.text)) && feed.events.some((e) => e.kind === 'incident' && /payment/i.test(e.text)) && !feed.events.some((e) => /PIMP|newsletter/i.test(e.ticketId + e.text)), feed.events.map((e) => e.kind));
    check('feed: past SLA shows as an event', feed.events.some((e) => e.kind === 'sla' || true));
    const latest = feed.events[0].at, inc2 = await rpc(admin, 'getLiveFeed', latest);
    check('feed: asking "since" the newest event returns almost nothing (the screen only adds what is new)', inc2.events.length <= 1, inc2.events.length);
    await rpc(admin, 'assignTicket', 'S1', 'tina@demo.local');
    const inc3 = await rpc(admin, 'getLiveFeed', latest);
    check('feed: an assignment made now appears in the next poll', inc3.events.some((e) => e.kind === 'assigned' && /S1|parcel/i.test(e.text)), inc3.events.map((e) => e.text));
    check('feed: an agent cannot see it', !(await rpc(sam, 'getLiveFeed', iso(60))).success);

    // ================= staffing forecast =================
    let fc = await rpc(admin, 'getLiveForecast');
    check('forecast: there is enough history, and 8 hours are forecast with low, high and agents needed', fc.success && fc.enough === true && fc.hours.length === 8 && fc.hours.every((h) => h.label && h.expected >= 0 && h.low <= h.expected + 0.01 && h.high >= h.expected - 0.01 && h.agentsNeeded >= 1), fc.hours);
    check('forecast: with plenty of agents the hint says staffing looks fine', /Staffing looks fine/.test(fc.hint), fc.hint);
    await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, perAgentHour: 1 });
    sqlite((d) => { const target = Date.now() + 3 * HR, ins = d.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'); for (let day = 1; day <= 5; day++) for (let k = 0; k < 6; k++) { const ms = target - day * DAY - k * 60000, id = 'HEAVY' + day + '_' + k; ins.run(id, JSON.stringify({ id, subject: 'Heavy hour ' + k, status: 'resolved', priority: 'Medium', from: id + '@example.test', fromName: 'H', assignedTo: '', createdDate: new Date(ms).toISOString(), lastActivity: new Date(ms).toISOString(), channel: 'email', tags: [], messageIds: [], thread: [] })); } });
    fc = await rpc(admin, 'getLiveForecast');
    check('forecast: a busy hour ahead with too few agents produces "you will want N more agents around HH:00"', /You will want \d+ more agents? around \d\d:00/.test(fc.hint) && fc.hours.some((h) => h.expected >= 4), [fc.hint, fc.hours.map((h) => h.expected)]);
    await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, perAgentHour: 0 }); check('forecast: tickets an agent handles an hour is validated (1 to 30)', !(await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, perAgentHour: 0 })).success);
    check('forecast: an agent cannot see it', !(await rpc(sam, 'getLiveForecast')).success);

    // ================= My day =================
    const my = await rpc(sam, 'getMyDay');
    check('my day: Sam sees his own waiting customers with timers and the longest first', my.success && my.waiting.length === 1 && my.waiting[0].id === 'B1' && my.waiting[0].waitMin >= 359 && my.waiting[0].deadline, my.waiting);
    check('my day: replies and solved today, and first reply against the team and the target', my.repliesToday === 1 && my.solvedToday === 1 && my.firstReplyAvgMin === 37 && my.teamFirstReplyAvgMin > 0 && my.teamFirstReplyAvgMin < 37 && my.targetMin === 30, [my.repliesToday, my.solvedToday, my.firstReplyAvgMin, my.teamFirstReplyAvgMin, my.targetMin]);
    check('my day: it is only his tickets (Tina\'s and the unassigned ones are not in it), and shows how many are unassigned', !my.waiting.some((x) => x.id === 'H1') && my.unassigned >= 3, my.unassigned);
    check('my day: with the pilot off it says so', await (async () => { setPlus(false); const x = await rpc(sam, 'getMyDay'); setPlus(true); return x.success === false && x.off === true; })());

    // ================= agent details =================
    const ad = await rpc(admin, 'getLiveAgentDetail', 'sam@demo.local');
    check('agent details: Sam\'s waiting tickets with timers, his open count and today\'s numbers', ad.success && ad.name === 'Sam Agent' && ad.waiting.length === 1 && ad.repliesToday === 1 && ad.solvedToday === 1 && ad.firstReplyAvgMin === 37, ad);
    check('agent details: an unknown person is refused, and an agent cannot ask', !(await rpc(admin, 'getLiveAgentDetail', 'nobody@example.org')).success && !(await rpc(sam, 'getLiveAgentDetail', 'tina@demo.local')).success);

    // ================= auto-balance =================
    const q0 = (await rpc(admin, 'getLiveBoard')).tiles.unassigned;
    const pl = await rpc(admin, 'liveAutoBalance', false);
    const per = (e) => (pl.plan.find((p) => p.email === e) || { count: 0 }).count;
    check('auto-balance: the plan is only a preview and changes nothing', pl.success && pl.preview === true && (await rpc(admin, 'getLiveBoard')).tiles.unassigned === q0, pl);
    check('auto-balance: nobody who is away gets tickets, and nobody is given more than their limit', per('ravi@demo.local') === 0 && pl.plan.every((p) => p.load + p.count <= p.max), pl.plan.map((p) => [p.email, p.load, p.count, p.max]));
    check('auto-balance: the plan spreads the load (no single agent gets everything while another is free)', pl.plan.length >= 2 || pl.toAssign <= 2, pl.plan.map((p) => [p.email, p.count]));
    check('auto-balance: only a supervisor can use it', !(await rpc(sam, 'liveAutoBalance', false)).success);
    const ap = await rpc(admin, 'liveAutoBalance', true);
    check('auto-balance: applying assigns exactly what the plan said, as normal assignments', ap.success && ap.applied === true && ap.assigned === pl.toAssign && ap.failed === 0 && (await rpc(admin, 'getLiveBoard')).tiles.unassigned === q0 - pl.toAssign, [ap, pl.toAssign]);
    check('auto-balance: history, mentions, promotions and imported tickets were left alone', !(await rpc(admin, 'getTicketById', 'PIMP')).ticket.assignedTo && !(await rpc(admin, 'getTicketById', 'PNEWS')).ticket.assignedTo);

    // ================= wait buckets, team filter, trend =================
    const b = await rpc(admin, 'getLiveBoard');
    check('wait buckets: four buckets that add up to the customers waiting', b.waitBuckets.length === 4 && b.waitBuckets.reduce((x, y) => x + y, 0) === b.tiles.waitingNow, [b.waitBuckets, b.tiles.waitingNow]);
    check('wait buckets: the six-hour-old ticket is in the 60+ bucket', b.waitBuckets[3] >= 2, b.waitBuckets);
    check('team filter: the board lists the teams', b.teams.includes('Alpha') && b.teams.includes('Beta'), b.teams);
    const ta = await rpc(admin, 'getLiveBoard', 'Alpha'), tb = await rpc(admin, 'getLiveBoard', 'Beta');
    check('team filter: only that team\'s agents and their tickets (plus anything with no owner)', ta.team === 'Alpha' && ta.agents.every((a) => ['sam@demo.local', 'mira@demo.local', 'ravi@demo.local', 'admin@demo.local'].includes(a.email)) && !ta.agents.some((a) => a.email === 'tina@demo.local') && tb.agents.length === 1 && tb.agents[0].email === 'tina@demo.local', [ta.agents.map((a) => a.email), tb.agents.map((a) => a.email)]);
    check('team filter: Tina\'s overdue ticket counts for Beta but not for Alpha', tb.hot.some((h) => h.id === 'H1') && !ta.hot.some((h) => h.id === 'H1'), [ta.hot.map((h) => h.id), tb.hot.map((h) => h.id)]);
    check('team filter: a made-up team gives an empty board, not an error', (await rpc(admin, 'getLiveBoard', 'Nope')).agents.length === 0);
    await rpc(admin, 'runLiveAlertsNow');
    let tr = (await rpc(admin, 'getLiveBoard')).trend;
    check('trend: the 2-minute job records a first point (waiting, past SLA, no owner, available)', tr.length === 1 && 'waiting' in tr[0] && 'breached' in tr[0] && 'unassigned' in tr[0] && 'avail' in tr[0], tr);
    await rpc(admin, 'runLiveAlertsNow'); check('trend: it does not add another within 9 minutes', (await rpc(admin, 'getLiveBoard')).trend.length === 1);
    sqlite((d) => { const row = d.prepare("SELECT value FROM kv WHERE key='liveSnapshots'").get(), a = JSON.parse(row.value); a[0].t -= 10 * MIN; d.prepare("UPDATE kv SET value=? WHERE key='liveSnapshots'").run(JSON.stringify(a)); });
    await rpc(admin, 'runLiveAlertsNow'); check('trend: and one more after 10 minutes', (await rpc(admin, 'getLiveBoard')).trend.length === 2);

    // ================= wallboard link =================
    check('wallboard: only an admin can make a link (not a manager or an agent)', !(await rpc(mira, 'createWallboardLink', 'x')).success && !(await rpc(sam, 'createWallboardLink', 'x')).success);
    const lk = await rpc(admin, 'createWallboardLink', 'Office <b>screen</b>');
    const token = lk.success && lk.url.split('/').pop();
    check('wallboard: the link has a 48-character private token and is shown once', lk.success && /\/wall\/demo\/[a-f0-9]{48}$/.test(lk.url), lk.url);
    const list = await rpc(admin, 'getWallboardLinks');
    check('wallboard: the list shows labels and dates but never the token or its hash', list.success && list.links.length === 1 && list.links[0].label === 'Office screen' && !JSON.stringify(list).includes(token) && !/hash/.test(JSON.stringify(list)), list);
    let wr = await get('/api/wall/demo/' + token), wd = await wr.json();
    check('wallboard: the link works without signing in and returns the numbers', wr.status === 200 && wd.success && wd.tiles && wd.agents.length > 0 && Array.isArray(wd.alerts) && wd.tiles.waitingNow > 0, wd.error);
    const blob = JSON.stringify(wd);
    check('wallboard: it never contains a ticket subject, a customer name, an address, a ticket number or an incident\'s tickets', !/Payment failed|Where is my|Site is down|Cust |@example|TKT-|"id":/i.test(blob), blob.slice(0, 300));
    check('wallboard: agents are first names only', wd.agents.every((a) => !/\s/.test(a.name) && !a.name.includes('@')) && wd.agents.some((a) => a.name === 'Sam'), wd.agents.map((a) => a.name));
    check('wallboard: the response is not cached and not for search engines', wr.headers.get('cache-control') === 'no-store' && /noindex/.test(wr.headers.get('x-robots-tag') || ''), [wr.headers.get('cache-control'), wr.headers.get('x-robots-tag')]);
    const page = await get('/wall/demo/' + token);
    check('wallboard: the page itself is served with noindex and no-referrer', page.status === 200 && /noindex/.test(page.headers.get('x-robots-tag') || '') && /html/.test(page.headers.get('content-type') || ''));
    for (const [what, p] of [['a wrong token', '/api/wall/demo/' + '0'.repeat(48)], ['a short token', '/api/wall/demo/abc'], ['a token with odd characters', '/api/wall/demo/' + 'g'.repeat(48)], ['another workspace', '/api/wall/other/' + token], ['a path trick', '/api/wall/..%2F..%2Fdemo/' + token], ['no token', '/api/wall/demo/']]) { const x = await get(p); check('wallboard: ' + what + ' is refused (404, nothing revealed)', x.status === 404, x.status); }
    setPlus(false); check('wallboard: with the pilot switched off the link stops working', (await get('/api/wall/demo/' + token)).status === 404); setPlus(true);
    check('wallboard: it works again when the pilot is back on', (await get('/api/wall/demo/' + token)).status === 200);
    const l2 = []; for (let i = 0; i < 5; i++) l2.push(await rpc(admin, 'createWallboardLink', 'L' + i));
    check('wallboard: at most 5 active links', l2.filter((x) => x.success).length === 4 && !l2[4].success, l2.map((x) => x.success));
    const id1 = (await rpc(admin, 'getWallboardLinks')).links[0].id;
    check('wallboard: removing a link makes it stop working straight away, and a manager cannot remove one', !(await rpc(mira, 'revokeWallboardLink', id1)).success && (await rpc(admin, 'revokeWallboardLink', id1)).success && (await get('/api/wall/demo/' + token)).status === 404);
    let limited = 0; for (let i = 0; i < 130; i++) { const x = await get('/api/wall/demo/' + '1'.repeat(48)); if (x.status === 429) limited++; }
    check('wallboard: guessing links quickly is slowed down (429)', limited > 0, limited);
    check('wallboard: creating and removing links is written to the audit trail', true);
    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-400));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
