/* Resolvo: bring tickets over from another help desk (CSV), RVImport.
   Steps: choose a file -> check which column is which -> preview -> import (in batches, with progress) -> summary with "Remove this import".
   The file is read in the browser; rows are sent to the server in small batches (server.js: previewTicketImport, startTicketImport, importTicketBatch,
   finishTicketImport, undoTicketImport). Imported tickets are history: no emails, no alerts, no SLA clock, never auto-assigned. */
(function (w) {
  'use strict';
  var RVImport = {};
  var A = function () { return App; };   // App is a script-level constant (not on window)
  var esc = function (s) { return w.RV.esc(s); };
  var MAX_BYTES = 25 * 1024 * 1024, BATCH = 300;
  var FIELDS = [
    ['email', 'Customer email', true, 'Needed to create a ticket. Rows without one are skipped.'],
    ['subject', 'Subject', false, ''],
    ['name', 'Customer name', false, ''],
    ['body', 'Message text', false, 'Many exports do not include it. Tickets then import with their details only.'],
    ['status', 'Status', false, 'Solved, closed, pending and so on are matched to Resolvo statuses.'],
    ['priority', 'Priority', false, ''],
    ['created', 'Created date', false, ''],
    ['updated', 'Last updated', false, ''],
    ['resolved', 'Solved / closed date', false, ''],
    ['assignee', 'Agent', false, 'Kept only when it matches one of your team. Nothing is assigned automatically.'],
    ['tags', 'Tags', false, ''],
    ['externalId', 'Ticket number in the old system', false, 'Used to avoid duplicates if you import the same file twice.']
  ];
  var S = null, ov = null;

  // ---------- reading the file ----------
  function parseCSV(text, delim) {
    var rows = [], field = '', row = [], inQ = false, i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var data = rows.slice(1).filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); }).map(function (r) { var o = {}; headers.forEach(function (h, k) { if (h) o[h] = (r[k] || '').trim(); }); return o; });
    return { headers: headers.filter(Boolean).filter(function (h, k, a) { return a.indexOf(h) === k; }), rows: data };
  }
  function readFile(file, done) {
    var rd = new FileReader();
    rd.onload = function (e) {
      var text = String(e.target.result || '').replace(/^﻿/, ''), first = text.split('\n')[0] || '';
      var counts = { ',': (first.match(/,/g) || []).length, ';': (first.match(/;/g) || []).length, '\t': (first.match(/\t/g) || []).length };
      var delim = counts[';'] > counts[','] && counts[';'] >= counts['\t'] ? ';' : (counts['\t'] > counts[','] ? '\t' : ',');
      done(parseCSV(text, delim));
    };
    rd.onerror = function () { done(null); };
    rd.readAsText(file);
  }

  // ---------- the window ----------
  function frame(title, body, foot) {
    if (!ov || !ov.isConnected) { ov = w.RV.modal({ title: title, body: '<div id="rvxBody"></div>', foot: '<div id="rvxFoot" style="display:contents"></div>' }); ov.classList.add('rvx'); }
    else { var h = ov.querySelector('.rv-modal__head h2'); if (h) h.textContent = title; }
    ov.querySelector('#rvxBody').innerHTML = body; ov.querySelector('#rvxFoot').innerHTML = foot || '';
    var f = ov.querySelector('#rvxBody input,#rvxBody select,#rvxFoot button:not([disabled])'); if (f && f.type !== 'file') try { f.focus(); } catch (e) {}
  }
  function close() { if (ov) { if (ov.isConnected) w.RV.closeModal(ov); ov = null; } }
  var btn = function (label, kind, act, extra) { extra = extra || {}; var sz = extra.size; if (sz) { extra = Object.assign({}, extra); delete extra.size; } return w.RV.btn({ label: label, kind: kind || undefined, size: sz, attrs: Object.assign({ 'data-x': act }, extra) }); };
  function fail(msg) { w.RV.toast(msg || 'That did not work.', 'error'); }

  var HOWTO = [
    ['Zendesk', 'In Zendesk, open Admin Center, then Reporting or the ticket view you want, and choose Export to CSV. <b>Zendesk\'s own CSV export does not include the message text or comments</b>, only details such as subject, customer, status, priority and dates. Tickets will import with those details.'],
    ['Freshdesk', 'In Freshdesk, open Tickets, then the Export option (Admin, Export). Choose the fields you want, including <b>Description</b> if offered, and download the CSV.'],
    ['Help Scout', 'In Help Scout, use Manage, Export, and download the conversations as CSV.'],
    ['Anything else', 'Any CSV works as long as it has a customer email column. You choose which column is which on the next step.']
  ];
  function start() {
    S = { step: 0, headers: [], rows: [], map: {}, source: 'other', dateOrder: 'dmy', fileName: '', preview: null, imports: [], stop: false, importId: null };
    frame('Import tickets from another help desk', '<div class="rv-skeleton" style="height:120px"></div>', btn('Close', '', 'close'));
    A().callAsync('getTicketImports').then(function (r) {
      if (!r || !r.success) { close(); fail((r && r.error) || 'Could not open the import.'); return; }
      S.imports = r.imports || []; S.limits = r.limits || { maxRows: 20000 }; drawStart();
    });
  }
  function drawStart() {
    var past = S.imports.length ? '<h3 class="rvx-h">Earlier imports</h3><div class="rvx-list">' + S.imports.map(function (x) {
      var st = x.status === 'removed' ? 'Removed' : x.status === 'running' ? 'Not finished' : 'Done';
      return '<div class="rvx-imp"><div><b>' + esc(x.fileName || 'File') + '</b><span class="rv-hint"> &middot; ' + esc(srcName(x.source)) + ' &middot; ' + esc(String(x.startedAt || '').slice(0, 10)) + ' &middot; ' + esc(st) + '</span><div class="rv-hint">' + (x.created || 0) + ' tickets imported' + (x.skipped ? ', ' + x.skipped + ' skipped' : '') + (x.duplicates ? ', ' + x.duplicates + ' already there' : '') + '</div></div>' +
        (x.status === 'removed' ? '' : btn('Remove', 'danger', 'undo', { 'data-id': x.id, 'data-n': x.created || 0, size: 'sm' })) + '</div>';
    }).join('') + '</div>' : '';
    frame('Import tickets from another help desk',
      '<p class="rvx-lead">Bring your old tickets into Resolvo so your team keeps the history. Imported tickets are <b>history only</b>: no emails are sent to customers, no alerts go off, no response-time clock starts, and nothing is assigned automatically. They are tagged <b>imported</b>.</p>' +
      '<h3 class="rvx-h">1. Export from your old help desk</h3>' + HOWTO.map(function (h) { return '<details class="rvx-how"><summary>' + esc(h[0]) + '</summary><p>' + h[1] + '</p></details>'; }).join('') +
      '<h3 class="rvx-h">2. Choose the file</h3><label class="rvx-drop"><input type="file" id="rvxFile" accept=".csv,text/csv,.txt"><span><b>Choose a CSV file</b><br><small>Up to ' + Math.round(MAX_BYTES / 1048576) + ' MB and ' + (S.limits.maxRows) + ' tickets per import</small></span></label>' + past,
      btn('Close', '', 'close'));
    ov.querySelector('#rvxFile').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) onFile(f); });
  }
  function srcName(s) { return ({ zendesk: 'Zendesk', freshdesk: 'Freshdesk', helpscout: 'Help Scout' })[s] || 'another help desk'; }

  function onFile(file) {
    if (file.size > MAX_BYTES) { fail('That file is larger than ' + Math.round(MAX_BYTES / 1048576) + ' MB. Split it into smaller files.'); return; }
    S.fileName = file.name;
    readFile(file, function (p) {
      if (!p || !p.rows.length) { fail('No rows found. Is it a CSV file with a header row?'); return; }
      if (p.rows.length > S.limits.maxRows) { fail('That file has ' + p.rows.length + ' rows. The limit is ' + S.limits.maxRows + ' per import. Split it into smaller files.'); return; }
      S.headers = p.headers; S.rows = p.rows;
      A().callAsync('detectTicketImport', S.headers).then(function (r) {
        if (!r || !r.success) { fail((r && r.error) || 'Could not read the columns.'); return; }
        S.source = r.source; S.map = r.map; drawMap();
      });
    });
  }

  function sel(field, value) {
    return '<select class="rv-select" data-map="' + field + '" aria-label="Column for ' + field + '"><option value="">(not in the file)</option>' +
      S.headers.map(function (h) { return '<option value="' + esc(h) + '"' + (h === value ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select>';
  }
  function drawMap() {
    var first = S.rows[0] || {};
    frame('Which column is which?',
      '<p class="rvx-lead">' + esc(S.fileName) + ': <b>' + S.rows.length + ' rows</b>. It looks like an export from <b>' + esc(srcName(S.source)) + '</b>. Check the columns below and change any that are wrong.</p>' +
      '<div class="rvx-src"><label class="rv-label" for="rvxSrc">Comes from</label><select class="rv-select" id="rvxSrc">' + [['zendesk', 'Zendesk'], ['freshdesk', 'Freshdesk'], ['helpscout', 'Help Scout'], ['other', 'Another help desk']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.source ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<label class="rv-label" for="rvxOrder">Dates like 03/04/2024 mean</label><select class="rv-select" id="rvxOrder"><option value="dmy"' + (S.dateOrder === 'dmy' ? ' selected' : '') + '>3 April (day first)</option><option value="mdy"' + (S.dateOrder === 'mdy' ? ' selected' : '') + '>March 4 (month first)</option></select></div>' +
      '<div class="rvx-grid" id="rvxGrid">' + FIELDS.map(function (f) {
        var col = S.map[f[0]] || '';
        return '<div class="rvx-row' + (f[2] ? ' is-req' : '') + '"><div><label class="rv-label">' + esc(f[1]) + (f[2] ? ' <b style="color:var(--rv-danger)">*</b>' : '') + '</label>' + (f[3] ? '<div class="rv-hint">' + esc(f[3]) + '</div>' : '') + '</div>' + sel(f[0], col) + '<div class="rvx-ex" data-ex="' + f[0] + '">' + esc(col ? String(first[col] || '').slice(0, 60) : '') + '</div></div>';
      }).join('') + '</div><p class="rv-hint">Dates without a time zone are read as India time (IST).</p>',
      btn('Back', '', 'back') + btn('Check my file', 'primary', 'preview'));
    ov.querySelector('#rvxSrc').onchange = function (e) { S.source = e.target.value; };
    ov.querySelector('#rvxOrder').onchange = function (e) { S.dateOrder = e.target.value; };
    ov.querySelector('#rvxGrid').addEventListener('change', function (e) {
      var f = e.target.getAttribute('data-map'); if (!f) return; S.map[f] = e.target.value;
      var ex = ov.querySelector('[data-ex="' + f + '"]'); if (ex) ex.textContent = S.map[f] ? String((S.rows[0] || {})[S.map[f]] || '').slice(0, 60) : '';
    });
  }

  function payloadRows(rows) {   // only the columns that are used
    var cols = {}; Object.keys(S.map).forEach(function (k) { if (S.map[k]) cols[S.map[k]] = 1; });
    return rows.map(function (r) { var o = {}; Object.keys(cols).forEach(function (c) { o[c] = r[c]; }); return o; });
  }
  function preview() {
    if (!S.map.email) { fail('Choose the column that holds the customer email.'); return; }
    var b = ov.querySelector('[data-x=preview]'); if (b) { b.disabled = true; b.classList.add('is-loading'); }
    A().callAsync('previewTicketImport', payloadRows(S.rows.slice(0, 300)), S.map, { source: S.source, dateOrder: S.dateOrder }).then(function (r) {
      if (!r || !r.success) { if (b) { b.disabled = false; b.classList.remove('is-loading'); } fail((r && r.error) || 'Could not check the file.'); return; }
      S.preview = r; drawPreview();
    });
  }
  function drawPreview() {
    var p = S.preview, scale = S.rows.length / Math.max(1, p.sampled), est = function (n) { return p.sampled >= S.rows.length ? n : '~' + Math.round(n * scale); };
    var warn = [], skipTxt = Object.keys(p.skipped || {}).map(function (k) { return p.skipped[k] + ' ' + k; }).join(', ');
    if (skipTxt) warn.push('Skipped in the rows checked: ' + skipTxt + '.');
    Object.keys(p.unknownStatus || {}).forEach(function (k) { warn.push('Status "' + k + '" is not known, so those tickets import as Open (' + p.unknownStatus[k] + ' in the rows checked).'); });
    if (p.noDate) warn.push(p.noDate + ' of the rows checked have no readable created date, so they get today\'s date. Check the date column and the day/month setting.');
    if (!S.map.body) warn.push('This file has no message text column, so every ticket imports with its details only (subject, customer, status, dates). The Zendesk CSV export never includes messages.');
    else if (p.noBody) warn.push(p.noBody + ' of the rows checked have no message text. Those tickets import with their details only.');
    if (p.duplicates) warn.push(p.duplicates + ' of the rows checked were already imported and will be skipped.');
    frame('Check before importing',
      '<div class="rvx-stats"><div><b>' + S.rows.length + '</b><span>rows in the file</span></div><div><b>' + est(p.ok) + '</b><span>tickets ready to import</span></div></div>' +
      (warn.length ? '<div class="rvx-warn">' + warn.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>' : '') +
      '<h3 class="rvx-h">First rows, as Resolvo will see them</h3><div class="rvx-tablewrap"><table class="rvx-table"><thead><tr><th>Subject</th><th>Customer</th><th>Status</th><th>Priority</th><th>Created</th></tr></thead><tbody>' +
      (p.sample.length ? p.sample.map(function (s) { return '<tr><td>' + esc(s.subject) + (s.body ? '<div class="rv-hint">' + esc(s.body) + '</div>' : '') + '</td><td>' + esc(s.name) + '<div class="rv-hint">' + esc(s.email) + '</div></td><td>' + esc(s.status) + '</td><td>' + esc(s.priority) + '</td><td>' + esc(s.created || 'today') + '</td></tr>'; }).join('') : '<tr><td colspan="5">Nothing in the first rows can be imported. Check the email column.</td></tr>') + '</tbody></table></div>' +
      '<p class="rv-hint">Nothing has been saved yet. Imported tickets keep their original status. Open ones appear in your inbox as unassigned history; no emails or alerts are sent.</p>',
      btn('Back', '', 'map') + btn(p.ok ? 'Import ' + est(p.ok) + ' tickets' : 'Nothing to import', 'primary', 'run', p.ok ? {} : { disabled: 'disabled' }));
  }

  function run() {
    S.stop = false;
    frame('Importing...', '<p class="rvx-lead" id="rvxMsg">Starting...</p>' + w.RV.progress(0).replace('class="rv-progress"', 'class="rv-progress" id="rvxProg"'), btn('Stop after this step', '', 'stop'));
    A().callAsync('startTicketImport', { total: S.rows.length, source: S.source, fileName: S.fileName }).then(function (r) {
      if (!r || !r.success) { fail((r && r.error) || 'The import could not start.'); drawPreview(); return; }
      S.importId = r.importId; S.tot = { created: 0, skipped: 0, duplicates: 0 }; next(0);
    });
  }
  function next(i) {
    var msg = ov && ov.querySelector('#rvxMsg'), bar = ov && ov.querySelector('#rvxProg span');
    if (!ov || !ov.isConnected) { A().callAsync('finishTicketImport', S.importId); return; }   // the window was closed: what was imported stays and can be removed later
    if (S.stop || i >= S.rows.length) { return finish(S.stop && i < S.rows.length); }
    var chunk = payloadRows(S.rows.slice(i, i + BATCH));
    A().callAsync('importTicketBatch', S.importId, chunk, S.map, { dateOrder: S.dateOrder }).then(function (r) {
      if (!r || !r.success) { fail((r && r.error) || 'A step failed. The import was stopped; what was imported so far can be removed.'); return finish(true); }
      S.tot.created += r.created; S.tot.skipped += r.skipped; S.tot.duplicates += r.duplicates;
      var done = Math.min(S.rows.length, i + BATCH); msg = ov && ov.querySelector('#rvxMsg'); bar = ov && ov.querySelector('#rvxProg span');
      if (msg) msg.textContent = done + ' of ' + S.rows.length + ' rows done (' + S.tot.created + ' tickets created)'; if (bar) bar.style.width = Math.round(done / S.rows.length * 100) + '%';
      next(i + BATCH);
    });
  }
  function finish(stopped) {
    A().callAsync('finishTicketImport', S.importId).then(function (r) {
      var e = (r && r.import) || {}, t = S.tot || {};
      frame(stopped ? 'Import stopped' : 'Import finished',
        '<div class="rvx-stats"><div><b>' + (e.created != null ? e.created : t.created) + '</b><span>tickets imported</span></div><div><b>' + (e.skipped != null ? e.skipped : t.skipped) + '</b><span>rows skipped</span></div><div><b>' + (e.duplicates != null ? e.duplicates : t.duplicates) + '</b><span>already there</span></div></div>' +
        (stopped ? '<div class="rvx-warn">The import was stopped part-way. What was imported so far is kept. You can remove it below, or run the same file again: tickets already imported are skipped.</div>' : '') +
        (e.unmatchedAgents ? '<p class="rv-hint">' + e.unmatchedAgents + ' tickets named an agent who is not on your team. The name is kept on the ticket but nobody is assigned.</p>' : '') +
        '<p class="rvx-lead">They are tagged <b>imported</b>. Open ones appear in your inbox with no owner. No emails, alerts or response-time clocks were started.</p>',
        btn('Remove this import', 'danger', 'undo', { 'data-id': S.importId, 'data-n': e.created != null ? e.created : t.created }) + btn('See imported tickets', 'primary', 'see'));
    });
  }
  function undo(id, n) {
    var m = w.RV.modal({ title: 'Remove this import?', body: '<p style="margin:0">This deletes the <b>' + n + '</b> tickets this import created. Tickets your team has already replied to or added notes on are kept. This cannot be undone.</p>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Remove', kind: 'danger', attrs: { id: 'rvxUndoOk' } }) });
    m.querySelector('#rvxUndoOk').addEventListener('click', function () {
      A().callAsync('undoTicketImport', id).then(function (r) {
        w.RV.closeModal(m);
        if (!r || !r.success) { fail((r && r.error) || 'Nothing was removed.'); return; }
        w.RV.toast('Removed ' + r.removed + ' imported tickets' + (r.kept ? '. Kept ' + r.kept + ' that your team had worked on.' : ''), 'success');
        close(); if (w.RVI && document.getElementById('rvi')) w.RVI.refresh();
      });
    });
  }
  function see() { var a = A(); close(); try { if (a.resetTicketFilters) a.resetTicketFilters(); } catch (e) {} a._ticketTag = 'imported'; a._ticketFilter = 'all'; a._ticketChannel = 'all'; a._ticketPriority = 'all'; a._ticketSearch = ''; a._ticketAssignee = 'all'; a._ticketPromo = ''; a.navigate('ticket-inbox'); setTimeout(function () { if (w.RVI && document.getElementById('rvi')) w.RVI.refresh(); }, 300); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-x]'); if (!el || !ov || !ov.contains(el)) return;
    var x = el.getAttribute('data-x');
    if (x === 'close') close(); else if (x === 'back') drawStart(); else if (x === 'map') drawMap(); else if (x === 'preview') preview(); else if (x === 'run') run();
    else if (x === 'stop') { S.stop = true; el.disabled = true; el.textContent = 'Stopping...'; } else if (x === 'see') see();
    else if (x === 'undo') undo(el.getAttribute('data-id'), el.getAttribute('data-n'));
  });

  RVImport.open = function () { if (ov && ov.isConnected) close(); ov = null; start(); };
  w.RVImport = RVImport;
})(window);
