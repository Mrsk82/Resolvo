/* Resolvo architecture page. Gets the text and live facts from /api/owner/architecture (owner session only). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var live = null, token = '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getToken() {
    if (token) return token;
    try { token = localStorage.getItem('tt_session_token') || localStorage.getItem('tt_token') || ''; } catch (e) {}
    return token;
  }
  function fmtBytes(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
  function fmtUp(s) { s = +s || 0; var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm'; }
  function ago(iso) { var t = Date.parse(iso); if (isNaN(t)) return 'never'; var d = Math.floor((Date.now() - t) / 3600000); return d < 1 ? 'under an hour ago' : d < 48 ? d + ' hours ago' : Math.floor(d / 24) + ' days ago'; }

  /* ---------- theme ---------- */
  function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  try { applyTheme(localStorage.getItem('arch_theme')); } catch (e) {}
  $('themeBtn').onclick = function () {
    var cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark'; applyTheme(next);
    try { localStorage.setItem('arch_theme', next); } catch (e) {}
  };

  /* ---------- sign-in ---------- */
  function showLogin(msg) { $('state').hidden = true; $('loginErr').textContent = msg || ''; $('loginOverlay').hidden = false; setTimeout(function () { $('loginPass').focus(); }, 50); }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault(); var err = $('loginErr'); err.textContent = 'Signing in…';
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPass').value }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d.success) { err.textContent = d.error || 'Sign-in failed'; return; }
        if (!d.isOwner) { err.textContent = 'This page needs the owner account.'; return; }
        token = d.token; try { localStorage.setItem('tt_session_token', d.token); } catch (x) {}
        $('loginPass').value = ''; err.textContent = ''; $('loginOverlay').hidden = true; load();
      }).catch(function () { err.textContent = 'No answer from the server.'; });
  });

  /* ---------- live facts ---------- */
  function table(head, rows, cls) {
    return '<div class="a-scroll"><table class="a-table"><thead><tr>' + head.map(function (h) { return '<th' + (h.c ? ' class="' + h.c + '"' : '') + '>' + esc(h.t) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  var BLOCKS = {
    kpis: function (L) {
      var w = L.workspaces, k = [
        ['Routes', L.routes.total], ['Workspaces', w.total], ['Prospects', w.prospects], ['Leads logged', w.leads], ['Uptime', fmtUp(L.build.uptimeSec)], ['Memory', L.build.memoryMb + ' MB']];
      return '<div class="a-kpis">' + k.map(function (x) { return '<div class="kpi"><div class="v">' + esc(x[1]) + '</div><div class="l">' + esc(x[0]) + '</div></div>'; }).join('') + '</div>';
    },
    build: function (L) {
      var b = L.build, g = b.git;
      return table([{ t: 'Fact' }, { t: 'Value' }], [
        ['Version on this server', g ? '<code>' + esc(g.commit) + '</code> · ' + esc(g.subject) + ' <span class="stamp">(' + esc((g.date || '').slice(0, 10)) + ')</span>' : 'not a git checkout'],
        ['Node.js / Express', esc(b.node) + ' / ' + esc(b.express)],
        ['Started', esc((b.startedAt || '').replace('T', ' ').slice(0, 16)) + ' UTC · up ' + fmtUp(b.uptimeSec)],
        ['Mode', esc(b.env)], ['Public address', esc(b.baseUrl)],
        ['Resolvo\'s own email sender', b.mail ? '<span class="pill ok">on</span>' : '<span class="pill warn">off on this server</span>']
      ].map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }));
    },
    routes: function (L) {
      var r = L.routes, m = Object.keys(r.byMethod).sort().map(function (k) { return '<span class="pill">' + k + ' ' + r.byMethod[k] + '</span>'; }).join(' ');
      return '<p>' + r.total + ' routes registered right now. ' + m + '</p>' + table([{ t: 'Starts with' }, { t: 'Routes', c: 'num' }], r.groups.map(function (g) { return '<tr><td><code>' + esc(g.prefix) + '</code></td><td class="num">' + g.n + '</td></tr>'; }));
    },
    tiers: function (L) {
      var T = ['Free', 'Trial', 'Pro', 'Enterprise'], rows = [], grp = '';
      L.matrix.forEach(function (f) {
        if (f.group !== grp) { grp = f.group; rows.push('<tr class="grp"><td colspan="5">' + esc(grp) + '</td></tr>'); }
        rows.push('<tr><td>' + esc(f.label) + ' <span class="mono" style="color:var(--muted)">' + esc(f.key) + '</span></td>' + T.map(function (t) { return '<td class="c">' + (f.on.indexOf(t) >= 0 ? '<span class="yes" aria-label="included">●</span>' : '<span class="no" aria-label="not included">–</span>') + '</td>'; }).join('') + '</tr>');
      });
      var head = [{ t: 'Feature' }].concat(T.map(function (t) { return { t: t, c: 'c' }; }));
      var sum = '<p>' + L.tiers.map(function (t) { return '<span class="pill">' + esc(t.tier) + ': ' + t.on + ' of ' + t.total + ' switches on</span>'; }).join(' ') + '</p>';
      return sum + table(head, rows);
    },
    workspaces: function (L) {
      var w = L.workspaces, f = function (o) { return Object.keys(o).map(function (k) { return '<span class="pill">' + esc(k) + ' ' + o[k] + '</span>'; }).join(' '); };
      return table([{ t: 'Group' }, { t: 'Count' }], [['By status', f(w.byStatus)], ['By plan', f(w.byTier)]].map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }));
    },
    storage: function (L) {
      var s = L.storage, c = L.code;
      return table([{ t: 'What' }, { t: 'Size now' }], [
        ['Owner registry (<code>data/owner.json</code>)', fmtBytes(s.ownerJsonBytes)],
        ['Workspace databases (' + s.brandFolders + ' folders)', fmtBytes(s.brandDbBytes)],
        ['Backups kept', s.backups + ' · ' + fmtBytes(s.backupBytes) + ' · latest ' + ago(s.lastBackup)],
        ['Recycle bin items', String(s.trashItems)],
        ['Visit counts (<code>data/analytics.json</code>)', fmtBytes(s.analyticsBytes)],
        ['<code>server.js</code>', Number(c.serverLines).toLocaleString('en-IN') + ' lines'],
        ['Public pages / library modules / test files', c.publicPages + ' / ' + c.libModules + ' / ' + c.testFiles]
      ].map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td></tr>'; }));
    },
    deps: function (L) {
      return '<p>' + L.code.dependencies.map(function (d) { return '<span class="pill">' + esc(d.name) + ' ' + esc(d.version) + '</span>'; }).join(' ') + '</p>';
    }
  };
  function fill(L) {
    document.querySelectorAll('[data-live-block]').forEach(function (el) { var f = BLOCKS[el.getAttribute('data-live-block')]; if (f) { try { el.innerHTML = f(L); } catch (e) { el.textContent = 'Could not show this live block.'; } } });
    var jobs = {};
    L.cron.forEach(function (c) { jobs[c] = (jobs[c] || 0) + 1; });
    var doc = {};
    document.querySelectorAll('[data-cron]').forEach(function (tr) {
      var c = tr.getAttribute('data-cron'); doc[c] = (doc[c] || 0) + 1;
      var cell = tr.querySelector('.cron-state'); if (cell) cell.innerHTML = jobs[c] ? '<span class="pill ok">running</span>' : (tr.hasAttribute('data-optional') ? '<span class="pill">idle: nothing to poll</span>' : '<span class="pill warn">not registered here</span>');
    });
    var extra = Object.keys(jobs).filter(function (c) { return (doc[c] || 0) < jobs[c]; });
    var box = $('docCheck');
    if (box) {
      var notes = [];
      if (extra.length) notes.push('<div class="callout warn"><b>Schedules not described above</b>The server registers these schedules, but this page does not describe them yet: ' + extra.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(', ') + '. Add them to the jobs table in <code>internal/architecture-content.html</code>.</div>');
      var text = $('content').textContent.toLowerCase();
      var missing = L.code.dependencies.filter(function (d) { return text.indexOf(d.name.toLowerCase()) < 0; }).map(function (d) { return d.name; });
      if (missing.length) notes.push('<div class="callout warn"><b>Packages not mentioned above</b>' + missing.map(function (m) { return '<code>' + esc(m) + '</code>'; }).join(', ') + ' are installed but this page does not mention them.</div>');
      box.innerHTML = notes.length ? notes.join('') : '<div class="callout"><b>This page matches the server</b>Every schedule and every installed package on this server is described above.</div>';
    }
    var g = L.build.git;
    $('liveBar').innerHTML = '<span class="dot"></span><b>Live</b> · ' + (g ? esc(g.commit) + ' · ' : '') + L.routes.total + ' routes · ' + L.workspaces.total + (L.workspaces.total === 1 ? ' workspace' : ' workspaces') + ' · up ' + fmtUp(L.build.uptimeSec);
  }

  /* ---------- navigation, search ---------- */
  var secs = [];
  function buildNav() {
    secs = [].slice.call(document.querySelectorAll('#content .a-sec'));
    var groups = {}, order = [];
    secs.forEach(function (s) { var g = s.getAttribute('data-group') || 'More'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(s); });
    $('navList').innerHTML = order.map(function (g) {
      return '<div class="ng"><div class="ng-t">' + esc(g) + '</div>' + groups[g].map(function (s) { return '<a href="#' + esc(s.id) + '" data-id="' + esc(s.id) + '">' + esc(s.getAttribute('data-title') || s.id) + '</a>'; }).join('') + '</div>';
    }).join('');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) { document.querySelectorAll('#navList a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-id') === x.target.id); }); } });
      }, { rootMargin: '-20% 0px -70% 0px' });
      secs.forEach(function (s) { io.observe(s); });
    }
  }
  $('navList').addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
  function closeMenu() { $('nav').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false'); }
  $('menuBtn').onclick = function () { var o = $('nav').classList.toggle('open'); this.setAttribute('aria-expanded', o); };
  function clearMarks(root) { root.querySelectorAll('mark').forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); }); root.normalize(); }
  $('q').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase(), shown = 0;
    secs.forEach(function (s) { clearMarks(s); });
    secs.forEach(function (s) {
      var hit = !q || s.textContent.toLowerCase().indexOf(q) >= 0; s.hidden = !hit; if (hit) shown++;
      var a = document.querySelector('#navList a[data-id="' + s.id + '"]'); if (a) a.classList.toggle('dim', !hit);
      if (q && hit && q.length > 2) markText(s, q);
    });
    $('noMatch').hidden = shown > 0;
  });
  function markText(root, q) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode.closest('script,style,svg,mark') || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }), nodes = [], n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.slice(0, 400).forEach(function (t) {
      var i = t.nodeValue.toLowerCase().indexOf(q); if (i < 0) return;
      var r = t.splitText(i); r.splitText(q.length); var m = document.createElement('mark'); r.parentNode.insertBefore(m, r); m.appendChild(r);
    });
  }

  /* ---------- load ---------- */
  function load() {
    $('state').hidden = false; $('state').textContent = 'Loading the architecture…';
    fetch('/api/owner/architecture', { headers: { 'x-session-token': getToken() } }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) { if (d && /owner access/i.test(d.error || '')) return showLogin(); $('state').textContent = (d && d.error) || 'Could not load.'; return; }
      live = d.live; $('state').hidden = true;
      $('content').innerHTML = d.html; $('content').hidden = false;
      buildNav(); fill(live);
      var st = $('content').querySelector('[data-stamp]'); if (st) $('sideFoot').innerHTML = 'Text last reviewed <b>' + esc(st.getAttribute('data-stamp')) + '</b>. Numbers marked live come from this server when the page loads.';
      if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(function () { t.scrollIntoView(); }, 50); }
    }).catch(function () { $('state').textContent = 'No answer from the server.'; });
  }
  $('refreshBtn').onclick = function () {
    fetch('/api/owner/architecture', { headers: { 'x-session-token': getToken() } }).then(function (r) { return r.json(); }).then(function (d) { if (d && d.success) { live = d.live; fill(live); } else showLogin(); }).catch(function () {});
  };
  load();
})();
