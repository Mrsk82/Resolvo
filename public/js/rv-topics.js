/* Topics: listen for a brand's keywords on the web. Every public mention becomes a ticket in Inbox, Listening.
   Server side: getTopics, saveTopic, previewTopic, runTopicNow, getTopicDetail and friends (server.js, lib/listening.js). */
(function (w) {
  'use strict';
  var A = function () { return App; }, RV = w.RV, esc = RV.esc;
  var S = { data: null, view: 'list', edit: null, detail: null, days: 14, preview: null, busy: false };
  var LANGS = [['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['ta', 'Tamil'], ['bn', 'Bengali'], ['mr', 'Marathi']];
  var COUNTRIES = [['', 'Anywhere'], ['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AE', 'UAE'], ['SG', 'Singapore'], ['AU', 'Australia'], ['CA', 'Canada'], ['DE', 'Germany']];
  var PLAT = { news: 'News', hn: 'Hacker News', bluesky: 'Bluesky', youtube: 'YouTube', web: 'Web', x: 'X', feeds: 'Feeds', tickets: 'My tickets' };
  var toast = function (m, k) { RV.toast(m, k); };
  var area = function () { return document.getElementById('contentArea'); };
  var ago = function (d) { var t = Date.parse(d); if (isNaN(t)) return 'never'; var m = Math.floor((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.floor(m / 60); if (h < 24) return h + ' h ago'; var dd = Math.floor(h / 24); return dd + ' day' + (dd === 1 ? '' : 's') + ' ago'; };
  var RVT = {};

  // ---------- the search, as people read it (same wording as the server) ----------
  function boolText(e) {
    var q = function (l) { return l.map(function (t) { return '"' + t + '"'; }).join(' OR '); };
    if (!e.contains.length) return 'Add a keyword to see the search.';
    return '(' + q(e.contains) + ')' + (e.andContains.length ? ' AND (' + q(e.andContains) + ')' : '') + (e.notContains.length ? ' NOT (' + q(e.notContains) + ')' : '');
  }

  // ---------- list ----------
  function spark(daily) {
    var max = Math.max.apply(null, daily.map(function (d) { return d.n; }).concat([1])), W = 110, H = 30, n = daily.length;
    var pts = daily.map(function (d, i) { return (i / (n - 1) * W).toFixed(1) + ',' + (H - 3 - d.n / max * (H - 6)).toFixed(1); }).join(' ');
    return '<svg class="rvt-spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mentions per day, last 14 days"><polyline points="' + pts + '" fill="none" stroke="var(--rv-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function statusPill(t) {
    if (t.active && !(t.pausedUntil && Date.parse(t.pausedUntil) > Date.now())) return RV.badge('Listening', 'success', { dot: true });
    if (t.pausedUntil && Date.parse(t.pausedUntil) > Date.now()) return RV.badge('Paused until ' + new Date(t.pausedUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), 'warning', { dot: true });
    return RV.badge('Off', '', { dot: true });
  }
  function card(t) {
    var src = Object.keys(t.sources).filter(function (k) { return t.sources[k]; }).map(function (k) { return '<span class="rvt-chip">' + esc(PLAT[k] || k) + '</span>'; }).join('');
    var on = t.active && !(t.pausedUntil && Date.parse(t.pausedUntil) > Date.now());
    return '<article class="rv-card rvt-card"><div class="rvt-card__top"><h3 class="rvt-card__name"><button type="button" class="rvt-link" data-tp="open" data-id="' + esc(t.id) + '">' + esc(t.name) + '</button></h3>' + statusPill(t) + '</div>' +
      '<code class="rvt-bool">' + esc(t.boolean) + '</code><div class="rvt-chips">' + src + '</div>' +
      '<div class="rvt-nums"><div><b>' + t.stats.today + '</b><span>today</span></div><div><b>' + t.stats.week + '</b><span>this week</span></div><div><b>' + t.stats.open + '</b><span>open</span></div>' + spark(t.stats.daily) + '</div>' +
      (t.lastRun && !t.lastCreated && !t.stats.total ? '<div class="rvt-none">Nothing matched in the last check' + (t.lastCounts && Object.keys(t.lastCounts).length ? ' (' + Object.keys(t.lastCounts).map(function (k) { return esc((PLAT[k] || k) + ' ' + t.lastCounts[k]); }).join(', ') + ')' : '') + '. Try fewer "and also" words or add more places. The free places have limited coverage, so X, YouTube and web search find the most.</div>' : '') +
      '<div class="rvt-meta">Last checked ' + esc(t.lastRun ? ago(t.lastRun) : 'not yet') + (t.lastCreated ? ' · ' + t.lastCreated + ' new' : '') + '</div>' +
      (t.lastError ? '<div class="rvt-warn">' + RV.icon('alert', 14) + '<span>' + esc(t.lastError) + '</span></div>' : '') +
      '<div class="rvt-acts">' + RV.btn({ label: 'Open', size: 'sm', kind: 'primary', attrs: { 'data-tp': 'open', 'data-id': t.id } }) + RV.btn({ label: 'Edit', size: 'sm', attrs: { 'data-tp': 'edit', 'data-id': t.id } }) +
      RV.btn({ label: on ? 'Pause' : 'Resume', size: 'sm', attrs: { 'data-tp': on ? 'pause' : 'resume', 'data-id': t.id } }) + RV.btn({ label: 'Check now', size: 'sm', attrs: { 'data-tp': 'run', 'data-id': t.id } }) +
      RV.btn({ label: 'Clone', size: 'sm', attrs: { 'data-tp': 'clone', 'data-id': t.id } }) + RV.btn({ label: 'Delete', size: 'sm', attrs: { 'data-tp': 'delete', 'data-id': t.id } }) + '</div></article>';
  }
  function planStrip(d) {
    var u = d.usage || {}, p = d.plan, bits = [p.tier + ' plan', d.topics.length + ' of ' + p.topics + ' topics', 'checked every ' + (p.everyMin / 60) + ' hour' + (p.everyMin === 60 ? '' : 's')];
    if (p.web) bits.push('web searches ' + (u.web || 0) + ' of ' + p.web + ' this month');
    if (p.x) bits.push('X posts read ' + (u.x || 0) + ' of ' + p.x + ' this month');
    return '<div class="rvt-strip">' + bits.map(function (b) { return '<span>' + esc(b) + '</span>'; }).join('') + '</div>';
  }
  function drawList() {
    var d = S.data, a = area();
    var head = RV.pageHead({ title: 'Topics', sub: 'Listen for your brand and keywords across the web. Every mention becomes a ticket in Inbox, Listening, so your team can assign it, add notes and keep track.',
      actions: d && d.success ? RV.btn({ label: 'New topic', kind: 'primary', icon: 'plus', attrs: { 'data-tp': 'new' } }) + RV.btn({ label: 'See all mentions', attrs: { 'data-tp': 'inbox' } }) : '' });
    if (!d || !d.success) {
      a.innerHTML = '<div class="rv rvt">' + head + RV.card({ body: RV.empty({ icon: 'sparkle', title: d && d.upgrade ? 'Topics are on the Pro and Enterprise plans' : 'Topics could not load', text: d && d.upgrade ? 'Watch the web for your brand name, product and competitors. Each mention arrives as a ticket in your inbox. Ask the owner of this workspace to upgrade, or look at the plans.' : (d && d.error) || 'Reload the page to try again.',
        actions: d && d.upgrade ? '<a class="rv-btn rv-btn--primary" href="/pitch#pricing" target="_blank" rel="noopener">See plans</a>' : RV.btn({ label: 'Try again', onclick: 'RVT.render()' }) }) }) + '</div>';
      return;
    }
    var ready = d.sources.filter(function (s) { return !s.ready && s.allowed; });
    var notice = ready.length ? RV.alert('info', RV.icon('alert', 16) + '<span>Not switched on yet for everyone: ' + ready.map(function (s) { return esc(s.label); }).join(', ') + '. The platform owner adds these.</span>') : '';
    a.innerHTML = '<div class="rv rvt">' + head + planStrip(d) + notice +
      (d.topics.length ? '<div class="rvt-grid">' + d.topics.map(card).join('') + '</div>' : RV.card({ body: RV.empty({ icon: 'sparkle', title: 'Nothing is being watched yet', text: 'Start with your brand name. Add words that must also appear to cut the noise, and words to leave out. Try it first to see what it would catch before anything becomes a ticket.', actions: RV.btn({ label: 'Create your first topic', kind: 'primary', icon: 'plus', attrs: { 'data-tp': 'new' } }) }) })) + '</div>';
  }

  // ---------- editor ----------
  var blank = function () { return { name: '', contains: [], andContains: [], notContains: [], sources: { news: true, hn: true, tickets: true }, feeds: [], feedsTrust: true, languages: [], country: '', excludeDomains: [], excludeHandles: [], xHandle: '', includeRetweets: false, includeReplies: false, assignTo: '', priority: 'Low', raiseOnNegative: true, dailyCap: 30, active: true }; };
  function tags(key, label, hint, ph) {
    var l = S.edit[key];
    return '<div class="rv-field"><label class="rv-label" for="t_' + key + '">' + esc(label) + '</label><div class="rvt-tags" id="g_' + key + '">' + l.map(function (t, i) { return '<span class="rvt-tag">' + esc(t) + '<button type="button" aria-label="Remove ' + esc(t) + '" onclick="RVT.tagRm(\'' + key + '\',' + i + ')">&times;</button></span>'; }).join('') +
      '<input id="t_' + key + '" class="rvt-taginput" placeholder="' + esc(ph || 'Type and press Enter') + '" onkeydown="RVT.tagKey(event,\'' + key + '\')" onblur="RVT.tagAdd(\'' + key + '\',this)"></div>' + (hint ? '<span class="rv-hint">' + esc(hint) + '</span>' : '') + '</div>';
  }
  function sourceCard(s) {
    var e = S.edit, off = !s.allowed || !s.ready, on = !off && !!e.sources[s.id];
    return '<label class="rvt-src' + (off ? ' is-off' : '') + '"><input type="checkbox" data-src="' + s.id + '"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + ' onchange="RVT.srcChange()"><span><b>' + esc(s.label) + '</b>' + (s.paid ? ' <em class="rvt-paid">Paid source</em>' : '') + '<small>' + esc(!s.allowed ? 'Not in your plan.' : !s.ready ? 'Not switched on yet.' : s.note) + '</small></span></label>';
  }
  function drawEdit() {
    var e = S.edit, d = S.data, a = area(), users = d.users || [];
    var opt = function (list, cur) { return list.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); };
    var tickets = '<label class="rvt-src"><input type="checkbox" data-src="tickets"' + (e.sources.tickets ? ' checked' : '') + ' onchange="RVT.srcChange()"><span><b>My own tickets</b><small>Tag tickets from the last 3 days that match, so you can filter by topic.</small></span></label>';
    a.innerHTML = '<div class="rv rvt">' + RV.pageHead({ title: e.id ? 'Edit topic' : 'New topic', sub: 'Say what to listen for, where, and what should happen with each mention.', actions: RV.btn({ label: 'Back to topics', attrs: { 'data-tp': 'list' } }) }) +
      '<div class="rvt-form"><div class="rv-stack">' +
      RV.card({ title: '1. What to listen for', body:
        RV.field({ id: 'tp_name', label: 'Topic name', control: '<input class="rv-input" id="tp_name" maxlength="60" value="' + esc(e.name) + '" placeholder="For example: Our brand">' }) +
        tags('contains', 'Contains', 'Any one of these words or phrases. Put a phrase in quotes or just type it. A star at the end finds longer words: refund*', 'For example: resolvo') +
        tags('andContains', 'And also contains (optional)', 'The mention must also have at least one of these. Use it to cut noise.', 'For example: helpdesk') +
        tags('notContains', 'Does not contain (optional)', 'Leave out any mention with these words.', 'For example: giveaway') +
        '<div class="rvt-bool" aria-live="polite"><span>The search</span><code id="rvtBool">' + esc(boolText(e)) + '</code></div>' }) +
      RV.card({ title: '2. Where to listen', body: '<div class="rvt-srcs">' + d.sources.map(sourceCard).join('') + tickets + '</div>' +
        '<div id="rvtFopts" class="rvt-xopts"' + (e.sources.feeds ? '' : ' hidden') + '>' + tags('feeds', 'Feed links', 'Up to 5. Press Enter after each one.', 'https://www.google.com/alerts/feeds/...') +
          '<label class="rvt-check"><input type="checkbox" id="tp_ft"' + (e.feedsTrust ? ' checked' : '') + '> Trust these feeds: keep every item except those with a "does not contain" word (right for Google Alerts, which already searched for you)</label>' +
          '<details class="rvt-how"><summary>How to get a free Google Alerts feed</summary><ol><li>Open google.com/alerts and sign in.</li><li>Type your keyword, for example <b>"Indian Idol"</b>, then click <b>Show options</b>.</li><li>Set <b>Deliver to</b> to <b>RSS feed</b>, then click <b>Create Alert</b>.</li><li>Click the orange RSS icon next to the alert and copy the link from the address bar.</li><li>Paste it above.</li></ol></details></div>' +
        '<div id="rvtXopts" class="rvt-xopts"' + (e.sources.x ? '' : ' hidden') + '>' + RV.field({ id: 'tp_xh', label: 'Your X handle (optional)', control: '<input class="rv-input" id="tp_xh" value="' + esc(e.xHandle) + '" placeholder="@yourbrand">', hint: 'Also catches posts that mention this handle.' }) +
        '<label class="rvt-check"><input type="checkbox" id="tp_rt"' + (e.includeRetweets ? ' checked' : '') + '> Include retweets</label><label class="rvt-check"><input type="checkbox" id="tp_rp"' + (e.includeReplies ? ' checked' : '') + '> Include replies</label></div>' +
        '<div class="rvt-two">' + RV.field({ id: 'tp_country', label: 'Country', control: '<select class="rv-select" id="tp_country">' + opt(COUNTRIES, e.country) + '</select>' }) +
        RV.field({ id: 'tp_lang', label: 'Language', control: '<select class="rv-select" id="tp_lang"><option value="">Any language</option>' + opt(LANGS, e.languages[0] || '') + '</select>' }) + '</div>' +
        tags('excludeDomains', 'Leave out these websites (optional)', 'Your own site and anyone you do not want, such as example.com.', 'example.com') +
        tags('excludeHandles', 'Leave out these profiles (optional)', 'Your own accounts, so you do not get tickets for your own posts.', '@yourbrand') }) +
      RV.card({ title: '3. What happens with each mention', body: '<div class="rvt-two">' +
        RV.field({ id: 'tp_assign', label: 'Give new mentions to', control: '<select class="rv-select" id="tp_assign"><option value="">Nobody (unassigned)</option>' + users.map(function (u) { return '<option value="' + esc(u.email) + '"' + (String(u.email).toLowerCase() === e.assignTo ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select>' }) +
        RV.field({ id: 'tp_pri', label: 'Priority', hint: 'Most mentions are routine. Low or Medium keeps your inbox calm.', control: '<select class="rv-select" id="tp_pri">' + ['Low', 'Medium', 'High'].map(function (p) { return '<option' + (p === e.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' }) + '</div>' +
        '<label class="rvt-check"><input type="checkbox" id="tp_neg"' + (e.raiseOnNegative ? ' checked' : '') + '> Raise the priority one step when the post sounds unhappy</label>' +
        RV.field({ id: 'tp_cap', label: 'Most tickets per day', control: '<input class="rv-input" id="tp_cap" type="number" min="1" max="200" value="' + esc(e.dailyCap) + '">', hint: 'A safety limit so a busy topic cannot flood your inbox (30 is plenty for most). A sudden jump still alerts you in the bell.' }) +
        '<label class="rvt-check"><input type="checkbox" id="tp_active"' + (e.active ? ' checked' : '') + '> Start listening as soon as it is saved</label>' }) +
      '<div class="rvt-bar">' + RV.btn({ label: 'Save topic', kind: 'primary', attrs: { 'data-tp': 'save' } }) + RV.btn({ label: 'Cancel', attrs: { 'data-tp': 'list' } }) + '</div></div>' +
      '<aside class="rvt-side"><div class="rv-card rvt-preview"><div class="rv-card__head"><h2 class="rv-card__title">Try it first</h2></div><div class="rv-card__body"><p class="rv-hint" style="margin:0 0 10px">See what this would catch right now. Nothing is saved and no tickets are made.</p>' +
        RV.btn({ label: 'Preview mentions', icon: 'search', attrs: { 'data-tp': 'preview' } }) + '<div id="rvtPrev" class="rvt-prev" aria-live="polite"></div></div></div></aside></div></div>';
  }
  function readForm() {
    var e = S.edit, g = function (id) { var x = document.getElementById(id); return x ? x : { value: '', checked: false }; };
    e.name = g('tp_name').value.trim(); e.country = g('tp_country').value; e.languages = g('tp_lang').value ? [g('tp_lang').value] : [];
    e.feedsTrust = document.getElementById('tp_ft') ? !!document.getElementById('tp_ft').checked : e.feedsTrust; e.xHandle = g('tp_xh').value.trim(); e.includeRetweets = !!g('tp_rt').checked; e.includeReplies = !!g('tp_rp').checked;
    e.assignTo = g('tp_assign').value; e.priority = g('tp_pri').value; e.raiseOnNegative = !!g('tp_neg').checked; e.dailyCap = parseInt(g('tp_cap').value, 10) || 30; e.active = !!g('tp_active').checked;
    ['contains', 'andContains', 'notContains', 'excludeDomains', 'excludeHandles', 'feeds'].forEach(function (k) { var i = document.getElementById('t_' + k); if (i && i.value.trim()) { RVT.tagAdd(k, i, true); } });
    e.sources = {}; document.querySelectorAll('[data-src]').forEach(function (c) { e.sources[c.getAttribute('data-src')] = !!c.checked && !c.disabled; });
    return e;
  }
  RVT.tagKey = function (ev, key) { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); RVT.tagAdd(key, ev.target); } else if (ev.key === 'Backspace' && !ev.target.value && S.edit[key].length) { S.edit[key].pop(); redrawTags(key); } };
  RVT.tagAdd = function (key, input, quiet) {
    var v = String(input.value || '').replace(/^["']|["']$/g, '').trim(); if (!v) return;
    if (key === 'feeds' && !/^https?:\/\/\S{4,}$/i.test(v)) { toast('A feed link starts with https://', 'warning'); return; }
    var l = S.edit[key]; if (l.map(function (x) { return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0 && l.length < 20) l.push(v.slice(0, key === 'feeds' ? 500 : 80));
    input.value = ''; if (!quiet) redrawTags(key, true);
  };
  RVT.tagRm = function (key, i) { S.edit[key].splice(i, 1); redrawTags(key); };
  function redrawTags(key, refocus) {
    var box = document.getElementById('g_' + key); if (!box) return;
    var tmp = document.createElement('div'); tmp.innerHTML = tags(key, '', '', '');
    box.innerHTML = tmp.querySelector('.rvt-tags').innerHTML;
    var b = document.getElementById('rvtBool'); if (b) b.textContent = boolText(S.edit);
    if (refocus) { var i = document.getElementById('t_' + key); if (i) i.focus(); }
  }
  RVT.srcChange = function () { var x = document.querySelector('[data-src="x"]'), box = document.getElementById('rvtXopts'); if (box && x) box.hidden = !x.checked; var f = document.querySelector('[data-src="feeds"]'), fb = document.getElementById('rvtFopts'); if (fb && f) fb.hidden = !f.checked; };

  async function preview() {
    var e = readForm(), box = document.getElementById('rvtPrev'); if (!box) return;
    box.innerHTML = '<p class="rv-hint" style="margin:0 0 8px">Searching. The news search can take up to a minute.</p>' + RV.skeleton(4);
    var r = await A().callAsync('previewTopic', e);
    if (!r || !r.success) { box.innerHTML = '<div class="rvt-warn">' + RV.icon('alert', 14) + '<span>' + esc((r && r.error) || 'Preview failed') + '</span></div>'; return; }
    var counts = Object.keys(r.counts).map(function (k) { return '<span class="rvt-chip">' + esc(PLAT[k] || k) + ' ' + r.counts[k] + '</span>'; }).join('');
    var errs = Object.keys(r.errors).map(function (k) { return '<div class="rvt-warn">' + RV.icon('alert', 14) + '<span><b>' + esc(PLAT[k] || k) + ':</b> ' + esc(r.errors[k]) + '</span></div>'; }).join('');
    box.innerHTML = '<div class="rvt-bool"><span>Searched for</span><code>' + esc(r.boolean) + '</code></div><p class="rvt-found"><b>' + r.total + '</b> mention' + (r.total === 1 ? '' : 's') + ' in the last day.</p><div class="rvt-chips">' + counts + '</div>' + errs +
      (r.items.length ? '<ul class="rvt-items">' + r.items.map(function (i) { return '<li><span class="rvt-chip">' + esc(PLAT[i.platform] || i.platform) + '</span><div><a href="' + esc(/^https?:/i.test(i.url) ? i.url : '#') + '" target="_blank" rel="noopener noreferrer">' + esc(i.title || i.text.slice(0, 90)) + '</a><small>' + esc(i.author || '') + (i.author ? ' · ' : '') + esc(ago(i.publishedAt)) + '</small></div></li>'; }).join('') + '</ul>' : '<p class="rv-hint">Nothing matched in the last day. Try fewer "and also" words, or add more keywords.</p>');
  }

  async function save() {
    var e = readForm();
    if (!e.name) { toast('Give the topic a name.', 'warning'); document.getElementById('tp_name').focus(); return; }
    if (!e.contains.length) { toast('Add at least one keyword in Contains.', 'warning'); document.getElementById('t_contains').focus(); return; }
    var r = await A().callAsync('saveTopic', e);
    if (!r || !r.success) { toast((r && r.error) || 'Could not save', 'error'); return; }
    toast('Topic saved' + (e.active ? '. Listening starts within 30 minutes.' : '.'), 'success');
    S.view = 'list'; await load();
  }

  // ---------- detail ----------
  function drawDetail() {
    var d = S.detail, a = area(), t = d.topic, V = w.RVDash && w.RVDash.views;
    var days = d.daily.map(function (x) { return x.date; });
    var chart = V ? V.line({ dates: days, label: 'Mentions per day', series: [{ label: 'Mentions', color: 'var(--rv-accent)', values: d.daily.map(function (x) { return x.n; }), area: true }], empty: 'No mentions in this period yet.' }) : '';
    var plat = d.platforms.length ? d.platforms.map(function (p) { var max = d.platforms[0].n; return '<div class="rvd-hbar s"><b>' + esc(p.label) + '</b><div class="t"><i style="width:' + (p.n / max * 100).toFixed(0) + '%"></i></div><span>' + p.n + '</span></div>'; }).join('') : '<div class="rvd-empty">No mentions yet.</div>';
    var cloud = V && d.words.length ? V.cloud(d.words.map(function (x) { return { word: x.word, n: x.n, prev: 0, change: 'flat' }; }), { static: true, compare: false, noSide: true }) : '<div class="rvd-empty">Not enough mentions yet.</div>';
    var recent = d.recent.length ? '<ul class="rvt-items rvt-items--big">' + d.recent.map(function (m) { return '<li><span class="rvt-chip">' + esc(PLAT[m.platform] || m.platform || '') + '</span><div><button type="button" class="rvt-link" data-tp="ticket" data-id="' + esc(m.id) + '">' + esc(m.title || m.id) + '</button><small>' + esc(ago(m.at)) + ' · ' + esc(m.status) + (m.sentiment === 'negative' ? ' · unhappy' : m.sentiment === 'positive' ? ' · happy' : '') + (m.assignedTo ? ' · ' + esc(m.assignedTo) : ' · unassigned') + '</small></div>' + (/^https?:/i.test(m.url || '') ? '<a class="rv-btn rv-btn--sm" href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">Open post</a>' : '') + '</li>'; }).join('') + '</ul>' : '<div class="rvd-empty">Nothing found yet. It checks every few hours, or press Check now.</div>';
    a.innerHTML = '<div class="rv rvt">' + RV.pageHead({ title: t.name, sub: t.boolean, actions: RV.btn({ label: 'Back to topics', attrs: { 'data-tp': 'list' } }) + RV.btn({ label: 'Check now', attrs: { 'data-tp': 'run', 'data-id': t.id } }) + RV.btn({ label: 'Edit', attrs: { 'data-tp': 'edit', 'data-id': t.id } }) + RV.btn({ label: 'All in inbox', kind: 'primary', attrs: { 'data-tp': 'inbox', 'data-tag': 'topic:' + t.name } }) }) +
      '<div class="rv-stack">' + RV.card({ title: 'Mentions per day', actions: RV.range([{ value: 7, label: '7d' }, { value: 14, label: '14d' }, { value: 30, label: '30d' }], d.days, 'RVT.setDays'), body: chart }) +
      '<div class="rv-grid rv-grid--2">' + RV.card({ title: 'Where they come from', body: plat }) + RV.card({ title: 'Mood', body: V ? V.mood(d.mood) : '' }) + '</div>' +
      RV.card({ title: 'Words that come up', body: cloud }) + RV.card({ title: 'Latest mentions', body: recent }) + '</div></div>';
  }
  RVT.setDays = function (n) { S.days = n; openDetail(S.detail.topic.id); };
  async function openDetail(id) {
    var r = await A().callAsync('getTopicDetail', id, S.days);
    if (!r || !r.success) { toast((r && r.error) || 'Could not open the topic', 'error'); return; }
    S.detail = r; S.view = 'detail'; drawDetail();
  }

  // ---------- actions ----------
  function find(id) { return (S.data.topics || []).filter(function (t) { return t.id === id; })[0]; }
  async function act(el) {
    var a = el.getAttribute('data-tp'), id = el.getAttribute('data-id'), t = id ? find(id) : null;
    if (a === 'new') { S.edit = blank(); S.view = 'edit'; drawEdit(); }
    else if (a === 'edit' && (t || (S.detail && S.detail.topic.id === id))) { var src = t || S.detail.topic; S.edit = JSON.parse(JSON.stringify(src)); S.edit.sources = Object.assign({}, src.sources); S.edit.feeds = S.edit.feeds || []; if (S.edit.feedsTrust === undefined) S.edit.feedsTrust = true; S.view = 'edit'; if (!S.data || !S.data.sources) await load(true); drawEdit(); }
    else if (a === 'list') { S.view = 'list'; await load(); }
    else if (a === 'open') openDetail(id);
    else if (a === 'save') save();
    else if (a === 'preview') preview();
    else if (a === 'pause' || a === 'resume') { var r = await A().callAsync('setTopicActive', id, a === 'resume', a === 'pause' ? 7 : 0); if (r && r.success) { toast(a === 'pause' ? 'Paused for 7 days. Resume any time.' : 'Listening again.', 'success'); await load(); } else toast((r && r.error) || 'Could not change it', 'error'); }
    else if (a === 'clone') { var c = await A().callAsync('cloneTopic', id); if (c && c.success) { toast('Copy made. It is paused until you switch it on.', 'success'); await load(); } else toast((c && c.error) || 'Could not clone', 'error'); }
    else if (a === 'run') {
      el.disabled = true; var rr = await A().callAsync('runTopicNow', id); el.disabled = false;
      if (rr && rr.success) { var errs = Object.keys(rr.errors || {}); toast(rr.created + ' new mention' + (rr.created === 1 ? '' : 's') + (errs.length ? '. Some places could not be checked.' : '.'), errs.length && !rr.created ? 'warning' : 'success'); if (S.view === 'detail') openDetail(id); else await load(); }
      else toast((rr && rr.error) || 'Could not check', 'error');
    }
    else if (a === 'delete' && t) {
      var ov = RV.modal({ title: 'Delete "' + t.name + '"?', body: '<p style="margin:0">It stops listening. The tickets it already made stay in your inbox.</p>', foot: RV.btn({ label: 'Cancel', onclick: 'RV.closeModal(this.closest(\'.rv-overlay\'))' }) + RV.btn({ label: 'Delete topic', kind: 'danger', attrs: { id: 'rvtDel' } }) });
      document.getElementById('rvtDel').onclick = async function () { RV.closeModal(ov); var d = await A().callAsync('deleteTopic', id); if (d && d.success) { toast('Topic deleted.', 'success'); await load(); } else toast((d && d.error) || 'Could not delete', 'error'); };
    }
    else if (a === 'inbox') { var A_ = A(); if (window.RVI) RVI.setView('mentions'); if (el.getAttribute('data-tag')) A_._ticketTag = el.getAttribute('data-tag'); A_.navigate('ticket-inbox'); }
    else if (a === 'ticket') { if (window.RVI) { RVI.preselect(id); RVI.setView('mentions'); } A().navigate('ticket-inbox'); }
  }

  async function load(silent) {
    S.data = await A().callAsync('getTopics');
    if (silent) return;
    if (S.view === 'edit' && S.data.success) drawEdit(); else drawList();
  }
  RVT.render = async function () {
    var a = A(); a.setPage('Topics', 'Topics');
    var el = area(); if (!el) return;
    el.innerHTML = '<div class="rv rvt"><div class="rv-card">' + RV.skeleton(5) + '</div></div>';
    S.view = 'list'; await load();
    if (!el._rvtBound) { el._rvtBound = true; el.addEventListener('click', function (ev) { var b = ev.target.closest('[data-tp]'); if (b && el.querySelector('.rvt')) act(b); }); }
  };
  w.RVT = RVT;
})(window);
