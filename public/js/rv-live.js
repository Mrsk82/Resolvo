/* Resolvo: Live team (RVL), a screen for supervisors (Admin and Manager) while the Inbox 2.0 pilot is on.
   Who is waiting, who is busy and what needs a hand right now. It asks the server (getLiveBoard) every 15 seconds while the page is open and
   the tab is visible; it stops by itself when you leave the page. Moving tickets (liveBoardAssign) and nudges (nudgeAgent) use the normal rules. */
(function (w) {
  'use strict';
  var RVL = { poll: 15000 };
  var A = function () { return App; };   // App is a script-level constant (not on window)
  var esc = function (s) { return w.RV.esc(s); };
  var S = { data: null, hist: null, paused: false, timer: null, tick: null, at: 0, loading: false, histAt: 0 };

  function ago(ms) { var s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 5 ? 'just now' : s < 90 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; }
  function mins(m) { return m == null ? '' : m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : Math.floor(m / 1440) + ' days'; }
  var ST = { available: ['Available', 'var(--rv-success, #0a7d4b)'], busy: ['Busy', 'var(--rv-warning, #b7791f)'], away: ['Away', 'var(--rv-danger, #b42318)'] };

  // ---------- the page ----------
  RVL.render = async function () {
    var a = A(); a.setPage('Live team', 'Inbox / Live team');
    var area = document.getElementById('contentArea'); var fab = document.getElementById('quickCaptureFab'); if (fab) fab.style.display = 'none';
    stop(); S.data = null; S.hist = null; S.paused = false;
    area.innerHTML = '<div class="rv rvl" id="rvlRoot"><div class="rv-card">' + w.RV.skeleton(6) + '</div></div>';
    await load(true); start();
  };
  function frame() {
    var root = document.getElementById('rvlRoot'); if (!root) return null;
    if (!document.getElementById('rvlTiles')) {
      var admin = (A().currentUser || {}).role === 'Admin';
      root.innerHTML = '<header class="rvl-head"><div><p class="rv-hint">Who is waiting, who is busy and what needs a hand right now. <span id="rvlUpdated">Updating...</span></p></div>' +
        '<div class="rvl-head__acts"><button type="button" class="rv-btn rv-btn--sm" id="rvlPause">Pause</button>' + (admin ? '<button type="button" class="rv-btn rv-btn--sm" id="rvlSettings">Alert limits</button>' : '') + '</div></header>' +
        '<div id="rvlAlerts"></div><div class="rvl-tiles" id="rvlTiles"></div>' +
        '<section><h2 class="rvl-h">Your team</h2><div class="rvl-agents" id="rvlAgents"></div></section>' +
        '<section><h2 class="rvl-h">Needs a hand</h2><div id="rvlHot"></div></section>' +
        '<section><h2 class="rvl-h">Last 24 hours and 7 days</h2><div id="rvlHist"><div class="rv-hint">Loading history...</div></div></section>';
      root.querySelector('#rvlPause').addEventListener('click', togglePause);
      var st = root.querySelector('#rvlSettings'); if (st) st.addEventListener('click', settings);
      root.addEventListener('click', onClick); root.addEventListener('change', onChange);
    }
    return root;
  }
  async function load(first) {
    if (S.loading) return; S.loading = true;
    var r; try { r = await A().callAsync('getLiveBoard'); } finally { S.loading = false; }
    var root = document.getElementById('rvlRoot'); if (!root) return;
    if (!r || !r.success) {
      if (first || !S.data) { root.innerHTML = '<div class="rv-card">' + w.RV.empty({ icon: 'sparkle', title: r && r.off ? 'Live team is not switched on' : 'Live team could not load', text: (r && r.error) || 'Reload the page to try again.' }) + '</div>'; }
      else { var u = document.getElementById('rvlUpdated'); if (u) u.textContent = 'Could not refresh. Showing the last numbers.'; }
      return;
    }
    S.data = r; S.at = Date.now(); frame(); draw();
    if (!S.hist || Date.now() - S.histAt > 60000) loadHist();
  }
  async function loadHist() { S.histAt = Date.now(); var r = await A().callAsync('getLiveHistory'); if (r && r.success) { S.hist = r; drawHist(); } }

  // ---------- drawing ----------
  function tile(label, value, sub, kind) { return '<div class="rvl-tile' + (kind ? ' rvl-tile--' + kind : '') + '"><b>' + value + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function draw() {
    var d = S.data, t = d.tiles, cfg = d.cfg;
    document.getElementById('rvlAlerts').innerHTML = (d.alerts || []).map(function (a) { return '<div class="rvl-alert rvl-alert--' + a.level + '" role="alert">' + w.RV.icon('alert', 16) + '<span>' + esc(a.text) + '</span></div>'; }).join('');
    var diff = t.arrivals.last60 - t.arrivals.prev60, trend = t.arrivals.prev60 === 0 && t.arrivals.last60 === 0 ? 'same hour yesterday: 0' : (diff === 0 ? 'same as this hour yesterday' : (diff > 0 ? '&#9650; ' + diff + ' more' : '&#9660; ' + (-diff) + ' fewer') + ' than this hour yesterday');
    document.getElementById('rvlTiles').innerHTML =
      tile('waiting for a first reply', t.waitingFirst, t.waitingNow ? t.waitingNow + ' waiting for any reply' : 'nobody is waiting', t.waitingFirst > 0 ? 'warn' : '') +
      tile('longest wait', t.longest ? mins(t.longest.min) : 'none', t.longest ? '<button type="button" class="rvl-link" data-open="' + esc(t.longest.id) + '">' + esc(t.longest.subject) + '</button>' : 'no one is waiting', t.longest && t.longest.min >= cfg.waitMin ? 'bad' : '') +
      tile('past SLA', t.slaBreached, t.slaRisk + ' close to SLA', t.slaBreached > 0 ? 'bad' : t.slaRisk > 0 ? 'warn' : '') +
      tile('no owner', t.unassigned, 'limit ' + cfg.queueDepth, t.unassigned >= cfg.queueDepth ? 'bad' : t.unassigned > 0 ? 'warn' : '') +
      tile('new in the last hour', t.arrivals.last60, trend) +
      tile('available', t.available.n + ' of ' + t.available.total, 'agents who can take tickets', t.available.n === 0 && t.waitingNow > 0 ? 'bad' : '');
    document.getElementById('rvlAgents').innerHTML = d.agents.length ? d.agents.map(agentCard).join('') : '<div class="rv-hint">No agents yet. Invite your team in Settings.</div>';
    document.getElementById('rvlHot').innerHTML = hotList(d);
  }
  function agentCard(a) {
    var st = ST[a.status] || ST.available, flags = [];
    if (a.awayWithTickets) flags.push('<span class="rv-badge rv-badge--danger">Away with ' + a.open + ' open</span>');
    if (a.overloaded) flags.push('<span class="rv-badge rv-badge--warning">At their limit</span>');
    if (a.quiet) flags.push('<span class="rv-badge rv-badge--warning">Quiet for ' + mins(a.lastActiveMin) + '</span>');
    var bar = '<div class="rvl-bar' + (a.pct >= 100 ? ' is-full' : a.pct >= 70 ? ' is-high' : '') + '" role="progressbar" aria-valuenow="' + Math.min(100, a.pct) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(a.name) + ' workload"><span style="width:' + Math.min(100, a.pct) + '%"></span></div>';
    return '<article class="rvl-agent" data-agent="' + esc(a.email) + '"><header>' + w.RV.avatar(a.name, null) + '<div class="rvl-agent__who"><b>' + esc(a.name) + '</b><span class="rv-hint">' + esc(a.role) + '</span></div>' +
      '<span class="rvl-status" style="color:' + st[1] + '"><i style="background:' + st[1] + '"></i>' + st[0] + '</span></header>' + bar +
      '<dl><div><dt>Open</dt><dd>' + a.open + ' of ' + a.max + '</dd></div><div><dt>Waiting on them</dt><dd>' + a.waiting + '</dd></div>' +
      '<div><dt>Longest wait</dt><dd>' + (a.oldest ? '<button type="button" class="rvl-link" data-open="' + esc(a.oldest.id) + '" title="' + esc(a.oldest.subject) + '">' + mins(a.oldest.min) + '</button>' : '&ndash;') + '</dd></div>' +
      '<div><dt>Last active</dt><dd>' + (a.lastActiveMin == null ? 'no activity in 2 days' : a.lastActiveMin < 2 ? 'just now' : mins(a.lastActiveMin) + ' ago') + '</dd></div></dl>' +
      (a.viewing ? '<div class="rvl-view">Looking at: <button type="button" class="rvl-link" data-open="' + esc(a.viewing.id) + '">' + esc(a.viewing.subject || a.viewing.id) + '</button></div>' : '') +
      (flags.length ? '<div class="rvl-flags">' + flags.join('') + '</div>' : '') +
      '<footer><button type="button" class="rv-btn rv-btn--sm" data-tickets="' + esc(a.email) + '">Their tickets</button><button type="button" class="rv-btn rv-btn--sm" data-nudge="' + esc(a.email) + '" data-name="' + esc(a.name) + '">Nudge</button></footer></article>';
  }
  function hotList(d) {
    if (!d.hot.length) return '<div class="rvl-calm">Nothing needs a hand right now.</div>';
    var opts = d.agents.map(function (a) { return '<option value="' + esc(a.email) + '">' + esc(a.name) + (a.status !== 'available' ? ' (' + (ST[a.status] || ST.available)[0].toLowerCase() + ')' : '') + '</option>'; }).join('');
    return '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Why</th><th>Ticket</th><th>Waiting</th><th>Owner</th><th>Give to</th></tr></thead><tbody>' + d.hot.map(function (h) {
      var own = h.assignedTo ? ((d.agents.filter(function (a) { return a.email.toLowerCase() === h.assignedTo.toLowerCase(); })[0] || {}).name || h.assignedTo) : '<span class="rv-badge rv-badge--danger">No owner</span>';
      return '<tr><td>' + h.reasons.filter(function (r) { return r !== 'No owner'; }).map(function (r) { return '<span class="rv-badge rv-badge--' + (/SLA/.test(r) && /Past/.test(r) ? 'danger' : /Unhappy|Close|Waiting/.test(r) ? 'warning' : 'accent') + '">' + esc(r) + '</span>'; }).join(' ') + '</td>' +
        '<td><button type="button" class="rvl-link" data-open="' + esc(h.id) + '"><b>' + esc(h.subject) + '</b></button><div class="rv-hint">' + esc(h.from || '') + '</div></td><td>' + (h.waitMin != null ? mins(h.waitMin) : '&ndash;') + '</td><td>' + own + '</td>' +
        '<td><select class="rv-select rvl-give" data-give="' + esc(h.id) + '" aria-label="Give ' + esc(h.subject) + ' to"><option value="">Choose...</option>' + opts + '</select></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  // history: hourly bars (new tickets and team replies) and a 7-day table
  function drawHist() {
    var h = S.hist, box = document.getElementById('rvlHist'); if (!box || !h) return;
    var max = Math.max(1, Math.max.apply(null, h.hours.map(function (x) { return Math.max(x.created, x.replies || 0); }))), W = 720, H = 140, bw = W / h.hours.length;
    var bars = h.hours.map(function (x, i) {
      var c = Math.round(x.created / max * (H - 24)), r = Math.round((x.replies || 0) / max * (H - 24));
      return '<g><rect x="' + (i * bw + 3) + '" y="' + (H - 18 - c) + '" width="' + (bw / 2 - 3) + '" height="' + c + '" fill="var(--rv-accent, #10B981)"><title>' + x.label + ':00  new ' + x.created + '</title></rect>' +
        '<rect x="' + (i * bw + bw / 2) + '" y="' + (H - 18 - r) + '" width="' + (bw / 2 - 3) + '" height="' + r + '" fill="var(--rv-text-faint, #9ca3af)"><title>' + x.label + ':00  replies ' + (x.replies || 0) + '</title></rect>' +
        (i % 3 === 0 ? '<text x="' + (i * bw + bw / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="10" fill="var(--rv-text-faint, #6b7280)">' + x.label + '</text>' : '') + '</g>';
    }).join('');
    var rows = h.days.map(function (d) { return '<tr><td>' + esc(d.label) + '</td><td>' + d.created + '</td><td>' + d.resolved + '</td><td>' + (d.avgFirstReplyMin == null ? '&ndash;' : mins(d.avgFirstReplyMin)) + '</td></tr>'; }).join('');
    box.innerHTML = '<div class="rvl-hist"><div><div class="rvl-legend"><span><i style="background:var(--rv-accent,#10B981)"></i>New tickets</span><span><i style="background:var(--rv-text-faint,#9ca3af)"></i>Team replies</span><span class="rv-hint">by hour, India time</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="New tickets and team replies for each of the last 24 hours" class="rvl-chart">' + bars + '</svg>' +
      '<p class="rv-hint">' + (h.busiestHour == null ? 'Not enough tickets yet to show the busiest hour.' : 'Busiest hour in the last 7 days: <b>' + h.busiestHour + ':00</b> (' + h.busiestHourCount + ' new tickets).') + '</p></div>' +
      '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Day</th><th>New</th><th>Solved</th><th>First reply (avg)</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  // ---------- actions ----------
  function onClick(e) {
    var el = e.target.closest('[data-open],[data-tickets],[data-nudge]'); if (!el) return;
    var a = A();
    if (el.hasAttribute('data-open')) { var id = el.getAttribute('data-open'); a.navigate('ticket-inbox'); setTimeout(function () { if (w.RVI && w.RVI.open) w.RVI.open(id); }, 700); return; }
    if (el.hasAttribute('data-tickets')) { a._ticketAssignee = el.getAttribute('data-tickets'); a._ticketFilter = 'all'; a._ticketChannel = 'all'; a._ticketPriority = 'all'; a._ticketSearch = ''; a._ticketTag = ''; a._ticketTeam = ''; a._ticketSla = ''; a._ticketActive = false; a._ticketPromo = ''; a.navigate('ticket-inbox'); return; }
    if (el.hasAttribute('data-nudge')) nudge(el.getAttribute('data-nudge'), el.getAttribute('data-name'));
  }
  async function onChange(e) {
    var sel = e.target.closest('[data-give]'); if (!sel || !sel.value) return;
    var id = sel.getAttribute('data-give'), who = sel.value; sel.disabled = true;
    var r = await A().callAsync('liveBoardAssign', [id], who);
    sel.disabled = false;
    if (!r || !r.success || !r.assigned) { sel.value = ''; w.RV.toast((r && r.error) || 'That ticket could not be moved.', 'error'); return; }
    w.RV.toast('Given to ' + (sel.options[sel.selectedIndex].text.split(' (')[0]), 'success'); load();
  }
  var PRESETS = ['Please pick up your oldest waiting ticket.', 'A customer is waiting, can you reply now?', 'Can you check the queue and take some tickets?'];
  function nudge(email, name) {
    var ov = w.RV.modal({ title: 'Nudge ' + name, body: '<p class="rv-hint" style="margin-top:0">They get a phone alert (if they switched alerts on) and a note in their bell.</p><div class="rvl-presets">' + PRESETS.map(function (p, i) { return '<button type="button" class="rv-btn rv-btn--sm" data-preset="' + i + '">' + esc(p) + '</button>'; }).join('') + '</div><label class="rv-label" for="rvlMsg">Message</label><textarea class="rv-textarea" id="rvlMsg" maxlength="200" rows="3" placeholder="Write a short message"></textarea>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Send nudge', kind: 'primary', attrs: { id: 'rvlSend' } }) });
    ov.querySelectorAll('[data-preset]').forEach(function (b) { b.addEventListener('click', function () { ov.querySelector('#rvlMsg').value = PRESETS[+b.getAttribute('data-preset')]; }); });
    ov.querySelector('#rvlSend').addEventListener('click', async function () {
      var msg = ov.querySelector('#rvlMsg').value.trim(); if (!msg) { w.RV.toast('Write a short message first.', 'error'); return; }
      var r = await A().callAsync('nudgeAgent', email, '', msg); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Nothing was sent.', 'error'); return; }
      w.RV.closeModal(ov); w.RV.toast('Nudge sent to ' + name, 'success');
    });
  }
  async function settings() {
    var r = await A().callAsync('getLiveBoardConfig'); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not open the alert limits.', 'error'); return; }
    var c = r.config, num = function (id, label, v, hint) { return '<div class="rvl-field"><label class="rv-label" for="' + id + '">' + label + '</label><input class="rv-input" type="number" min="1" id="' + id + '" value="' + v + '"><span class="rv-hint">' + hint + '</span></div>'; };
    var chk = function (id, label, v) { return '<label class="rvl-check"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + label + '</label>'; };
    var ov = w.RV.modal({ title: 'Alert limits', body: '<p class="rv-hint" style="margin-top:0">Admins and Managers are alerted when a limit is crossed. The same alert is not repeated for 30 minutes.</p>' + chk('rvlOn', 'Send alerts', c.alertsOn) +
        num('rvlWait', 'A customer has waited more than (minutes)', c.waitMin, 'Used by the next limit and the "Needs a hand" list.') + num('rvlCount', 'Alert when this many customers are waiting that long', c.waitingCount, 'For example 10.') +
        num('rvlQueue', 'Alert when this many tickets have no owner', c.queueDepth, 'For example 20.') + chk('rvlNone', 'Alert when nobody is available and customers are waiting', c.noneAvailable) +
        '<h3 class="rvl-h" style="margin-top:14px">How to alert</h3>' + chk('rvlPush', 'Phone and browser alert', c.notifyPush) + chk('rvlMail', 'Email', c.notifyEmail) +
        '<div style="margin-top:10px"><button type="button" class="rv-btn rv-btn--sm" id="rvlTest">Send myself a test alert</button> <span class="rv-hint" id="rvlTestMsg"></span></div>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Save', kind: 'primary', attrs: { id: 'rvlSave' } }) });
    ov.querySelector('#rvlTest').addEventListener('click', async function () { var t = await A().callAsync('testLiveAlert'); ov.querySelector('#rvlTestMsg').textContent = !t || !t.success ? 'Could not send.' : t.sent ? 'Sent to ' + t.sent + ' device' + (t.sent === 1 ? '' : 's') + '.' : 'No device is set up for alerts yet. Turn alerts on from your phone or browser first.'; });
    ov.querySelector('#rvlSave').addEventListener('click', async function () {
      var g = function (id) { return ov.querySelector('#' + id); };
      var res = await A().callAsync('saveLiveBoardConfig', { alertsOn: g('rvlOn').checked, waitMin: g('rvlWait').value, waitingCount: g('rvlCount').value, queueDepth: g('rvlQueue').value, noneAvailable: g('rvlNone').checked, notifyPush: g('rvlPush').checked, notifyEmail: g('rvlMail').checked });
      if (!res || !res.success) { w.RV.toast((res && res.error) || 'Not saved.', 'error'); return; }
      w.RV.closeModal(ov); w.RV.toast('Alert limits saved', 'success'); load();
    });
  }

  // ---------- refreshing ----------
  function togglePause() { S.paused = !S.paused; var b = document.getElementById('rvlPause'); if (b) b.textContent = S.paused ? 'Resume' : 'Pause'; if (!S.paused) load(); showUpdated(); }
  function showUpdated() { var u = document.getElementById('rvlUpdated'); if (!u || !S.at) return; u.textContent = S.paused ? 'Paused. Last updated ' + ago(S.at) + '.' : 'Updated ' + ago(S.at) + ', refreshes every ' + Math.round(RVL.poll / 1000) + ' s.'; }
  function start() {
    stop();
    S.timer = setInterval(function () { if (!document.getElementById('rvlRoot')) { stop(); return; } if (document.hidden || S.paused) return; load(); }, RVL.poll);
    S.tick = setInterval(function () { if (!document.getElementById('rvlRoot')) { stop(); return; } showUpdated(); }, 1000);
  }
  function stop() { if (S.timer) clearInterval(S.timer); if (S.tick) clearInterval(S.tick); S.timer = S.tick = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && document.getElementById('rvlRoot') && !S.paused) load(); });
  RVL.stop = stop; RVL._state = S;   // exposed so the screen test can look at the timers
  w.RVL = RVL;
})(window);
