// Recycle bin for things the owner deletes (a whole workspace, a user, a ticket or issue, a sign-up lead).
// Nothing is destroyed at once: it is moved here, listed, restorable for `keepDays` days, then removed for good.
// Layout:  <dir>/index.json            one entry per deleted item
//          <dir>/<id>/item.json        the removed record (user, ticket, lead) or the workspace's owner record
//          <dir>/<id>/brand/           a deleted workspace's whole data folder, moved as it was
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function create(dir, opts) {
  const keepDays = (opts && opts.keepDays) || 30, DAY = 86400000;
  const indexFile = path.join(dir, 'index.json');
  const readIndex = () => { try { const a = JSON.parse(fs.readFileSync(indexFile, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const writeIndex = (list) => {   // saved in one step so a crash cannot leave half a list
    fs.mkdirSync(dir, { recursive: true });
    const tmp = indexFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2)); fs.renameSync(tmp, indexFile);
  };
  const safeId = (id) => /^del-[0-9a-f]{12}$/.test(String(id || ''));
  const folder = (id) => { if (!safeId(id)) throw new Error('Bad recycle-bin id'); return path.join(dir, id); };

  function newId() { return 'del-' + crypto.randomBytes(6).toString('hex'); }
  function add(entry, now) {
    now = now || new Date();
    const e = Object.assign({}, entry, { id: entry.id || newId(), deletedAt: now.toISOString(), expiresAt: new Date(now.getTime() + keepDays * DAY).toISOString() });
    folder(e.id); fs.mkdirSync(folder(e.id), { recursive: true });
    const list = readIndex(); list.push(e); writeIndex(list);
    return e;
  }
  function list(now) {
    now = now || new Date();
    return readIndex().map((e) => Object.assign({}, e, { daysLeft: Math.max(0, Math.ceil((Date.parse(e.expiresAt) - now.getTime()) / DAY)) })).sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
  }
  const get = (id) => readIndex().find((e) => e.id === id) || null;
  function saveJSON(id, name, obj) { fs.mkdirSync(folder(id), { recursive: true }); fs.writeFileSync(path.join(folder(id), name), JSON.stringify(obj, null, 2)); }
  function readJSON(id, name) { return JSON.parse(fs.readFileSync(path.join(folder(id), name), 'utf8')); }
  const brandDir = (id) => path.join(folder(id), 'brand');
  function remove(id) {   // forget the entry and delete its files
    const f = folder(id);
    writeIndex(readIndex().filter((e) => e.id !== id));
    fs.rmSync(f, { recursive: true, force: true });
  }
  function purgeExpired(now) {
    now = now || new Date();
    const gone = [];
    for (const e of readIndex()) if (Date.parse(e.expiresAt) <= now.getTime()) { try { remove(e.id); gone.push(e.id); } catch (x) {} }
    return gone;
  }
  // Rename is instant; if the two places are on different disks, copy then delete.
  function moveDir(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try { fs.renameSync(src, dst); return; } catch (e) { if (e.code !== 'EXDEV' && e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; }
    fs.cpSync(src, dst, { recursive: true }); fs.rmSync(src, { recursive: true, force: true });
  }
  return { add, list, get, saveJSON, readJSON, brandDir, remove, purgeExpired, moveDir, keepDays, folder };
}

module.exports = { create };
