// Daily backups of the whole data folder (owner file, every workspace database, keys), checked after they are made.
// A backup is one file: resolvo-YYYY-MM-DD_HHMM.tar.gz. The newest 14 days are kept, then one per week for 8 weeks.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const NAME_RE = /^resolvo-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\.tar\.gz)?$/;
const p2 = (n) => String(n).padStart(2, '0');
const stampOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
function parseName(n) {
  const m = NAME_RE.exec(n); if (!m) return null;
  return { name: n.replace(/\.tar\.gz$/, ''), tar: !!m[6], date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) };
}
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
function weekKey(d) { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return dayKey(t); }   // Monday of that week

function copyFile(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
// A SQLite database that is in use must be copied with SQLite's own backup, not a plain file copy (a plain copy can be torn).
async function copySqlite(Database, src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const db = new Database(src, { readonly: true, fileMustExist: true });
  try { await db.backup(dst); } finally { db.close(); }
}
function checkSqlite(Database, file, label) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const ok = db.pragma('quick_check', { simple: true });
    if (ok !== 'ok') throw new Error('The copy of ' + label + ' failed its integrity check: ' + ok);
    const n = (sql) => { try { return db.prepare(sql).get().c; } catch (e) { return null; } };
    return { users: n('select count(*) c from users'), tickets: n('select count(*) c from tickets') };
  } finally { db.close(); }
}

async function createBackup({ dataDir, backupDir, Database, now = new Date() }) {
  const t0 = Date.now(), name = 'resolvo-' + stampOf(now);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(path.join(backupDir, name + '.tar.gz')) || fs.existsSync(path.join(backupDir, name))) return { name, skipped: 'already made this minute' };
  const work = path.join(backupDir, '.' + name + '.partial');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'data'), { recursive: true });
  const files = [], brands = {};
  let manifest;
  try {
    for (const f of ['owner.json', 'vapid.json', 'app-secret.txt', 'credentials.key', 'db.json']) {
      const s = path.join(dataDir, f);
      if (fs.existsSync(s)) { copyFile(s, path.join(work, 'data', f)); files.push(f); }
    }
    const main = path.join(dataDir, 'main.sqlite');
    if (fs.existsSync(main) && fs.statSync(main).size > 0) { await copySqlite(Database, main, path.join(work, 'data', 'main.sqlite')); files.push('main.sqlite'); }
    const bdir = path.join(dataDir, 'brands');
    for (const slug of fs.existsSync(bdir) ? fs.readdirSync(bdir) : []) {
      const dir = path.join(bdir, slug);
      if (!fs.statSync(dir).isDirectory()) continue;
      const sq = path.join(dir, 'db.sqlite'), js = path.join(dir, 'db.json'), out = path.join(work, 'data', 'brands', slug);
      if (fs.existsSync(sq)) {
        await copySqlite(Database, sq, path.join(out, 'db.sqlite'));
        brands[slug] = checkSqlite(Database, path.join(out, 'db.sqlite'), slug);
        files.push('brands/' + slug + '/db.sqlite');
      }
      if (fs.existsSync(js)) { copyFile(js, path.join(out, 'db.json')); files.push('brands/' + slug + '/db.json'); brands[slug] = brands[slug] || { users: null, tickets: null }; }
    }
    let ownerBrands;
    try { ownerBrands = (JSON.parse(fs.readFileSync(path.join(work, 'data', 'owner.json'), 'utf8')).brands || []).length; }
    catch (e) { throw new Error('owner.json in the backup could not be read: ' + e.message); }
    manifest = { format: 1, createdAt: now.toISOString(), workspacesInOwnerFile: ownerBrands, brands, files };
    fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.renameSync(work, path.join(backupDir, name));
  } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw e; }
  // one file is easier to copy off the server; if tar is missing the folder is simply kept
  let file = path.join(backupDir, name), packed = false;
  const tmp = path.join(backupDir, name + '.tar.gz.tmp');
  // run from inside the backup folder with plain names: some tar builds read "C:" in a path as a network host
  const tar = cp.spawnSync('tar', ['-czf', name + '.tar.gz.tmp', name], { cwd: backupDir, timeout: 120000 });
  if (tar.status === 0) { fs.renameSync(tmp, path.join(backupDir, name + '.tar.gz')); fs.rmSync(path.join(backupDir, name), { recursive: true, force: true }); file += '.tar.gz'; packed = true; }
  else fs.rmSync(tmp, { force: true });
  const sum = (k) => Object.values(brands).reduce((a, b) => a + (b[k] || 0), 0);
  return { name, file, packed, bytes: packed ? fs.statSync(file).size : 0, workspaces: manifest.workspacesInOwnerFile, databases: Object.keys(brands).length, users: sum('users'), tickets: sum('tickets'), ms: Date.now() - t0 };
}

function listBackups(backupDir) {
  let names = [];
  try { names = fs.readdirSync(backupDir); } catch (e) { return []; }
  return names.map((n) => {
    const p = parseName(n); if (!p) return null;
    const f = path.join(backupDir, n); let st; try { st = fs.statSync(f); } catch (e) { return null; }
    return { name: n, base: p.name, packed: p.tar, createdAt: p.date, bytes: p.tar ? st.size : 0, file: f };
  }).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

// Keep the newest backup of each of the last `keepDays` days, then the newest of each of the next `keepWeeks` weeks.
function pruneBackups({ backupDir, now = new Date(), keepDays = 14, keepWeeks = 8 }) {
  const list = listBackups(backupDir), keep = new Set(), seenDay = new Set(), seenWeek = new Set();
  const cutDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (keepDays - 1));
  const cutWeek = new Date(cutDay.getFullYear(), cutDay.getMonth(), cutDay.getDate() - keepWeeks * 7);
  for (const b of list) {   // newest first
    const dk = dayKey(b.createdAt);
    if (b.createdAt >= cutDay) { if (!seenDay.has(dk)) { seenDay.add(dk); keep.add(b.name); } }
    else if (b.createdAt >= cutWeek) { const wk = weekKey(b.createdAt); if (!seenWeek.has(wk)) { seenWeek.add(wk); keep.add(b.name); } }
  }
  if (list.length && !keep.size) keep.add(list[0].name);   // never delete the last backup
  const removed = [];
  for (const b of list) if (!keep.has(b.name)) { try { fs.rmSync(b.file, { recursive: true, force: true }); removed.push(b.name); } catch (e) {} }
  return { kept: [...keep], removed };
}

module.exports = { createBackup, listBackups, pruneBackups, parseName, stampOf };
