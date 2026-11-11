/* Resolvo: Live team (RVL), for supervisors (Admin and Manager) while the Inbox 2.0 pilot is on, plus "My day" (RVL.renderMyDay) for every agent.
   Tabs: Board, Incidents, SLA countdown, Channels, Activity, Forecast. The page asks the server every 15 seconds while it is open and the tab is visible,
   and stops by itself when you leave. Moving tickets, nudges, incident messages and auto-balance use the normal rules (see server.js, "Live team"). */
(function (w) {
  'use strict';
  var RVL = { poll: 15000 };
  var A = function () { return App; };   // App is a script-level constant (not on window)
  var esc = function (s) { return w.RV.esc(s); };
  var S = { tab: 'board', data: null, hist: null, paused: false, timer: null, tick: null, at: 0, loading: false, histAt: 0, team: '', inc: null, sla: null, ch: null, feed: { events: [], since: null, ids: {} }, fc: null, fcAt: 0, seen: null, audio: null };
  var TABS = [['board', 'Board'], ['incidents', 'Incidents'], ['sla', 'SLA countdown'], ['channels', 'Channels'], ['feed', 'Activity'], ['forecast', 'Forecast']];
  var ST = { available: ['Available', 'var(--rv-success, #0a7d4b)'], busy: ['Busy', 'var(--rv-warning, #b7791f)'], away: ['Away', 'var(--rv-danger, #b42318)'] };

  function ago(ms) { var s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 5 ? 'just now' : s < 90 ? s + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; }
  function mins(m) { return m == null ? '' : m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : Math.floor(m / 1440) + ' days'; }
  // a live countdown to (or past) a deadline
  function cd(deadlineMs) { var ms = deadlineMs - Date.now(), late = ms < 0, s = Math.abs(Math.round(ms / 1000)), t = s < 120 ? s + ' s' : s < 7200 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + (Math.round(s / 60) % 60) + ' min'; return late ? t + ' late' : 'in ' + t; }
  function cdClass(deadlineMs) { var m = (deadlineMs - Date.now()) / 60000; return m < 0 ? 'is-late' : m <= 30 ? 'is-soon' : ''; }
  function root() { return document.getElementById('rvlRoot'); }

  // ================= the page =================
  RVL.render = async function () {
    var a = A(); a.setPage('Live team', 'Inbox / Live team');
    var area = document.getElementById('contentArea'); var fab = document.getElementById('quickCaptureFab'); if (fab) fab.style.display = 'none';
    stop(); dayStop(); S.data = S.hist = S.inc = S.sla = S.ch = S.fc = null; S.feed = { events: [], since: null, ids: {} }; S.paused = false; S.seen = null; S.team = '';
    try { S.tab = sessionStorage.getItem('rvl_tab') || 'board'; } catch (e) { S.tab = 'board'; } if (!TABS.some(function (t) { return t[0] === S.tab; })) S.tab = 'board';
    area.innerHTML = '<div class="rv rvl" id="rvlRoot"><div class="rv-card">' + w.RV.skeleton(6) + '</div></div>';
    await load(true); start();
  };
  function frame() {
    var r = root(); if (!r) return null;
    if (!document.getElementById('rvlTabs')) {
      var admin = (A().currentUser || {}).role === 'Admin', soundOn = lsGet('rvl_sound') === '1', notif = 'Notification' in w ? Notification.permission : 'denied';
      r.innerHTML = '<header class="rvl-head"><div><p class="rv-hint">Who is waiting, who is busy and what needs a hand right now. <span id="rvlUpdated">Updating...</span></p></div>' +
        '<div class="rvl-head__acts"><button type="button" class="rv-btn rv-btn--sm" id="rvlSound" aria-pressed="' + soundOn + '" title="A short beep when a new alert appears">Sound: ' + (soundOn ? 'on' : 'off') + '</button>' +
        ('Notification' in w ? '<button type="button" class="rv-btn rv-btn--sm" id="rvlDesk" title="A pop-up when an alert appears and this tab is in the background">Desktop alerts: ' + (notif === 'granted' ? 'on' : notif === 'denied' ? 'blocked' : 'off') + '</button>' : '') +
        '<button type="button" class="rv-btn rv-btn--sm" id="rvlPause">Pause</button>' + (admin ? '<button type="button" class="rv-btn rv-btn--sm" id="rvlWall">Wallboard</button><button type="button" class="rv-btn rv-btn--sm" id="rvlSettings">Alert limits</button>' : '') + '</div></header>' +
        '<div id="rvlAlerts"></div><nav class="rvl-tabs" id="rvlTabs" role="tablist" aria-label="Live team pages">' + TABS.map(function (t) { return '<button type="button" role="tab" class="rvl-tab" data-tab="' + t[0] + '" id="rvlTab_' + t[0] + '">' + t[1] + '<i class="rvl-badge" hidden></i></button>'; }).join('') + '</nav><div id="rvlBody"></div>';
      r.addEventListener('click', onClick); r.addEventListener('change', onChange);
      r.querySelector('#rvlPause').addEventListener('click', togglePause); r.querySelector('#rvlSound').addEventListener('click', toggleSound);
      var d = r.querySelector('#rvlDesk'); if (d) d.addEventListener('click', askDesktop);
      var st = r.querySelector('#rvlSettings'); if (st) st.addEventListener('click', settings); var wl = r.querySelector('#rvlWall'); if (wl) wl.addEventListener('click', wall);
      showTab(S.tab, true);
    }
    return r;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function showTab(t, first) {
    S.tab = t; try { sessionStorage.setItem('rvl_tab', t); } catch (e) {}
    document.querySelectorAll('.rvl-tab').forEach(function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', String(on)); b.classList.toggle('is-on', on); });
    var body = document.getElementById('rvlBody'); if (!body) return;
    if (t === 'board') {
      body.innerHTML = '<div class="rvl-toolbar" id="rvlToolbar"></div><div class="rvl-tiles" id="rvlTiles"></div><div id="rvlBuckets"></div>' +
        '<section><h2 class="rvl-h">Your team</h2><div class="rvl-agents" id="rvlAgents"></div></section><section><h2 class="rvl-h">Needs a hand</h2><div id="rvlHot"></div></section>' +
        '<section><h2 class="rvl-h">Last 24 hours and 7 days</h2><div id="rvlHist"><div class="rv-hint">Loading history...</div></div></section>';
      if (S.data) draw(); if (S.hist) drawHist(); else loadHist();
    } else {
      body.innerHTML = '<div id="rvlTabBody"><div class="rv-card">' + w.RV.skeleton(4) + '</div></div>';
      if (t === 'incidents') loadInc(); else if (t === 'sla') loadSla(); else if (t === 'channels') loadCh(); else if (t === 'feed') loadFeed(true); else if (t === 'forecast') loadFc();
    }
  }

  // ================= loading =================
  async function load(first) {
    if (S.loading) return; S.loading = true;
    var r; try { r = await A().callAsync('getLiveBoard', S.team); } finally { S.loading = false; }
    var rt = root(); if (!rt) return;
    if (!r || !r.success) {
      if (first || !S.data) { rt.innerHTML = '<div class="rv-card">' + w.RV.empty({ icon: 'sparkle', title: r && r.off ? 'Live team is not switched on' : 'Live team could not load', text: (r && r.error) || 'Reload the page to try again.' }) + '</div>'; }
      else { var u = document.getElementById('rvlUpdated'); if (u) u.textContent = 'Could not refresh. Showing the last numbers.'; }
      return;
    }
    S.data = r; S.at = Date.now(); frame(); drawAlerts(); badges(); if (S.tab === 'board') draw(); watchAlerts();
    if (S.tab === 'board' && (!S.hist || Date.now() - S.histAt > 60000)) loadHist();
  }
  async function loadHist() { S.histAt = Date.now(); var r = await A().callAsync('getLiveHistory'); if (r && r.success) { S.hist = r; if (S.tab === 'board') drawHist(); } }
  async function loadInc() { var r = await A().callAsync('getLiveIncidents'); if (r && r.success) { S.inc = r; if (S.tab === 'incidents') drawInc(); } }
  async function loadSla() { var r = await A().callAsync('getLiveSla'); if (r && r.success) { S.sla = r; if (S.tab === 'sla') drawSla(); } }
  async function loadCh() { var r = await A().callAsync('getLiveChannels'); if (r && r.success) { S.ch = r; if (S.tab === 'channels') drawCh(); } }
  async function loadFc() { var r = await A().callAsync('getLiveForecast'); S.fcAt = Date.now(); if (r && r.success) { S.fc = r; if (S.tab === 'forecast') drawFc(); } }
  async function loadFeed(first) {
    var r = await A().callAsync('getLiveFeed', first ? null : S.feed.since); if (!r || !r.success) return;
    r.events.forEach(function (e) { if (!S.feed.ids[e.id]) { S.feed.ids[e.id] = 1; S.feed.events.push(Object.assign({ fresh: !first }, e)); } });
    S.feed.events.sort(function (a, b) { return b.at < a.at ? -1 : 1; }); S.feed.events = S.feed.events.slice(0, 150);
    S.feed.since = S.feed.events.length ? S.feed.events[0].at : r.now;
    if (S.tab === 'feed') drawFeed();
  }

  // ================= alerts (page, tabs, sound, pop-up) =================
  function drawAlerts() { var el = document.getElementById('rvlAlerts'); if (!el) return; el.innerHTML = (S.data.alerts || []).map(function (a) { return '<div class="rvl-alert rvl-alert--' + a.level + '" role="alert">' + w.RV.icon('alert', 16) + '<span>' + esc(a.text) + '</span></div>'; }).join(''); }
  function badges() {
    var d = S.data, set = function (id, n, hot) { var b = document.querySelector('#rvlTab_' + id + ' .rvl-badge'); if (!b) return; b.hidden = !n; b.textContent = n || ''; b.classList.toggle('is-hot', !!hot); };
    set('incidents', (d.incidents || []).filter(function (i) { return i.status !== 'ack'; }).length, true);
    set('channels', (d.channels || []).filter(function (c) { return c.state === 'down' || c.state === 'quiet' || c.state === 'warn'; }).length, true);
    set('sla', d.tiles.slaBreached, true);
  }
  function watchAlerts() {
    var keys = (S.data.alerts || []).map(function (a) { return a.key; });
    if (S.seen === null) { S.seen = {}; keys.forEach(function (k) { S.seen[k] = 1; }); return; }   // what was already wrong when you opened the page is not announced again
    (S.data.alerts || []).forEach(function (a) { if (!S.seen[a.key]) { S.seen[a.key] = 1; announce(a); } });
    Object.keys(S.seen).forEach(function (k) { if (keys.indexOf(k) < 0) delete S.seen[k]; });
  }
  function announce(a) {
    if (lsGet('rvl_sound') === '1') beep();
    if ('Notification' in w && Notification.permission === 'granted' && document.hidden) { try { new Notification('Live team', { body: a.text, tag: a.key }); } catch (e) {} }
    w.RV.toast(a.text, 'error');
  }
  function beep() { try { var C = w.AudioContext || w.webkitAudioContext; if (!C) return; S.audio = S.audio || new C(); var o = S.audio.createOscillator(), g = S.audio.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(S.audio.destination); o.start(); o.stop(S.audio.currentTime + 0.25); } catch (e) {} }
  function toggleSound() { var on = lsGet('rvl_sound') !== '1'; lsSet('rvl_sound', on ? '1' : '0'); var b = document.getElementById('rvlSound'); if (b) { b.textContent = 'Sound: ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', String(on)); } if (on) beep(); }
  async function askDesktop() {
    if (!('Notification' in w)) return; var p = Notification.permission; if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) {} }
    var b = document.getElementById('rvlDesk'); if (b) b.textContent = 'Desktop alerts: ' + (p === 'granted' ? 'on' : p === 'denied' ? 'blocked' : 'off');
    if (p === 'denied') w.RV.toast('Your browser is blocking pop-ups for this site. Allow them in the address bar settings.', 'info');
  }

  // ================= board =================
  function spark(key, bad) {
    var pts = (S.data.trend || []).map(function (x) { return x[key] || 0; }); if (pts.length < 2) return '';
    var W = 100, H = 22, max = Math.max(1, Math.max.apply(null, pts)), step = W / (pts.length - 1);
    return '<svg class="rvl-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="' + (bad ? 'var(--rv-danger, #b42318)' : 'var(--rv-accent, #10B981)') + '" stroke-width="1.6" points="' + pts.map(function (v, i) { return (i * step).toFixed(1) + ',' + (H - 2 - v / max * (H - 5)).toFixed(1); }).join(' ') + '"/></svg>';
  }
  function tile(label, value, sub, kind, go, trendKey) { return '<div class="rvl-tile' + (kind ? ' rvl-tile--' + kind : '') + (go ? ' is-go' : '') + '"' + (go ? ' role="button" tabindex="0" data-go="' + go + '" title="Open these in the inbox"' : '') + '><b>' + value + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + (trendKey ? spark(trendKey, kind === 'bad') : '') + '</div>'; }
  function draw() {
    var d = S.data, t = d.tiles, cfg = d.cfg;
    var tb = document.getElementById('rvlToolbar');
    if (tb) tb.innerHTML = ((d.teams || []).length > 1 ? '<label class="rvl-team">Team <select class="rv-select" id="rvlTeam"><option value="">All teams</option>' + d.teams.map(function (x) { return '<option value="' + esc(x) + '"' + (x === d.team ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' : '') +
      '<span style="flex:1"></span><button type="button" class="rv-btn rv-btn--sm" id="rvlBalance"' + (t.unassigned ? '' : ' disabled') + ' title="Spread the tickets nobody owns over the agents who are available">Auto-balance ' + t.unassigned + ' unassigned</button>';
    var diff = t.arrivals.last60 - t.arrivals.prev60, trend = t.arrivals.prev60 === 0 && t.arrivals.last60 === 0 ? 'same hour yesterday: 0' : (diff === 0 ? 'same as this hour yesterday' : (diff > 0 ? '&#9650; ' + diff + ' more' : '&#9660; ' + (-diff) + ' fewer') + ' than this hour yesterday');
    document.getElementById('rvlTiles').innerHTML =
      tile('waiting for a first reply', t.waitingFirst, t.waitingNow ? t.waitingNow + ' waiting for any reply' : 'nobody is waiting', t.waitingFirst > 0 ? 'warn' : '', 'waiting', 'waiting') +
      tile('longest wait', t.longest ? mins(t.longest.min) : 'none', t.longest ? '<button type="button" class="rvl-link" data-open="' + esc(t.longest.id) + '">' + esc(t.longest.subject) + '</button>' : 'no one is waiting', t.longest && t.longest.min >= cfg.waitMin ? 'bad' : '') +
      tile('past SLA', t.slaBreached, t.slaRisk + ' close to SLA', t.slaBreached > 0 ? 'bad' : t.slaRisk > 0 ? 'warn' : '', 'sla', 'breached') +
      tile('no owner', t.unassigned, 'limit ' + cfg.queueDepth, t.unassigned >= cfg.queueDepth ? 'bad' : t.unassigned > 0 ? 'warn' : '', 'noowner', 'unassigned') +
      tile('new in the last hour', t.arrivals.last60, trend, '', 'newest') +
      tile('available', t.available.n + ' of ' + t.available.total, 'agents who can take tickets', t.available.n === 0 && t.waitingNow > 0 ? 'bad' : '', '', 'avail');
    var wb = d.waitBuckets || [0, 0, 0, 0], tot = Math.max(1, wb[0] + wb[1] + wb[2] + wb[3]), lab = ['0 to 5 min', '5 to 15 min', '15 to 60 min', 'over 60 min'], col = ['var(--rv-success, #0a7d4b)', 'var(--rv-accent, #10B981)', 'var(--rv-warning, #b7791f)', 'var(--rv-danger, #b42318)'];
    document.getElementById('rvlBuckets').innerHTML = '<div class="rvl-buckets" role="img" aria-label="How long customers have waited: ' + lab.map(function (l, i) { return wb[i] + ' ' + l; }).join(', ') + '"><div class="rvl-buckets__bar">' + wb.map(function (n, i) { return n ? '<i style="width:' + (n / tot * 100) + '%;background:' + col[i] + '"></i>' : ''; }).join('') + '</div><div class="rvl-buckets__key">' + wb.map(function (n, i) { return '<span><i style="background:' + col[i] + '"></i>' + lab[i] + ': <b>' + n + '</b></span>'; }).join('') + '</div></div>';
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
      '<footer><button type="button" class="rv-btn rv-btn--sm" data-detail="' + esc(a.email) + '">Details</button><button type="button" class="rv-btn rv-btn--sm" data-tickets="' + esc(a.email) + '">Their tickets</button><button type="button" class="rv-btn rv-btn--sm" data-nudge="' + esc(a.email) + '" data-name="' + esc(a.name) + '">Nudge</button></footer></article>';
  }
  function hotList(d) {
    if (!d.hot.length) return '<div class="rvl-calm">Nothing needs a hand right now.</div>';
    var opts = d.agents.map(function (a) { return '<option value="' + esc(a.email) + '">' + esc(a.name) + (a.status !== 'available' ? ' (' + (ST[a.status] || ST.available)[0].toLowerCase() + ')' : '') + '</option>'; }).join('');
    return '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Why</th><th>Ticket</th><th>Waiting</th><th>Owner</th><th>Give to</th></tr></thead><tbody>' + d.hot.map(function (h) {
      var own = h.assignedTo ? ((d.agents.filter(function (a) { return a.email.toLowerCase() === h.assignedTo.toLowerCase(); })[0] || {}).name || h.assignedTo) : '<span class="rv-badge rv-badge--danger">No owner</span>';
      return '<tr><td>' + h.reasons.filter(function (r) { return r !== 'No owner'; }).map(function (r) { return '<span class="rv-badge rv-badge--' + (/Past/.test(r) ? 'danger' : /Unhappy|Close|Waiting/.test(r) ? 'warning' : 'accent') + '">' + esc(r) + '</span>'; }).join(' ') + '</td>' +
        '<td><button type="button" class="rvl-link" data-open="' + esc(h.id) + '"><b>' + esc(h.subject) + '</b></button><div class="rv-hint">' + esc(h.from || '') + '</div></td><td>' + (h.waitMin != null ? mins(h.waitMin) : '&ndash;') + '</td><td>' + own + '</td>' +
        '<td><select class="rv-select rvl-give" data-give="' + esc(h.id) + '" aria-label="Give ' + esc(h.subject) + ' to"><option value="">Choose...</option>' + opts + '</select></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
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

  // ================= incidents =================
  function drawInc() {
    var d = S.inc, box = document.getElementById('rvlTabBody'); if (!box || !d) return;
    var bars = function (t) { var m = Math.max(1, Math.max.apply(null, t)); return '<span class="rvl-bars" role="img" aria-label="Tickets in each 10 minutes of the last 90">' + t.map(function (v) { return '<i style="height:' + Math.max(3, v / m * 28) + 'px" title="' + v + '"></i>'; }).join('') + '</span>'; };
    var cards = d.active.map(function (i) {
      return '<article class="rvl-inc rvl-inc--' + i.severity + '" data-inc="' + esc(i.id) + '"><header><div><h3>' + esc(i.title) + '</h3><p class="rv-hint">' + i.count + ' tickets from ' + i.customers + ' customers in ' + i.sinceMin + ' min &middot; first at ' + new Date(i.firstAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</p></div>' + bars(i.trend) + '</header>' +
        '<div class="rvl-inc__meta"><span class="rv-badge rv-badge--' + (i.severity === 'high' ? 'danger' : 'warning') + '">' + (i.severity === 'high' ? 'Large' : 'Growing') + '</span> ' + (i.status === 'ack' ? '<span class="rv-badge rv-badge--accent">Seen by ' + esc(i.ackBy || '') + '</span>' : '<span class="rv-badge rv-badge--danger">New</span>') +
        (i.updates.length ? ' <span class="rv-hint">' + i.updates.length + ' update' + (i.updates.length === 1 ? '' : 's') + ' sent, last to ' + i.updates[i.updates.length - 1].sent + ' customers</span>' : '') + '</div>' +
        '<ul class="rvl-inc__tickets">' + i.tickets.slice(0, 5).map(function (t) { return '<li><button type="button" class="rvl-link" data-open="' + esc(t.id) + '">' + esc(t.subject) + '</button><span class="rv-hint"> ' + esc(t.from || '') + ' &middot; ' + ago(Date.parse(t.at)) + '</span></li>'; }).join('') + '</ul>' +
        '<footer>' + (i.status === 'open' ? '<button type="button" class="rv-btn rv-btn--sm" data-inc-ack="' + esc(i.id) + '">I have seen this</button>' : '') + '<button type="button" class="rv-btn rv-btn--sm rv-btn--primary" data-inc-msg="' + esc(i.id) + '">Message these customers</button><button type="button" class="rv-btn rv-btn--sm" data-inc-done="' + esc(i.id) + '">Mark as over</button></footer></article>';
    }).join('');
    var recent = d.recent.length ? '<h2 class="rvl-h" style="margin-top:18px">Earlier today</h2><div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Incident</th><th>Tickets</th><th>How it ended</th><th>Updates sent</th></tr></thead><tbody>' + d.recent.map(function (r) { return '<tr><td>' + esc(r.title || r.id) + '</td><td>' + (r.count || '') + '</td><td>' + (r.status === 'resolved' ? 'Marked over' + (r.resolvedBy ? ' by ' + esc(r.resolvedBy) : '') : 'Stopped on its own') + '</td><td>' + r.updates + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    box.innerHTML = '<p class="rv-hint">When ' + d.min + ' or more customers write about the same thing within about 90 minutes, and far more than usual, they are grouped here. Nothing is sent to customers unless you choose to.</p>' +
      (cards || '<div class="rvl-calm">No incident right now. Customers are writing about their usual things.</div>') + recent;
  }
  async function incMessage(id) {
    var r = await A().callAsync('liveIncidentPreview', id); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not prepare the message.', 'error'); return; }
    if (!r.recipients) { w.RV.toast('Nobody is left to message: ' + r.skipped + ' ticket' + (r.skipped === 1 ? ' is' : 's are') + ' already answered, closed or contacted.', 'info'); return; }
    var ov = w.RV.modal({ title: 'Message ' + r.recipients + ' customers', body: '<p class="rv-hint" style="margin-top:0">About: <b>' + esc(r.title) + '</b>. Each customer gets this as a normal reply on their ticket. <b>{name}</b> becomes their first name. Edit it first.</p>' +
        '<label class="rv-label" for="rvlIncText">Message</label><textarea class="rv-textarea" id="rvlIncText" rows="9" maxlength="2000">' + esc(r.draft) + '</textarea>' +
        '<p class="rv-hint">To (first ' + r.sample.length + ' of ' + r.recipients + '): ' + r.sample.map(function (s) { return esc(s.name); }).join(', ') + (r.recipients > r.sample.length ? '...' : '') + (r.skipped ? '. ' + r.skipped + ' left out (answered, closed or already told).' : '') + (r.capped ? ' <b>Only the first 100 will be sent.</b>' : '') + '</p>' +
        '<label class="rvl-check"><input type="checkbox" id="rvlIncOk"> I understand this emails ' + Math.min(r.recipients, 100) + ' customers and cannot be taken back.</label><div id="rvlIncProg"></div>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Send to ' + Math.min(r.recipients, 100), kind: 'primary', attrs: { id: 'rvlIncSend', disabled: 'disabled' } }) });
    var ok = ov.querySelector('#rvlIncOk'), btn = ov.querySelector('#rvlIncSend');
    ok.addEventListener('change', function () { btn.disabled = !ok.checked; });
    btn.addEventListener('click', async function () {
      var msg = ov.querySelector('#rvlIncText').value.trim(); if (!msg) { w.RV.toast('Write the message first.', 'error'); return; }
      btn.disabled = true; ok.disabled = true; var key = 'u' + Date.now().toString(36), sent = 0, failed = 0, skipped = 0, reasons = [], ids = r.ids.slice(), prog = ov.querySelector('#rvlIncProg');
      for (var i = 0; i < ids.length; i += 20) {
        prog.innerHTML = '<div class="rv-hint">Sending... ' + Math.min(i, ids.length) + ' of ' + ids.length + '</div>' + w.RV.progress(i / ids.length * 100);
        var x = await A().callAsync('liveIncidentSend', id, msg, ids.slice(i, i + 20), key, true);
        if (!x || !x.success) { reasons.push((x && x.error) || 'A step failed.'); failed += Math.min(20, ids.length - i); break; }
        sent += x.sent; failed += x.failed; skipped += x.skipped; x.results.forEach(function (q) { if (q.status === 'failed' && reasons.length < 3) reasons.push(q.reason); });
      }
      prog.innerHTML = '<div class="rvl-alert rvl-alert--' + (failed ? 'warn' : 'high') + '" style="' + (failed ? '' : 'background:var(--rv-success-soft,#e8f6ee);color:var(--rv-success,#0a7d4b)') + '"><span><b>' + sent + ' sent</b>' + (failed ? ', <b>' + failed + ' not delivered</b>' : '') + (skipped ? ', ' + skipped + ' skipped' : '') + '.' + (reasons.length ? ' ' + esc(reasons[0]) : '') + (failed ? ' Failed ones are on each ticket with a Retry button.' : '') + '</span></div>';
      btn.textContent = 'Done'; btn.disabled = false; btn.onclick = function () { w.RV.closeModal(ov); }; loadInc();
    });
  }

  // ================= SLA countdown =================
  function drawSla() {
    var d = S.sla, box = document.getElementById('rvlTabBody'); if (!box || !d) return;
    var nm = function (e) { if (!e) return '<span class="rv-badge rv-badge--danger">No owner</span>'; var a = ((S.data && S.data.agents) || []).filter(function (x) { return x.email.toLowerCase() === e.toLowerCase(); })[0]; return esc(a ? a.name : e); };
    box.innerHTML = '<div class="rvl-stats"><div><b class="is-late">' + d.counts.breached + '</b><span>already late</span></div><div><b class="is-soon">' + d.counts.within30 + '</b><span>within 30 min</span></div><div><b>' + d.counts.within120 + '</b><span>within 2 hours</span></div><div><b>' + d.counts.total + '</b><span>open with a timer</span></div></div>' +
      (d.tickets.length ? '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Time left</th><th>Ticket</th><th>Owner</th><th>Priority</th></tr></thead><tbody>' + d.tickets.map(function (t) {
        var dl = Date.parse(t.deadline); return '<tr><td><b class="rvl-cd ' + cdClass(dl) + '" data-deadline="' + dl + '">' + cd(dl) + '</b>' + (t.paused ? ' <span class="rv-hint">(paused)</span>' : '') + '</td><td><button type="button" class="rvl-link" data-open="' + esc(t.id) + '"><b>' + esc(t.subject) + '</b></button><div class="rv-hint">' + esc(t.from || '') + '</div></td><td>' + nm(t.assignedTo) + '</td><td>' + esc(t.priority || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="rvl-calm">No open ticket has a response-time target running.</div>');
  }

  // ================= channels =================
  function drawCh() {
    var box = document.getElementById('rvlTabBody'); if (!box || !S.ch) return;
    var lab = { ok: ['Working', 'success'], quiet: ['Quiet', 'warning'], down: ['No messages', 'danger'], warn: ['Check', 'warning'], not_connected: ['Not connected', ''] };
    box.innerHTML = '<p class="rv-hint">Per way customers reach you: when the last message arrived, and whether it is quieter than it normally is at this time of day.</p><div class="rvl-channels">' + S.ch.channels.map(function (c) {
      var l = lab[c.state] || lab.ok;
      return '<article class="rvl-chan"><header><h3>' + esc(c.label) + '</h3><span class="rv-badge' + (l[1] ? ' rv-badge--' + l[1] : '') + '">' + l[0] + '</span></header><dl><div><dt>Last message</dt><dd>' + (c.lastAt ? ago(Date.parse(c.lastAt)) : 'never') + '</dd></div><div><dt>Last hour</dt><dd>' + c.count1h + '</dd></div><div><dt>Last 24 hours</dt><dd>' + c.count24h + '</dd></div><div><dt>Usually per hour</dt><dd>' + c.perHour + '</dd></div></dl>' +
        (c.state === 'quiet' || c.state === 'down' ? '<p class="rvl-chan__note">About ' + c.expected + ' messages would normally have arrived since the last one. Check that ' + esc(c.label.toLowerCase()) + ' is still connected.</p>' : '') +
        (c.issues.length ? '<ul class="rvl-chan__issues">' + c.issues.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + (c.state === 'not_connected' ? '<p class="rv-hint">Not connected yet.</p>' : '') + '</article>';
    }).join('') + '</div>';
  }

  // ================= activity =================
  var ICON = { new: '&#43;', reply: '&#8617;', customer: '&#9993;', assigned: '&#8594;', status: '&#10003;', sla: '&#9888;', escalated: '&#8593;', nudge: '&#128075;', incident: '&#128225;' };
  function drawFeed() {
    var box = document.getElementById('rvlTabBody'); if (!box) return;
    if (!document.getElementById('rvlFeed')) box.innerHTML = '<p class="rv-hint">What is happening across the team, newest first. It adds new events by itself.</p><ul class="rvl-feed" id="rvlFeed" aria-live="polite"></ul>';
    var ul = document.getElementById('rvlFeed');
    ul.innerHTML = S.feed.events.length ? S.feed.events.map(function (e) { return '<li class="rvl-ev rvl-ev--' + e.kind + (e.fresh ? ' is-fresh' : '') + '"><i aria-hidden="true">' + (ICON[e.kind] || '&bull;') + '</i><span>' + (e.ticketId ? '<button type="button" class="rvl-link" data-open="' + esc(e.ticketId) + '">' + esc(e.text) + '</button>' : esc(e.text)) + '</span><time datetime="' + esc(e.at) + '">' + ago(Date.parse(e.at)) + '</time></li>'; }).join('') : '<li class="rv-hint">Nothing has happened in the last few hours.</li>';
  }

  // ================= forecast =================
  function drawFc() {
    var d = S.fc, box = document.getElementById('rvlTabBody'); if (!box || !d) return;
    if (!d.enough) { box.innerHTML = '<div class="rvl-calm" style="background:var(--rv-surface-2);color:var(--rv-text)">' + esc(d.hint) + '</div>'; return; }
    var max = Math.max(1, Math.max.apply(null, d.hours.map(function (h) { return h.high; })));
    box.innerHTML = '<div class="rvl-alert rvl-alert--' + (/want/.test(d.hint) ? 'warn' : 'high') + '" style="' + (/want/.test(d.hint) ? '' : 'background:var(--rv-success-soft,#e8f6ee);color:var(--rv-success,#0a7d4b)') + '"><span>' + esc(d.hint) + '</span></div>' +
      '<div class="rvl-fc" role="img" aria-label="Expected new tickets for each of the next 8 hours">' + d.hours.map(function (h) {
        return '<div class="rvl-fc__col' + (h.agentsNeeded > d.available ? ' is-short' : '') + '"><div class="rvl-fc__plot"><i class="rvl-fc__range" style="bottom:' + (h.low / max * 100) + '%;height:' + Math.max(2, (h.high - h.low) / max * 100) + '%"></i><i class="rvl-fc__bar" style="height:' + Math.max(2, h.expected / max * 100) + '%" title="' + h.expected + ' expected (' + h.low + ' to ' + h.high + ')"></i></div><b>' + h.expected + '</b><span>' + h.label + '</span><small>needs ' + h.agentsNeeded + '</small></div>';
      }).join('') + '</div><p class="rv-hint">The bar is the usual number of new tickets in that hour (from the same hour ' + (d.hours[0].basis === 'same weekday' ? 'on the same weekday in earlier weeks' : 'on recent days') + '); the pale range is the lowest to highest seen. "Needs" assumes one agent handles ' + d.perAgentHour + ' tickets an hour (you can change this in Alert limits). Available now: ' + d.available + '.</p>';
  }

  // ================= actions =================
  function goInbox(setup) { var a = A(); try { setup(a); } catch (e) {} a.navigate('ticket-inbox'); }
  function openTicket(id) { A().navigate('ticket-inbox'); setTimeout(function () { if (w.RVI && w.RVI.open) w.RVI.open(id); }, 700); }
  function onClick(e) {
    var t = e.target.closest('[data-tab],[data-open],[data-tickets],[data-nudge],[data-detail],[data-go],#rvlBalance,[data-inc-ack],[data-inc-msg],[data-inc-done]'); if (!t) return;
    if (t.hasAttribute('data-tab')) { showTab(t.getAttribute('data-tab')); return; }
    if (t.hasAttribute('data-open')) { openTicket(t.getAttribute('data-open')); return; }
    if (t.hasAttribute('data-tickets')) { goInbox(function (x) { if (w.RVI && w.RVI.setView) w.RVI.setView('all'); x._ticketAssignee = t.getAttribute('data-tickets'); }); return; }
    if (t.hasAttribute('data-nudge')) { nudge(t.getAttribute('data-nudge'), t.getAttribute('data-name')); return; }
    if (t.hasAttribute('data-detail')) { detail(t.getAttribute('data-detail')); return; }
    if (t.id === 'rvlBalance') { balance(); return; }
    if (t.hasAttribute('data-go')) { var g = t.getAttribute('data-go');
      goInbox(function (x) { var v = w.RVI && w.RVI.setView; if (g === 'noowner' && v) v('unassigned'); else if (g === 'sla' && v) v('sla-breached'); else if (g === 'waiting') { if (v) v('all'); x._ticketSort = 'waiting'; } else if (g === 'newest') { if (v) v('all'); x._ticketSort = 'newest'; } }); return; }
    if (t.hasAttribute('data-inc-ack')) { act(t, 'liveIncidentAction', t.getAttribute('data-inc-ack'), 'ack'); return; }
    if (t.hasAttribute('data-inc-done')) { if (confirm('Mark this incident as over? Customers are not told anything.')) act(t, 'liveIncidentAction', t.getAttribute('data-inc-done'), 'resolve'); return; }
    if (t.hasAttribute('data-inc-msg')) incMessage(t.getAttribute('data-inc-msg'));
  }
  async function act(btn, fn, a1, a2) { btn.disabled = true; var r = await A().callAsync(fn, a1, a2); if (!r || !r.success) { btn.disabled = false; w.RV.toast((r && r.error) || 'That did not work.', 'error'); return; } load(); loadInc(); }
  async function onChange(e) {
    if (e.target.id === 'rvlTeam') { S.team = e.target.value; S.data = null; await load(true); return; }
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
  async function detail(email) {
    var r = await A().callAsync('getLiveAgentDetail', email); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not open the details.', 'error'); return; }
    var st = ST[r.status] || ST.available, fr = r.firstReplyAvgMin, tf = r.teamFirstReplyAvgMin, fcls = fr == null ? '' : fr <= r.targetMin ? 'is-ok' : 'is-late';
    var ov = w.RV.modal({ title: r.name, body: '<p class="rv-hint" style="margin-top:0">' + esc(r.role) + ' &middot; <span style="color:' + st[1] + ';font-weight:700">' + st[0] + '</span></p>' +
      '<div class="rvl-stats"><div><b>' + r.repliesToday + '</b><span>replies today</span></div><div><b>' + r.solvedToday + '</b><span>solved today</span></div><div><b>' + r.open + '</b><span>open now</span></div><div><b class="' + fcls + '">' + (fr == null ? '&ndash;' : mins(fr)) + '</b><span>first reply today</span></div></div>' +
      '<p class="rv-hint">Target ' + mins(r.targetMin) + (tf != null ? ' &middot; whole team today ' + mins(tf) : '') + '</p>' +
      '<h3 class="rvl-h">Customers waiting for ' + esc(r.name.split(' ')[0]) + '</h3>' + (r.waiting.length ? '<ul class="rvl-inc__tickets">' + r.waiting.map(function (t) { return '<li><button type="button" class="rvl-link" data-open="' + esc(t.id) + '">' + esc(t.subject) + '</button> <b class="rvl-cd" data-since="' + Date.parse(t.since) + '">' + mins(t.waitMin) + '</b>' + (t.deadline ? ' <span class="rv-hint">SLA <span class="rvl-cd ' + cdClass(Date.parse(t.deadline)) + '" data-deadline="' + Date.parse(t.deadline) + '">' + cd(Date.parse(t.deadline)) + '</span></span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="rv-hint">Nobody is waiting for them.</p>') +
      (r.answered.length ? '<h3 class="rvl-h" style="margin-top:12px">Waiting on the customer (' + r.answered.length + ')</h3><ul class="rvl-inc__tickets">' + r.answered.slice(0, 8).map(function (t) { return '<li><button type="button" class="rvl-link" data-open="' + esc(t.id) + '">' + esc(t.subject) + '</button></li>'; }).join('') + '</ul>' : ''),
      foot: w.RV.btn({ label: 'Close', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Nudge', attrs: { id: 'rvlDNudge' } }) + w.RV.btn({ label: 'Their tickets', kind: 'primary', attrs: { id: 'rvlDTix' } }) });
    ov.addEventListener('click', function (e) { var o = e.target.closest('[data-open]'); if (o) { w.RV.closeModal(ov); openTicket(o.getAttribute('data-open')); } });
    ov.querySelector('#rvlDNudge').addEventListener('click', function () { w.RV.closeModal(ov); nudge(r.email, r.name); });
    ov.querySelector('#rvlDTix').addEventListener('click', function () { w.RV.closeModal(ov); goInbox(function (x) { if (w.RVI && w.RVI.setView) w.RVI.setView('all'); x._ticketAssignee = r.email; }); });
  }
  async function balance() {
    var p = await A().callAsync('liveAutoBalance', false); if (!p || !p.success) { w.RV.toast((p && p.error) || 'Could not work out a plan.', 'error'); return; }
    if (!p.toAssign) { w.RV.toast(p.noAgents ? 'Nobody is available to take tickets right now.' : 'Everyone available is at their limit, so nothing can be handed out.', 'info'); return; }
    var ov = w.RV.modal({ title: 'Auto-balance', body: '<p class="rv-hint" style="margin-top:0">' + p.toAssign + ' of the ' + p.total + ' tickets nobody owns would be handed to the agents who are available, the oldest first, keeping everyone within their limit.' + (p.left ? ' <b>' + p.left + ' would stay unassigned</b> because everyone is full.' : '') + ' Each agent is told in the usual way.</p>' +
      '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Agent</th><th>Open now</th><th>Would get</th></tr></thead><tbody>' + p.plan.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td>' + x.load + ' of ' + x.max + '</td><td><b>+' + x.count + '</b> <span class="rv-hint">' + x.tickets.slice(0, 2).map(function (t) { return esc(t.subject); }).join('; ') + '</span></td></tr>'; }).join('') + '</tbody></table></div>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Assign ' + p.toAssign + ' tickets', kind: 'primary', attrs: { id: 'rvlBalGo' } }) });
    ov.querySelector('#rvlBalGo').addEventListener('click', async function (e) { e.target.disabled = true; var r = await A().callAsync('liveAutoBalance', true); w.RV.closeModal(ov); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Nothing was assigned.', 'error'); return; } w.RV.toast('Assigned ' + r.assigned + ' tickets' + (r.failed ? ', ' + r.failed + ' could not be moved' : ''), r.failed ? 'info' : 'success'); load(true); });
  }
  async function wall() {
    var r = await A().callAsync('getWallboardLinks'); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not open the wallboard links.', 'error'); return; }
    var row = function (l) { return '<tr><td>' + esc(l.label) + '</td><td>' + new Date(l.createdAt).toLocaleDateString() + '</td><td>' + (l.lastSeen ? ago(Date.parse(l.lastSeen)) : 'not opened yet') + '</td><td>' + (l.revokedAt ? '<span class="rv-hint">removed</span>' : '<button type="button" class="rv-btn rv-btn--sm rv-btn--danger" data-wal-del="' + esc(l.id) + '">Remove</button>') + '</td></tr>'; };
    var ov = w.RV.modal({ title: 'Wallboard for the office screen', body: '<p class="rv-hint" style="margin-top:0">A full-screen, big-number page for a TV. Anyone with the link can see the <b>numbers and first names only</b> (no ticket, customer, subject or address) and needs no sign-in, so keep the link private. Remove it any time.</p>' +
        '<div class="rvl-wallnew"><input class="rv-input" id="rvlWallLabel" placeholder="Name, for example Office screen" maxlength="40"><button type="button" class="rv-btn rv-btn--primary" id="rvlWallMake">Make a link</button></div><div id="rvlWallUrl"></div>' +
        '<h3 class="rvl-h" style="margin-top:14px">Links</h3><div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Name</th><th>Made</th><th>Last opened</th><th></th></tr></thead><tbody id="rvlWallRows">' + (r.links.map(row).join('') || '<tr><td colspan="4" class="rv-hint">No links yet.</td></tr>') + '</tbody></table></div>',
      foot: w.RV.btn({ label: 'Close', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) });
    var refresh = async function () { var x = await A().callAsync('getWallboardLinks'); if (x && x.success) ov.querySelector('#rvlWallRows').innerHTML = x.links.map(row).join('') || '<tr><td colspan="4" class="rv-hint">No links yet.</td></tr>'; };
    ov.querySelector('#rvlWallMake').addEventListener('click', async function () {
      var x = await A().callAsync('createWallboardLink', ov.querySelector('#rvlWallLabel').value); if (!x || !x.success) { w.RV.toast((x && x.error) || 'Could not make the link.', 'error'); return; }
      ov.querySelector('#rvlWallUrl').innerHTML = '<div class="rvl-alert rvl-alert--warn"><span>Copy it now. It is shown only once.</span></div><div class="rvl-wallnew"><input class="rv-input" id="rvlWallOut" readonly value="' + esc(x.url) + '"><button type="button" class="rv-btn" id="rvlWallCopy">Copy</button></div>';
      ov.querySelector('#rvlWallCopy').addEventListener('click', function () { var i = ov.querySelector('#rvlWallOut'); i.select(); try { (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { w.RV.toast('Link copied', 'success'); }, function () { document.execCommand('copy'); w.RV.toast('Link copied', 'success'); }); } catch (e) { document.execCommand('copy'); } });
      refresh();
    });
    ov.addEventListener('click', async function (e) { var d = e.target.closest('[data-wal-del]'); if (!d) return; if (!confirm('Remove this link? The screen using it stops working.')) return; var x = await A().callAsync('revokeWallboardLink', d.getAttribute('data-wal-del')); if (!x || !x.success) { w.RV.toast((x && x.error) || 'Not removed.', 'error'); return; } w.RV.toast('Link removed', 'success'); refresh(); });
  }
  async function settings() {
    var r = await A().callAsync('getLiveBoardConfig'); if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not open the alert limits.', 'error'); return; }
    var c = r.config, num = function (id, label, v, hint) { return '<div class="rvl-field"><label class="rv-label" for="' + id + '">' + label + '</label><input class="rv-input" type="number" min="1" id="' + id + '" value="' + v + '"><span class="rv-hint">' + hint + '</span></div>'; };
    var chk = function (id, label, v) { return '<label class="rvl-check"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + label + '</label>'; };
    var ov = w.RV.modal({ title: 'Alert limits', body: '<p class="rv-hint" style="margin-top:0">Admins and Managers are alerted when a limit is crossed. The same alert is not repeated for 30 minutes.</p>' + chk('rvlOn', 'Send alerts', c.alertsOn) +
        num('rvlWait', 'A customer has waited more than (minutes)', c.waitMin, 'Used by the next limit and the "Needs a hand" list.') + num('rvlCount', 'Alert when this many customers are waiting that long', c.waitingCount, 'For example 10.') +
        num('rvlQueue', 'Alert when this many tickets have no owner', c.queueDepth, 'For example 20.') + chk('rvlNone', 'Alert when nobody is available and customers are waiting', c.noneAvailable) +
        num('rvlInc', 'An incident is this many customers writing about the same thing', c.incidentMin, 'Between 3 and 100. Lower finds smaller problems sooner but may flag coincidences.') +
        num('rvlFr', 'First reply target (minutes)', c.frTargetMin, 'Shown on My day and in agent details.') + num('rvlPer', 'Tickets one agent handles in an hour', c.perAgentHour, 'Used by the staffing forecast.') +
        '<h3 class="rvl-h" style="margin-top:14px">How to alert</h3>' + chk('rvlPush', 'Phone and browser alert', c.notifyPush) + chk('rvlMail', 'Email', c.notifyEmail) +
        '<div style="margin-top:10px"><button type="button" class="rv-btn rv-btn--sm" id="rvlTest">Send myself a test alert</button> <span class="rv-hint" id="rvlTestMsg"></span></div>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Save', kind: 'primary', attrs: { id: 'rvlSave' } }) });
    ov.querySelector('#rvlTest').addEventListener('click', async function () { var t = await A().callAsync('testLiveAlert'); ov.querySelector('#rvlTestMsg').textContent = !t || !t.success ? 'Could not send.' : t.sent ? 'Sent to ' + t.sent + ' device' + (t.sent === 1 ? '' : 's') + '.' : 'No device is set up for alerts yet. Turn alerts on from your phone or browser first.'; });
    ov.querySelector('#rvlSave').addEventListener('click', async function () {
      var g = function (id) { return ov.querySelector('#' + id); };
      var res = await A().callAsync('saveLiveBoardConfig', { alertsOn: g('rvlOn').checked, waitMin: g('rvlWait').value, waitingCount: g('rvlCount').value, queueDepth: g('rvlQueue').value, noneAvailable: g('rvlNone').checked, notifyPush: g('rvlPush').checked, notifyEmail: g('rvlMail').checked, incidentMin: g('rvlInc').value, frTargetMin: g('rvlFr').value, perAgentHour: g('rvlPer').value });
      if (!res || !res.success) { w.RV.toast((res && res.error) || 'Not saved.', 'error'); return; }
      w.RV.closeModal(ov); w.RV.toast('Alert limits saved', 'success'); load();
    });
  }

  // ================= refreshing =================
  function togglePause() { S.paused = !S.paused; var b = document.getElementById('rvlPause'); if (b) b.textContent = S.paused ? 'Resume' : 'Pause'; if (!S.paused) refreshAll(); showUpdated(); }
  function showUpdated() { var u = document.getElementById('rvlUpdated'); if (!u || !S.at) return; u.textContent = S.paused ? 'Paused. Last updated ' + ago(S.at) + '.' : 'Updated ' + ago(S.at) + ', refreshes every ' + Math.round(RVL.poll / 1000) + ' s.'; }
  function refreshAll() { load(); if (S.tab === 'incidents') loadInc(); else if (S.tab === 'sla') loadSla(); else if (S.tab === 'channels') loadCh(); else if (S.tab === 'feed') loadFeed(false); else if (S.tab === 'forecast' && Date.now() - S.fcAt > 60000) loadFc(); }
  function liveText() {   // timers that run every second without asking the server
    document.querySelectorAll('[data-deadline]').forEach(function (e) { var d = +e.getAttribute('data-deadline'); e.textContent = cd(d); e.classList.remove('is-late', 'is-soon'); var c = cdClass(d); if (c) e.classList.add(c); });
    document.querySelectorAll('[data-since]').forEach(function (e) { e.textContent = mins(Math.max(0, Math.round((Date.now() - +e.getAttribute('data-since')) / 60000))); });
    document.querySelectorAll('.rvl-feed time').forEach(function (e) { e.textContent = ago(Date.parse(e.getAttribute('datetime'))); });
  }
  function start() {
    stop();
    S.timer = setInterval(function () { if (!root()) { stop(); return; } if (document.hidden || S.paused) return; refreshAll(); }, RVL.poll);
    S.tick = setInterval(function () { if (!root()) { stop(); return; } showUpdated(); liveText(); }, 1000);
  }
  function stop() { if (S.timer) clearInterval(S.timer); if (S.tick) clearInterval(S.tick); S.timer = S.tick = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && root() && !S.paused) refreshAll(); });

  // ================= My day (every agent) =================
  var D = { data: null, timer: null, tick: null };
  RVL.renderMyDay = async function () {
    var a = A(); a.setPage('My day', 'Inbox / My day'); var area = document.getElementById('contentArea'); var fab = document.getElementById('quickCaptureFab'); if (fab) fab.style.display = 'none';
    stop(); dayStop(); area.innerHTML = '<div class="rv rvl" id="rvlDay"><div class="rv-card">' + w.RV.skeleton(5) + '</div></div>';
    await dayLoad();
    D.timer = setInterval(function () { if (!document.getElementById('rvlDay')) { dayStop(); return; } if (!document.hidden) dayLoad(); }, RVL.poll);
    D.tick = setInterval(function () { if (!document.getElementById('rvlDay')) { dayStop(); return; } liveText(); }, 1000);
  };
  function dayStop() { if (D.timer) clearInterval(D.timer); if (D.tick) clearInterval(D.tick); D.timer = D.tick = null; }
  async function dayLoad() {
    var r = await A().callAsync('getMyDay'), box = document.getElementById('rvlDay'); if (!box) return;
    if (!r || !r.success) { box.innerHTML = '<div class="rv-card">' + w.RV.empty({ icon: 'sparkle', title: r && r.off ? 'My day is not switched on' : 'My day could not load', text: (r && r.error) || 'Reload the page to try again.' }) + '</div>'; return; }
    D.data = r; var fr = r.firstReplyAvgMin, cls = fr == null ? '' : fr <= r.targetMin ? 'is-ok' : 'is-late';
    box.innerHTML = '<header class="rvl-head"><div><p class="rv-hint">Your customers, your numbers, today. Updates by itself.</p></div></header>' +
      '<div class="rvl-stats"><div><b>' + r.waiting.length + '</b><span>customers waiting for you</span></div><div><b>' + r.repliesToday + '</b><span>replies today</span></div><div><b>' + r.solvedToday + '</b><span>solved today</span></div><div><b class="' + cls + '">' + (fr == null ? '&ndash;' : mins(fr)) + '</b><span>your first reply</span></div></div>' +
      '<p class="rv-hint">Target ' + mins(r.targetMin) + (r.teamFirstReplyAvgMin != null ? ' &middot; whole team today ' + mins(r.teamFirstReplyAvgMin) : '') + ' &middot; ' + r.open + ' open tickets are yours.</p>' +
      '<section><h2 class="rvl-h">Waiting for your reply</h2>' + (r.waiting.length ? '<div class="rvl-tablewrap"><table class="rvl-table"><thead><tr><th>Waiting</th><th>Ticket</th><th>Response target</th></tr></thead><tbody>' + r.waiting.map(function (t) { var dl = t.deadline ? Date.parse(t.deadline) : null; return '<tr><td><b class="rvl-cd" data-since="' + Date.parse(t.since) + '">' + mins(t.waitMin) + '</b></td><td><button type="button" class="rvl-link" data-dopen="' + esc(t.id) + '"><b>' + esc(t.subject) + '</b></button><div class="rv-hint">' + esc(t.from || '') + '</div></td><td>' + (dl ? '<b class="rvl-cd ' + cdClass(dl) + '" data-deadline="' + dl + '">' + cd(dl) + '</b>' : '&ndash;') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="rvl-calm">Nobody is waiting for you. Nice.</div>') + '</section>' +
      (r.unassigned ? '<p class="rvl-help">' + r.unassigned + ' ticket' + (r.unassigned === 1 ? ' has' : 's have') + ' no owner. <button type="button" class="rvl-link" id="rvlDayHelp">Open them</button> to help out.</p>' : '');
    var h = document.getElementById('rvlDayHelp'); if (h) h.onclick = function () { goInbox(function () { if (w.RVI && w.RVI.setView) w.RVI.setView('unassigned'); }); };
    box.querySelectorAll('[data-dopen]').forEach(function (b) { b.onclick = function () { openTicket(b.getAttribute('data-dopen')); }; });
  }

  RVL.stop = function () { stop(); dayStop(); }; RVL._state = S;   // exposed so the screen tests can look at the timers
  w.RVL = RVL;
})(window);
