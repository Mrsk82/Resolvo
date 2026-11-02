/* Owner Console: find anyone, ready-made reports, browse data, monitor, nurture emails, health and backups.
   Secrets (hashes, tokens, keys) are removed on the server, so nothing here ever receives them. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var _token = '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getToken() {
    if (_token) return _token;
    try {
      _token = localStorage.getItem('tt_session_token') || '';
      if (!_token) for (var k in localStorage) { if (k.indexOf('portal_token_') === 0 && localStorage.getItem(k)) { _token = localStorage.getItem(k); break; } }
      if (!_token) _token = localStorage.getItem('tt_token') || '';
    } catch (e) {}
    return _token;
  }
  function api(path, body) {
    var o = { headers: { 'x-session-token': getToken() } };
    if (body !== undefined) { o.method = 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success === false && /owner access required/i.test(d.error || '')) { showLogin(); }
      return d;
    });
  }
  function toast(msg, type) {
    var t = document.createElement('div'); t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2000;max-width:min(92vw,520px);padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.25);background:' + (type === 'error' ? '#e5484d' : type === 'warning' ? '#b45309' : '#0f766e');
    t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4200);
  }
  function copy(text) {
    var done = function () { toast('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Could not copy', 'warning'); });
    else toast('Could not copy', 'warning');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function day(s) { return String(s || '').slice(0, 10); }
  function when(s) { var t = Date.parse(s); if (isNaN(t)) return ''; var d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }

  /* ---------- tabs ---------- */
  var loaded = {};
  function showTab(name) {
    document.querySelectorAll('.rvc-tab').forEach(function (t) { var on = t.getAttribute('data-tab') === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    document.querySelectorAll('.rvc-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
    if (name === 'monitor') loadMonitor();
    if (name === 'trash') loadTrash();
    if (name === 'health') { if (!loaded.health) { loaded.health = 1; if (window.RVOwner) RVOwner.mount(document.body); } loadHealth(); }
  }

  /* ---------- sign-in ---------- */
  function showLogin() { $('loginOverlay').hidden = false; $('connStatus').textContent = 'Sign-in needed'; $('connStatus').classList.remove('ok'); setTimeout(function () { $('loginPass').focus(); }, 50); }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('loginErr'); err.textContent = 'Signing in…';
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPass').value }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d.success) { err.textContent = d.error || 'Sign-in failed'; return; }
        if (!d.isOwner) { err.textContent = 'This needs the owner account.'; return; }
        _token = d.token; try { localStorage.setItem('tt_token', d.token); } catch (x) {}
        $('loginPass').value = ''; err.textContent = ''; $('loginOverlay').hidden = true; init();
      }).catch(function () { err.textContent = 'No answer from the server.'; });
  });

  /* ---------- table helper: filter, sort, copy a cell, CSV ---------- */
  function Grid(host, opts) {
    this.host = host; this.cols = []; this.rows = []; this.sortCol = -1; this.sortDir = 1; this.q = ''; this.opts = opts || {};
  }
  Grid.prototype.set = function (cols, rows) { this.cols = cols; this.rows = rows; this.sortCol = -1; this.draw(); };
  Grid.prototype.view = function () {
    var q = this.q.toLowerCase(), self = this;
    var out = this.rows.map(function (r, i) { return { r: r, i: i }; });
    if (q) out = out.filter(function (x) { return x.r.some(function (v) { return String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).toLowerCase().indexOf(q) >= 0; }); });
    if (this.sortCol >= 0) {
      var c = this.sortCol, d = this.sortDir;
      out.sort(function (a, b) {
        var x = a.r[c], y = b.r[c], nx = typeof x === 'number', ny = typeof y === 'number';
        if (x == null) return 1; if (y == null) return -1;
        return (nx && ny ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * d;
      });
    }
    return out;
  };
  Grid.prototype.draw = function () {
    var self = this, v = this.view(), cols = this.cols, act = this.opts.action;
    if (!cols.length || !this.rows.length) { this.host.innerHTML = '<div class="rvc-empty">Nothing to show.</div>'; this.host.hidden = false; if (this.opts.onCount) this.opts.onCount(0, 0); return; }
    var h = '<table><thead><tr>' + cols.map(function (c, i) { return '<th data-c="' + i + '">' + esc(c) + (self.sortCol === i ? ' <span class="ar">' + (self.sortDir > 0 ? '▲' : '▼') + '</span>' : '') + '</th>'; }).join('') + (act ? '<th></th>' : '') + '</tr></thead><tbody>';
    v.forEach(function (x) {
      h += '<tr>' + x.r.map(function (val, i) {
        if (val === null || val === undefined) return '<td class="nv" data-l="' + esc(cols[i]) + '">—</td>';
        var s = typeof val === 'object' ? JSON.stringify(val) : String(val), shown = s.length > 100 ? s.slice(0, 100) + '…' : s;
        return '<td class="copy" data-l="' + esc(cols[i]) + '" title="' + esc(s.length > 100 ? s : 'Click to copy') + '" data-v="' + esc(s) + '">' + esc(shown) + '</td>';
      }).join('') + (act ? '<td data-l="">' + act(x.r, x.i) + '</td>' : '') + '</tr>';
    });
    this.host.innerHTML = h + '</tbody></table>'; this.host.hidden = false;
    if (this.opts.onCount) this.opts.onCount(v.length, this.rows.length);
    if (!v.length) this.host.innerHTML += '<div class="rvc-empty">No row matches the filter.</div>';
    this.host.onclick = function (e) {
      var th = e.target.closest('th[data-c]'); if (th) { var c = +th.getAttribute('data-c'); self.sortDir = self.sortCol === c ? -self.sortDir : 1; self.sortCol = c; self.draw(); return; }
      var td = e.target.closest('td.copy'); if (td && !e.target.closest('button')) copy(td.getAttribute('data-v'));
    };
  };
  Grid.prototype.csv = function (name) {
    var rows = [this.cols].concat(this.view().map(function (x) { return x.r; }));
    var text = rows.map(function (r) { return r.map(function (v) { var s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = 'resolvo-' + name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  };

  /* ---------- confirm dialog ---------- */
  function ask(o) {
    return new Promise(function (resolve) {
      $('confirmTitle').textContent = o.title; $('confirmBody').innerHTML = o.html || '';
      var w = $('confirmTypeWrap'), inp = $('confirmType'), go = $('confirmGo'), word = o.typeWord || 'SEND';
      go.textContent = o.go || 'Send'; go.className = 'rvc-btn ' + (o.danger ? 'danger' : 'main'); w.hidden = !o.type; inp.value = ''; go.disabled = !!o.type;
      $('confirmTypeLabel').innerHTML = 'Type <b>' + esc(word) + '</b> to confirm';
      var done = function (v) { $('confirmOverlay').hidden = true; inp.oninput = null; go.onclick = null; $('confirmCancel').onclick = null; $('confirmClose').onclick = null; resolve(v); };
      inp.oninput = function () { var v = inp.value.trim(); go.disabled = o.exact ? v !== word : v.toUpperCase() !== word.toUpperCase(); };
      go.onclick = function () { done(true); }; $('confirmCancel').onclick = function () { done(false); }; $('confirmClose').onclick = function () { done(false); };
      $('confirmOverlay').hidden = false; setTimeout(function () { (o.type ? inp : go).focus(); }, 50);
    });
  }

  /* ---------- record editor (secrets never arrive here) ---------- */
  var editCtx = null, afterEdit = null;
  function openEdit(table, brand, id, then) {
    editCtx = { table: table, brand: brand, id: id }; afterEdit = then || null;
    $('editErr').hidden = true; $('editMeta').textContent = table + ' · ' + (brand || '—') + ' · ' + id;
    $('editFields').innerHTML = '<div class="rvc-empty">Loading…</div>'; $('editOverlay').hidden = false;
    api('/api/owner/record/' + encodeURIComponent(table) + '/' + encodeURIComponent(brand || '_') + '/' + encodeURIComponent(id)).then(function (d) {
      if (!d.success) { $('editFields').innerHTML = ''; $('editErr').textContent = d.error; $('editErr').hidden = false; return; }
      var skip = { id: 1, slug: 1, _brand: 1, _brandName: 1 };
      var keys = Object.keys(d.record).filter(function (k) { return !skip[k]; });
      $('editFields').innerHTML = keys.length ? keys.map(function (k) {
        var v = d.record[k], fid = 'ef_' + k.replace(/\W/g, '_');
        if (typeof v === 'boolean') return '<div class="rvc-field"><label for="' + fid + '">' + esc(k) + '</label><select id="' + fid + '" data-field="' + esc(k) + '" data-type="bool"><option value="true"' + (v ? ' selected' : '') + '>true</option><option value="false"' + (!v ? ' selected' : '') + '>false</option></select></div>';
        if (v !== null && typeof v === 'object') return '<div class="rvc-field"><label for="' + fid + '">' + esc(k) + ' <span class="rvc-muted">(JSON)</span></label><textarea id="' + fid + '" data-field="' + esc(k) + '" data-type="json" rows="6">' + esc(JSON.stringify(v, null, 2)) + '</textarea></div>';
        return '<div class="rvc-field"><label for="' + fid + '">' + esc(k) + '</label><input type="text" id="' + fid + '" data-field="' + esc(k) + '" data-type="str" value="' + esc(v == null ? '' : v) + '"></div>';
      }).join('') : '<div class="rvc-empty">No editable fields.</div>';
    }).catch(function (e) { $('editErr').textContent = e.message; $('editErr').hidden = false; });
  }
  function closeEdit() { $('editOverlay').hidden = true; editCtx = null; }
  $('editClose').onclick = closeEdit; $('editCancel').onclick = closeEdit;
  $('editSaveBtn').onclick = function () {
    if (!editCtx) return;
    var updates = {}, err = $('editErr'); err.hidden = true;
    var inputs = $('editFields').querySelectorAll('[data-field]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i], f = el.getAttribute('data-field'), t = el.getAttribute('data-type');
      if (t === 'json') { var raw = el.value.trim(); if (raw === '') { updates[f] = null; continue; } try { updates[f] = JSON.parse(raw); } catch (x) { err.textContent = 'Invalid JSON in "' + f + '": ' + x.message; err.hidden = false; return; } }
      else if (t === 'bool') updates[f] = el.value === 'true'; else updates[f] = el.value;
    }
    var btn = $('editSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    api('/api/owner/record/' + encodeURIComponent(editCtx.table) + '/' + encodeURIComponent(editCtx.brand || '_') + '/' + encodeURIComponent(editCtx.id), { updates: updates }).then(function (d) {
      btn.disabled = false; btn.textContent = '💾 Save changes';
      if (!d.success) { err.textContent = d.error; err.hidden = false; return; }
      closeEdit(); toast('Saved'); if (afterEdit) afterEdit();
    }).catch(function (e) { btn.disabled = false; btn.textContent = '💾 Save changes'; err.textContent = e.message; err.hidden = false; });
  };

  /* ---------- find anyone ---------- */
  function pill(t, cls) { return '<span class="rvc-pill ' + (cls || '') + '">' + esc(t) + '</span>'; }
  function statusPill(s) { return pill(s || 'unknown', s === 'active' ? 'good' : s === 'pending' ? 'warn' : s === 'suspended' ? 'bad' : ''); }
  function findGroup(title, items, fn) { return items.length ? '<div class="rvc-group"><div class="rvc-group-t">' + esc(title) + ' (' + items.length + ')</div>' + items.map(fn).join('') + '</div>' : ''; }
  function runFind(q) {
    q = String(q || '').trim(); var out = $('findOut');
    if (q.length < 2) { out.innerHTML = '<div class="rvc-none">Type at least 2 characters.</div>'; return; }
    out.innerHTML = '<div class="rvc-none rvc-muted">Searching…</div>';
    api('/api/owner/find?q=' + encodeURIComponent(q)).then(function (d) {
      if (!d.success) { out.innerHTML = '<div class="rvc-err">' + esc(d.error || 'Search failed') + '</div>'; return; }
      var r = d.results, s = d.seen;
      if (!d.total) { out.innerHTML = '<div class="rvc-none"><b>Nothing matches “' + esc(d.q) + '”.</b><br>Searched ' + plural(s.workspaces, 'workspace') + ' (including ones waiting for activation), ' + plural(s.people, 'person', 'people') + ', ' + plural(s.tickets, 'ticket') + ' and ' + plural(s.leads, 'sign-up lead') + '. If someone says they signed up, they are not in the system under that spelling.</div>'; return; }
      out.innerHTML =
        findGroup('Workspaces', r.workspaces, function (b) {
          return '<div class="rvc-result"><div class="b"><div class="t">' + esc(b.name) + ' <span class="rvc-muted rvc-mono">' + esc(b.slug) + '</span></div><div class="s">' + statusPill(b.status) + pill(b.tier || 'Free') + esc(b.admin || '') + ' · created ' + esc(day(b.created)) + (b.lastActive ? ' · last used ' + esc(when(b.lastActive)) : ' · never used') + (b.status === 'pending' ? ' · <b>not activated</b>' : '') + '</div></div>' +
            (b.status === 'pending' ? '<button class="rvc-btn sm main" data-act="resend" data-slug="' + esc(b.slug) + '">Resend activation</button><button class="rvc-btn sm" data-act="link" data-slug="' + esc(b.slug) + '">Copy link</button>' : '') +
            '<button class="rvc-btn sm" data-act="edit-brand" data-slug="' + esc(b.slug) + '">Edit</button><button class="rvc-btn sm dline" data-act="del" data-type="workspace" data-slug="' + esc(b.slug) + '">🗑 Delete</button></div>';
        }) +
        findGroup('People', r.people, function (u) {
          return '<div class="rvc-result"><div class="b"><div class="t">' + esc(u.name || u.email) + '</div><div class="s">' + esc(u.email || '') + '<br>' + pill(u.role || 'User') + (u.active ? '' : pill('switched off', 'bad')) + (u.neverSignedIn ? pill('never signed in', 'warn') : '') + esc(u.brandName) + ' ' + statusPill(u.brandStatus) + pill(u.tier || 'Free') + '</div></div>' +
            '<button class="rvc-btn sm" data-act="copy" data-v="' + esc(u.email || '') + '">Copy email</button><button class="rvc-btn sm" data-act="edit-user" data-slug="' + esc(u.brand) + '" data-id="' + esc(u.id) + '">Edit</button><button class="rvc-btn sm dline" data-act="del" data-type="user" data-slug="' + esc(u.brand) + '" data-id="' + esc(u.id) + '">🗑 Delete</button></div>';
        }) +
        findGroup('Tickets', r.tickets, function (t) {
          return '<div class="rvc-result"><div class="b"><div class="t">' + esc(t.id) + ' · ' + esc(t.subject || '(no subject)') + '</div><div class="s">' + pill(t.status || '') + esc(t.from || '') + ' · ' + esc(t.brandName) + ' · ' + esc(day(t.created)) + '</div></div><button class="rvc-btn sm dline" data-act="del" data-type="ticket" data-table="tickets" data-slug="' + esc(t.brand) + '" data-id="' + esc(t.id) + '">🗑 Delete</button></div>';
        }) +
        findGroup('Sign-up leads', r.leads, function (l) {
          return '<div class="rvc-result"><div class="b"><div class="t">' + esc(l.name || l.email) + '</div><div class="s">' + esc(l.email) + (l.company ? ' · ' + esc(l.company) : '') + ' ' + pill(l.status || 'lead') + ' · ' + esc(day(l.created)) + '</div></div><button class="rvc-btn sm" data-act="copy" data-v="' + esc(l.email) + '">Copy email</button><button class="rvc-btn sm dline" data-act="del" data-type="lead" data-id="' + esc(l.id) + '">🗑 Delete</button></div>';
        });
    }).catch(function () { out.innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
  }
  $('findForm').addEventListener('submit', function (e) { e.preventDefault(); runFind($('findQ').value); });
  $('findOut').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), slug = b.getAttribute('data-slug');
    if (a === 'copy') copy(b.getAttribute('data-v'));
    else if (a === 'del') startDelete({ type: b.getAttribute('data-type'), slug: slug, id: b.getAttribute('data-id'), table: b.getAttribute('data-table') }, function () { runFind($('findQ').value); loadReports(); });
    else if (a === 'edit-brand') openEdit('brands', '', slug, function () { runFind($('findQ').value); });
    else if (a === 'edit-user') openEdit('users', slug, b.getAttribute('data-id'), function () { runFind($('findQ').value); });
    else if (a === 'resend' || a === 'link') {
      b.disabled = true;
      api('/api/owner/brands/' + encodeURIComponent(slug) + '/resend-activation', a === 'link' ? { send: false } : {}).then(function (d) {
        b.disabled = false;
        if (!d.success) { toast(d.error || 'Could not do that', 'error'); return; }
        if (a === 'resend' && d.sent) { toast(d.message); return; }
        if (d.link) { copy(d.link); toast(a === 'resend' ? 'The email could not be sent. The link is copied: send it to them yourself.' : 'Activation link copied. It works for 48 hours.', a === 'resend' ? 'warning' : 'success'); }
      }).catch(function () { b.disabled = false; toast('No answer from the server', 'error'); });
    }
  });

  /* ---------- reports ---------- */
  var HOT = { 'not-activated': 1, 'trials-ending': 1, 'failed-emails': 1 };
  var reportGrid = null, reportId = '', reportName = '';
  function loadReports() {
    api('/api/owner/reports').then(function (d) {
      if (!d.success) { $('reportTiles').innerHTML = '<div class="rvc-err">' + esc(d.error || 'Could not load') + '</div>'; return; }
      $('reportTiles').innerHTML = d.reports.map(function (r) {
        return '<button class="rvc-tile" data-r="' + esc(r.id) + '"><span class="n' + (HOT[r.id] && r.count ? ' hot' : '') + '">' + (r.count == null ? '–' : r.count) + '</span><span class="t">' + esc(r.title) + '</span><span class="d">' + esc(r.desc) + '</span></button>';
      }).join('');
    }).catch(function () { $('reportTiles').innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
  }
  function openReport(id) {
    if (!document.getElementById('panel-find').classList.contains('active')) showTab('find');
    document.querySelectorAll('.rvc-tile').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-r') === id); });
    $('reportOut').innerHTML = '<div class="rvc-none rvc-muted">Loading…</div>';
    api('/api/owner/reports/' + encodeURIComponent(id)).then(function (d) {
      if (!d.success) { $('reportOut').innerHTML = '<div class="rvc-err">' + esc(d.error || 'Could not load') + '</div>'; return; }
      reportId = id; reportName = d.title;
      $('reportOut').innerHTML = '<div class="rvc-report-h"><div class="t">' + esc(d.title) + ' <span class="rvc-muted" id="rptCount"></span></div><input id="rptFilter" type="search" placeholder="Filter…" style="width:200px" autocapitalize="none"><button class="rvc-btn" id="rptCsv">⬇ Export CSV</button></div><div class="rvc-tablewrap rvc-cardtable" id="rptTable"></div>';
      var slugCol = d.columns.indexOf('Slug');
      reportGrid = new Grid($('rptTable'), {
        onCount: function (n, all) { $('rptCount').textContent = n === all ? '· ' + all : '· ' + n + ' of ' + all; },
        action: slugCol >= 0 ? function (row) { return '<button class="rvc-btn sm" data-find="' + esc(row[slugCol]) + '">Find</button>'; } : null
      });
      reportGrid.set(d.columns, d.rows);
      $('rptFilter').oninput = function () { reportGrid.q = this.value; reportGrid.draw(); };
      $('rptCsv').onclick = function () { reportGrid.csv(reportId); };
      $('rptTable').addEventListener('click', function (e) { var b = e.target.closest('button[data-find]'); if (b) { $('findQ').value = b.getAttribute('data-find'); runFind(b.getAttribute('data-find')); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      $('reportOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function () { $('reportOut').innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
  }
  $('reportTiles').addEventListener('click', function (e) { var t = e.target.closest('.rvc-tile'); if (t) openReport(t.getAttribute('data-r')); });

  /* ---------- browse data ---------- */
  var EDITABLE = { brands: 1, users: 1, tickets: 1, issues: 1, appointments: 1, comments: 1 };
  var browseGrid = new Grid($('tableWrap'), { onCount: function (n, all) { var m = $('qMeta'); m.hidden = false; m.innerHTML = '<span><b>' + n + '</b>' + (n === all ? '' : ' of ' + all) + ' rows</span>' + (EDITABLE[browseTable] ? '<span>✏️ Click Edit on a row to change it</span>' : '') + '<span>Click a column to sort, a cell to copy</span>'; } });
  var browseTable = '';
  function loadBrowse() {
    browseTable = $('selTable').value; var lim = $('selLimit').value;
    $('qErr').hidden = true; $('qMeta').hidden = true; $('tableWrap').hidden = true; $('exportBtn').hidden = true;
    var sql = 'SELECT * FROM ' + browseTable + (lim !== '9999' ? ' LIMIT ' + lim : '');
    var btn = $('browseLoad'); btn.disabled = true; btn.textContent = 'Loading…';
    api('/api/owner/query', { sql: sql }).then(function (d) {
      btn.disabled = false; btn.textContent = 'Show';
      if (!d.success) { $('qErr').textContent = 'Could not load: ' + d.error; $('qErr').hidden = false; return; }
      var cols = d.columns, idCol = browseTable === 'brands' ? 'slug' : 'id', idIdx = cols.indexOf(idCol), brIdx = cols.indexOf('_brand');
      browseGrid.opts.action = (EDITABLE[browseTable] && idIdx >= 0) ? function (row) {
        var id = row[idIdx], brand = browseTable === 'brands' ? '' : (brIdx >= 0 ? row[brIdx] : '');
        var can = id && (browseTable === 'brands' || brand), kind = { brands: 'workspace', users: 'user', tickets: 'ticket', issues: 'ticket' }[browseTable];
        return can ? '<button class="rvc-btn sm" data-edit="' + esc(id) + '" data-brand="' + esc(brand) + '">✏️ Edit</button>' + (kind ? ' <button class="rvc-btn sm dline" data-del="' + kind + '" data-slug="' + esc(browseTable === 'brands' ? id : brand) + '" data-id="' + esc(id) + '" data-table="' + browseTable + '">🗑 Delete</button>' : '') : '';
      } : null;
      browseGrid.q = $('browseFilter').value; browseGrid.set(cols, d.rows); $('exportBtn').hidden = false;
    }).catch(function () { btn.disabled = false; btn.textContent = 'Show'; $('qErr').textContent = 'No answer from the server.'; $('qErr').hidden = false; });
  }
  $('browseLoad').onclick = loadBrowse;
  $('selTable').onchange = loadBrowse;
  $('browseFilter').oninput = function () { browseGrid.q = this.value; if (browseGrid.cols.length) browseGrid.draw(); };
  $('exportBtn').onclick = function () { browseGrid.csv(browseTable); };
  $('tableWrap').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-edit]'); if (b) { openEdit(browseTable, b.getAttribute('data-brand'), b.getAttribute('data-edit'), loadBrowse); return; }
    var d = e.target.closest('button[data-del]'); if (d) startDelete({ type: d.getAttribute('data-del'), slug: d.getAttribute('data-slug'), id: d.getAttribute('data-id'), table: d.getAttribute('data-table') }, loadBrowse);
  });

  /* ---------- live monitor ---------- */
  var allLogs = [], logLevel = '';
  function loadMonitor() {
    api('/api/owner/monitor?limit=500').then(function (d) {
      allLogs = d.logs || []; var s = d.summary || {};
      $('monStats').innerHTML = [['Total events', s.total || 0, ''], ['Errors', s.errors || 0, (s.errors || 0) > 0 ? 'bad' : 'good'], ['Email failures', s.emailFails || 0, (s.emailFails || 0) > 0 ? 'bad' : 'good'], ['Server', 'Live ✓', 'good']]
        .map(function (x) { return '<div class="rvc-stat"><div class="l">' + x[0] + '</div><div class="v ' + x[2] + '">' + x[1] + '</div></div>'; }).join('');
      drawLogs();
    }).catch(function () { $('logList').innerHTML = '<div class="rvc-empty">Could not load.</div>'; });
  }
  function drawLogs() {
    var q = $('logSearch').value.toLowerCase(), logs = allLogs;
    if (logLevel) logs = logs.filter(function (e) { return e.level === logLevel; });
    if (q) logs = logs.filter(function (e) { return (e.message + e.category + (e.detail ? JSON.stringify(e.detail) : '')).toLowerCase().indexOf(q) >= 0; });
    $('logList').innerHTML = logs.length ? logs.map(function (e) {
      return '<div class="rvc-log-e"><span class="rvc-lv ' + esc(e.level) + '">' + esc(e.level) + '</span><span class="rvc-log-c">' + esc(e.category) + '</span><span class="rvc-log-m">' + esc(e.message) + (e.detail ? '<small>' + esc(JSON.stringify(e.detail).slice(0, 180)) + '</small>' : '') + '</span><span class="rvc-log-t">' + esc(String(e.ts || '').replace('T', ' ').slice(0, 19)) + '</span></div>';
    }).join('') : '<div class="rvc-empty">No events found.</div>';
  }
  $('logSearch').oninput = drawLogs; $('monRefresh').onclick = loadMonitor;
  $('logChips').addEventListener('click', function (e) { var c = e.target.closest('.rvc-chip[data-level]'); if (!c) return; logLevel = c.getAttribute('data-level'); document.querySelectorAll('#logChips .rvc-chip[data-level]').forEach(function (x) { x.classList.toggle('active', x === c); }); drawLogs(); });
  setInterval(function () { if ($('panel-monitor').classList.contains('active')) loadMonitor(); }, 30000);

  /* ---------- nurture emails ---------- */
  var SCHEDULE = [['Day 1', 'Quick tip: Create your first issue', 'Activation'], ['Day 2', 'Your team is waiting: invite them now', 'Activation'], ['Day 3', 'Did you know Resolvo has a full email helpdesk?', 'Activation'], ['Day 4', 'Set up your brand in 5 minutes', 'Activation'], ['Day 5', 'Your customers can now book appointments', 'Activation'], ['Day 6', 'Setup checklist: how are you doing?', 'Activation'], ['Day 7', 'Your first week with Resolvo', 'Check-in'], ['Day 8', 'Never miss an SLA again', 'Habit'], ['Day 10', '3 things your team should set up', 'Habit'], ['Day 12', 'How to reply to customers from Resolvo', 'Habit'], ['Day 14', 'Upgrade to Pro? Here is what you unlock', 'Upsell'], ['Day 16', 'Auto-assign tickets instantly', 'Power'], ['Day 18', 'Your customers deserve a self-service portal', 'Power'], ['Day 21', 'See how your team is really performing', 'Power'], ['Day 25', 'Save hours every week with automations', 'Loyalty'], ['Day 30', '30 days with Resolvo: milestone stats', 'Loyalty'], ['Day 35', 'Are your customers happy? CSAT', 'Loyalty'], ['Day 40', 'Integrate with your existing tools', 'Loyalty'], ['Day 45', "Your team's busiest hours", 'Loyalty'], ['Day 50', 'One thing top support teams do differently', 'Retention'], ['Day 60', "Still there? We'd love your feedback", 'Re-engage'], ['Day 75', '75 days milestone summary', 'Retention'], ['Day 90', 'What is new in Resolvo this month', 'Changelog'], ['Trigger', 'No login in 7 days', 'Behaviour'], ['Trigger', 'First ticket resolved', 'Behaviour'], ['Trigger', '10 tickets closed', 'Behaviour'], ['Trigger', 'Email inbox not connected (day 5+)', 'Behaviour'], ['Trigger', 'No team members (day 3+)', 'Behaviour'], ['Trigger', 'Trial expiring in 3 days', 'Behaviour'], ['Trigger', 'Trial expired', 'Behaviour']];
  var CAT = { Activation: '#10B981', 'Check-in': '#6366F1', Habit: '#3b82f6', Upsell: '#f59e0b', Power: '#8b5cf6', Loyalty: '#0891b2', 'Re-engage': '#ef4444', Retention: '#10B981', Changelog: '#6b7280', Behaviour: '#f97316' };
  $('nurtureSchedule').innerHTML = SCHEDULE.map(function (x) { return '<div><div class="k"><span>' + esc(x[0]) + '</span><span style="color:' + CAT[x[2]] + '">' + esc(x[2]) + '</span></div><div class="s">' + esc(x[1]) + '</div></div>'; }).join('');
  $('nurtureTestBtn').onclick = function () {
    var to = $('nurtureTestTo').value.trim() || 'contact@resolvogroup.com';
    ask({ title: 'Send the 27 test emails?', html: '<p class="rvc-p">All 27 emails go to <b>' + esc(to) + '</b> only, marked as tests. It takes about 30 seconds.</p>', go: 'Send tests' }).then(function (ok) {
      if (!ok) return;
      $('nurtureResult').innerHTML = '<div class="rvc-none rvc-muted">Sending 27 emails… about 30 seconds.</div>';
      api('/api/owner/nurture/test-all', { to: to }).then(function (d) {
        $('nurtureResult').innerHTML = d.success ? '<div class="rvc-none"><b>' + d.sent + ' test emails sent to ' + esc(d.to) + '</b>' + (d.failed ? ' (' + d.failed + ' failed)' : '') + '</div>' : '<div class="rvc-err">' + esc(d.error || 'Send failed') + '</div>';
      }).catch(function () { $('nurtureResult').innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
    });
  };
  $('nurtureRunBtn').onclick = function () {
    $('nurtureResult').innerHTML = '<div class="rvc-none rvc-muted">Checking who is due today…</div>';
    api('/api/owner/nurture/preview').then(function (d) {
      if (!d.success) { $('nurtureResult').innerHTML = '<div class="rvc-err">' + esc(d.error || 'Could not check') + '</div>'; return; }
      if (!d.plan.length) { $('nurtureResult').innerHTML = '<div class="rvc-none"><b>No email is due today.</b> Nothing would be sent.</div>'; return; }
      $('nurtureResult').innerHTML = '';
      var list = '<div class="rvc-plan">' + d.plan.map(function (p) { return '<div><b>' + esc(p.to) + '</b><span>' + esc(p.workspace) + '</span><span>' + esc(p.kind) + ': ' + esc(p.subject) + '</span></div>'; }).join('') + '</div>';
      ask({ title: d.plan.length + ' real ' + (d.plan.length === 1 ? 'email' : 'emails') + ' would be sent', html: '<p class="rvc-p">These go to real customers. Check the list.</p>' + list, type: true, go: 'Send ' + d.plan.length }).then(function (ok) {
        if (!ok) { $('nurtureResult').innerHTML = '<div class="rvc-none">Cancelled. Nothing was sent.</div>'; return; }
        api('/api/owner/nurture/run-now', { confirm: 'SEND' }).then(function (r) {
          $('nurtureResult').innerHTML = r.success ? '<div class="rvc-none"><b>' + esc(r.message) + '</b></div>' : '<div class="rvc-err">' + esc(r.error || 'Failed') + '</div>';
        });
      });
    }).catch(function () { $('nurtureResult').innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
  };

  /* ---------- health ---------- */
  function loadHealth() {
    var wrap = $('healthTableWrap');
    api('/api/owner/db-monitor').then(function (r) {
      if (!r || !r.success) { wrap.innerHTML = '<div class="rvc-empty">Could not load.</div>'; return; }
      $('healthMigrateBrand').innerHTML = '<option value="">— all workspaces —</option>' + r.stats.map(function (s) { return '<option value="' + esc(s.slug) + '">' + esc(s.slug) + '</option>'; }).join('');
      wrap.classList.add('rvc-cardtable');
      wrap.innerHTML = '<table><thead><tr><th>Workspace</th><th>Size (KB)</th><th>Tickets</th><th>Issues</th></tr></thead><tbody>' + r.stats.map(function (s) {
        return '<tr><td data-l="Workspace">' + esc(s.slug) + (s.critical ? ' 🔴' : s.warning ? ' 🟡' : '') + '</td><td data-l="Size (KB)">' + esc(s.sizeKB) + '</td><td data-l="Tickets">' + (s.records.tickets || 0) + '</td><td data-l="Issues">' + (s.records.issues || 0) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }).catch(function () { wrap.innerHTML = '<div class="rvc-empty">Could not load.</div>'; });
  }
  $('healthRefresh').onclick = loadHealth;
  function migrate(dry) {
    var slug = $('healthMigrateBrand').value, err = $('migrateErr'), res = $('migrateResult'); err.hidden = true;
    var go = function () {
      res.innerHTML = '<div class="rvc-muted">' + (dry ? 'Checking…' : 'Migrating…') + '</div>';
      api('/api/owner/migrate-email-assets', { slug: slug || undefined, dryRun: dry }).then(function (r) {
        if (!r.success) { err.textContent = r.error; err.hidden = false; res.innerHTML = ''; return; }
        res.innerHTML = '<div class="rvc-tablewrap rvc-cardtable"><table><thead><tr><th>Workspace</th><th>Tickets touched</th><th>Messages moved</th><th>Before KB</th><th>After KB</th></tr></thead><tbody>' + r.results.map(function (x) {
          return x.error ? '<tr><td data-l="Workspace">' + esc(x.slug) + '</td><td colspan="4" style="color:#e5484d">' + esc(x.error) + '</td></tr>' : '<tr><td data-l="Workspace">' + esc(x.slug) + '</td><td data-l="Tickets touched">' + x.ticketsTouched + '</td><td data-l="Messages moved">' + x.messagesMoved + '</td><td data-l="Before KB">' + x.beforeKB + '</td><td data-l="After KB">' + x.afterKB + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="rvc-note">' + (dry ? 'Dry run only. Nothing was changed.' : '✅ Done. Refresh the sizes above.') + '</p>';
      }).catch(function (e) { err.textContent = e.message; err.hidden = false; res.innerHTML = ''; });
    };
    if (dry) go(); else ask({ title: 'Run the migration?', html: '<p class="rvc-p">This moves email bodies out of the tickets for ' + esc(slug || 'ALL workspaces') + '. Run the dry run first if you have not.</p>', go: 'Run migration' }).then(function (ok) { if (ok) go(); });
  }
  $('migDry').onclick = function () { migrate(true); }; $('migRun').onclick = function () { migrate(false); };

  /* ---------- delete (everything goes to the recycle bin first) ---------- */
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function startDelete(t, after) {
    api('/api/owner/delete-preview?' + qs(t)).then(function (d) {
      if (!d.success) { toast(d.error || 'Cannot delete this', 'error'); return; }
      var ws = d.type === 'workspace';
      var html = '<p class="rvc-p"><b>' + esc(d.label) + '</b></p>' + d.lines.map(function (l) { return '<p class="rvc-p">' + esc(l) + '</p>'; }).join('')
        + (ws ? '<div class="rvc-warn">This removes the whole workspace: its users can no longer sign in and its customers\' tickets disappear from the app. A safety backup is taken first.</div>' : '')
        + '<p class="rvc-note">It goes to the Recycle bin for ' + d.keepDays + ' days. You can restore it from there.</p>';
      ask({ title: ws ? 'Delete this workspace?' : 'Delete this?', html: html, type: ws, typeWord: d.confirmName, exact: true, danger: true, go: ws ? 'Delete workspace' : 'Delete' }).then(function (ok) {
        if (!ok) return;
        var typed = $('confirmType').value;
        api('/api/owner/delete', Object.assign({}, t, { confirm: typed })).then(function (r) {
          if (!r.success) { toast(r.error || 'Delete failed', 'error'); return; }
          toast(r.message); refreshTrashBadge(); if (after) after();
        }).catch(function () { toast('No answer from the server. Check the Recycle bin before trying again.', 'error'); });
      });
    }).catch(function () { toast('No answer from the server', 'error'); });
  }
  var TYPE_ICON = { workspace: '🏢', user: '👤', ticket: '🎫', lead: '📨' };
  function refreshTrashBadge() { api('/api/owner/trash').then(function (d) { var n = d && d.success ? d.items.length : 0; $('trashBadge').textContent = n; $('trashBadge').hidden = !n; }).catch(function () {}); }
  function loadTrash() {
    var host = $('trashList'); host.innerHTML = '<div class="rvc-empty">Loading…</div>';
    api('/api/owner/trash').then(function (d) {
      if (!d.success) { host.innerHTML = '<div class="rvc-err">' + esc(d.error || 'Could not load') + '</div>'; return; }
      $('trashBadge').textContent = d.items.length; $('trashBadge').hidden = !d.items.length;
      if (!d.items.length) { host.innerHTML = '<div class="rvc-empty">The Recycle bin is empty.</div>'; return; }
      host.innerHTML = d.items.map(function (e) {
        return '<div class="rvc-result"><div class="b"><div class="t">' + (TYPE_ICON[e.type] || '') + ' ' + esc(e.label) + '</div><div class="s">' + pill(e.type === 'ticket' && e.table === 'issues' ? 'issue' : e.type) + esc(e.detail || '') + '<br>Deleted ' + esc(when(e.deletedAt)) + (e.by ? ' by ' + esc(e.by) : '') + ' · ' + (e.daysLeft <= 3 ? '<b style="color:#c0262b">' : '<b>') + e.daysLeft + (e.daysLeft === 1 ? ' day' : ' days') + ' left</b></div></div>' +
          '<button class="rvc-btn sm main" data-trash="restore" data-id="' + esc(e.id) + '">Restore</button><button class="rvc-btn sm dline" data-trash="purge" data-id="' + esc(e.id) + '" data-label="' + esc(e.label) + '">Delete for good</button></div>';
      }).join('');
    }).catch(function () { host.innerHTML = '<div class="rvc-err">No answer from the server.</div>'; });
  }
  $('trashList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-trash]'); if (!b) return;
    var id = b.getAttribute('data-id');
    if (b.getAttribute('data-trash') === 'restore') {
      b.disabled = true;
      api('/api/owner/trash/' + encodeURIComponent(id) + '/restore', {}).then(function (r) { b.disabled = false; toast(r.success ? r.message : (r.error || 'Could not restore'), r.success ? 'success' : 'error'); loadTrash(); });
    } else {
      ask({ title: 'Delete for good?', html: '<p class="rvc-p"><b>' + esc(b.getAttribute('data-label')) + '</b></p><p class="rvc-p">This cannot be undone. The only way back is an old backup file.</p>', type: true, typeWord: 'DELETE', exact: true, danger: true, go: 'Delete for good' }).then(function (ok) {
        if (!ok) return;
        api('/api/owner/trash/' + encodeURIComponent(id) + '/purge', { confirm: 'DELETE' }).then(function (r) { toast(r.success ? r.message : (r.error || 'Failed'), r.success ? 'success' : 'error'); loadTrash(); });
      });
    }
  });

  /* ---------- start ---------- */
  document.querySelector('.rvc-tabs').addEventListener('click', function (e) { var t = e.target.closest('.rvc-tab'); if (t) showTab(t.getAttribute('data-tab')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('editOverlay').hidden) closeEdit(); else if (!$('confirmOverlay').hidden) $('confirmCancel').click(); } });
  function init() {
    api('/api/owner/stats').then(function (d) {
      if (!d || !d.success) { showLogin(); return; }
      $('connStatus').textContent = 'Connected ✓'; $('connStatus').classList.add('ok');
      loadReports(); refreshTrashBadge();
      api('/api/owner/attention').then(function (a) {
        var n = a && a.success ? a.items.filter(function (i) { return i.severity !== 'low'; }).length : 0;
        if (n) { $('healthBadge').textContent = n; $('healthBadge').hidden = false; }
      });
      var h = (location.hash || '').replace('#', ''), qs = new URLSearchParams(location.search).get('q');
      if (['browse', 'monitor', 'nurture', 'health', 'trash'].indexOf(h) >= 0) showTab(h);
      if (qs) { $('findQ').value = qs; runFind(qs); }
    }).catch(function () { $('connStatus').textContent = 'No answer from the server'; });
  }
  window.RVConsole = { openReport: openReport, find: function (q) { showTab('find'); $('findQ').value = q; runFind(q); } };
  init();
})();
