/* Owner portal panels: "Needs your attention" and "System and backups", plus the phone menu.
   Everything here reads /api/owner/attention and /api/owner/system; the layout lives in /css/rv-owner.css. */
(function () {
  'use strict';
  var showAll = false, showBackups = false, attn = null, sys = null, busy = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tok() { return localStorage.getItem('tt_session_token') || ''; }
  function api(path, body) {
    var o = { headers: { 'x-session-token': tok(), 'Content-Type': 'application/json' } };
    if (body !== undefined) { o.method = 'POST'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json(); });
  }
  function toast(msg, type) {
    if (window.App && App.showToast) { App.showToast(msg, type || 'success'); return; }
    var t = document.createElement('div');   // the Owner Console has no App object: a plain notice instead
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2000;max-width:min(92vw,520px);padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.25);background:' + (type === 'error' ? '#e5484d' : type === 'warning' ? '#b45309' : '#0f766e');
    t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4500);
  }
  function ago(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 2) return 'just now'; if (m < 120) return m + ' minutes ago';
    var h = Math.round(m / 60); if (h < 48) return h + ' hours ago';
    return Math.round(h / 24) + ' days ago';
  }
  function size(b) { if (!b) return '0 KB'; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function dur(s) { var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm'; }
  var SEV = { high: '#e5484d', med: '#f59e0b', low: '#94a3b8' };

  // ---------- needs attention ----------
  function drawAttention() {
    var el = document.getElementById('rvOwnAttention'); if (!el) return;
    if (!attn) { el.innerHTML = ''; return; }
    var items = attn, high = items.filter(function (i) { return i.severity !== 'low'; });
    var shown = showAll ? items : (high.length ? high : items.slice(0, 3));
    var h = '<div class="rv-oa"><div class="rv-oa-head"><h2>Needs your attention</h2><span class="rv-oa-count' + (items.length ? '' : ' ok') + '">' + (items.length || '✓') + '</span></div>';
    if (!items.length) h += '<div class="rv-oa-clear">All clear. Backups are current, sign-ups are activated and emails are going out.</div>';
    shown.forEach(function (i) {
      h += '<div class="rv-oa-row"><span class="rv-oa-dot" style="background:' + SEV[i.severity] + '"></span><div class="rv-oa-body"><div class="rv-oa-title">' + esc(i.title) + '</div><div class="rv-oa-text">' + esc(i.text) + '</div></div>';
      if ((i.actions || []).length) h += '<div class="rv-oa-acts">' + i.actions.map(function (a, n) {
        return '<button class="rv-oa-btn' + (n === 0 ? ' main' : '') + '" data-rvo="' + esc(a.kind) + '" data-slug="' + esc(a.slug || '') + '" data-target="' + esc(a.target || '') + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>';
      h += '</div>';
    });
    if (items.length > shown.length) h += '<div class="rv-oa-more"><button data-rvo="toggle-all">Show ' + (items.length - shown.length) + ' more (lower priority)</button></div>';
    else if (showAll && high.length && items.length > high.length) h += '<div class="rv-oa-more"><button data-rvo="toggle-all">Show fewer</button></div>';
    el.innerHTML = h + '</div>';
  }
  function loadAttention() { return api('/api/owner/attention').then(function (r) { attn = r && r.success ? r.items : null; drawAttention(); }).catch(function () {}); }

  // ---------- system and backups ----------
  function spark(hist) {
    if (!hist || hist.length < 2) return '';
    var v = hist.map(function (x) { return x.workspaces || 0; }), mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), w = 120, ht = 26, step = w / (v.length - 1);
    var pts = v.map(function (n, i) { return (i * step).toFixed(1) + ',' + (mx === mn ? ht / 2 : ht - 3 - (n - mn) / (mx - mn) * (ht - 6)).toFixed(1); }).join(' ');
    return '<svg class="rv-os-spark" width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '" aria-label="Workspaces at each backup"><polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="1.6"/></svg>';
  }
  function drawSystem() {
    var el = document.getElementById('rvOwnSystem'); if (!el) return;
    if (!sys) { el.innerHTML = ''; return; }
    var b = sys.backup, last = b.last, hist = b.history || [], cur = hist[hist.length - 1];
    var lastOk = last && last.ok !== false && b.newest;
    var stale = b.newest && (Date.now() - Date.parse(b.newest.createdAt)) > 26 * 3600000;
    var tile1 = !b.newest ? '<div class="rv-os-v bad">None yet</div><div class="rv-os-s">The first one is made at 03:30.</div>'
      : '<div class="rv-os-v ' + (last && last.ok === false ? 'bad' : stale ? 'bad' : 'good') + '">' + esc(ago(b.newest.createdAt)) + '</div><div class="rv-os-s">' + (last && last.ok === false ? 'The last attempt failed: ' + esc(String(last.error || '').slice(0, 90)) : esc(size(b.newest.bytes)) + ' · every night at 03:30') + '</div>';
    var since = hist.slice(Math.max(0, hist.map(function (x) { return !!x.intentional; }).lastIndexOf(true)));   // only counts since the last deliberate delete/restore
    var peak = Math.max.apply(null, since.slice(0, -1).map(function (x) { return x.workspaces || 0; }).concat([0]));
    var tile2 = cur ? '<div class="rv-os-v ' + (cur.workspaces < peak ? 'bad' : '') + '">' + cur.workspaces + ' <span style="font-size:12px;font-weight:600;color:var(--text-dim)">workspaces</span></div><div class="rv-os-s">' + (cur.users != null ? cur.users + ' users · ' : '') + (cur.tickets != null ? cur.tickets + ' tickets · ' : '') + 'at the last backup' + (cur.workspaces < peak ? '<br><b style="color:#e5484d">Was ' + peak + ' before.</b>' : '') + '</div>' + spark(hist)
      : '<div class="rv-os-v">–</div><div class="rv-os-s">Shown after the first backup.</div>';
    var tile3 = '<div class="rv-os-v">' + b.count + '</div><div class="rv-os-s">' + esc(size(b.totalBytes)) + ' in total · 14 days, then 1 a week for 8 weeks</div>';
    var d = sys.disk;
    var tile4 = '<div class="rv-os-v ' + (d && d.usedPct >= 85 ? 'bad' : '') + '">' + (d ? d.freeGB + ' GB <span style="font-size:12px;font-weight:600;color:var(--text-dim)">free</span>' : esc(dur(sys.uptimeSec))) + '</div><div class="rv-os-s">' + (d ? 'disk ' + d.usedPct + '% used · ' : '') + 'up ' + esc(dur(sys.uptimeSec)) + ' · memory ' + sys.memoryMB + ' MB<br>Email sender: ' + (sys.senderOn ? '<b style="color:var(--low,#16a34a)">on</b>' : '<b style="color:#e5484d">off</b>') + '</div>';
    var h = '<div class="rv-os"><div class="rv-os-head"><h2>System and backups</h2>'
      + '<button class="rv-os-btn" data-rvo="toggle-backups">' + (showBackups ? 'Hide backups' : 'All backups') + '</button>'
      + '<button class="rv-os-btn main" data-rvo="backup-now"' + (b.running || busy.backup ? ' disabled' : '') + '>' + (b.running || busy.backup ? 'Backing up…' : 'Back up now') + '</button></div>'
      + '<div class="rv-os-tiles"><div class="rv-os-tile"><div class="rv-os-k">Last backup</div>' + tile1 + '</div><div class="rv-os-tile"><div class="rv-os-k">Workspaces</div>' + tile2 + '</div><div class="rv-os-tile"><div class="rv-os-k">Backups kept</div>' + tile3 + '</div><div class="rv-os-tile"><div class="rv-os-k">Server</div>' + tile4 + '</div></div>';
    if (showBackups) {
      h += '<div class="rv-os-list">' + (b.list.length ? b.list.map(function (x) {
        return '<div class="rv-os-item"><span class="n">' + esc(x.name) + '</span><span class="d">' + esc(new Date(x.createdAt).toLocaleString()) + ' · ' + esc(size(x.bytes)) + '</span>' + (x.packed ? '<button class="rv-os-btn" data-rvo="download" data-name="' + esc(x.name) + '">Download</button>' : '') + '</div>';
      }).join('') : '<div class="rv-os-item">No backups yet.</div>') + '</div>'
        + '<div class="rv-os-note">Backups hold every workspace, the owner file and the keys. Keep a copy off the server (download one now and then). Showing the newest ' + b.list.length + ' of ' + b.count + '.</div>';
    }
    el.innerHTML = h + '</div>';
  }
  function loadSystem() { return api('/api/owner/system').then(function (r) { sys = r && r.success ? r : null; drawSystem(); }).catch(function () {}); }

  function runBackup() {
    busy.backup = true; drawSystem();
    return api('/api/owner/backups/run', {}).then(function (r) {
      busy.backup = false;
      if (r && r.success) toast(r.skipped ? 'A backup was already made this minute.' : 'Backup saved (' + size(r.bytes) + ').');
      else toast('Backup failed: ' + ((r && r.error) || 'unknown error'), 'error');
    }).catch(function () { busy.backup = false; toast('Backup failed: no answer from the server.', 'error'); }).then(function () { return Promise.all([loadSystem(), loadAttention()]); });
  }
  function download(name) {
    fetch('/api/owner/backups/download/' + encodeURIComponent(name), { headers: { 'x-session-token': tok() } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob();
    }).then(function (blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }).catch(function (e) { toast('Download failed: ' + e.message, 'error'); });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; });
    return Promise.resolve(false);
  }

  // ---------- phone menu ----------
  function closeNav() { var o = document.getElementById('owner-dashboard'); if (o) o.classList.remove('rv-own-nav-open'); }

  function onClick(e) {
    var t = e.target.closest && e.target.closest('[data-rvo]');
    if (t) {
      var k = t.getAttribute('data-rvo'), slug = t.getAttribute('data-slug');
      if (k === 'toggle-all') { showAll = !showAll; drawAttention(); }
      else if (k === 'toggle-backups') { showBackups = !showBackups; drawSystem(); }
      else if (k === 'show-backups') { showBackups = true; drawSystem(); RVOwner.goto('rvOwnSystem'); }
      else if (k === 'backup-now') runBackup();
      else if (k === 'download') download(t.getAttribute('data-name'));
      else if (k === 'trials') { if (window.RVConsole) RVConsole.openReport('trials-ending'); else if (window.App && App._ownerShowTrials) App._ownerShowTrials(); }
      else if (k === 'scroll') RVOwner.goto(t.getAttribute('data-target'));
      else if (k === 'resend-activation') {
        t.disabled = true;
        api('/api/owner/brands/' + encodeURIComponent(slug) + '/resend-activation', {}).then(function (r) {
          if (!r || !r.success) { toast((r && r.error) || 'Could not resend.', 'error'); t.disabled = false; return; }
          if (r.sent) { toast(r.message); loadAttention(); return; }
          toast(r.message || 'The email could not be sent.', 'warning');
          if (r.link) copyText(r.link).then(function (ok) { toast(ok ? 'Activation link copied. Send it to them yourself.' : 'Link: ' + r.link, 'warning'); });
          t.disabled = false;
        }).catch(function () { toast('No answer from the server.', 'error'); t.disabled = false; });
      } else if (k === 'copy-activation') {
        api('/api/owner/brands/' + encodeURIComponent(slug) + '/resend-activation', { send: false }).then(function (r) {
          if (!r || !r.success) { toast((r && r.error) || 'Could not make a link.', 'error'); return; }
          copyText(r.link).then(function (ok) { toast(ok ? 'Activation link copied. It works for 48 hours.' : 'Link: ' + r.link, ok ? 'success' : 'warning'); });
        });
      }
      return;
    }
    if (e.target.closest && e.target.closest('.rv-own-burger')) { var od = document.getElementById('owner-dashboard'); if (od) od.classList.toggle('rv-own-nav-open'); return; }
    if (e.target.closest && (e.target.closest('.rv-own-scrim') || e.target.closest('.rv-own-side button'))) closeNav();
  }

  window.RVOwner = {
    mount: function (root) {
      var o = root || document.getElementById('owner-dashboard'); if (!o) return;
      if (!o.getAttribute('data-rvo-wired')) { o.setAttribute('data-rvo-wired', '1'); o.addEventListener('click', onClick); }
      attn = null; sys = null; showAll = false;
      loadAttention(); loadSystem();
    },
    goto: function (id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    openBackups: function () { showBackups = true; drawSystem(); RVOwner.goto('rvOwnSystem'); }
  };
})();
