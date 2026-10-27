/* Resolvo Insights (RVN): one page with Overview, Questions, Team, Reports and Customers.
   Overview, Questions and Team are drawn from one call (getInsights). Reports and Customers are the existing pages with this tab bar on top. */
(function (w) {
  'use strict';
  var RVN = {}, esc = function (s) { return w.RV.esc(s); }, A = function () { return App; };
  var S = { days: 14, cmp: true, tab: 'overview', data: null, sort: { k: 'open', d: -1 } };
  var TABS = [['overview', 'Overview'], ['questions', 'Questions'], ['team', 'Team'], ['reports', 'Reports'], ['customers', 'Customers']];
  var DOW = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  try { var d0 = parseInt(localStorage.getItem('tt_insights_days'), 10); if ([7, 14, 30, 90].indexOf(d0) >= 0) S.days = d0; } catch (e) {}

  // ---------- small helpers ----------
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  function delta(cur, prev, higherIsBetter, unit) {
    if (cur == null || prev == null || prev === 0 && cur === 0) return { cls: 'flat', txt: '' };
    if (prev === 0) return { cls: 'flat', txt: 'new' };
    var d = unit === 'pts' ? cur - prev : (cur - prev) / prev * 100; if (Math.abs(d) < .5) return { cls: 'flat', txt: '0' + (unit === 'pts' ? ' pts' : '%') };
    var good = higherIsBetter ? d > 0 : d < 0;
    return { cls: good ? 'up' : 'dn', txt: (d > 0 ? '+' : '') + Math.round(d) + (unit === 'pts' ? ' pts' : '%') };
  }
  function line(series, labels, o) {
    o = o || {}; var W = 640, H = o.h || 230, L = 34, B = 22, T = 10, R = 8, all = [].concat.apply([], series.map(function (s) { return s.v; })), step = o.step || 10;
    var max = o.max || Math.max(step, Math.ceil(Math.max.apply(null, all) * 1.1 / step) * step), tk = o.ticks || 4;
    var x = function (i) { return L + i * (W - L - R) / Math.max(1, labels.length - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var grid = '', k; for (k = 0; k <= tk; k++) { var v = Math.round(max * k / tk * 10) / 10, yy = y(v); grid += '<line class="rvn-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + v + '</text>'; }
    var tick = Math.max(1, Math.ceil(labels.length / 7)), last = labels.length - 1, xt = labels.map(function (l, i) { return ((i % tick === 0 && last - i >= Math.ceil(tick / 2)) || i === last) ? '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === labels.length - 1 ? 'end' : 'middle') + '">' + esc(l) + '</text>' : ''; }).join('');
    var paths = series.map(function (s, n) {
      var d = s.v.map(function (a, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(a).toFixed(1); }).join('');
      return (n === 0 ? '<path d="' + d + 'L' + x(labels.length - 1) + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z" fill="' + s.c + '" opacity=".10"/>' : '') + '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="2.2" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    }).join('');
    return '<svg class="rvn-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Chart') + '">' + grid + xt + paths + '</svg>';
  }
  function spark(v, color) { if (!v || v.length < 2) return ''; var wd = 96, h = 28, mx = Math.max.apply(null, v), mn = Math.min.apply(null, v); var x = function (i) { return i * (wd - 2) / (v.length - 1) + 1; }, y = function (a) { return h - 3 - (a - mn) / ((mx - mn) || 1) * (h - 6); }; return '<svg width="' + wd + '" height="' + h + '" viewBox="0 0 ' + wd + ' ' + h + '" aria-hidden="true"><path d="' + v.map(function (a, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(a).toFixed(1); }).join('') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/></svg>'; }
  function hbars(items, color) { var mx = Math.max.apply(null, items.map(function (i) { return i.n; })) || 1; return items.map(function (i, k) { return '<div class="rvn-hbar"><span title="' + esc(i.label) + '">' + esc(i.label) + '</span><div class="rvn-bar"><i style="width:' + (i.n / mx * 100) + '%;background:' + (color || 'var(--rv-accent)') + '"></i></div><b>' + i.n + '</b></div>'; }).join(''); }
  function chName(c) { var m = { email: 'Email', whatsapp: 'WhatsApp', widget: 'Web widget', manual: 'Manual', sms: 'SMS', call: 'Call', sample: 'Sample' }; c = String(c || 'email').toLowerCase(); return m[c] || c.charAt(0).toUpperCase() + c.slice(1); }
  function hrs(h) { return h == null ? '-' : (h < 1 ? Math.round(h * 60) + ' min' : h + ' h'); }
  var AVC = ['', 'rv-avatar--c1', 'rv-avatar--c2', 'rv-avatar--c3', 'rv-avatar--c4'];
  function av(name) { return w.RV.avatar(name, 'sm'); }

  // ---------- frame ----------
  RVN.tabsHtml = function (active) {
    return '<div class="rv-tabs rv-tabs--pills rvn-tabs" role="tablist" aria-label="Insights">' + TABS.map(function (t) { return '<button type="button" role="tab" class="rv-tab" aria-selected="' + (t[0] === active) + '" onclick="App.renderInsights(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>';
  };
  // the existing pages get the same tab bar on top
  RVN.addStrip = function (active) { var area = document.getElementById('contentArea'); if (!area || document.getElementById('rvnStrip')) return; var d = document.createElement('div'); d.className = 'rv rvn'; d.id = 'rvnStrip'; d.innerHTML = '<div class="rvn-head"><h1>Insights</h1></div>' + RVN.tabsHtml(active); area.insertBefore(d, area.firstChild); };

  RVN.render = async function (tab) {
    var a = A(); S.tab = tab && TABS.some(function (t) { return t[0] === tab; }) ? tab : (S.tab || 'overview');
    if (S.tab === 'reports') { a.navigate('reports'); return; }
    if (S.tab === 'customers') { a.navigate('customer-health'); return; }
    a.setPage('Insights', 'Insights');
    var area = document.getElementById('contentArea');
    area.innerHTML = '<div class="rv rvn"><div class="rv-card">' + w.RV.skeleton(6) + '</div></div>';
    var r = await a.callAsync('getInsights', { days: S.days });
    if (!r || !r.success) { area.innerHTML = '<div class="rv rvn">' + w.RV.alert('danger', w.RV.icon('alert', 16) + '<span style="flex:1">Insights could not load. ' + esc((r && r.error) || '') + '</span>' + w.RV.btn({ label: 'Try again', size: 'sm', onclick: 'App.renderInsights()' })) + '</div>'; return; }
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    r.labels = r.labels.map(function (l) { var m = /^(\d\d)-(\d\d)$/.exec(l); return m ? (+m[2]) + ' ' + MON[+m[1] - 1] : l; });
    S.data = r; draw();
  };
  function head() {
    var d = S.data, range = [7, 14, 30, 90].map(function (n) { return '<button type="button" aria-pressed="' + (n === S.days) + '" data-days="' + n + '">' + n + ' days</button>'; }).join('');
    return '<div class="rvn-head"><div><h1>Insights</h1><p class="rv-hint">' + esc(d.labels[0]) + ' to ' + esc(d.labels[d.labels.length - 1]) + ' &middot; promotions and automated alerts left out</p></div>' +
      '<div class="rv-cluster"><div class="rvn-seg" id="rvnRange" role="group" aria-label="Date range">' + range + '</div>' + (S.tab === 'overview' ? '<label class="rvn-chip"><input type="checkbox" id="rvnCmp"' + (S.cmp ? ' checked' : '') + '> Compare to previous</label>' : '') +
      w.RV.btn({ label: 'Export', size: 'sm', onclick: "App.navigate('export')" }) + '</div></div>' + RVN.tabsHtml(S.tab);
  }
  function draw() {
    var area = document.getElementById('contentArea'); if (!area) return;
    var body = S.tab === 'questions' ? questions() : S.tab === 'team' ? team() : overview();
    area.innerHTML = '<div class="rv rvn">' + head() + body + '</div>';
    document.getElementById('rvnRange').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.days = +b.getAttribute('data-days'); try { localStorage.setItem('tt_insights_days', S.days); } catch (x) {} RVN.render(S.tab); } };
    var c = document.getElementById('rvnCmp'); if (c) c.onchange = function () { S.cmp = c.checked; draw(); };
    var tb = document.getElementById('rvnTbl'); if (tb) tb.onclick = function (e) { var th = e.target.closest('th[data-k]'); if (th) { var k = th.getAttribute('data-k'); S.sort = { k: k, d: S.sort.k === k ? -S.sort.d : (k === 'name' || k === 'frtHours' ? 1 : -1) }; draw(); } };
  }

  // ---------- Overview ----------
  function overview() {
    var d = S.data, k = d.kpi, cmp = S.cmp;
    var cards = [
      ['Tickets', k.created[0], delta(k.created[0], k.created[1], true), spark(d.series.created, 'var(--rv-info)'), "App._inboxView('all')"],
      ['Resolved', k.resolved[0], delta(k.resolved[0], k.resolved[1], true), spark(d.series.resolved, 'var(--rv-accent)'), "App._inboxView('status:resolved')"],
      ['First reply', k.frtHours[0] == null ? '-' : hrs(k.frtHours[0]), delta(k.frtHours[0], k.frtHours[1], false), '', "App.navigate('first-response')"],
      ['Resolved on time', k.slaPct[0] == null ? '-' : k.slaPct[0] + '%', delta(k.slaPct[0], k.slaPct[1], true, 'pts'), '', "App.renderInsights('team')"],
      ['Happy customers', k.csatPct[0] == null ? '-' : k.csatPct[0] + '%', delta(k.csatPct[0], k.csatPct[1], true, 'pts'), '', "App.navigate('customer-health')"]
    ].map(function (c) { return '<button type="button" class="rvn-kpi" onclick="' + c[4] + '"><span class="rvn-kpi__l">' + c[0] + '</span><span class="rvn-kpi__n">' + c[1] + '</span><span class="rvn-kpi__f">' + (cmp && c[2].txt ? '<span class="rvn-delta rvn-delta--' + c[2].cls + '">' + c[2].txt + '</span>' : '<span></span>') + c[3] + '</span></button>'; }).join('');
    var ser = [{ c: 'var(--rv-info)', v: d.series.created, n: 'Created' }, { c: 'var(--rv-accent)', v: d.series.resolved, n: 'Resolved' }];
    if (cmp) ser.push({ c: 'var(--rv-text-faint)', v: d.series.createdPrev, n: 'Created, previous period', dash: 1 });
    var chart = line(ser, d.labels, { label: 'Tickets created and resolved' }), legend = ser.map(function (s) { return '<span><i style="background:' + s.c + '"></i>' + s.n + '</span>'; }).join('');
    var ch = d.channels.length ? hbars(d.channels.map(function (c) { return { label: chName(c.label), n: c.n }; }), 'var(--rv-info)') : '<p class="rv-hint">No tickets in this period.</p>';
    var rs = d.reasons.length ? hbars(d.reasons, 'var(--rv-accent)') : '<p class="rv-hint">No tickets in this period.</p>';
    var tm = d.agents.length ? d.agents.slice(0, 5).map(function (g) { return '<div class="rvn-mini">' + '<span class="rv-cluster">' + av(g.name) + '<span class="rvn-clip">' + esc(g.name) + '</span></span><span class="rv-hint">' + g.resolved + ' resolved</span>' + (g.slaPct != null ? '<span class="rv-badge ' + (g.slaPct >= 90 ? 'rv-badge--success' : 'rv-badge--warning') + '">' + g.slaPct + '% on time</span>' : '') + '</div>'; }).join('') : '<p class="rv-hint">Assign tickets to see your team here.</p>';
    return '<div class="rvn-kpis">' + cards + '</div>' +
      '<section class="rvn-card"><div class="rvn-card__h"><h3>Tickets created and resolved</h3><div class="rvn-legend">' + legend + '</div></div><div class="rvn-card__b">' + chart + '</div></section>' +
      '<div class="rvn-grid2"><section class="rvn-card"><div class="rvn-card__h"><h3>Where tickets come from</h3></div><div class="rvn-card__b">' + ch + '</div></section>' +
      '<section class="rvn-card"><div class="rvn-card__h"><h3>' + (d.reasonsKind === 'type' ? 'What customers ask about' : 'Words customers use most') + '</h3></div><div class="rvn-card__b">' + rs + '</div></section>' +
      '<section class="rvn-card"><div class="rvn-card__h"><h3>Team this period</h3><a class="rv-link" onclick="App.renderInsights(\'team\')">See all</a></div><div class="rvn-card__b">' + tm + '</div></section></div>';
  }

  // ---------- Questions: plain answers from the same numbers ----------
  function questions() {
    var d = S.data, k = d.kpi, out = [], tot = k.created[0], dd = d.days;
    // 1 speed
    var sla = k.slaPct[0], frt = k.frtHours[0];
    out.push(['Are we answering fast enough?', sla == null ? (frt == null ? 'Nothing has been resolved or answered yet in this period, so there is nothing to measure.' : 'First replies take <em>' + hrs(frt) + '</em> on average. No tickets were resolved yet to check against your targets.') :
      (sla >= 90 ? 'Yes. ' : sla >= 75 ? 'Mostly. ' : 'Not yet. ') + '<em class="' + (sla < 75 ? 'bad' : '') + '">' + sla + '%</em> of resolved tickets were done within target' + (k.slaPct[1] != null ? ', ' + (sla >= k.slaPct[1] ? 'up ' : 'down ') + Math.abs(sla - k.slaPct[1]) + ' points on the period before' : '') + (frt != null ? '. First replies take ' + hrs(frt) + '.' : '.'),
      line([{ c: 'var(--rv-accent)', v: d.series.resolved }], d.labels, { h: 130, label: 'Tickets resolved per day' }), 'See first-response time', "App.navigate('first-response')"]);
    // 2 volume
    var dow = d.heat.map(function (r) { return sum(r); }), busiest = dow.indexOf(Math.max.apply(null, dow)), dl = delta(k.created[0], k.created[1], true);
    out.push(['Are we getting busier?', tot === 0 ? 'No new tickets in this period.' : 'Volume is <em>' + (dl.txt && dl.txt !== 'new' ? dl.txt : 'new') + '</em> against the period before: ' + tot + ' tickets' + (Math.max.apply(null, dow) > 0 ? '. ' + DOW[busiest] + ' are the busiest day.' : '.'),
      line([{ c: 'var(--rv-info)', v: d.series.created }], d.labels, { h: 130, label: 'Tickets created per day' }), 'See the tickets', "App._inboxView('all')"]);
    // 3 channels
    var c0 = d.channels[0], c1 = d.channels[1], totc = sum(d.channels.map(function (c) { return c.n; }));
    out.push(['Where do tickets come from?', !c0 ? 'No tickets yet.' : '<em>' + chName(c0.label) + '</em> brings ' + Math.round(c0.n / totc * 100) + '% of tickets' + (c1 ? ', then ' + chName(c1.label) + ' with ' + Math.round(c1.n / totc * 100) + '%.' : '.'),
      hbars(d.channels.slice(0, 4).map(function (c) { return { label: chName(c.label), n: c.n }; }), 'var(--rv-info)'), 'Open the inbox', "App._inboxView('all')"]);
    // 4 topics
    var r0 = d.reasons[0] && d.reasons[0].n >= 2 ? d.reasons[0] : null, totr = sum(d.reasons.map(function (r) { return r.n; }));
    out.push(['What do customers ask about?', !r0 ? 'Not enough tickets to see a pattern yet.' : (d.reasonsKind === 'type' ? '<em>' + esc(r0.label) + '</em> is the most common topic (' + Math.round(r0.n / Math.max(totr, 1) * 100) + '% of classified tickets). ' : 'The word <em>“' + esc(r0.label) + '”</em> appears in ' + r0.n + ' ticket subjects. ') + 'A help article on it could answer many of these before they reach you.',
      hbars(d.reasons.slice(0, 4), 'var(--rv-accent)'), 'Write a help article', "App.navigate('settings',{tab:'knowledge-base'})"]);
    // 5 people
    var late = d.agents.filter(function (g) { return g.over > 0; }).sort(function (x, y) { return y.over - x.over; })[0], busy = d.agents[0];
    var line5 = !d.agents.length ? (d.unassignedOpen ? '<em class="bad">' + d.unassignedOpen + '</em> open tickets have no owner yet.' : 'No tickets are assigned to anyone yet.') :
      (late ? '<em class="bad">' + esc(late.name.split(' ')[0]) + '</em> has ' + late.over + ' ticket' + (late.over === 1 ? '' : 's') + ' past target. ' : 'Nobody has tickets past target. ') + (busy && busy.open > 0 && busy !== late ? esc(busy.name.split(' ')[0]) + ' has the most open (' + busy.open + '). ' : '') + (d.unassignedOpen ? d.unassignedOpen + ' open tickets have no owner.' : '');
    out.push(['Who needs help?', line5, d.agents.slice(0, 5).map(function (g) { return '<div class="rvn-mini"><span class="rv-cluster">' + av(g.name) + esc(g.name.split(' ')[0]) + '</span><span class="rv-hint">' + g.open + ' open</span><span class="rv-badge ' + (g.over ? 'rv-badge--warning' : 'rv-badge--success') + '">' + (g.over ? g.over + ' late' : 'on track') + '</span></div>'; }).join('') || '', 'Open the team view', "App.renderInsights('team')"]);
    // 6 happy
    var cs = k.csatPct[0];
    out.push(['Are customers happy?', cs == null ? 'No survey replies yet in this period. Turn on CSAT in Settings to start collecting them.' : (cs >= 85 ? 'Yes. ' : cs >= 70 ? 'Mostly. ' : 'Not enough. ') + '<em class="' + (cs < 70 ? 'bad' : '') + '">' + cs + '%</em> of ' + k.csatN + ' survey replies were positive' + (k.csatPct[1] != null ? ' (' + (cs >= k.csatPct[1] ? 'up' : 'down') + ' ' + Math.abs(cs - k.csatPct[1]) + ' points).' : '.'),
      '', 'See the comments', "App.navigate('customer-health')"]);
    return '<div class="rvn-qs">' + out.map(function (q) { return '<article class="rvn-q"><span class="rvn-q__q">' + q[0] + '</span><p class="rvn-q__a">' + q[1] + '</p><div>' + q[2] + '</div><button type="button" class="rvn-q__more" onclick="' + q[4] + '">' + q[3] + ' &rarr;</button></article>'; }).join('') + '</div>';
  }

  // ---------- Team ----------
  function team() {
    var d = S.data, ag = d.agents.slice(), s = S.sort;
    ag.sort(function (x, y) { var a = x[s.k], b = y[s.k]; a = a == null ? -1 : a; b = b == null ? -1 : b; return (typeof a === 'string' ? a.localeCompare(b) : a - b) * s.d; });
    var avgOpen = ag.length ? sum(ag.map(function (g) { return g.open; })) / ag.length : 0, mx = Math.max.apply(null, [1].concat(ag.map(function (g) { return g.open; })));
    var al = [], late = ag.filter(function (g) { return g.over > 0; }).sort(function (x, y) { return y.over - x.over; })[0];
    if (late) al.push(['d', '&#9201;', esc(late.name) + ': ' + late.over + ' ticket' + (late.over === 1 ? '' : 's') + ' past target', 'Open tickets that have passed their target time.']);
    var heavy = ag.filter(function (g) { return g.open >= 5 && g.open >= 2 * avgOpen; })[0];
    if (heavy) al.push(['w', '&#9878;', esc(heavy.name) + ' has ' + heavy.open + ' open', 'About ' + Math.round(heavy.open / Math.max(avgOpen, 1) * 10) / 10 + ' times the team average. Consider reassigning some.']);
    if (d.unassignedOpen) al.push(['w', '&#128229;', d.unassignedOpen + ' open ticket' + (d.unassignedOpen === 1 ? '' : 's') + ' with no owner', 'Assign them from the inbox so none are missed.']);
    var best = ag.filter(function (g) { return g.resolved >= 3 && g.slaPct != null; }).sort(function (x, y) { return y.slaPct - x.slaPct; })[0];
    if (best && best.slaPct >= 90) al.push(['g', '&#127775;', esc(best.name) + ': ' + best.slaPct + '% on time', 'Best on the team this period.']);
    var cols = [['name', 'Agent'], ['open', 'Open'], ['resolved', 'Resolved'], ['frtHours', 'First reply'], ['slaPct', 'On time'], ['trend', 'Trend']];
    var tbl = ag.length ? '<div class="rvn-tw"><table class="rvn-t" id="rvnTbl"><thead><tr>' + cols.map(function (c) { return '<th' + (c[0] !== 'trend' ? ' data-k="' + c[0] + '" class="is-sort"' + (s.k === c[0] ? ' aria-sort="' + (s.d > 0 ? 'ascending' : 'descending') + '"' : '') : '') + '>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + ag.map(function (g) {
      return '<tr><td><span class="rv-cluster">' + av(g.name) + '<b>' + esc(g.name) + '</b></span></td><td><div class="rvn-load"><b>' + g.open + '</b><div class="rvn-bar"><i style="width:' + (g.open / mx * 100) + '%;background:' + (g.open >= 2 * avgOpen && g.open >= 5 ? 'var(--rv-danger)' : g.open > avgOpen * 1.3 ? 'var(--rv-warning)' : 'var(--rv-accent)') + '"></i></div></div></td><td>' + g.resolved + '</td><td>' + (g.frtHours == null ? '-' : '<span class="rv-badge ' + (g.frtHours > 4 ? 'rv-badge--warning' : 'rv-badge--success') + '">' + hrs(g.frtHours) + '</span>') + '</td><td>' + (g.slaPct == null ? '-' : g.slaPct + '%') + '</td><td>' + spark(g.trend, g.slaPct != null && g.slaPct < 80 ? 'var(--rv-warning)' : 'var(--rv-accent)') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="rvn-cards">' + ag.map(function (g) { return '<div class="rvn-ac"><span class="rv-cluster">' + av(g.name) + '<b>' + esc(g.name) + '</b></span><span class="rv-badge ' + ((g.slaPct || 0) >= 90 ? 'rv-badge--success' : 'rv-badge--warning') + '">' + (g.slaPct == null ? '-' : g.slaPct + '% on time') + '</span><div class="rv-hint">' + g.open + ' open &middot; ' + g.resolved + ' resolved &middot; first reply ' + hrs(g.frtHours) + '</div></div>'; }).join('') + '</div>'
      : w.RV.empty({ icon: 'user', title: 'No one has tickets yet', text: 'Assign tickets to your team and their numbers appear here.' });
    var hmax = Math.max.apply(null, [1].concat([].concat.apply([], d.heat))), slots = ['9-11', '11-13', '13-15', '15-17', '17-19', '19-21'], days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var heat = '<div class="rvn-hm"><span></span>' + days.map(function (x) { return '<span class="rvn-hm__c">' + x + '</span>'; }).join('') + slots.map(function (sl, r) { return '<span>' + sl + '</span>' + days.map(function (x, c) { var v = d.heat[c][r]; return '<i style="opacity:' + Math.max(.07, v / hmax).toFixed(2) + '" title="' + x + ' ' + sl + ': ' + v + ' tickets"></i>'; }).join(''); }).join('') + '</div>';
    return (al.length ? '<div class="rvn-alerts">' + al.map(function (a) { return '<div class="rvn-al rvn-al--' + a[0] + '"><span aria-hidden="true">' + a[1] + '</span><div><b>' + a[2] + '</b><span>' + a[3] + '</span></div></div>'; }).join('') + '</div>' : '') +
      '<section class="rvn-card">' + tbl + '</section><section class="rvn-card"><div class="rvn-card__h"><h3>When tickets arrive</h3><span class="rv-hint">Darker means busier. Times are India time.</span></div><div class="rvn-card__b">' + heat + '</div></section>';
  }

  w.RVN = RVN;
})(window);
