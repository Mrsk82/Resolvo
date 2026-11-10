// Inbox speed with a large workspace: 5,000 tickets with real-sized threads. Measures the list call (first page, a filter, a search inside messages) and prints the times.
// Fails only if something is clearly too slow (see LIMIT_MS). Run: node docs/ui-redesign/tools/inbox_perf_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3940, BASE = 'http://localhost:' + PORT, N = +(process.env.TICKETS || 5000), LIMIT_MS = +(process.env.LIMIT_MS || 2500);
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 200) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-perf-')), app = path.join(tmp, 'app');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
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
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8')); o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  const sq = new Dsql(path.join(app, 'data', 'brands', 'demo', 'db.sqlite')); sq.prepare('DELETE FROM tickets').run(); demoLogin(sq);
  const ins = sq.prepare('INSERT INTO tickets(id,data) VALUES(?,?)'), st = ['new', 'open', 'open', 'pending', 'resolved', 'closed'], pr = ['Low', 'Medium', 'Medium', 'High', 'Critical'], now = Date.now();
  const body = 'Hello, I ordered a product two weeks ago and it has not arrived. '.repeat(6);
  sq.transaction(() => { for (let i = 0; i < N; i++) {
    const m = (i % 4000) * 60000 + 120000, ts = new Date(now - m).toISOString();
    ins.run('TKT-P' + i, JSON.stringify({ id: 'TKT-P' + i, subject: 'Order question ' + i, status: st[i % st.length], priority: pr[i % pr.length], from: 'c' + (i % 900) + '@example.test', fromName: 'Customer ' + (i % 900), createdDate: ts, lastActivity: ts, channel: 'email', tags: [], messageIds: [],
      sentimentLevel: i % 7 === 0 ? 'negative' : 'neutral', assignedTo: i % 3 ? '' : 'admin@demo.local', thread: [{ id: 'M' + i + 'a', type: 'incoming', from: 'c@example.test', body, timestamp: ts }, { id: 'M' + i + 'b', type: 'reply', from: 'admin@demo.local', body: 'We are checking this for you.', timestamp: ts, sentAsEmail: true, deliveryStatus: 'sent' }] }));
  } })();
  sq.close();
}
let srv, srvLog = '';
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, PORT: String(PORT), MAIL_CAPTURE: path.join(tmp, 'mail.jsonl'), EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-400));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const timed = async (label, tok, f) => { const t0 = Date.now(); const r = await post('/api/call', { fn: 'getTickets', args: [f] }, tok); const ms = Date.now() - t0; check(label + ': ' + ms + ' ms', r.success && ms < LIMIT_MS, { total: r.total, ms }); return { r, ms }; };
(async () => {
  build(); await start();
  try {
    const tok = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    await timed('first page (warm-up)', tok, { status: 'all', limit: 25 });
    const a = await timed('first page of ' + N + ' tickets', tok, { status: 'all', limit: 25 });
    check('first page returns 25 rows and the right total', a.r.tickets.length === 25 && a.r.total > 0 && a.r.total < N + 1, [a.r.tickets.length, a.r.total]);
    check('rows do not carry whole threads', a.r.tickets.every((t) => t.thread === undefined));
    await timed('filter: mine', tok, { status: 'mine', limit: 25 });
    await timed('filter: SLA breached', tok, { sla: 'breached', limit: 25 });
    await timed('sort: SLA deadline', tok, { sort: 'sla', limit: 25 });
    await timed('search inside messages', tok, { search: 'two weeks ago', limit: 25 });
    await timed('negative mood + unread', tok, { sentiment: 'negative', read: 'unread', limit: 25 });
    const t0 = Date.now(); const rr = await post('/api/call', { fn: 'getTicketById', args: ['TKT-P42'] }, tok); const ms = Date.now() - t0;
    check('open one ticket: ' + ms + ' ms', rr.success && ms < LIMIT_MS);
  } catch (e) { check('perf run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
