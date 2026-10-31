// Tests lib/backup.js and lib/owner-guard.js with real databases and real files. Run: node docs/ui-redesign/tools/safeguards_unit_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const B = require(path.join(ROOT, 'lib', 'backup.js')), G = require(path.join(ROOT, 'lib', 'owner-guard.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 220) : '')); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-safeguards-'));

(async () => {
  // ---------- owner-file guard ----------
  const cur = { brands: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }, { slug: 'company-name', name: 'Company name' }], other: 1 };
  let g = G.protectBrands(cur, { brands: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B edited' }], other: 2 });
  check('guard: a save that lacks a workspace gets it back', g.restored.join() === 'company-name' && g.data.brands.length === 3, g);
  check('guard: edits to other workspaces and fields are kept', g.data.brands.find((b) => b.slug === 'b').name === 'B edited' && g.data.other === 2);
  g = G.protectBrands(cur, { brands: [...cur.brands, { slug: 'new' }] });
  check('guard: a normal save with a new workspace changes nothing', g.restored.length === 0 && g.data.brands.length === 4);
  g = G.protectBrands(cur, { other: 3 });
  check('guard: a save with no workspace list at all restores all of them', g.restored.length === 3 && g.data.brands.length === 3);
  check('guard: nothing on disk yet, or a broken file, is safe', G.protectBrands(null, { brands: [] }).restored.length === 0 && G.protectBrands({ x: 1 }, { brands: [{ slug: 'z' }] }).restored.length === 0);
  const fresh = { nurtureSent: { k1: 'old' }, brands: [{ slug: 'late-signup' }], prospects: ['p'] };
  G.patchFields(fresh, { nurtureSent: { k1: 'old', k2: 'new' }, brands: [], prospects: [] }, ['nurtureSent']);
  check('patch: only the named fields are merged, a signup made meanwhile survives', fresh.nurtureSent.k2 === 'new' && fresh.brands[0].slug === 'late-signup' && fresh.prospects[0] === 'p', fresh);

  // ---------- backup ----------
  const data = path.join(tmp, 'data'); fs.mkdirSync(path.join(data, 'brands', 'alpha'), { recursive: true }); fs.mkdirSync(path.join(data, 'brands', 'beta'), { recursive: true });
  fs.writeFileSync(path.join(data, 'owner.json'), JSON.stringify({ brands: [{ slug: 'alpha' }, { slug: 'beta' }] })); fs.writeFileSync(path.join(data, 'credentials.key'), 'k'); fs.writeFileSync(path.join(data, 'vapid.json'), '{}');
  const live = new Database(path.join(data, 'brands', 'alpha', 'db.sqlite')); live.pragma('journal_mode = WAL');
  live.exec('create table users(id text primary key, data text); create table tickets(id text primary key, data text);');
  for (let i = 0; i < 300; i++) { live.prepare('insert into users values(?,?)').run('u' + i, '{}'); live.prepare('insert into tickets values(?,?)').run('t' + i, '{"s":"' + 'x'.repeat(200) + '"}'); }
  fs.writeFileSync(path.join(data, 'brands', 'beta', 'db.json'), '{"users":[1]}');
  const out = path.join(tmp, 'backups');
  const writer = setInterval(() => { try { live.prepare('insert into tickets values(?,?)').run('w' + Math.random(), '{}'); } catch (e) {} }, 2);   // the app keeps writing while the backup runs
  const when = new Date(2026, 9, 31, 3, 30);
  const r = await B.createBackup({ dataDir: data, backupDir: out, Database, now: when });
  clearInterval(writer);
  check('backup: made as one .tar.gz file', r.packed && fs.existsSync(r.file) && r.file.endsWith('resolvo-2026-10-31_0330.tar.gz') && r.bytes > 500, r);
  check('backup: no half-finished leftovers', fs.readdirSync(out).every((n) => !n.includes('partial') && !n.endsWith('.tmp')), fs.readdirSync(out));
  const ex = path.join(tmp, 'extracted'); fs.mkdirSync(ex);
  fs.copyFileSync(r.file, path.join(ex, path.basename(r.file))); const tr = cp.spawnSync('tar', ['-xzf', path.basename(r.file)], { cwd: ex }); check('backup: the file can be unpacked', tr.status === 0, String(tr.stderr));
  const root = path.join(ex, 'resolvo-2026-10-31_0330'), man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  check('backup: manifest counts the workspaces and the real rows', man.workspacesInOwnerFile === 2 && man.brands.alpha.users === 300 && man.brands.alpha.tickets >= 300, man);
  const copy = new Database(path.join(root, 'data', 'brands', 'alpha', 'db.sqlite'), { readonly: true });
  check('backup: the database copy opens and is consistent', copy.pragma('quick_check', { simple: true }) === 'ok' && copy.prepare('select count(*) c from users').get().c === 300); copy.close();
  check('backup: the old-format workspace, the owner file and the keys are in it', fs.existsSync(path.join(root, 'data', 'brands', 'beta', 'db.json')) && fs.existsSync(path.join(root, 'data', 'owner.json')) && fs.existsSync(path.join(root, 'data', 'credentials.key')));
  check('backup: the live database was not touched', live.prepare('select count(*) c from users').get().c === 300);
  const again = await B.createBackup({ dataDir: data, backupDir: out, Database, now: when });
  check('backup: asking twice in the same minute does not redo it', !!again.skipped);
  // a damaged database must make the backup fail loudly, and leave nothing behind that looks like a good backup
  fs.mkdirSync(path.join(data, 'brands', 'broken'), { recursive: true }); fs.writeFileSync(path.join(data, 'brands', 'broken', 'db.sqlite'), Buffer.from('this is not a database'.repeat(200)));
  let err = null; try { await B.createBackup({ dataDir: data, backupDir: out, Database, now: new Date(2026, 9, 31, 4, 0) }); } catch (e) { err = e; }
  check('backup: a damaged workspace database makes it fail instead of saving a bad copy', !!err, err && err.message);
  check('backup: and no new backup file was left behind', B.listBackups(out).length === 1, B.listBackups(out).map((x) => x.name));
  live.close();

  // ---------- pruning ----------
  const pdir = path.join(tmp, 'prune'); fs.mkdirSync(pdir);
  const now = new Date(2026, 9, 31, 12, 0);
  const mk = (d) => fs.writeFileSync(path.join(pdir, 'resolvo-' + B.stampOf(d) + '.tar.gz'), 'x');
  for (let day = 0; day < 100; day++) { const d = new Date(2026, 9, 31 - day, 3, 30); mk(d); if (day < 3) mk(new Date(2026, 9, 31 - day, 15, 0)); }   // 100 days, two a day for the newest three
  fs.writeFileSync(path.join(pdir, 'notes.txt'), 'keep me'); fs.writeFileSync(path.join(pdir, 'resolvo-latest.tar.gz'), 'keep me too');
  const before = B.listBackups(pdir).length, res = B.pruneBackups({ backupDir: pdir, now });
  const left = B.listBackups(pdir);
  const last14 = left.filter((b) => b.createdAt >= new Date(2026, 9, 18));
  check('prune: before pruning there were 103 backups', before === 103, before);
  check('prune: the last 14 days keep exactly one (the newest) per day', last14.length === 14 && last14[0].base === 'resolvo-2026-10-31_1500', last14.map((b) => b.base));
  const older = left.filter((b) => b.createdAt < new Date(2026, 9, 18));
  check('prune: older than that, one per week for 8 weeks', older.length >= 7 && older.length <= 9 && older.every((b) => b.createdAt >= new Date(2026, 7, 1)), older.map((b) => b.base));
  check('prune: nothing older than about 10 weeks is kept', !left.some((b) => b.createdAt < new Date(2026, 7, 1)));
  check('prune: files that are not backups are left alone', fs.existsSync(path.join(pdir, 'notes.txt')) && fs.existsSync(path.join(pdir, 'resolvo-latest.tar.gz')));
  const solo = path.join(tmp, 'solo'); fs.mkdirSync(solo); fs.writeFileSync(path.join(solo, 'resolvo-2025-01-01_0300.tar.gz'), 'x');
  B.pruneBackups({ backupDir: solo, now });
  check('prune: the very last backup is never deleted, however old', B.listBackups(solo).length === 1);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
