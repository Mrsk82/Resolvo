/* Dashboard extras: live command center and trend charts (word cloud, created vs resolved, backlog, on-time rate,
   first reply time, busiest hours, customer mood, top customers). Data: App.callAsync('getDashboardTrends'). */
(function () {
  'use strict';
  var RVDash = {}, timer = null, lastCmd = 0, state = { days: 14 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var C = { accent: 'var(--rv-accent)', ok: 'var(--rv-success)', danger: 'var(--rv-danger)', high: 'var(--rv-high)', info: 'var(--rv-info)', faint: 'var(--rv-text-faint)' };
  function niceStep(max) { if (max <= 5) return 1; var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag; }
  function shortDate(k) { var p = String(k).split('-'); return p.length === 3 ? (+p[2]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] : k; }

  /* One line/area chart. series: [{label,color,values (null = no data that day),area}]; dates: day keys. */
  function line(o) {
    var W = 640, H = 190, pl = 36, pr = 24, pt = 10, pb = 26, n = o.dates.length;
    var all = []; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
    if (!all.length) return '<div class="rvd-empty">' + esc(o.empty || 'Not enough data yet.') + '</div>';
    var max = Math.max.apply(null, all.concat([o.min0 === false ? 0 : 1])), step = o.fixedMax ? o.fixedMax / 4 : niceStep(max), top = o.fixedMax || Math.ceil(max / step) * step || 1;
    var cw = W - pl - pr, ch = H - pt - pb;
    var X = function (i) { return pl + (n === 1 ? cw / 2 : (i / (n - 1)) * cw); }, Y = function (v) { return pt + ch - (v / top) * ch; };
    var g = '', v, i;
    for (v = 0; v <= top + 1e-9; v += step) g += '<line x1="' + pl + '" y1="' + Y(v).toFixed(1) + '" x2="' + (W - pr) + '" y2="' + Y(v).toFixed(1) + '" stroke="var(--rv-border-soft)"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + (o.unit || '') + '</text>';
    var every = Math.max(1, Math.ceil(n / 6));
    for (i = 0; i < n; i++) if ((n - 1 - i) % every === 0) g += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(shortDate(o.dates[i])) + '</text>';
    o.series.forEach(function (s) {
      var segs = [], cur = [];
      s.values.forEach(function (val, k) { if (val == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(k), Y(val), k, val]); });
      if (cur.length) segs.push(cur);
      segs.forEach(function (sg) {
        var d = sg.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        if (s.area && sg.length > 1) g += '<path d="' + d + ' L' + sg[sg.length - 1][0].toFixed(1) + ' ' + (pt + ch) + ' L' + sg[0][0].toFixed(1) + ' ' + (pt + ch) + ' Z" fill="' + s.color + '" opacity=".12"/>';
        g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
        if (sg.length === 1) g += '<circle cx="' + sg[0][0].toFixed(1) + '" cy="' + sg[0][1].toFixed(1) + '" r="3.5" fill="' + s.color + '"/>';
      });
      s.values.forEach(function (val, k) { if (val != null) g += '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(val).toFixed(1) + '" r="9" fill="transparent"><title>' + esc(shortDate(o.dates[k]) + ' · ' + s.label + ': ' + val + (o.unit || '')) + '</title></circle>'; });
    });
    var key = o.series.length > 1 ? '<div class="rvd-key">' + o.series.map(function (s) { return '<em style="color:' + s.color + '"><span style="color:var(--rv-text-2)">' + esc(s.label) + '</span></em>'; }).join('') + '</div>' : '';
    return key + '<svg class="rvd-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '">' + g + '</svg>';
  }

  function cloud(terms, o) {
    o = o || {};
    var compare = o.compare !== false;
    if (!terms.length) return '<div class="rvd-empty">Not enough messages yet. Words that come up in several tickets will appear here.</div>';
    var list = terms.slice(0, 36), max = list[0].n, min = list[list.length - 1].n, rng = Math.max(1, max - min);
    var arranged = [];   // biggest in the middle, smaller toward the edges, so it reads as a cloud and not a sorted list
    list.forEach(function (t, i) { if (i % 2) arranged.unshift(t); else arranged.push(t); });
    var rankColor = function (i) { return i < 3 ? 'var(--rv-accent-strong)' : i < 10 ? 'var(--rv-info)' : i < 20 ? 'var(--rv-text-2)' : 'var(--rv-text-muted)'; };
    var rank = {}; list.forEach(function (t, i) { rank[t.word] = i; });
    var words = arranged.map(function (t) {
      var size = 13 + Math.round(Math.pow((t.n - min) / rng, 0.8) * 25);
      var mark = t.change === 'up' ? '<sup aria-hidden="true">▲</sup>' : t.change === 'new' ? '<sup aria-hidden="true">new</sup>' : t.change === 'down' ? '<sup aria-hidden="true">▼</sup>' : '';
      var hint = t.n + ' ticket' + (t.n === 1 ? '' : 's') + (t.change === 'up' ? ', up from ' + t.prev : t.change === 'new' ? ', new this period' : t.change === 'down' ? ', down from ' + t.prev : '');
      var st = 'font-size:' + size + 'px;color:' + (t.change === 'down' ? 'var(--rv-text-faint)' : rankColor(rank[t.word]));
      if (o.static) return '<span class="rvd-word ' + esc(t.change) + '" style="' + st + '" title="' + esc(t.word + ': ' + hint) + '">' + esc(t.word) + mark + '</span>';
      return '<button type="button" class="rvd-word ' + esc(t.change) + '" style="' + st + '" title="' + esc(hint) + '" aria-label="' + esc(t.word + ': ' + hint + '. Search tickets') + '" onclick="RVDash.search(\'' + esc(t.word) + '\')">' + esc(t.word) + mark + '</button>';
    }).join('');
    if (o.noSide) return '<div class="rvd-cloud">' + words + '</div>';
    var rising = terms.filter(function (t) { return t.change === 'up' || t.change === 'new'; }).sort(function (a, b) { return (b.n - b.prev) - (a.n - a.prev); }).slice(0, 5);
    var fading = terms.filter(function (t) { return t.change === 'down'; }).sort(function (a, b) { return (b.prev - b.n) - (a.prev - a.n); }).slice(0, 3);
    var row = function (t, kind) { return '<li><b>' + esc(t.word) + '</b><span class="' + kind + '">' + (kind === 'up' ? '▲ ' : '▼ ') + (t.prev ? t.prev + ' → ' + t.n : 'new, ' + t.n) + '</span></li>'; };
    var side = '<div class="rvd-movers"><h3>Rising</h3>' + (rising.length ? '<ul>' + rising.map(function (t) { return row(t, 'up'); }).join('') + '</ul>' : '<p>' + (compare ? 'Nothing new is rising.' : 'Rising and fading words show up once there are a few tickets from the period before.') + '</p>') +
      (fading.length ? '<h3>Fading</h3><ul>' + fading.map(function (t) { return row(t, 'down'); }).join('') + '</ul>' : '') + '<p class="rvd-note">Tickets that mention the word, this period against the one before.</p></div>';
    return '<div class="rvd-cloudwrap"><div><div class="rvd-cloud">' + words + '</div><div class="rvd-key" style="justify-content:center;margin-top:8px"><span>Bigger = in more tickets</span><span style="color:var(--rv-accent-strong)">▲ rising or new</span><span>▼ falling</span></div></div>' + side + '</div>';
  }

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], BINS = ['0–3', '3–6', '6–9', '9–12', '12–15', '15–18', '18–21', '21–24'];
  function heat(h) {
    var max = 0; h.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    if (!max) return '<div class="rvd-empty">No tickets in this period yet.</div>';
    var out = '<div class="rvd-heat" role="img" aria-label="Tickets by weekday and time of day"><span></span>' + BINS.map(function (b) { return '<span class="h">' + b + '</span>'; }).join('');
    h.forEach(function (r, d) {
      out += '<span>' + DAYS[d] + '</span>' + r.map(function (v, b) { return '<i title="' + DAYS[d] + ' ' + BINS[b] + ' h: ' + v + ' ticket' + (v === 1 ? '' : 's') + '" style="opacity:' + (v ? (0.14 + 0.86 * v / max).toFixed(2) : 0.05) + '"></i>'; }).join('');
    });
    return out + '</div><p class="rvd-note">Hours are India time. Darker means more tickets arrive then, so you know when to have people on.</p>';
  }

  function mood(m) {
    var tot = m.positive + m.neutral + m.negative;
    if (tot < 3) return '<div class="rvd-empty">Mood is read from the words in new messages. Not enough yet.</div>';
    var parts = [['Happy', m.positive, C.ok], ['Neutral', m.neutral, C.faint], ['Unhappy', m.negative, C.danger]];
    return '<div class="rvd-stack" role="img" aria-label="Customer mood">' + parts.map(function (p) { return '<i title="' + p[0] + ': ' + p[1] + '" style="width:' + (p[1] / tot * 100).toFixed(1) + '%;background:' + p[2] + '"></i>'; }).join('') + '</div>' +
      '<div class="rvd-legend">' + parts.map(function (p) { return '<em style="color:' + p[2] + '"><span style="color:var(--rv-text-2)">' + p[0] + ' ' + Math.round(p[1] / tot * 100) + '% (' + p[1] + ')</span></em>'; }).join('') + '</div>' +
      '<p class="rvd-note">A quick read of the words in new messages, not a verdict on any customer.</p>';
  }

  function custs(list, o) {
    o = o || {};
    if (!list.length) return '<div class="rvd-empty">No tickets in this period yet.</div>';
    var max = list[0].n;
    return list.map(function (c) { return '<div class="rvd-hbar' + (o.static ? ' s' : '') + '"><b title="' + esc(c.email) + '">' + esc(c.name) + '</b><div class="t"><i style="width:' + (c.n / max * 100).toFixed(0) + '%"></i></div><span>' + c.n + '</span></div>'; }).join('') + '<p class="rvd-note">Most tickets in this period.' + (o.static ? '' : ' Click a name to search for them.') + '</p>';
  }

  function card(title, body, cls, actions) { return '<section class="rv-card ' + (cls || '') + '"><div class="rv-card__head"><h2 class="rv-card__title">' + esc(title) + '</h2>' + (actions || '') + '</div><div class="rv-card__body">' + body + '</div></section>'; }

  /* ---------- command center ---------- */
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 5 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; }
  function waitText(h) { return h < 1 ? Math.max(1, Math.round(h * 60)) + ' minutes' : h < 48 ? (Math.round(h * 10) / 10) + ' hours' : Math.round(h / 24) + ' days'; }
  function command(c, o) {
    o = o || {};
    var view = function (v) { return "App._inboxView('" + v + "')"; };
    var tile = function (n, label, cls, v) { var inner = '<b>' + n + '</b><span>' + esc(label) + '</span>'; return o.static ? '<div class="rvd-tile ' + (n ? cls : 'zero') + '">' + inner + '</div>' : '<button type="button" class="rvd-tile ' + (n ? cls : 'zero') + '" onclick="' + view(v) + '">' + inner + '</button>'; };
    var tiles = tile(c.breached, 'Past SLA', 'hot', 'sla-breached') + tile(c.atRisk, 'At risk', 'warm', 'sla-risk') + tile(c.critical, 'Critical', 'hot', 'critical') +
      tile(c.unassigned, 'No owner', 'warm', 'unassigned') + tile(c.waitingOnUs, 'Waiting on us', '', 'status:open') + tile(c.awaitingCustomer, 'Waiting on customer', '', 'status:open');
    var wait = c.oldest ? '<div class="rvd-wait">Longest wait: ' + (o.static ? '<b>' + esc(c.oldest.subject || c.oldest.id) + '</b>' : '<button type="button" onclick="App._openInInbox(\'' + String(c.oldest.id).replace(/[^A-Za-z0-9_-]/g, '') + '\')">' + esc(c.oldest.subject || c.oldest.id) + '</button>') + ' · customer has waited ' + esc(waitText(c.oldest.hours)) + '</div>' : '<div class="rvd-wait">Nobody is waiting on you right now.</div>';
    var pr = c.priority, tot = (pr.Critical + pr.High + pr.Medium + pr.Low) || 1, pc = [['Critical', pr.Critical, C.danger], ['High', pr.High, C.high], ['Medium', pr.Medium, C.info], ['Low', pr.Low, C.faint]];
    var mix = c.open ? '<div class="rvd-sub">Open tickets by priority</div><div class="rvd-stack" role="img" aria-label="Open tickets by priority">' + pc.map(function (p) { return p[1] ? '<i title="' + p[0] + ': ' + p[1] + '" style="width:' + (p[1] / tot * 100).toFixed(1) + '%;background:' + p[2] + '"></i>' : ''; }).join('') + '</div><div class="rvd-legend">' + pc.map(function (p) { return '<em style="color:' + p[2] + '"><span style="color:var(--rv-text-2)">' + p[0] + ' ' + p[1] + '</span></em>'; }).join('') + '</div>' : '';
    var team = c.agents.length ? c.agents.map(function (a) {
      var col = a.pct >= 100 ? C.danger : a.pct >= 70 ? C.high : C.accent;
      return '<div class="rvd-agent"><b>' + esc(a.name) + (a.away ? ' <span class="rv-badge">away</span>' : '') + '</b><small>' + a.open + ' of ' + a.max + (a.over ? ' · ' + a.over + ' late' : '') + '</small><div class="rvd-bar" role="img" aria-label="' + esc(a.name + ' has ' + a.open + ' of ' + a.max + ' tickets') + '"><i style="width:' + Math.max(a.open ? 4 : 0, a.pct) + '%;background:' + col + '"></i></div></div>';
    }).join('') : '<div class="rvd-empty">No one has tickets yet. Assign tickets to see each person\'s load.</div>';
    var q = c.queue.frozen ? 'Auto-assign is paused (queue frozen).' : c.queue.on ? 'Auto-assign is on: new tickets go to the next free person.' : 'Auto-assign is off. New tickets stay unassigned until someone takes them.';
    return '<div class="rvd-cmd"><div><div class="rvd-tiles">' + tiles + '</div>' + wait + mix + '</div><div><div class="rvd-sub" style="margin-top:0">Team load (open tickets against each person\'s limit)</div>' + team + '<p class="rvd-note">' + esc(q) + '</p></div></div>';
  }
  function cmdCard(c) {
    var act = '<span class="rvd-head-act"><span class="rvd-live" id="rvdLive"><i></i>Live · updated ' + ago(lastCmd) + '</span><button type="button" class="rv-btn rv-btn--sm" onclick="RVDash.refresh()">Refresh</button></span>';
    return card('Command center', command(c), '', act);
  }

  /* Custom Dashboard widgets: RVDash.widget(type, element, data) draws one chart into a widget body. Words and names are not links there. */
  RVDash.widget = function (type, el, d) {
    var dates = (d.daily || []).map(function (x) { return x.date; }), col = function (k) { return (d.daily || []).map(function (x) { return x[k]; }); }, ST = { static: true };
    var html;
    if (type === 'word_cloud') html = cloud(d.terms || [], { static: true, compare: d.compare });
    else if (type === 'command_center') html = command(d.command, ST);
    else if (type === 'backlog_trend') html = line({ dates: dates, label: 'Open tickets at the end of each day', series: [{ label: 'Open at end of day', color: C.high, values: col('backlog'), area: true }], empty: 'Nothing open.' });
    else if (type === 'sla_trend') html = line({ dates: dates, label: 'Share of resolved tickets closed within their SLA, per day', unit: '%', fixedMax: 100, series: [{ label: 'Within SLA', color: C.ok, values: col('slaPct') }], empty: 'No resolved tickets in this period yet.' });
    else if (type === 'reply_time_trend') html = line({ dates: dates, label: 'Average hours to first reply, by day tickets arrived', unit: 'h', series: [{ label: 'Hours to first reply', color: C.info, values: col('frtHours') }], empty: 'No replies in this period yet.' });
    else if (type === 'busiest_hours') html = heat(d.heat || []);
    else if (type === 'customer_mood') html = mood(d.mood || { positive: 0, neutral: 0, negative: 0 });
    else if (type === 'top_customers') html = custs(d.topCustomers || [], ST);
    else html = '<div class="rvd-empty">Unknown chart.</div>';
    el.innerHTML = '<div class="rvd-widget">' + html + '</div>';
  };

  RVDash.search = function (w) { App._ticketSearch = w; App._ticketFilter = 'all'; App._ticketChannel = 'all'; App._ticketPriority = 'all'; if (window.RVI && RVI.leaveFocus) { try { RVI.leaveFocus(); } catch (e) {} } App.navigate('ticket-inbox'); };

  function paint(d) {
    var host = document.getElementById('rvdCommand'), tr = document.getElementById('rvdTrends');
    if (host && d.command) { lastCmd = Date.now(); host.innerHTML = cmdCard(d.command); }
    if (tr && d.terms) {
      var dates = d.daily.map(function (x) { return x.date; }), col = function (k) { return d.daily.map(function (x) { return x[k]; }); };
      var tc = d.topCustomers.length ? custs(d.topCustomers) : custs([]);
      tr.innerHTML = '<div class="rvd-trends">' +
        card('Trending topics', cloud(d.terms, { compare: d.compare }), 'wide') +
        card('Created and resolved', line({ dates: dates, label: 'Tickets created and resolved per day', series: [{ label: 'Created', color: C.accent, values: col('created'), area: true }, { label: 'Resolved', color: C.info, values: col('resolved') }], empty: 'No tickets in this period yet.' })) +
        card('Backlog', line({ dates: dates, label: 'Open tickets at the end of each day', series: [{ label: 'Open at end of day', color: C.high, values: col('backlog'), area: true }], empty: 'Nothing open.' })) +
        card('Replied on time', line({ dates: dates, label: 'Share of resolved tickets closed within their SLA, per day', unit: '%', fixedMax: 100, series: [{ label: 'Within SLA', color: C.ok, values: col('slaPct') }], empty: 'No resolved tickets in this period yet.' })) +
        card('First reply time', line({ dates: dates, label: 'Average hours to first reply, by day tickets arrived', unit: 'h', series: [{ label: 'Hours to first reply', color: C.info, values: col('frtHours') }], empty: 'No replies in this period yet.' })) +
        card('Busiest hours', heat(d.heat)) +
        card('Customer mood', mood(d.mood)) +
        card('Who writes most', tc, 'wide') + '</div>';
      tr.querySelectorAll('.rvd-hbar b').forEach(function (b) { b.style.cursor = 'pointer'; b.onclick = function () { RVDash.search(b.getAttribute('title') || b.textContent); }; });
    }
  }

  function load(only) {
    return App.callAsync('getDashboardTrends', only ? { days: state.days, only: 'command' } : { days: state.days }).then(function (d) {
      if (!d || d.success === false) { var t = document.getElementById('rvdTrends'); if (t && !only) t.innerHTML = '<div class="rvd-empty">Trends could not load. Reload the page to try again.</div>'; return; }
      paint(d);
    }).catch(function () {});
  }
  RVDash.refresh = function () { return load(true); };
  RVDash.mount = function (days) {
    state.days = days || 14; clearInterval(timer);
    load(false);
    timer = setInterval(function () {
      if (!document.getElementById('rvdCommand')) { clearInterval(timer); return; }   // left the dashboard
      if (document.hidden) { var l = document.getElementById('rvdLive'); if (l) l.classList.add('off'); return; }
      var l2 = document.getElementById('rvdLive'); if (l2) { l2.classList.remove('off'); l2.lastChild.textContent = 'Live · updated ' + ago(lastCmd); }
      if (Date.now() - lastCmd > 29000) load(true);
    }, 5000);
  };
  RVDash.views = { line: line, cloud: cloud, mood: mood, heat: heat };
  window.RVDash = RVDash;
})();
