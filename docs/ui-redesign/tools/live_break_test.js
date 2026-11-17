// Live team: agent activity, breaks, and "who gets the next ticket". Checks the prediction against what the real assignment then does.
// Throwaway copy on :3949; nothing is emailed. Run: node docs/ui-redesign/tools/live_break_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3949, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 420) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-break-')), app = path.join(tmp, 'app');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const dbFile = () => path.join(app, 'data', 'brands', 'demo', 'db.sqlite'), ownerFile = () => path.join(app, 'data', 'owner.json');
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
  cp.execFileSync(process.execPath, [path.join(ROOT, 'docs', 'ui-redesign', 'tools', 'live_more_seed.js'), dbFile(), ROOT]);
}
let srv, srvLog = '';
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, LIVE_CACHE_MS: '1', LIVE_INC_MS: '1', PORT: String(PORT), MAIL_CAPTURE: path.join(tmp, 'mail.jsonl'), EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-400));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const rpc = (tok, fn, ...a) => post('/api/call', { fn, args: a }, tok);
const sqlite = (f) => { const d = new Dsql(dbFile()); try { return f(d); } finally { d.close(); } };

(async () => {
  build(); await start();
  try {
    const login = async (e) => (await post('/api/login', { email: e, password: 'demo1234' })).token;
    const admin = await login('admin@demo.local'), sam = await login('sam@demo.local'), ravi = await login('ravi@demo.local'), mira = await login('mira@demo.local'); let tina = await login('tina@demo.local');
    const board = async (tok) => rpc(tok || admin, 'getLiveBoard'); const card = (b, e) => b.agents.find((a) => a.email === e);
    const queue = (over) => rpc(admin, 'saveQueueConfig', { enabled: true, mode: 'roundrobin', frozen: false, agents: ['sam@demo.local', 'ravi@demo.local', 'tina@demo.local', 'mira@demo.local'].map((e) => ({ email: e, inQueue: true })), routingRules: [], timeRules: [], ...(over || {}) });
    const nextTicket = async (n) => { const r = await rpc(admin, 'createManualTicket', { subject: 'Probe ' + n + ' ' + Math.random().toString(36).slice(2, 7), customerEmail: 'probe' + n + '@example.test', customerName: 'Probe', description: 'Hello', priority: 'Low' }); return r.success ? (await rpc(admin, 'getTicketById', r.ticketId || r.id)).ticket.assignedTo : null; };
    const peek = async () => (await board()).queue;

    // ---- a break ----
    let b = await board();
    check('activity: every card says active, idle, break or away', b.agents.every((a) => ['active', 'idle', 'break', 'away', 'offline'].includes(a.activity)) && card(b, 'ravi@demo.local').activity === 'away', b.agents.map((a) => [a.email, a.activity]));
    check('activity: Sam (acted 3 minutes ago) is active; Tina (no activity, and Resolvo not open) is offline although marked Active', card(b, 'sam@demo.local').activity === 'active' && card(b, 'tina@demo.local').activity === 'offline' && card(b, 'tina@demo.local').seenMin === null, [card(b, 'sam@demo.local').activity, card(b, 'tina@demo.local').activity]);
    check('presence: an agent can tell the server the page is open', (await rpc(tina, 'pingPresence')).success);
    b = await board();
    check('presence: Tina is now idle (open but no ticket work) and was seen 0 minutes ago', card(b, 'tina@demo.local').activity === 'idle' && card(b, 'tina@demo.local').seenMin === 0, [card(b, 'tina@demo.local').activity, card(b, 'tina@demo.local').seenMin]);
    check('presence: signing out makes her offline straight away', (await post('/api/logout', {}, tina)).success && card(await board(), 'tina@demo.local').activity === 'offline');
    tina = await login('tina@demo.local');
    check('presence: signing in again (status check on load) makes her idle again', (await rpc(tina, 'getMyStatus')).success && card(await board(), 'tina@demo.local').activity === 'idle');
    check('presence: a person who is not signed in cannot send a ping', !(await rpc('bad-token', 'pingPresence')).success);
    const samOpen = card(b, 'sam@demo.local').open;
    let r = await rpc(sam, 'setAgentStatus', 'break');
    check('break: an agent can start a break', r.success && r.status === 'break', r);
    check('break: it is stored as Away with the reason, so every assignment rule already skips it', sqlite((d) => { const u = JSON.parse(d.prepare("SELECT data FROM users WHERE data LIKE '%sam@demo.local%'").get().data); return u.availabilityStatus === 'away' && u.awayReason === 'break'; }));
    check('break: my own status reads "break"', (await rpc(sam, 'getMyStatus')).status === 'break');
    b = await board(); let sc = card(b, 'sam@demo.local');
    check('break: the board shows Sam on break with a timer, not "away with tickets"', sc.onBreak === true && sc.activity === 'break' && sc.statusSinceMin === 0 && sc.awayWithTickets === false && sc.longBreak === false, sc);
    check('break: Sam is not counted as available', b.tiles.available.n === 3, b.tiles.available);
    check('break: today\'s breaks counted (1)', sc.breaksToday.count === 1);
    check('break: Sam keeps the tickets he had (a break does not hand them to others)', sc.open === samOpen);
    check('break: choosing Break again changes nothing (no second break counted)', (await rpc(sam, 'setAgentStatus', 'break')).success && card(await board(), 'sam@demo.local').breaksToday.count === 1);
    check('status: an unknown status is refused', !(await rpc(sam, 'setAgentStatus', 'sleeping')).success && !(await rpc(sam, 'setAgentStatus', '')).success);
    check('status: statuses listed for the team carry the reason', (await rpc(admin, 'getAgentStatuses')).agents.find((a) => a.email === 'sam@demo.local').reason === 'break');

    // ---- how long a break may last ----
    sqlite((d) => { const row = d.prepare("SELECT id,data FROM users WHERE data LIKE '%sam@demo.local%'").get(), u = JSON.parse(row.data); u.statusUpdatedAt = new Date(Date.now() - 40 * 60000 + 5.5 * 3600000).toISOString().replace('Z', '+05:30'); d.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), row.id); });
    b = await board(); sc = card(b, 'sam@demo.local');
    check('break: after 40 minutes the board shows 40 and flags it as long (limit 30)', sc.statusSinceMin >= 39 && sc.statusSinceMin <= 41 && sc.longBreak === true, [sc.statusSinceMin, sc.longBreak, b.cfg.breakMin]);
    const cfg0 = (await rpc(admin, 'getLiveBoardConfig')).config;
    check('limits: the long-break limit is 30 by default and can be changed by an admin only', cfg0.breakMin === 30 && (await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, breakMin: 60 })).success && !(await rpc(mira, 'saveLiveBoardConfig', { ...cfg0, breakMin: 10 })).success);
    check('limits: 60 minutes stops the flag, and values outside 5 to 240 are refused', card(await board(), 'sam@demo.local').longBreak === false && !(await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, breakMin: 4 })).success && !(await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, breakMin: 241 })).success);
    await rpc(admin, 'saveLiveBoardConfig', { ...cfg0, breakMin: 30 });

    // ---- who gets the next ticket ----
    let q = await peek();
    check('next up: with auto-assign off it says so and names nobody', q.state === 'off' && !q.next, q);
    await queue();
    q = await peek();
    check('next up: with auto-assign on, Sam (break) and Ravi (away) are skipped with their reasons', q.state === 'on' && q.skipped.some((s) => s.email === 'sam@demo.local' && s.why === 'break') && q.skipped.some((s) => s.email === 'ravi@demo.local' && s.why === 'away'), q);
    check('next up: the next person and the ones after are named, round robin', !!q.next && q.mode === 'roundrobin' && [q.next, ...q.then].every((x) => ['tina@demo.local', 'mira@demo.local'].includes(x.email)), q);
    let agree = 0, tries = 6, seen = new Set();
    for (let i = 0; i < tries; i++) { const p = await peek(); const got = await nextTicket(i); seen.add(got); if (p.next && got === p.next.email) agree++; }
    check('next up: the person named is the person the real assignment picks, 6 times in a row', agree === tries, [agree, [...seen]]);
    check('next up: tickets went to both people in turn, never to Sam on break or Ravi away', seen.size === 2 && !seen.has('sam@demo.local') && !seen.has('ravi@demo.local'), [...seen]);
    await queue({ mode: 'leastbusy' });
    q = await peek(); const lb = q.next;
    check('next up (least busy): names whoever has the fewest open tickets', q.mode === 'leastbusy' && lb && q.then.length <= 1 && [lb, ...q.then].every((x, i, a) => i === 0 || a[i - 1].open <= x.open), q);
    const got = await nextTicket(99);
    check('next up (least busy): and that is who really gets it', got === lb.email, [got, lb.email]);
    sqlite((d) => { const row = d.prepare("SELECT id,data FROM users WHERE data LIKE '%tina@demo.local%'").get(), u = JSON.parse(row.data); u.maxTickets = 1; d.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), row.id); });
    q = await peek();
    check('next up: somebody at their limit is skipped as full', q.skipped.some((s) => s.email === 'tina@demo.local' && s.why === 'full' && s.max === 1), q.skipped);
    await queue({ agents: [{ email: 'sam@demo.local', inQueue: true }, { email: 'ravi@demo.local', inQueue: true }] });
    q = await peek();
    check('next up: when nobody can take one it says "nobody" and why', q.state === 'nobody' && !q.next && q.skipped.length === 2, q);
    await queue({ frozen: true });
    check('next up: a frozen queue says so', (await peek()).state === 'frozen');
    await queue({ routingRules: [{ enabled: true, type: 'keyword', keyword: 'refund', assignTo: 'mira@demo.local' }], priorityRouting: true });
    check('next up: tells how many special rules can send a ticket elsewhere', (await peek()).rules === 2);
    check('next up: an agent cannot read it', !(await board(sam)).success);

    // ---- back from the break ----
    r = await rpc(sam, 'setAgentStatus', 'available');
    check('back: Sam is available again, the break is closed and counted', r.success && r.status === 'available', r);
    b = await board(); sc = card(b, 'sam@demo.local');
    check('back: the card is no longer on break, and today shows 1 break of about 0 minutes', sc.onBreak === false && sc.status === 'available' && sc.breaksToday.count === 1 && sc.breaksToday.min <= 1, sc);
    await queue({ mode: 'roundrobin' });
    check('back: Sam can be next again', (await peek()).skipped.every((s) => s.email !== 'sam@demo.local'));

    // ---- break then Away: tickets move (a break does not move them, Away does) ----
    await queue({ mode: 'roundrobin' });
    await rpc(tina, 'setAgentStatus', 'available');
    const tinaOpen = card(await board(), 'tina@demo.local').open;
    await rpc(tina, 'setAgentStatus', 'break'); const afterBreak = card(await board(), 'tina@demo.local').open;
    r = await rpc(tina, 'setAgentStatus', 'away'); const afterAway = card(await board(), 'tina@demo.local').open;
    check('away: a break keeps Tina\'s tickets; going Away from a break hands them over (queue on)', afterBreak === tinaOpen && (r.reassigned > 0 ? afterAway < tinaOpen : tinaOpen === 0), [tinaOpen, afterBreak, afterAway, r]);
    check('away: an Away person is "away", not on break', card(await board(), 'tina@demo.local').onBreak === false && card(await board(), 'tina@demo.local').activity === 'away');

    // ---- an admin changes someone else's status ----
    await rpc(ravi, 'setAgentStatus', 'break');
    check('admin: an admin setting a person back to Available ends their break', (await rpc(admin, 'setAgentStatusAdmin', 'ravi@demo.local', 'available')).success && card(await board(), 'ravi@demo.local').onBreak === false && card(await board(), 'ravi@demo.local').status === 'available');
    check('admin: that break is closed in the log (not still running)', sqlite((d) => { const v = JSON.parse(d.prepare("SELECT value FROM kv WHERE key='agentBreakLog'").get().value); return v.filter((x) => x.e === 'ravi@demo.local').every((x) => x.t != null); }), sqlite((d) => d.prepare("SELECT value FROM kv WHERE key='agentBreakLog'").get()));

    // ---- the wallboard ----
    await rpc(sam, 'setAgentStatus', 'break'); await queue({ mode: 'roundrobin' });
    const lk = await rpc(admin, 'createWallboardLink', 'break test'); const u = lk.url.slice(lk.url.indexOf('/wall/'));
    const w = await (await fetch(BASE + '/api/wall/' + u.split('/wall/')[1])).json();
    check('wallboard: shows Sam as on break (first name only) and who is next up (first name only)', w.agents.some((a) => a.name === 'Sam' && a.status === 'break') && (w.queue.state === 'on' ? /^[A-Za-z]+$/.test(w.queue.next || '') : true) && !JSON.stringify(w).includes('@'), w.queue);
    check('server: no crash', !/TypeError|ReferenceError|UnhandledPromise|is not defined/.test(srvLog), srvLog.slice(-400));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
