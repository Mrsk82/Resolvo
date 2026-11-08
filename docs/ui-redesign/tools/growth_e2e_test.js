// Growth tracking: cookie-free visit counts, where leads came from, the funnel, the Monday email, contact-form safety.
// Runs lib/analytics.js directly, then a throwaway copy of the app on :3931 (MAIL_CAPTURE: no email is ever sent).
// Run: node docs/ui-redesign/tools/growth_e2e_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const A = require(path.join(ROOT, 'lib', 'analytics.js'));
const PORT = 3931, BASE = 'http://localhost:' + PORT;
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 300) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. the counting library on its own ----------
{
  const c = (a) => A.classify(A.cleanAttr(a));
  check('source: a tagged link wins over the referring site', c({ utm_source: 'LinkedIn', utm_medium: 'social', utm_campaign: 'nov-launch', r: 'https://www.google.com/' }).source === 'linkedin');
  check('source: Google search is recognised', c({ r: 'https://www.google.co.in/search?q=x' }).source === 'Google' && c({ r: 'https://www.google.co.in/' }).medium === 'organic search');
  check('source: LinkedIn and WhatsApp links are social', c({ r: 'https://lnkd.in/abc' }).source === 'LinkedIn' && c({ r: 'https://wa.me/91' }).medium === 'social');
  check('source: another website is a referral, named by host only', (() => { const x = c({ r: 'https://www.example.org/some/path?id=12' }); return x.source === 'example.org' && x.medium === 'referral'; })());
  check('source: our own pages and empty are direct', c({ r: 'https://app.resolvogroup.com/pitch' }).source === 'direct' && c(null).source === 'direct');
  check('clean: markup and control characters are removed, lengths capped', (() => { const x = A.cleanAttr({ s: '<script>alert(1)</script>' + 'x'.repeat(200), c: 'a\u0000b' }); return !/[<>]/.test(x.s) && x.s.length <= 60 && x.c === 'ab'; })());
  check('clean: junk input gives nothing', A.cleanAttr('x') === null && A.cleanAttr({}) === null && A.cleanAttr(null) === null);
  check('bots: common crawlers and tools are ignored', ['Googlebot/2.1', 'curl/8', 'python-requests', 'HeadlessChrome', 'Lighthouse', ''].every((u) => A.isBot(u)) && !A.isBot(CHROME));
  check('paths: only real public pages count', A.okPath('/pitch') && A.okPath('/tools/sla-calculator') && !A.okPath('/api/hit') && !A.okPath('/owner-console') && !A.okPath('/js/site.js') && !A.okPath('/a b') && !A.okPath('//x?y'));

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rv-an-')), 'a.json');
  const st = A.createStore(file), t0 = new Date('2026-11-02T10:00:00Z');
  st.hit({ path: '/pitch', attr: { s: 'linkedin', m: 'social' }, device: 'phone', ip: '1.1.1.1', ua: CHROME, now: t0 });
  st.hit({ path: '/pitch', attr: { s: 'linkedin', m: 'social' }, device: 'phone', ip: '1.1.1.1', ua: CHROME, now: t0 });
  st.hit({ path: '/features/', attr: null, device: 'desktop', ip: '2.2.2.2', ua: CHROME, now: t0 });
  check('store: a bot is not counted', st.hit({ path: '/pitch', ip: '9.9.9.9', ua: 'Googlebot', now: t0 }) === false);
  const rep = st.report(7, new Date('2026-11-03T10:00:00Z'));
  check('store: views and uniques are separate', rep.views === 3 && rep.uniques === 2, rep);
  check('store: pages merge a trailing slash and are ranked', rep.pages[0].name === '/pitch' && rep.pages[0].views === 2 && rep.pages.some((p) => p.name === '/features'), rep.pages);
  check('store: sources and devices are counted', rep.sources[0].name === 'linkedin · social' && rep.devices.phone === 2 && rep.devices.desktop === 1, [rep.sources, rep.devices]);
  check('store: the report has one entry per day asked for', rep.days.length === 7 && rep.days[rep.days.length - 1].date === '2026-11-03');
  st.flush();
  const saved = fs.readFileSync(file, 'utf8');
  check('privacy: the saved file holds no IP address and no browser string', !/1\.1\.1\.1|2\.2\.2\.2|Mozilla/.test(saved));
  const st2 = A.createStore(file);
  check('store: numbers survive a restart', st2.report(7, new Date('2026-11-03T10:00:00Z')).views === 3);
  st2.hit({ path: '/pitch', ip: '1.1.1.1', ua: CHROME, now: new Date('2026-11-04T10:00:00Z') });
  st2.hit({ path: '/pitch', ip: '1.1.1.1', ua: CHROME, now: new Date('2026-11-05T10:00:00Z') });
  const r2 = st2.report(7, new Date('2026-11-05T10:00:00Z'));
  check('store: the same visitor is counted once per day, again on a new day', r2.days.filter((d) => d.uniques === 1).length >= 2, r2.days);
}

// ---------- 2. the running app ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-gw-')), app = path.join(tmp, 'app'), mailFile = path.join(tmp, 'mail.jsonl');
function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8'));
  o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = []; o.leadLog = []; o.passwordHash = bcrypt.hashSync('Owner-test-1', 10);
  o.pwdResetTokens = {}; o.auditLog = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  return o.email;
}
let srv, srvLog = '';
async function start() {
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...process.env, PORT: String(PORT), MAIL_CAPTURE: mailFile, EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-600));
}
async function stop() { if (!srv) return; srv.kill(); await sleep(600); srv = null; }
const raw = (p, body, tok, ua) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua || CHROME, ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(body || {}) });
const post = (p, body, tok) => raw(p, body, tok).then((r) => r.json());
const get = (p, tok) => fetch(BASE + p, { headers: tok ? { 'x-session-token': tok } : {} });
const mails = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

(async () => {
  const ownerEmail = build();
  await start();
  try {
    let r = await post('/api/login', { email: ownerEmail, password: 'Owner-test-1' }); const owner = r.token;
    check('setup: owner can sign in', !!owner, r);
    const demo = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;

    // ---- visit beacon ----
    let h = await raw('/api/hit', { p: '/pitch', a: { s: 'linkedin', m: 'social', c: 'nov-launch' }, d: 'phone' });
    check('hit: answers 204 with nothing in the body', h.status === 204);
    await raw('/api/hit', { p: '/pitch', a: { r: 'https://www.google.com/' }, d: 'desktop' });
    await raw('/api/hit', { p: '/api/signup', d: 'desktop' });
    await raw('/api/hit', { p: '/owner-console', d: 'desktop' });
    await raw('/api/hit', { p: '/pitch', d: 'desktop' }, null, 'Googlebot/2.1');
    await raw('/api/hit', 'not json at all');
    await sleep(200);
    r = await (await get('/api/owner/growth?days=7', owner)).json();
    check('growth: counts only the real page views', r.success && r.traffic.views === 2, [r.traffic.views, r.traffic.pages, r.traffic.sources]);
    check('growth: shows sources and top page', r.traffic.pages[0].name === '/pitch' && r.traffic.sources.some((s) => s.name === 'linkedin · social') && r.traffic.sources.some((s) => s.name === 'Google · organic search'), r.traffic);
    r = await get('/api/owner/growth', demo); const rj = await r.json();
    check('growth: a workspace admin cannot read it', !rj.success && rj.traffic === undefined, rj);
    r = await fetch(BASE + '/api/owner/growth'); const rj2 = await r.json().catch(() => ({}));
    check('growth: signed-out visitors cannot read it', rj2.traffic === undefined);

    // ---- leads and where they came from ----
    r = await post('/api/demo-request', { name: 'Riya Shah', email: 'riya@shopfront.in', company: 'Shopfront', message: 'Looking at it', attribution: { utm_source: 'cold-email', utm_medium: 'email', utm_campaign: 'oct-2026-50', l: '/demo' } });
    check('demo request: accepted', r.success !== false, r);
    r = await post('/api/demo-request', { name: 'Kabir Rao', email: 'kabir@brandly.in', company: 'Brandly', message: 'DESIGN PARTNER application: we use email and WhatsApp', attribution: { r: 'https://lnkd.in/x' } });
    check('design partner request: accepted', r.success !== false, r);
    r = await post('/api/signup', { name: 'Mira Jain', email: 'mira@urbanloom.in', company: 'Urban Loom', password: 'Strong-pass-123!', attribution: { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'nov-launch', l: '/pitch' } });
    check('sign-up: accepted', r.success, r);
    r = await post('/api/contact', { name: 'Dev Patel', email: 'dev@studio.in', topic: 'SLA calculator', message: 'Please help with <b>setup</b>', attribution: { utm_source: 'google', utm_medium: 'organic' } });
    check('contact: accepted', r.ok === true, r);
    r = await (await get('/api/owner/growth?days=7', owner)).json();
    const L = r.leads, by = L.byType;
    check('leads: one sign-up, one demo, one partner, one calculator message', by.signup === 1 && by.demo === 1 && by.partner === 1 && by.calculator === 1, by);
    const sign = L.recent.find((x) => x.type === 'signup');
    check('leads: the sign-up carries its campaign and landing page', sign && sign.source === 'linkedin' && sign.campaign === 'nov-launch' && sign.landing === '/pitch', sign);
    check('leads: the demo request is credited to the cold-email campaign', L.bySource.some((s) => s.label === 'cold-email · email' && s.demo === 1), L.bySource);
    check('leads: the partner request is credited to LinkedIn by its referrer', L.bySource.some((s) => s.label === 'LinkedIn · social' && s.partner === 1), L.bySource);
    check('leads: stored in lower case, never as a raw address of a page', L.recent.every((x) => x.email === x.email.toLowerCase()));
    const own = JSON.parse(fs.readFileSync(path.join(app, 'data', 'owner.json'), 'utf8'));
    check('sign-up: attribution is also saved on the new workspace', (own.brands.find((b) => b.majorAdminEmail === 'mira@urbanloom.in') || {}).attribution?.s === 'linkedin');
    check('demo request: attribution is saved on the prospect', (own.prospects.find((p) => p.email === 'riya@shopfront.in') || {}).attribution?.c === 'oct-2026-50');
    check('privacy: the lead log holds no IP address', !/"ip"/.test(JSON.stringify(own.leadLog)));

    // ---- funnel ----
    const f = r.funnel;
    check('funnel: counts the new sign-up and leaves the demo workspace out', f.signedUp === 1 && f.activated === 0 && f.stuck.length === 1 && f.stuck[0].at === 'never activated', f);

    // ---- contact form safety ----
    const mc = mails().filter((m) => m.via === 'contact' && /Dev Patel/.test(m.subject || ''));
    check('contact: the email shown to you has the message escaped', mc.length && mc.every((m) => !/<b>setup<\/b>/.test(m.html || '')) && mc.some((m) => /&lt;b&gt;setup/.test(m.html || '')), mc.map((m) => (m.html || '').slice(0, 80)));
    r = await post('/api/contact', { name: 'X', email: 'not-an-email', message: 'hello' });
    check('contact: a bad email address is refused', r.error && /valid email/i.test(r.error), r);
    r = await post('/api/contact', { name: 'X', email: 'x@y.in' });
    check('contact: a missing message is refused', r.error && /Missing/i.test(r.error), r);
    let limited = 0; for (let i = 0; i < 8; i++) { const x = await raw('/api/contact', { name: 'Spam', email: 's@spam.in', message: 'hi ' + i }); if (x.status === 429) limited++; }
    check('contact: sending many messages gets rate-limited', limited >= 1, limited);

    // ---- Monday email ----
    const before = mails().length;
    r = await post('/api/owner/growth/digest/send', {}, owner);
    check('digest: send now works', r.success, r);
    const dm = mails().slice(before).find((m) => /Resolvo this week/.test(m.subject || ''));
    check('digest: the email has the week in numbers and a link to the Growth tab', dm && /Sign-ups: 1/.test(dm.text || '') && /owner-console#growth/.test(dm.text || ''), dm && dm.subject);
    r = await post('/api/owner/growth/digest', { enabled: false }, owner);
    check('digest: can be switched off', r.success && r.enabled === false, r);
    r = await (await get('/api/owner/growth', owner)).json();
    check('digest: the switch shows in the report', r.digest === false, r.digest);
    r = await post('/api/owner/growth/digest', { enabled: true }, owner); check('digest: can be switched back on', r.enabled === true, r);
    r = await post('/api/owner/growth/digest/send', {}, demo);
    check('digest: a workspace admin cannot trigger it', !r.success, r);

    // ---- the pages and the console ----
    for (const p of ['/tools/whatsapp-templates', '/tools/sla-calculator', '/shopify-customer-support-india']) { const x = await get(p); check('page ' + p + ' loads', x.status === 200 && (await x.text()).includes('<h1>')); }
    const con = await (await get('/owner-console')).text();
    check('console: the Growth tab and its parts are there', ['data-tab="growth"', 'id="panel-growth"', 'id="gwFunnel"', 'id="ubOut"', 'id="gwDigest"'].every((k) => con.includes(k)));
  } catch (e) { check('test run finished without an exception', false, String(e && e.stack || e)); }
  await stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
