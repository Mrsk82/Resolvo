// End-to-end check of the safeguards on a throwaway copy of the app (demo workspace only, nothing real, no email is ever sent:
// MAIL_CAPTURE writes each email to a file instead). Run: node docs/ui-redesign/tools/safeguards_e2e_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const PORT = 3917, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 300) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-e2e-')), app = path.join(tmp, 'app'), backups = path.join(tmp, 'backups'), mailFile = path.join(tmp, 'mail.jsonl');

function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8'));
  o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = []; o.passwordHash = bcrypt.hashSync('Owner-test-1', 10);
  o.pwdResetTokens = {}; o.auditLog = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
  return o.email;
}
let srv, srvLog = '';
async function start(capture) {
  srvLog = '';
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...process.env, PORT: String(PORT), MAIL_CAPTURE: capture, BACKUP_DIR: backups, EMAIL_ENABLED: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-600));
}
async function stop() { if (!srv) return; srv.kill(); await sleep(600); srv = null; }
const post = (p, body, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(body || {}) }).then((r) => r.json());
const get = (p, tok) => fetch(BASE + p, { headers: tok ? { 'x-session-token': tok } : {} }).then((r) => r.json());
const rpc = (tok, fn, ...args) => post('/api/call', { fn, args }, tok);
const login = (email, password) => post('/api/login', { email, password });
const mails = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

(async () => {
  const ownerEmail = build();
  await start(mailFile);
  try {
    let r = await login('admin@demo.local', 'demo1234'); const admin = r.token;
    check('setup: demo admin can sign in', !!admin, r);

    // ---- settings banner ----
    r = await rpc(admin, 'getSettingsOverview');
    check('banner: a workspace with no email of its own is told to set one up', (r.attention || []).some((a) => /email your customers get mail from/i.test(a.title)), r.attention);

    // ---- forgot password: capitals, spaces, honest answers ----
    r = await post('/api/forgot-password', { email: '  ADMIN@Demo.Local ' });
    check('reset: capitals and spaces in the typed address do not matter', r.success && r.sent === true && /admin@demo\.local/.test(r.message), r);
    let m = mails().filter((x) => /Reset Your Password/.test(x.subject));
    check('reset: the email really went out, from Resolvo\'s own sender (the workspace has none)', m.length === 1 && m[0].to === 'admin@demo.local' && m[0].via === 'platform-fallback', m);
    const tok = ((m[0] || {}).text || '').match(/token=([0-9a-f-]{36})/);
    check('reset: the email contains a working link', !!tok, m[0] && m[0].text);
    r = await post('/api/reset-password', { token: tok && tok[1], newPassword: 'Newpass-123' });
    check('reset: the link sets a new password', r.success === true, r);
    r = await login('ADMIN@demo.local', 'Newpass-123');
    check('login: works with capital letters in the address', r.success === true && !!r.token, r); const admin2 = r.token;
    r = await login('admin@demo.local', 'demo1234');
    check('login: the old password no longer works', r.success === false, r);

    const before = mails().length;
    r = await post('/api/forgot-password', { email: 'nobody-here@example.com' });
    check('reset: an unknown address gets a neutral answer and no email', r.success === true && !r.sent && /If that address is registered/.test(r.message) && mails().length === before, r);
    r = await post('/api/forgot-password', { email: 'not-an-email' });
    check('reset: a typo gets a clear message', r.success === false && /Enter the email/.test(r.error), r);
    let last; for (let i = 0; i < 6; i++) last = await post('/api/forgot-password', { email: 'limit@example.com' });
    check('reset: too many requests for one address are stopped', last.success === false && /Too many/.test(last.error), last);

    // ---- adding users: email result, change record ----
    r = await rpc(admin2, 'addUser', { name: 'Pat Test', email: '  Pat.TEST@Example.com ', role: 'Agent', team: 'Support' });
    check('add user: saved, email sent, no password shown on screen', r.success && r.emailSent === true && !r.tempPassword, r);
    const patId = r.userId;
    const w = mails().filter((x) => /Welcome to/.test(x.subject) && x.to === 'pat.test@example.com');
    check('add user: the address was tidied and the welcome email has the login details', w.length === 1 && /Pass: /.test(w[0].text) && w[0].via === 'platform-fallback', w);
    const patPass = ((w[0] || {}).text || '').match(/Pass: (\S+)/);
    r = await rpc(admin2, 'addUser', { name: 'Pat Again', email: 'PAT.test@example.com', role: 'Agent' });
    check('add user: the same address in other capitals is a duplicate', r.success === false && /already registered/.test(r.error), r);
    r = await login('PAT.test@example.com', patPass && patPass[1]);
    check('add user: the new person can sign in with the emailed password', r.success === true, r); const pat = r.token;

    r = await rpc(admin2, 'resendWelcomeEmail', patId);
    check('resend welcome: sends a new email and says so', r.success && r.emailSent === true && mails().filter((x) => /Your .* Account/.test(x.subject) && x.to === 'pat.test@example.com').length === 1, r);
    r = await rpc(admin2, 'updateUser', patId, { role: 'Manager' });
    check('update user: role change saved', r.success === true, r);
    r = await rpc(admin2, 'changePassword', patId, 'Patnew-123');
    check('change password by admin saved', r.success === true, r);
    r = await rpc(admin2, 'forcePasswordChange', patId);

    r = await rpc(admin2, 'getAuditTrail', {});
    const acts = (r.logs || []).map((l) => l.action + ' | ' + (l.detail || ''));
    check('change record: the audit page gets a list called "logs"', r.success && Array.isArray(r.logs) && r.logs.length >= 4, r);
    check('change record: user added, welcome resent, role change, password change are all there',
      ['user added', 'welcome resent', 'user updated', 'password changed'].every((k) => acts.some((a) => a.startsWith(k))), acts.slice(0, 8));
    check('change record: it says who and what', (r.logs || []).some((l) => l.action === 'user added' && l.user === 'admin@demo.local' && /pat\.test@example\.com/.test(l.detail)), r.logs && r.logs[0]);
    check('change record: newest first', (r.logs || []).every((l, i, a) => !i || String(a[i - 1].timestamp) >= String(l.timestamp)));
    r = await rpc(pat, 'getAuditTrail', {});
    check('change record: people who are not admins cannot read it', r.success === false, r);

    // ---- backups through the owner portal ----
    r = await login(ownerEmail, 'Owner-test-1'); const owner = r.token;
    check('setup: owner can sign in on the copy', !!owner, r);
    r = await get('/api/owner/backups', admin2);
    check('backups: not available to a workspace admin', r.success === false, r);
    r = await post('/api/owner/backups/run', {}, owner);
    check('backups: owner can run a backup now', r.success === true && r.packed === true && r.workspaces === 1 && r.databases === 1, r);
    r = await get('/api/owner/backups', owner);
    check('backups: the list shows it and the last result', r.success && r.backups.length === 1 && r.last && r.last.ok === true && /\.tar\.gz$/.test(r.backups[0].name), r);
    const name = r.backups[0].name;
    const dl = await fetch(BASE + '/api/owner/backups/download/' + name, { headers: { 'x-session-token': owner } });
    const buf = Buffer.from(await dl.arrayBuffer());
    check('backups: the download is a real gzip file', dl.ok && buf[0] === 0x1f && buf[1] === 0x8b && buf.length > 1000, [dl.status, buf.length]);
    const bad = await fetch(BASE + '/api/owner/backups/download/..%2F..%2Fowner.json', { headers: { 'x-session-token': owner } });
    check('backups: a made-up file name is refused', bad.status === 400 || bad.status === 404, bad.status);
    const unp = path.join(tmp, 'unpacked'); fs.mkdirSync(unp); fs.copyFileSync(path.join(backups, name), path.join(unp, name));
    cp.spawnSync('tar', ['-xzf', name], { cwd: unp });
    const man = JSON.parse(fs.readFileSync(path.join(unp, name.replace('.tar.gz', ''), 'manifest.json'), 'utf8'));
    check('backups: the backup holds the demo workspace with the users just added', man.workspacesInOwnerFile === 1 && man.brands.demo && man.brands.demo.users >= 3, man);
    r = await post('/api/owner/backups/run', {}, owner);
    check('backups: a second request in the same minute does not make a second file', r.success === true && !!r.skipped, r);

    // ---- owner file saved safely ----
    const ownerFile = path.join(app, 'data', 'owner.json');
    check('owner file: valid, and no half-written temp file left behind', !!JSON.parse(fs.readFileSync(ownerFile, 'utf8')).brands && !fs.existsSync(ownerFile + '.tmp'));
    check('owner file: the audit log recorded the backup run', JSON.parse(fs.readFileSync(ownerFile, 'utf8')).auditLog.some((a) => a.action === 'backup_run'));

    // ---- when no email can be sent at all ----
    await stop(); fs.mkdirSync(path.join(tmp, 'broken-mail'), { recursive: true });
    await start(path.join(tmp, 'broken-mail'));   // a folder where a file should be: every send fails
    r = await login('admin@demo.local', 'Newpass-123'); const adminB = r.token;
    r = await rpc(adminB, 'addUser', { name: 'Lee Test', email: 'lee@example.com', role: 'Agent' });
    check('no email: the user is still added, and the admin is told the email did not go', r.success && r.emailSent === false && typeof r.tempPassword === 'string' && r.tempPassword.length >= 6, r);
    const lee = await login('lee@example.com', r.tempPassword);
    check('no email: the temporary password shown to the admin really works', lee.success === true, lee);
    r = await rpc(adminB, 'resendWelcomeEmail', r.userId);
    check('no email: resend also says it failed and shows the password', r.success && r.emailSent === false && !!r.tempPassword, r);
    r = await post('/api/forgot-password', { email: 'admin@demo.local' });
    check('no email: forgot-password says so honestly, never "sent"', r.success === false && /could not send/i.test(r.error) && !r.sent, r);
    r = await login(ownerEmail, 'Owner-test-1');
    const al = await get('/api/owner/audit-log', r.token);
    check('no email: the failure is recorded for the owner', (al.log || []).some((a) => a.action === 'reset_email_failed'), al.log && al.log.slice(0, 3));
    r = await rpc(adminB, 'getAuditTrail', {});
    check('no email: the change record says the welcome email was NOT sent', (r.logs || []).some((l) => /NOT sent/.test(l.detail || '')), (r.logs || []).slice(0, 3));

    // ---- page and static checks ----
    const html = await fetch(BASE + '/js/app-core.js').then((x) => x.text());   // the app's script now lives in its own file
    check('page: the forgot-password box does not auto-capitalise', /id="forgotEmail"[^>]*autocapitalize="none"/.test(html));
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    check('ack email: marked as an automatic reply', /Reply to this email to add more details\.`,\s*\n\s*\{ auto: true \}/.test(src));
    check('ack email: the headers are the ones our own mail reader treats as automatic', ['Auto-Submitted', 'auto-replied', 'X-Auto-Response-Suppress'].every((k) => src.includes(k)));
  } catch (e) { fail++; console.log('FAIL  test crashed: ' + e.stack); console.log(srvLog.slice(-800)); }
  await stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
