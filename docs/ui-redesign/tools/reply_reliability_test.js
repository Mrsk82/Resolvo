// Inbox 2.0, Phase 1: an emailed reply is "sent" only when the provider accepts it; a failed one can be retried without ever being sent twice;
// the same click arriving twice sends once; reply text cannot inject HTML into the email. Email goes to a capture file, never the internet.
// Run: node docs/ui-redesign/tools/reply_reliability_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3937, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 360) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-rel-')), app = path.join(tmp, 'app'), mailFile = path.join(tmp, 'mail.jsonl');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite');

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
  const sq = new Dsql(dbFile()), now = new Date().toISOString();
  const mk = (id, extra) => ({ id, subject: 'Order not received', status: 'new', priority: 'Medium', from: 'customer@example.test', fromName: 'Test Customer', createdDate: now, lastActivity: now, channel: 'email', tags: [], messageIds: ['<' + id + '@x>'], thread: [{ id: 'MSG-' + id, type: 'incoming', from: 'customer@example.test', fromName: 'Test Customer', body: 'Where is my order?', timestamp: now, messageId: '<' + id + '@x>' }], ...extra });
  const ins = sq.prepare('INSERT OR REPLACE INTO tickets(id,data) VALUES(?,?)');
  ins.run('TKT-REL0001', JSON.stringify(mk('TKT-REL0001'))); ins.run('TKT-REL0002', JSON.stringify(mk('TKT-REL0002', { isSample: true })));
  sq.close();
}
function setMailer(on) {
  const sq = new Dsql(dbFile()), row = sq.prepare("SELECT value FROM kv WHERE key='settings'").get(), s = row ? JSON.parse(row.value) : {};
  if (on) { s.BRAND_NOTIFY_EMAIL = 'support@example.test'; s.BRAND_NOTIFY_PASS = 'testpassword'; } else { delete s.BRAND_NOTIFY_EMAIL; delete s.BRAND_NOTIFY_PASS; }
  sq.prepare("INSERT INTO kv(key,value) VALUES('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(s)); sq.close();
}
const mails = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).filter((m) => m.to === 'customer@example.test');
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

(async () => {
  build(); setMailer(false); await start();
  try {
    const tok = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    check('setup: demo admin signs in', !!tok);
    const getT = async (id) => (await rpc(tok, 'getTicketById', id)).ticket;

    // ---- 1. no email connected: the reply is kept but honestly shown as not delivered ----
    let r = await rpc(tok, 'replyToTicket', 'TKT-REL0001', 'Hello, we are checking your order.', false, 'key-a');
    check('failed send: the answer says the email was NOT delivered and why', r.success && r.deliveryStatus === 'failed' && /not connected/i.test(r.warning || ''), r);
    let t = await getT('TKT-REL0001'), m1 = t.thread.find((m) => m.id === r.msgId);
    check('failed send: the reply is kept in the ticket as failed, with the reason', m1 && m1.deliveryStatus === 'failed' && /not connected/i.test(m1.deliveryError || '') && m1.deliveryAttempts === 1, m1);
    check('failed send: the ticket history records it', t.timeline.some((e) => e.event === 'email_failed'), t.timeline);
    check('failed send: it does not count as a first response', !t.firstResponseAt, t.firstResponseAt);
    check('failed send: nothing reached the customer', mails().length === 0, mails());
    const list = await rpc(tok, 'getTickets', { status: 'all', promo: 'all', limit: 100 });
    check('failed send: the inbox list flags the ticket', list.tickets.find((x) => x.id === 'TKT-REL0001').deliveryFailed === true);

    // ---- 2. a note is never emailed and has no delivery state ----
    r = await rpc(tok, 'replyToTicket', 'TKT-REL0001', 'Internal: customer is a VIP', true, 'key-note');
    t = await getT('TKT-REL0001'); const note = t.thread.find((m) => m.id === r.msgId);
    check('note: saved as a note, no email, no delivery state', r.success && note.type === 'note' && !note.deliveryStatus && mails().length === 0, note);

    // ---- 3. email connected: retry sends it, once ----
    setMailer(true);
    let rt = await rpc(tok, 'retryReply', 'TKT-REL0001', m1.id);
    check('retry: delivers the saved reply', rt.success && rt.deliveryStatus === 'sent', rt);
    check('retry: exactly one email went out, with the original text', mails().length === 1 && /checking your order/.test(mails()[0].text), mails());
    t = await getT('TKT-REL0001'); m1 = t.thread.find((m) => m.id === m1.id);
    check('retry: the message is now sent, attempts counted, route recorded', m1.deliveryStatus === 'sent' && m1.deliveryAttempts === 2 && !!m1.deliveredVia && !m1.deliveryError, m1);
    check('retry: the first response is counted from the moment it was delivered', !!t.firstResponseAt && t.timeline.some((e) => e.event === 'email_sent'), [t.firstResponseAt]);
    rt = await rpc(tok, 'retryReply', 'TKT-REL0001', m1.id);
    check('retry again: nothing more is sent', rt.success && rt.duplicate === true && mails().length === 1, [rt, mails().length]);
    rt = await rpc(tok, 'retryReply', 'TKT-REL0001', note.id);
    check('retry: a note or a normal message cannot be "retried"', !rt.success, rt);
    rt = await rpc(tok, 'retryReply', 'TKT-REL0001', 'MSG-nope');
    check('retry: an unknown message is refused', !rt.success, rt);

    // ---- 4. the same send arriving twice ----
    r = await rpc(tok, 'replyToTicket', 'TKT-REL0001', 'Second message', false, 'key-b');
    const r2 = await rpc(tok, 'replyToTicket', 'TKT-REL0001', 'Second message', false, 'key-b');
    check('same key twice: same message back, flagged as a repeat', r.success && r.deliveryStatus === 'sent' && r2.success && r2.duplicate === true && r2.msgId === r.msgId, [r, r2]);
    check('same key twice: one email, not two', mails().filter((m) => /Second message/.test(m.text)).length === 1, mails().length);
    const [c1, c2, c3] = await Promise.all([1, 2, 3].map(() => rpc(tok, 'replyToTicket', 'TKT-REL0001', 'Racing message', false, 'key-race')));
    t = await getT('TKT-REL0001');
    check('three clicks at the same moment: one message in the ticket and one email', t.thread.filter((m) => m.body === 'Racing message').length === 1 && mails().filter((m) => /Racing message/.test(m.text)).length === 1, [c1, c2, c3].map((x) => x.duplicate || x.msgId));
    r = await rpc(tok, 'replyToTicket', 'TKT-REL0001', 'No key given', false);
    check('no key (older screens): still works as before', r.success && r.deliveryStatus === 'sent', r);

    // ---- 5. what goes into the email ----
    const evil = 'Hi <b>there</b> & <script>alert(1)</script> <img src=x onerror=alert(2)>';
    await rpc(tok, 'replyToTicket', 'TKT-REL0001', evil, false, 'key-evil');
    const em = mails().find((m) => /alert\(1\)/.test(m.text));
    check('html: markup typed in a reply is shown as text in the email, not run', em && !/<script>|<img |<b>there/.test(em.html) && /&lt;script&gt;/.test(em.html) && /&amp;/.test(em.html), em && em.html);
    check('html: the plain-text version keeps exactly what the agent typed', em && em.text === evil, em && em.text);

    // ---- 6. sample tickets send nothing and show no delivery state ----
    r = await rpc(tok, 'replyToTicket', 'TKT-REL0002', 'Reply on a sample ticket', false, 'key-s');
    t = await getT('TKT-REL0002');
    check('sample ticket: saved, nothing sent, no delivery state', r.success && !r.deliveryStatus && !t.thread.find((m) => m.id === r.msgId).deliveryStatus && !mails().some((m) => /sample ticket/.test(m.text)), r);

    // ---- 7. the ticket stays consistent ----
    t = await getT('TKT-REL0001');
    check('ticket: opened by the first reply, messages in order, none lost', t.status === 'open' && t.thread.length >= 6 && t.thread[0].type === 'incoming', [t.status, t.thread.length]);
    check('ticket: no message was written twice', new Set(t.thread.map((m) => m.id)).size === t.thread.length);
    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-300));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
