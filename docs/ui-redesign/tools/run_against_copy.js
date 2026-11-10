// Runs older UI tests (the ones that expect a server at RESOLVO_BASE, default :3001) against a THROWAWAY COPY of the app,
// so they never touch the local demo data. The copy gets the demo and showcase workspaces and a known password (demo1234) for every user.
// Run: node docs/ui-redesign/tools/run_against_copy.js inbox_focus_test.py first_customers_test.py customers_test.py
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), PORT = 3951, BASE = 'http://localhost:' + PORT;
const tests = process.argv.slice(2); if (!tests.length) { console.log('Give the test file names to run.'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-copy-')), app = path.join(tmp, 'app');
const Dsql = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), bc = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
const SRC = process.env.RV_SRC || ROOT;
fs.cpSync(SRC, app, { recursive: true, filter: (s) => { const rel = path.relative(SRC, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
const keep = ['demo', 'showcase'];
for (const b of keep) { const src = path.join(ROOT, 'data', 'brands', b); if (fs.existsSync(src)) fs.cpSync(src, path.join(app, 'data', 'brands', b), { recursive: true }); }
const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8')); o.brands = o.brands.filter((b) => keep.includes(b.slug)); o.prospects = [];
fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
const hash = bc.hashSync('demo1234', 10);
for (const b of keep) {
  const f = path.join(app, 'data', 'brands', b, 'db.sqlite'); if (!fs.existsSync(f)) continue;
  const sq = new Dsql(f); for (const r of sq.prepare('SELECT id,data FROM users').all()) { const u = JSON.parse(r.data); u.passwordHash = hash; u.mustChangePassword = false; u.firstLogin = false; sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u), r.id); } sq.close();
}
const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
const srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, PORT: String(PORT), MAIL_CAPTURE: path.join(tmp, 'mail.jsonl'), EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' }, stdio: 'ignore' });
(async () => {
  let up = false; for (let i = 0; i < 80 && !up; i++) { try { up = (await fetch(BASE + '/api/signup-config')).ok; } catch (e) { await sleep(250); } }
  if (!up) { console.log('copy did not start'); srv.kill(); process.exit(2); }
  let bad = 0;
  for (const t of tests) {
    const full = path.join(__dirname, t); console.log('=== ' + t);
    const r = cp.spawnSync(full.endsWith('.js') ? process.execPath : 'python', [full], { env: { ...env0, RESOLVO_BASE: BASE, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8', timeout: 280000 });
    const out = (r.stdout || '') + (r.stderr || ''); const lines = out.split('\n').filter((l) => /^FAIL|passed|Error|Traceback|^DBG/.test(l));
    console.log(lines.slice(-8).join('\n') || out.slice(-400)); if (r.status !== 0) bad++;
  }
  srv.kill(); await sleep(400); console.log(bad ? `\n${bad} test file(s) had failures` : '\nall test files passed'); process.exit(bad ? 1 : 0);
})();
