/* Resolvo UI kit (RV). Small builders that return HTML for the rv-* components in css/rv-components.css,
   plus the few behaviours they need (menus, tabs, modal, drawer, toast).
   Rules: every piece of text from data goes through RV.esc; `onclick`-style options are for developer-written
   handler strings only (never put user data in them). */
(function (global) {
  'use strict';
  var RV = {};

  RV.esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var esc = RV.esc;
  var cls = function () { return Array.prototype.filter.call(arguments, Boolean).join(' '); };
  var attrs = function (o) { var s = ''; for (var k in (o || {})) { if (o[k] === false || o[k] == null) continue; s += ' ' + k + (o[k] === true ? '' : '="' + esc(o[k]) + '"'); } return s; };

  // ---- icons (stroke, inherit colour) ----
  var ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>'
  };
  RV.icon = function (name, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  };

  // ---- primitives ----
  RV.btn = function (o) {
    o = o || {};
    var a = { type: o.type || 'button', onclick: o.onclick, id: o.id, title: o.title, 'aria-label': o.ariaLabel, disabled: !!o.disabled, 'data-rv-tip': o.tip };
    if (o.attrs) for (var k in o.attrs) a[k] = o.attrs[k];
    return '<button class="' + cls('rv-btn', o.kind && 'rv-btn--' + o.kind, o.size && 'rv-btn--' + o.size, o.loading && 'is-loading') + '"' + attrs(a) + '>' + (o.icon ? RV.icon(o.icon, 16) : '') + (o.label != null ? '<span>' + esc(o.label) + '</span>' : '') + '</button>';
  };
  RV.iconBtn = function (o) { return '<button type="button" class="rv-iconbtn"' + attrs({ onclick: o.onclick, 'aria-label': o.label, 'data-rv-tip': o.label, id: o.id }) + '>' + RV.icon(o.icon, o.size || 18) + '</button>'; };
  RV.badge = function (text, kind, o) { o = o || {}; return '<span class="' + cls('rv-badge', kind && 'rv-badge--' + kind) + '">' + (o.dot ? '<i class="rv-dot"></i>' : '') + esc(text) + '</span>'; };

  var STATUS = { new: ['info', 'New'], open: ['accent', 'Open'], pending: ['warning', 'Pending'], 'on-hold': ['', 'On hold'], escalated: ['danger', 'Escalated'], resolved: ['success', 'Resolved'], closed: ['', 'Closed'] };
  RV.status = function (s) { var k = String(s || 'open').toLowerCase(); var m = STATUS[k] || ['', String(s || 'Open')]; return RV.badge(m[1], m[0], { dot: true }); };
  var PRIORITY = { critical: 'danger', high: 'high', medium: 'warning', low: 'success' };
  RV.priority = function (p) { var k = String(p || 'Medium').toLowerCase(); return RV.badge(String(p || 'Medium'), PRIORITY[k] || '', { dot: true }); };

  RV.avatar = function (name, size, img) {
    var n = String(name || '?').trim(); var sum = 0; for (var i = 0; i < n.length; i++) sum += n.charCodeAt(i);
    return '<span class="' + cls('rv-avatar', size && 'rv-avatar--' + size, 'rv-avatar--c' + (sum % 5)) + '" aria-hidden="true">' + (img ? '<img src="' + esc(img) + '" alt="">' : esc(n.charAt(0).toUpperCase())) + '</span>';
  };

  // ---- structure ----
  RV.pageHead = function (o) {
    return '<div class="rv-pagehead"><div><h1 class="rv-pagehead__title">' + esc(o.title) + '</h1>' + (o.sub ? '<p class="rv-pagehead__sub">' + esc(o.sub) + '</p>' : '') + '</div>' +
      (o.actions ? '<div class="rv-pagehead__actions">' + o.actions + '</div>' : '') + '</div>';
  };
  RV.card = function (o) {
    o = o || {};
    var head = (o.title || o.actions) ? '<div class="rv-card__head"><h2 class="rv-card__title">' + esc(o.title || '') + '</h2>' + (o.actions || '') + '</div>' : '';
    return '<section class="' + cls('rv-card', o.flush && 'rv-card--flush', o.onclick && 'rv-card--interactive') + '"' + attrs({ onclick: o.onclick, id: o.id, role: o.onclick ? 'button' : null, tabindex: o.onclick ? '0' : null }) + '>' + head + '<div class="rv-card__body">' + (o.body || '') + '</div></section>';
  };
  RV.stat = function (o) {
    return '<div class="' + cls('rv-card', 'rv-stat', o.onclick && 'rv-card--interactive') + '"' + attrs({ onclick: o.onclick, role: o.onclick ? 'button' : null, tabindex: o.onclick ? '0' : null }) + '>' +
      (o.icon ? '<span class="' + cls('rv-stat__icon', o.iconKind && 'rv-stat__icon--' + o.iconKind) + '">' + RV.icon(o.icon, 17) + '</span>' : '') +
      '<div class="rv-stat__label">' + esc(o.label) + '</div><div class="rv-stat__value">' + (o.valueHtml != null ? o.valueHtml : esc(o.value)) + '</div>' +
      (o.note ? '<div class="' + cls('rv-stat__note', o.noteKind && 'rv-stat__note--' + o.noteKind) + '">' + esc(o.note) + '</div>' : '') + '</div>';
  };
  RV.alert = function (kind, html) { return '<div class="rv-alert rv-alert--' + esc(kind) + '" role="status">' + html + '</div>'; };
  RV.empty = function (o) {
    return '<div class="rv-empty"><div class="rv-empty__icon">' + RV.icon(o.icon || 'inbox', 24) + '</div><div class="rv-empty__title">' + esc(o.title) + '</div>' +
      (o.text ? '<div class="rv-empty__text">' + esc(o.text) + '</div>' : '') + (o.actions ? '<div class="rv-empty__actions">' + o.actions + '</div>' : '') + '</div>';
  };
  RV.skeleton = function (lines, w) { var s = ''; for (var i = 0; i < (lines || 3); i++) s += '<span class="rv-skeleton" style="width:' + (i === (lines || 3) - 1 ? 60 : (w || 100)) + '%;margin-bottom:10px"></span>'; return '<div aria-busy="true" aria-label="Loading">' + s + '</div>'; };
  RV.progress = function (pct) { return '<div class="rv-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>'; };

  // ---- navigation-ish ----
  // items: [{id,label,count}] ; the page wires clicks with RV.onTabs(container, fn)
  RV.tabs = function (items, active, o) {
    o = o || {};
    return '<div class="' + cls('rv-tabs', o.pills && 'rv-tabs--pills') + '" role="tablist"' + attrs({ 'aria-label': o.label }) + '>' + items.map(function (t) {
      var on = t.id === active;
      return '<button type="button" role="tab" class="rv-tab" data-rv-tab="' + esc(t.id) + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + esc(t.label) + (t.count != null ? '<span class="rv-tab__count">' + esc(t.count) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  };
  RV.onTabs = function (container, fn) {
    container.addEventListener('click', function (e) { var b = e.target.closest('[data-rv-tab]'); if (b && container.contains(b)) fn(b.getAttribute('data-rv-tab')); });
    container.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(container.querySelectorAll('[role=tab]')); var i = tabs.indexOf(document.activeElement); if (i < 0) return;
      var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
    });
  };
  RV.range = function (options, current, handler) {
    return '<div class="rv-range" role="group" aria-label="Range">' + options.map(function (o) {
      return '<button type="button" class="rv-range__opt" aria-pressed="' + (o.value === current) + '" onclick="' + handler + '(' + JSON.stringify(o.value).replace(/"/g, '&quot;') + ')">' + esc(o.label) + '</button>';
    }).join('') + '</div>';
  };
  RV.search = function (o) {
    return '<div class="rv-search">' + RV.icon('search', 16) + '<input class="rv-input" type="search"' + attrs({ id: o.id, placeholder: o.placeholder || 'Search', 'aria-label': o.label || o.placeholder || 'Search', oninput: o.oninput, value: o.value }) + '>' + (o.kbd ? '<span class="rv-kbd">' + esc(o.kbd) + '</span>' : '') + '</div>';
  };
  RV.field = function (o) {
    return '<div class="rv-field"><label class="rv-label" for="' + esc(o.id) + '">' + esc(o.label) + '</label>' + o.control + (o.hint ? '<span class="rv-hint">' + esc(o.hint) + '</span>' : '') + (o.error ? '<span class="rv-error" role="alert">' + esc(o.error) + '</span>' : '') + '</div>';
  };

  // table: columns [{key,label,render(row)->html, className}], rows [objects]; rowClick is a handler string receiving the row index
  RV.table = function (o) {
    if (!o.rows || !o.rows.length) return RV.empty(o.empty || { title: 'Nothing here yet', icon: 'inbox' });
    var head = '<tr>' + o.columns.map(function (c) { return '<th scope="col">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    var body = o.rows.map(function (r, i) {
      return '<tr' + (o.rowClick ? ' class="rv-row" tabindex="0" onclick="' + o.rowClick + '(' + i + ')"' : '') + '>' + o.columns.map(function (c) {
        return '<td class="' + (c.className || '') + '">' + (c.render ? c.render(r, i) : esc(r[c.key])) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="rv-table-wrap"><table class="rv-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  };
  RV.pagination = function (o) {
    return '<div class="rv-pagination"><span>' + esc(o.summary) + '</span><div class="rv-cluster">' + RV.btn({ label: 'Previous', size: 'sm', onclick: o.prev, disabled: !o.hasPrev }) + RV.btn({ label: 'Next', size: 'sm', onclick: o.next, disabled: !o.hasNext }) + '</div></div>';
  };
  RV.menu = function (o) {
    return '<div class="rv-menu">' + (o.trigger || RV.iconBtn({ icon: 'more', label: o.label || 'More actions' })).replace('<button', '<button data-rv-menu aria-haspopup="menu" aria-expanded="false"') +
      '<div class="rv-menu__panel" role="menu">' + o.items.map(function (it) { return it === '-' ? '<div class="rv-menu__sep"></div>' : '<button type="button" role="menuitem" class="rv-menu__item"' + attrs({ onclick: it.onclick }) + '>' + (it.icon ? RV.icon(it.icon, 15) : '') + esc(it.label) + '</button>'; }).join('') + '</div></div>';
  };

  // ---- behaviours ----
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-rv-menu]') : null;
    document.querySelectorAll('.rv-menu.is-open').forEach(function (m) { if (!t || m !== t.closest('.rv-menu')) { m.classList.remove('is-open'); var b = m.querySelector('[data-rv-menu]'); if (b) b.setAttribute('aria-expanded', 'false'); } });
    if (t) { var m = t.closest('.rv-menu'); var open = m.classList.toggle('is-open'); t.setAttribute('aria-expanded', String(open)); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.rv-menu.is-open').forEach(function (m) { m.classList.remove('is-open'); });
    var ov = document.querySelector('.rv-overlay[data-rv-modal]'); if (ov) RV.closeModal(ov);
    var dr = document.querySelector('.rv-drawer.is-open'); if (dr) dr.classList.remove('is-open');
  });

  RV.modal = function (o) {
    var ov = document.createElement('div'); ov.className = 'rv rv-overlay'; ov.setAttribute('data-rv-modal', '');
    ov.innerHTML = '<div class="rv-modal" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="rv-modal__head"><h2 class="rv-card__title">' + esc(o.title) + '</h2>' + RV.iconBtn({ icon: 'x', label: 'Close', onclick: 'RV.closeModal(this.closest(\'.rv-overlay\'))' }) + '</div><div class="rv-modal__body">' + (o.body || '') + '</div>' + (o.foot ? '<div class="rv-modal__foot">' + o.foot + '</div>' : '') + '</div>';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) RV.closeModal(ov); });
    ov._returnFocus = document.activeElement; document.body.appendChild(ov);
    var f = ov.querySelector('input,select,textarea,button:not([aria-label=Close])'); if (f) f.focus();
    return ov;
  };
  RV.closeModal = function (ov) { if (!ov) return; var r = ov._returnFocus; ov.remove(); if (r && r.focus) try { r.focus(); } catch (e) {} };
  RV.drawer = function (id, html) {
    var d = document.getElementById(id);
    if (!d) { d = document.createElement('aside'); d.id = id; d.className = 'rv rv-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'false'); document.body.appendChild(d); }
    d.innerHTML = html; requestAnimationFrame(function () { d.classList.add('is-open'); }); return d;
  };
  RV.toast = function (msg, kind) {
    var box = document.querySelector('.rv-toasts'); if (!box) { box = document.createElement('div'); box.className = 'rv rv-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'rv-toast' + (kind ? ' rv-toast--' + kind : ''); t.setAttribute('role', kind === 'error' ? 'alert' : 'status'); t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'error' ? 7000 : 4000);
  };

  global.RV = RV;
})(window);
