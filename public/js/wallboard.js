/* Live team wallboard: opens with a private link /wall/<workspace>/<token>, needs no sign-in, and shows counts and first names only. Refreshes every 10 seconds. */
(function () {
  'use strict';
  var parts = location.pathname.split('/').filter(Boolean), slug = parts[1] || '', token = parts[2] || '';
  var root = document.getElementById('wb'), last = null, failures = 0;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var mins = function (m) { return m == null ? 'none' : m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + ' days'; };
  var COL = { available: 'var(--ok)', busy: 'var(--warn)', away: 'var(--bad)' };

  function tile(v, label, kind) { return '<div class="wb-tile' + (kind ? ' is-' + kind : '') + '"><b>' + v + '</b><span>' + esc(label) + '</span></div>'; }
  function spark(trend) {
    if (!trend || trend.length < 2) return '<div class="wb-msg" style="font-size:1rem">The trend appears after a few minutes.</div>';
    var W = 300, H = 70, max = Math.max(1, Math.max.apply(null, trend.map(function (x) { return x.waiting; }))), step = W / (trend.length - 1);
    var pts = trend.map(function (x, i) { return (i * step).toFixed(1) + ',' + (H - 6 - (x.waiting / max) * (H - 14)).toFixed(1); }).join(' ');
    return '<svg class="wb-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Customers waiting over the last day"><polyline fill="none" stroke="var(--accent)" stroke-width="3" points="' + pts + '"/></svg>';
  }
  function draw(d) {
    var t = d.tiles, a = d.arrivals || t.arrivals, diff = t.arrivals.last60 - t.arrivals.prev60;
    var alerts = (d.alerts || []).map(function (x) { return '<div class="wb-alert is-' + esc(x.level) + '" role="alert">' + esc(x.text) + '</div>'; }).join('');
    var agents = (d.agents || []).map(function (g) {
      var flag = g.flags.indexOf('away') >= 0 ? 'away with tickets' : g.flags.indexOf('quiet') >= 0 ? 'quiet' : g.flags.indexOf('full') >= 0 ? 'full' : '';
      return '<div class="wb-agent"><b><span>' + esc(g.name) + '</span><i class="wb-dot" style="background:' + (COL[g.status] || COL.available) + '" title="' + esc(g.status) + '"></i></b><div class="wb-bar' + (g.pct >= 100 ? ' is-full' : g.pct >= 70 ? ' is-high' : '') + '"><i style="width:' + Math.min(100, g.pct) + '%"></i></div><small>' + g.open + ' of ' + g.max + ' open &middot; ' + g.waiting + ' waiting</small>' + (flag ? '<span class="wb-flag">' + esc(flag) + '</span>' : '') + '</div>';
    }).join('');
    var inc = (d.incidents || []).map(function (i) { return '<div class="wb-inc"><span class="wb-bad">' + esc(i.title) + '</span><span>' + i.count + ' in ' + i.sinceMin + ' min</span></div>'; }).join('') || '<div class="wb-inc"><span class="wb-ok">No incident</span><span></span></div>';
    var ch = (d.channels || []).map(function (c) { var cls = c.state === 'ok' ? 'wb-ok' : c.state === 'warn' || c.state === 'quiet' ? 'wb-warn' : c.state === 'down' ? 'wb-bad' : ''; return '<div class="wb-ch"><span>' + esc(c.label) + '</span><span class="' + cls + '">' + (c.state === 'ok' ? 'OK' : c.state === 'quiet' ? 'quiet ' + mins(c.quietMin) : c.state === 'down' ? 'no messages ' + mins(c.quietMin) : c.state === 'warn' ? 'check' : esc(c.state.replace('_', ' '))) + '</span></div>'; }).join('');
    var wbk = d.waitBuckets || [0, 0, 0, 0];
    root.innerHTML = '<div class="wb-head"><h1>' + esc(d.brand || 'Live team') + '</h1><span id="wbAt"></span></div>' + (alerts ? '<div class="wb-alerts">' + alerts + '</div>' : '') +
      '<div class="wb-tiles">' + tile(t.waitingNow, 'waiting for a reply', t.waitingNow > 0 ? 'warn' : 'ok') + tile(t.longestMin == null ? '&ndash;' : mins(t.longestMin), 'longest wait', t.longestMin != null && t.longestMin >= (d.waitMin || 10) ? 'bad' : '') + tile(t.slaBreached, 'past SLA', t.slaBreached > 0 ? 'bad' : t.slaRisk > 0 ? 'warn' : 'ok') +
      tile(t.unassigned, 'no owner', t.unassigned > 0 ? 'warn' : 'ok') + tile(t.arrivals.last60, 'new this hour' + (diff ? ' (' + (diff > 0 ? '+' : '') + diff + ')' : '')) + tile(t.available.n + '/' + t.available.total, 'available', t.available.n === 0 && t.waitingNow > 0 ? 'bad' : '') + '</div>' +
      '<div class="wb-row"><section class="wb-panel"><h2>Team</h2><div class="wb-agents">' + (agents || '<div class="wb-msg">No agents yet</div>') + '</div></section>' +
      '<div class="wb-side"><section class="wb-panel"><h2>How long customers have waited</h2><div class="wb-buckets"><div><b>' + wbk[0] + '</b><span>0-5 min</span></div><div><b>' + wbk[1] + '</b><span>5-15</span></div><div><b>' + wbk[2] + '</b><span>15-60</span></div><div><b>' + wbk[3] + '</b><span>60+ min</span></div></div></section>' +
      '<section class="wb-panel"><h2>Incidents</h2>' + inc + '</section><section class="wb-panel"><h2>Channels</h2>' + (ch || '<div class="wb-inc"><span>No channels yet</span><span></span></div>') + '</section><section class="wb-panel"><h2>Waiting, last 24 h</h2>' + spark(d.trend) + '</section></div></div>';
    showAt();
  }
  function showAt() { var el = document.getElementById('wbAt'); if (!el || !last) return; var s = Math.round((Date.now() - last) / 1000); el.textContent = 'Updated ' + (s < 5 ? 'just now' : s + ' s ago') + (failures ? ' (connection problem)' : ''); }
  function load() {
    fetch('/api/wall/' + encodeURIComponent(slug) + '/' + encodeURIComponent(token), { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) { root.innerHTML = '<div class="wb-msg">This link is not valid any more.<br><small>Ask your admin for a new one.</small></div>'; clearInterval(timer); return null; }
      return r.json();
    }).then(function (d) { if (!d) return; if (!d.success) throw new Error(d.error); failures = 0; last = Date.now(); draw(d); })
      .catch(function () { failures++; if (!last) root.innerHTML = '<div class="wb-msg">Could not load. Trying again...</div>'; else showAt(); });
  }
  var timer = setInterval(function () { if (!document.hidden) load(); }, 10000);
  setInterval(showAt, 1000);
  load();
  document.getElementById('wbFull').addEventListener('click', function () { var el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); });
  document.addEventListener('fullscreenchange', function () { document.body.classList.toggle('is-full', !!document.fullscreenElement); });
})();
