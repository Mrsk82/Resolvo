/* Resolvo inbox (RVI): three-panel ticket inbox for the Resolvo themes.
   It reuses the app's existing data calls and helpers (getTickets, replyToTicket, updateTicketStatus,
   assignTicket, TicketSavedViews, bulk actions, queue dashboard, customer card) and the existing filter
   state on `App`. If anything fails it falls back to the classic inbox. Nothing here sends a change to the
   server without checking the reply; a failed call shows an error and leaves the screen as it was. */
(function (w) {
  'use strict';
  var RVI = {};
  var A = function () { return App; };   // App is a script-level constant, so it is reached by name (not via window)
  var esc = function (s) { return w.RV.esc(s); };
  var S = { sel: null, ticket: null, tickets: [], total: 0, counts: {}, facets: { assignees: [], teams: [], tags: [] }, statuses: [], users: null, cls: null,
            drafts: {}, mode: 'reply', limit: 25, filtersOpen: false, canned: null, loaded: false, reqId: 0,
            focus: null, fAll: [], fTab: 'needs', fCur: 0, fOpen: null, fResolved: null, fTotal: 0, fKeys: null };
  var EXTRA = ['_ticketAssignee', '_ticketTeam', '_ticketTag', '_ticketFrom', '_ticketTo', '_ticketSla', '_ticketActive', '_ticketPromo'];
  // the server also sends counts that leave out promotions and automated alerts; those are the numbers people work from
  function normCounts(c) { c = c || {}; return Object.assign({}, c, c.inbox || {}, { raw: c }); }
  var KEYS = ['_ticketFilter', '_ticketChannel', '_ticketPriority', '_ticketSort', '_ticketSearch'].concat(EXTRA);

  // ---------- filter state (kept on App so the classic helpers and the dashboard links keep working) ----------
  function restore() {
    if (S.loaded) return; S.loaded = true;
    try { var o = JSON.parse(localStorage.getItem('tt_inbox_filters') || '{}'); KEYS.forEach(function (k) { if (A()[k] === undefined && o[k] !== undefined) A()[k] = o[k]; }); } catch (e) {}
  }
  function persist() { try { var o = {}; KEYS.forEach(function (k) { if (A()[k] !== undefined) o[k] = A()[k]; }); localStorage.setItem('tt_inbox_filters', JSON.stringify(o)); } catch (e) {} }
  function resetAll() { var a = A(); a._ticketFilter = 'all'; a._ticketChannel = 'all'; a._ticketPriority = 'all'; a._ticketSearch = ''; a._ticketSort = 'newest'; resetExtra(); }
  function resetExtra() { var a = A(); a._ticketAssignee = 'all'; a._ticketTeam = ''; a._ticketTag = ''; a._ticketFrom = ''; a._ticketTo = ''; a._ticketSla = ''; a._ticketActive = false; a._ticketPromo = ''; }
  function query() {
    var a = A();
    return { status: a._ticketFilter || 'all', channel: a._ticketChannel || 'all', priority: a._ticketPriority || 'all', sort: a._ticketSort || 'newest', search: a._ticketSearch || '', limit: S.limit,
      assignedTo: a._ticketAssignee || 'all', team: a._ticketTeam || '', tag: a._ticketTag || '', dateFrom: a._ticketFrom || '', dateTo: a._ticketTo || '', sla: a._ticketSla || '', active: !!a._ticketActive,
      promo: a._ticketPromo === 'only' ? 'only' : ((a._ticketSearch || '') ? 'all' : 'exclude') };
  }
  function currentView() {
    var a = A(), f = a._ticketFilter || 'all';
    var plain = (a._ticketChannel || 'all') === 'all' && !(a._ticketSearch) && (a._ticketAssignee || 'all') === 'all' && !a._ticketTeam && !a._ticketTag && !a._ticketFrom && !a._ticketTo;
    if (a._ticketPromo === 'only') return 'promo';
    if (a._ticketSla === 'breached') return 'sla-breached';
    if (a._ticketSla === 'atrisk') return 'sla-risk';
    if (a._ticketPriority === 'Critical' && a._ticketActive && f === 'all') return 'critical';
    if ((a._ticketPriority || 'all') !== 'all' || a._ticketSla) return 'custom';
    if (f === 'mine' || f === 'unassigned' || f === 'snoozed') return f;
    if (f === 'all' && plain) return 'all';
    return 'custom';
  }
  RVI.setView = function (v) {
    var a = A(); resetAll();
    if (v === 'mine' || v === 'unassigned' || v === 'snoozed') a._ticketFilter = v;
    else if (v === 'critical') { a._ticketPriority = 'Critical'; a._ticketActive = true; }
    else if (v === 'sla-risk') a._ticketSla = 'atrisk';
    else if (v === 'sla-breached') a._ticketSla = 'breached';
    else if (v === 'promo') a._ticketPromo = 'only';
    else if (/^status:/.test(String(v))) a._ticketFilter = String(v).slice(7).replace(/[^A-Za-z0-9_-]/g, '');
    S.limit = 25; persist();
  };

  function ago(d) { var a = A(); return a._relTime ? a._relTime(d) : (a._custAgo ? a._custAgo(d) : ''); }
  function statusLabel(id) { var s = (S.statuses || []).filter(function (x) { return x.id === id; })[0]; return s ? (s.label || s.id) : id; }
  function statusBadge(id) {
    var known = { new: 1, open: 1, pending: 1, 'on-hold': 1, escalated: 1, resolved: 1, closed: 1 };
    return known[String(id).toLowerCase()] ? w.RV.status(id) : w.RV.badge(statusLabel(id), '', { dot: true });
  }
  function slaChip(t) {
    if (['resolved', 'closed'].indexOf(t.status) >= 0) return '';
    if (t.slaBreached) return w.RV.badge('SLA breached', 'danger');
    if (t.slaRisk) return w.RV.badge('SLA ' + (t.slaHoursRemaining != null ? t.slaHoursRemaining + 'h left' : 'at risk'), 'warning');
    return '';
  }
  function channelName(c) { var m = { email: 'Email', whatsapp: 'WhatsApp', widget: 'Web widget', web: 'Website', sms: 'SMS', call: 'Call', manual: 'Manual', sample: 'Sample', voice: 'Voice' }; c = String(c || 'email').toLowerCase(); return m[c] || (c.charAt(0).toUpperCase() + c.slice(1)); }
  function selectHtml(id, label, options, value, wide) {
    return '<div class="rv-field' + (wide ? ' rv-field--wide' : '') + '"><label class="rv-label" for="' + id + '">' + esc(label) + '</label><select class="rv-select" id="' + id + '" data-filter="' + id + '">' +
      options.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(value) ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select></div>';
  }

  // ---------- panels ----------
  function viewsPanel() {
    var c = S.counts || {}, cur = currentView(), tsv = w.TicketSavedViews;
    var v = function (key, label, n, hot) { return '<button type="button" class="rvi-view" data-act="view" data-view="' + key + '" aria-current="' + (cur === key) + '"><span>' + esc(label) + '</span>' + (n != null ? '<span class="rvi-view__n' + (hot && n > 0 ? ' rvi-view__n--hot' : '') + '">' + n + '</span>' : '') + '</button>'; };
    var saved = '';
    if (tsv && tsv.getAll) {
      saved = '<h3>Saved views</h3>' + tsv.getAll().filter(function (x) { return ['all', 'mine', 'unassigned', 'critical'].indexOf(x.id) < 0; }).map(function (x) {
        return '<div class="rvi-saved"><button type="button" class="rvi-view" data-act="saved" data-id="' + esc(x.id) + '" aria-current="' + (tsv._isActive && tsv._isActive(x)) + '"><span>' + esc(x.name) + '</span></button><button type="button" class="rvi-saved__x" data-act="saved-del" data-id="' + esc(x.id) + '" aria-label="Delete saved view ' + esc(x.name) + '">&times;</button></div>';
      }).join('') + '<button type="button" class="rvi-view" data-act="save-view" style="color:var(--rv-link)"><span>+ Save current filters</span></button>';
    }
    return '<h3>Views</h3>' + v('mine', 'My tickets', c.mine) + v('unassigned', 'Unassigned', c.unassigned, true) + v('all', 'All tickets', c.all) + v('critical', 'Critical', c.critical, true) +
      v('sla-risk', 'SLA at risk', c.slaDue, true) + v('sla-breached', 'SLA breached', c.slaBreached, true) + v('snoozed', 'Snoozed', c.snoozed) + v('promo', 'Promotions & alerts', c.promo) + saved +
      '<div class="rvi-queue"><div id="queueAgentList"><span class="rv-hint">Loading queue...</span></div></div>';
  }
  function pillsRow() {
    var c = S.counts || {}, cur = currentView();
    var items = [['mine', 'Mine', c.mine], ['unassigned', 'Unassigned', c.unassigned], ['all', 'All', c.all], ['critical', 'Critical', c.critical], ['sla-risk', 'At risk', c.slaDue], ['sla-breached', 'Breached', c.slaBreached], ['snoozed', 'Snoozed', c.snoozed], ['promo', 'Promos', c.promo]];
    return '<div class="rvi-pills rv-tabs rv-tabs--pills" role="tablist" aria-label="Inbox views">' + items.map(function (i) {
      return '<button type="button" role="tab" class="rv-tab" data-act="view" data-view="' + i[0] + '" aria-selected="' + (cur === i[0]) + '">' + esc(i[1]) + (i[2] != null ? '<span class="rv-tab__count">' + i[2] + '</span>' : '') + '</button>'; }).join('') + '</div>';
  }
  function filterPanel() {
    var a = A(), f = S.facets || {};
    var stOpts = [{ v: 'all', l: 'All statuses' }].concat((S.statuses || []).map(function (s) { return { v: s.id, l: (s.label || s.id) + ' (' + ((S.counts || {})[s.id] || 0) + ')' }; }));
    var asg = [{ v: 'all', l: 'Anyone' }, { v: 'none', l: 'Unassigned' }].concat((f.assignees || []).map(function (u) { return { v: u.email, l: u.name + (u.count ? ' (' + u.count + ')' : '') }; }));
    var chOpts = [['all', 'All channels'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['widget', 'Web widget'], ['sms', 'SMS'], ['call', 'Call'], ['manual', 'Manual']].map(function (x) { return { v: x[0], l: x[1] }; });
    var prOpts = [['all', 'All priorities'], ['Critical', 'Critical'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']].map(function (x) { return { v: x[0], l: x[1] }; });
    var srt = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['priority', 'Priority'], ['sla', 'SLA risk']].map(function (x) { return { v: x[0], l: x[1] }; });
    var team = [{ v: '', l: 'Any team' }].concat((f.teams || []).map(function (x) { return { v: x.team, l: x.team + ' (' + x.count + ')' }; }));
    var tags = [{ v: '', l: 'Any tag' }].concat((f.tags || []).map(function (x) { return { v: x.tag, l: x.tag + ' (' + x.count + ')' }; }));
    return '<div class="rvi-filterpanel' + (S.filtersOpen ? ' is-open' : '') + '" id="rviFilters">' +
      selectHtml('f_status', 'Status', stOpts, a._ticketFilter && ['mine', 'unassigned', 'snoozed'].indexOf(a._ticketFilter) < 0 ? a._ticketFilter : 'all') +
      selectHtml('f_priority', 'Priority', prOpts, a._ticketPriority || 'all') + selectHtml('f_channel', 'Channel', chOpts, a._ticketChannel || 'all') + selectHtml('f_assignee', 'Assignee', asg, a._ticketAssignee || 'all') +
      selectHtml('f_team', 'Team', team, a._ticketTeam || '') + selectHtml('f_tag', 'Tag', tags, a._ticketTag || '') +
      '<div class="rv-field"><label class="rv-label" for="f_from">Created from</label><input class="rv-input" type="date" id="f_from" data-filter="f_from" value="' + esc(a._ticketFrom || '') + '"></div>' +
      '<div class="rv-field"><label class="rv-label" for="f_to">Created to</label><input class="rv-input" type="date" id="f_to" data-filter="f_to" value="' + esc(a._ticketTo || '') + '"></div>' +
      selectHtml('f_sort', 'Sort by', srt, a._ticketSort || 'newest', true) +
      '<div class="rv-field--wide" style="grid-column:1/-1"><button type="button" class="rv-btn rv-btn--sm" data-act="clear">Clear all filters</button></div></div>';
  }
  function chips() {
    var a = A(), out = [];
    var add = function (label, clear) { out.push('<button type="button" class="rvi-chip" data-act="chip" data-clear="' + clear + '" aria-label="Remove filter ' + esc(label) + '">' + esc(label) + '<i>&times;</i></button>'); };
    var f = a._ticketFilter || 'all';
    if (f !== 'all' && ['mine', 'unassigned', 'snoozed'].indexOf(f) < 0) add('Status: ' + statusLabel(f), 'status');
    if ((a._ticketChannel || 'all') !== 'all') add('Channel: ' + channelName(a._ticketChannel), 'channel');
    if ((a._ticketPriority || 'all') !== 'all' && currentView() !== 'critical') add('Priority: ' + a._ticketPriority, 'priority');
    if ((a._ticketAssignee || 'all') !== 'all') { var u = ((S.facets || {}).assignees || []).filter(function (x) { return x.email === a._ticketAssignee; })[0]; add('Assignee: ' + (a._ticketAssignee === 'none' ? 'Unassigned' : (u ? u.name : a._ticketAssignee)), 'assignee'); }
    if (a._ticketTeam) add('Team: ' + a._ticketTeam, 'team');
    if (a._ticketTag) add('Tag: ' + a._ticketTag, 'tag');
    if (a._ticketFrom || a._ticketTo) add('Created: ' + (a._ticketFrom || '...') + ' to ' + (a._ticketTo || '...'), 'dates');
    if (a._ticketSearch) add('Search: "' + a._ticketSearch + '"', 'search');
    return out.length ? '<div class="rvi-chips">' + out.join('') + '</div>' : '';
  }
  // Promotions and alerts view: say what it is and offer the clean-up (admins only)
  function promoBar() {
    if (currentView() !== 'promo') return '';
    var admin = A().currentUser && A().currentUser.role === 'Admin', n = (S.counts || {}).promo || 0;
    return '<div class="rvi-promo"><b>Newsletters and automated alerts</b><span class="rv-hint">These are kept out of your working queue. Anything that is really a customer can be moved back from the ticket menu.</span>' +
      (admin && n ? '<div class="rv-cluster">' + w.RV.btn({ label: 'Close all ' + n, size: 'sm', attrs: { 'data-act': 'promo-close' } }) + w.RV.btn({ label: 'Close all and block senders', size: 'sm', attrs: { 'data-act': 'promo-block' } }) + '</div>' : '') + '</div>';
  }
  // "Assign to..." for the selected tickets
  function assignSelect() {
    var us = ((S.facets || {}).assignees || []);
    return '<select class="rv-select rvi-assign" id="bulkAssignSel" aria-label="Assign selected tickets to" data-bulk="assign"><option value="">Assign to...</option><option value="__me">Me</option>' + us.map(function (u) { return '<option value="' + esc(u.email) + '">' + esc(u.name) + '</option>'; }).join('') + '</select>';
  }
  function filterCount() { var a = A(), n = 0; var f = a._ticketFilter || 'all'; if (f !== 'all' && ['mine', 'unassigned', 'snoozed'].indexOf(f) < 0) n++; ['_ticketChannel', '_ticketPriority', '_ticketAssignee'].forEach(function (k) { if ((a[k] || 'all') !== 'all') n++; }); ['_ticketTeam', '_ticketTag', '_ticketFrom', '_ticketTo'].forEach(function (k) { if (a[k]) n++; }); return n; }

  function rowHtml(t) {
    var a = A(), sel = S.sel === t.id, unread = !!t.unread, who = (t.fromName || t.from || 'Unknown');
    var prev = (t.lastMessage && t.lastMessage.body) ? String(t.lastMessage.body).replace(/\s+/g, ' ').trim().slice(0, 110) : '';
    var snoozed = t.snoozedUntil && new Date(t.snoozedUntil).getTime() > Date.now();
    var vip = t.isVIP || (t.tags || []).indexOf('VIP') >= 0;
    var asg = t.assignedTo ? ((S.facets.assignees || []).filter(function (u) { return String(u.email).toLowerCase() === String(t.assignedTo).toLowerCase(); })[0] || {}).name || t.assignedTo : '';
    // Quiet row: who, which channel, what it is about, and only the badges that need a decision
    // (SLA, High/Critical, a status other than Open, nobody assigned). Everything else lives in the conversation header.
    var done = ['resolved', 'closed'].indexOf(t.status) >= 0;
    var pri = (t.priority === 'Critical' || t.priority === 'High') ? w.RV.priority(t.priority) : '';
    var st = (t.status === 'open') ? '' : statusBadge(t.status);
    var owner = asg ? '<span class="rvi-row__owner">' + w.RV.avatar(asg, 'sm') + esc(String(asg).split(' ')[0]) + '</span>' : (done ? '' : '<span class="rvi-row__owner rvi-row__owner--none">Unassigned</span>');
    var badges = slaChip(t) + pri + st + (vip ? w.RV.badge('VIP', 'warning') : '') + (snoozed ? w.RV.badge('Snoozed', '') : '');
    return '<div class="ticket-row rvi-row' + (unread ? ' is-unread' : '') + '" role="option" tabindex="0" data-act="open" data-ticket-id="' + esc(t.id) + '" aria-selected="' + sel + '">' +
      '<input type="checkbox" class="ticket-checkbox" data-ticket-id="' + esc(t.id) + '" data-act="check" aria-label="Select ticket ' + esc(t.id) + '"' + (a._selectedTickets && a._selectedTickets.has(t.id) ? ' checked' : '') + '>' +
      '<span class="rvi-row__av">' + w.RV.avatar(who, null) + (unread ? '<i class="rvi-row__dot" title="Unread"></i>' : '') + '</span>' +
      '<div style="min-width:0"><div class="rvi-row__name"><b>' + esc(String(who).split('@')[0]) + '</b><span class="rvi-row__ch">' + esc(channelName(t.channel || t.source)) + '</span></div>' +
      '<div class="rvi-row__subj">' + esc(t.subject || '(No subject)') + '</div>' + (prev ? '<div class="rvi-row__prev">' + esc(prev) + '</div>' : '') +
      ((badges || owner) ? '<div class="rvi-row__tags">' + badges + owner + '</div>' : '') + '</div>' +
      '<div class="rvi-row__meta"><div>' + esc(ago(t.lastActivity || t.createdDate)) + '</div></div></div>';
  }
  function listRows() {
    if (!S.tickets.length) {
      var filtered = filterCount() > 0 || currentView() !== 'all';
      return w.RV.empty({ icon: 'inbox', title: filtered ? 'No tickets match these filters' : 'No tickets yet',
        text: filtered ? 'Try a different view or clear the filters.' : 'New customer messages will appear here. You can also load sample tickets or create one.',
        actions: filtered ? w.RV.btn({ label: 'Clear filters', attrs: { 'data-act': 'clear' } }) : w.RV.btn({ label: 'Create a ticket', kind: 'primary', onclick: 'App._showCreateManualTicket()' }) });
    }
    return '<div role="listbox" aria-label="Tickets" id="ticketListRows">' + S.tickets.map(rowHtml).join('') + '</div>' +
      (S.total > S.tickets.length ? '<div class="rvi-more">' + w.RV.btn({ label: 'Load more (' + (S.total - S.tickets.length) + ' left)', size: 'sm', attrs: { 'data-act': 'more' } }) + '</div>' : '');
  }
  function toolsHtml() {
    var a = A(), c = S.counts || {}, n = filterCount();
    var menu = w.RV.menu({ label: 'Inbox actions', items: [
      { label: 'Check inbox now', icon: 'mail', onclick: 'App._pollAndRefresh()' },
      c.new > 0 ? { label: 'Close all ' + c.new + ' new tickets', icon: 'check', onclick: "App._closeAllByStatus('new'," + c.new + ')' } : null,
      '-', { label: 'Email and spam settings', onclick: "App.navigate('email-ticketing')" }, { label: 'WhatsApp settings', onclick: "App.navigate('whatsapp-settings')" }, { label: 'Queue settings', onclick: "App.navigate('settings',{tab:'queue-config'})" },
      '-', { label: 'Use the classic inbox layout', onclick: 'RVI.useClassic(true)' }].filter(Boolean) });
    return '<div class="rvi-tools"><div class="rvi-tools__head"><span class="rvi-tools__title">Tickets</span><span class="rv-hint" id="rviCount" aria-live="polite">' + S.tickets.length + ' of ' + S.total + '</span><span style="flex:1"></span>' +
      '<button type="button" class="rv-btn rv-btn--sm rvi-viewsbtn" data-act="views-panel" title="Saved views and queue tools">Views</button>' +
      '<button type="button" class="rv-btn rv-btn--sm" data-act="focus-on" title="One calm queue, one ticket at a time">Focus mode</button></div>' +
      '<div class="rvi-tools__row"><input type="checkbox" id="selectAllTickets" data-act="checkall" aria-label="Select all tickets" style="accent-color:var(--rv-accent)">' +
      '<div style="flex:1;min-width:0">' + w.RV.search({ id: 'ticketSearch', placeholder: 'Search tickets', label: 'Search tickets', value: a._ticketSearch || '' }) + '</div>' +
      '<button type="button" class="rv-btn rv-btn--sm" data-act="filters" aria-expanded="' + S.filtersOpen + '" aria-controls="rviFilters">Filters' + (n ? ' (' + n + ')' : '') + '</button>' + menu + '</div>' +
      pillsRow() + filterPanel() + chips() + promoBar() +
      '<div id="ticketBulkBar" class="rvi-bulk"><span id="ticketSelectedCount" style="font-size:var(--rv-text-sm);font-weight:700">0 selected</span>' +
      assignSelect() + w.RV.btn({ label: 'Mark resolved', size: 'sm', attrs: { 'data-act': 'bulk-resolved' } }) + w.RV.btn({ label: 'Close', size: 'sm', attrs: { 'data-act': 'bulk-closed' } }) + w.RV.btn({ label: 'Delete', size: 'sm', kind: 'danger', attrs: { 'data-act': 'bulk-delete' } }) + w.RV.btn({ label: 'Clear', size: 'sm', kind: 'ghost', attrs: { 'data-act': 'bulk-clear' } }) + '</div></div>';
  }

  // ---------- render ----------
  RVI.render = async function () {
    var a = A(); restore();
    a.setPage('Support Inbox', 'Support / Tickets');
    var area = document.getElementById('contentArea');
    var fab = document.getElementById('quickCaptureFab'); if (fab) fab.style.display = 'none';
    area.innerHTML = '<div class="rv"><div class="rv-card">' + w.RV.skeleton(5) + '</div></div>';
    var admin = a.currentUser && a.currentUser.role === 'Admin', focus = focusOn();
    var res = await Promise.all([a.callAsync('getTickets', focus ? focusQuery() : query()), a.callAsync('getEmailTicketingConfig'), a.callAsync('getStatusConfig'),
      admin ? fetch('/api/email-ticketing/status', { headers: { 'x-session-token': a.sessionToken } }).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null)]);
    var r = res[0];
    if (!r || !r.success) throw new Error((r && r.error) || 'tickets did not load');
    S.counts = normCounts(r.counts); S.facets = r.facets || { assignees: [], teams: [], tags: [] };
    if (focus) { S.fAll = r.tickets || []; S.fTotal = r.total != null ? r.total : S.fAll.length; S.fResolved = null; S.tickets = S.fAll; S.total = S.fTotal; }
    else { S.tickets = r.tickets || []; S.total = r.total != null ? r.total : S.tickets.length; }
    S.statuses = (res[2] && res[2].success && res[2].statuses) ? res[2].statuses.slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); }) : [
      { id: 'new', label: 'New' }, { id: 'open', label: 'Open' }, { id: 'pending', label: 'Pending' }, { id: 'on-hold', label: 'On hold' }, { id: 'escalated', label: 'Escalated' }, { id: 'resolved', label: 'Resolved' }, { id: 'closed', label: 'Closed' }];
    a._customStatuses = S.statuses; a.allTickets = S.tickets; a._selectedTickets = a._selectedTickets || new Set();
    setTimeout(function () { if (a._syncMobileBadge) a._syncMobileBadge(); }, 0);
    var badge = document.getElementById('ticketNewBadge'); if (badge) { if (S.counts.new > 0) { badge.style.display = ''; badge.textContent = S.counts.new; } else badge.style.display = 'none'; }

    // connection banner: only when something needs attention
    var cfg = (res[1] && res[1].success && res[1].config) ? res[1].config : {}; var enabled = cfg.enabled === true, hasCred = !!(cfg.host && cfg.user && cfg.pass); var gmail = !!(cfg.gmailOAuth || cfg.gmailConnected);
    var ps = res[3] && res[3].success ? res[3].status : null, down = ps && !ps.healthy && ps.failureCount >= 3 && !gmail;
    var banner = '';
    if (!enabled && !gmail) banner = w.RV.alert('warning', w.RV.icon('alert', 16) + '<span style="flex:1">' + (hasCred ? '<b>Email ticketing is switched off.</b> No new emails will be fetched.' : '<b>Email is not connected yet.</b> Connect Gmail or IMAP so customer emails arrive as tickets.') + '</span>' + w.RV.btn({ label: hasCred ? 'Switch on' : 'Connect email', size: 'sm', kind: 'primary', onclick: "App.navigate('email-ticketing')" }));
    else if (down) banner = w.RV.alert('danger', w.RV.icon('alert', 16) + '<span style="flex:1"><b>Inbox disconnected.</b> New emails may not be arriving. ' + esc(ps.lastErrorFriendly || ps.lastError || '') + '</span>' + w.RV.btn({ label: 'Fix', size: 'sm', kind: 'danger', onclick: "App.navigate('email-ticketing')" }));

    if (focus) return drawFocus(area, banner);
    area.innerHTML = '<div class="rv rvi' + (banner ? ' rvi--banner' : '') + (S.sel ? ' is-reading' : '') + (S.custOpen ? ' rvi--cust-open' : '') + '" id="rvi">' + (banner ? '<div class="rvi-banner">' + banner + '</div>' : '') +
      '<div class="rvi-grid"><aside class="rvi-views" id="rviViews" aria-label="Inbox views">' + viewsPanel() + '</aside>' +
      '<section class="rvi-list" aria-label="Ticket list"><div id="rviTools">' + toolsHtml() + '</div><div class="rvi-rows" id="rviRows">' + listRows() + '</div></section>' +
      '<section class="rvi-conv" id="rviConv" aria-label="Conversation">' + convEmpty() + '</section>' +
      '<aside class="rvi-cust" id="rviCust" aria-label="Customer"><h3>Customer</h3><div id="rviCustBody"><span class="rv-hint">Select a ticket to see who it is from.</span></div></aside></div></div>';
    bind(document.getElementById('rvi'));
    if (a._updateTicketBulkBar) a._updateTicketBulkBar();
    if (a._loadQueueDashboard) a._loadQueueDashboard();
    if (S.sel) RVI.open(S.sel, true);
  };
  function convEmpty() { return '<div class="rvi-conv__empty">' + w.RV.empty({ icon: 'mail', title: 'Select a ticket', text: 'Pick a conversation from the list to read it, reply and manage it here.' }) + '</div>'; }

  // refresh only the list and counts (keeps the open conversation and any draft untouched)
  RVI.refresh = async function () {
    var a = A(); var r = await a.callAsync('getTickets', query());
    if (!r || !r.success) { w.RV.toast((r && r.error) || 'Could not refresh the list', 'error'); return; }
    S.tickets = r.tickets || []; S.total = r.total != null ? r.total : S.tickets.length; S.counts = r.counts ? normCounts(r.counts) : S.counts; S.facets = r.facets || S.facets; a.allTickets = S.tickets;
    var q = function (id) { return document.getElementById(id); };
    if (q('rviRows')) q('rviRows').innerHTML = listRows();
    if (q('rviViews')) q('rviViews').innerHTML = viewsPanel();
    if (q('rviTools')) { var had = document.activeElement && document.activeElement.id; var val = (q('ticketSearch') || {}).value; q('rviTools').innerHTML = toolsHtml(); if (had === 'ticketSearch' && q('ticketSearch')) { q('ticketSearch').focus(); q('ticketSearch').setSelectionRange(val.length, val.length); } }
    if (a._loadQueueDashboard) a._loadQueueDashboard();
    var badge = document.getElementById('ticketNewBadge'); if (badge) { if (S.counts.new > 0) { badge.style.display = ''; badge.textContent = S.counts.new; } else badge.style.display = 'none'; }
  };
  function change() { S.limit = 25; persist(); RVI.refresh(); }

  // ---------- conversation ----------
  RVI.open = async function (id, keepScroll) {
    var a = A(), root = document.getElementById('rvi'), conv = document.getElementById('rviConv'); if (!conv) return;
    S.sel = id; a._splitPaneTicketId = id; var my = ++S.reqId;
    if (root) { root.classList.add('is-reading'); }
    document.querySelectorAll('.rvi-row').forEach(function (r) { r.setAttribute('aria-selected', String(r.getAttribute('data-ticket-id') === id)); });
    conv.innerHTML = '<div class="rvi-conv__empty"><div style="width:min(420px,80%)">' + w.RV.skeleton(5) + '</div></div>';
    var res = await Promise.all([a.callAsync('getTicketById', id), S.users ? Promise.resolve(S.users) : a.callAsync('getUsers', true), S.cls ? Promise.resolve(S.cls) : a.callAsync('getClassificationConfig')]);
    if (my !== S.reqId) return;   // the user already opened another ticket
    var tr = res[0];
    if (!tr || !tr.success) { conv.innerHTML = '<div class="rvi-conv__empty">' + w.RV.empty({ icon: 'alert', title: 'This ticket could not be loaded', text: (tr && tr.error) || 'It may have been deleted.', actions: w.RV.btn({ label: 'Try again', onclick: "RVI.open('" + String(id).replace(/[^A-Za-z0-9_-]/g, '') + "')" }) }) + '</div>'; return; }
    S.ticket = tr.ticket; S.users = res[1]; S.cls = res[2];
    var cc = (S.cls && S.cls.config) || {}; a._clsDispositions = (cc.dispositions && cc.dispositions.length) ? cc.dispositions : a._clsDispositions; a._clsRequireDisposition = !!cc.requireDisposition;
    drawConv(keepScroll);
    a.callAsync('markTicketViewed', id).then(function () { var row = document.querySelector('.rvi-row[data-ticket-id="' + id + '"]'); if (row) { row.classList.remove('is-unread'); var d = row.querySelector('.rvi-row__dot'); if (d) d.remove(); } });
  };
  // ---------- reply helpers: waiting nudge, quick snooze, "/" for saved replies ----------
  function waitingNudge(t) {
    if (!t || isDone(t.status)) return '';
    var msgs = (t.thread || []).filter(function (m) { return m.type !== 'note'; }), last = msgs[msgs.length - 1];
    if (!last || last.type !== 'incoming' || !last.timestamp) return '';
    var h = (Date.now() - Date.parse(last.timestamp)) / 3600000; if (!(h >= 4)) return '';
    var txt = h >= 48 ? Math.round(h / 24) + ' days' : Math.round(h) + ' hours';
    return '<div class="rvi-nudge" role="status"><span aria-hidden="true">&#9201;</span> <b>' + esc(String(t.fromName || 'The customer').split(' ')[0]) + ' has been waiting ' + txt + ' for a reply.</b>' + (t.slaBreached ? ' The target time has passed.' : '') + '</div>';
  }
  function snoozeItems(t) {
    var id = String(t.id).replace(/[^A-Za-z0-9_-]/g, '');
    return [{ label: 'Snooze for 3 hours', onclick: "RVI.snooze('" + id + "','3h')" }, { label: 'Snooze until tomorrow 9am', onclick: "RVI.snooze('" + id + "','tomorrow')" }, { label: 'Snooze until Monday 9am', onclick: "RVI.snooze('" + id + "','monday')" }];
  }
  RVI.snooze = async function (id, kind) {
    var d = new Date(), a = A();
    if (kind === '3h') d = new Date(Date.now() + 3 * 3600000);
    else { d.setHours(9, 0, 0, 0); if (kind === 'monday') { do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 1); } else d.setDate(d.getDate() + 1); }
    var r = await a.callAsync('snoozeTicket', id, d.toISOString());
    if (!r || !r.success) { fail((r && r.error) || 'Could not snooze it'); return; }
    w.RV.toast('Snoozed until ' + d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '. It comes back to your queue then.', 'success');
    if (S.focus) { advance(id); } else { S.sel = null; var root = document.getElementById('rvi'); if (root) root.classList.remove('is-reading'); var cv = document.getElementById('rviConv'); if (cv) cv.innerHTML = convEmpty(); RVI.refresh(); }
  };
  // typing "/" at the start of a word in the reply box offers saved replies
  var slash = { items: [], active: 0, start: 0 };
  function slashClose() { var el = document.getElementById('rviSlash'); if (el) el.remove(); slash.items = []; }
  async function slashUpdate(ta) {
    var m = /(^|\s)\/([\w-]*)$/.exec(ta.value.slice(0, ta.selectionStart));
    if (!m || S.mode === 'note') { slashClose(); return; }
    if (!S.canned) { var cr = await A().callAsync('getCannedResponses'); S.canned = (cr && cr.responses) || []; }
    var q = m[2].toLowerCase(); slash.start = ta.selectionStart - m[2].length - 1;
    slash.items = (S.canned || []).filter(function (c) { return !q || (String(c.title || '') + ' ' + String(c.shortcut || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 6); slash.active = 0;
    var box = document.getElementById('rviSlash');
    if (!slash.items.length) { if (box) box.remove(); if (!S.canned.length) { w.RV.toast('No saved replies yet. Add some in Settings.', 'info'); } return; }
    if (!box) { box = document.createElement('div'); box.id = 'rviSlash'; box.className = 'rvi-slash'; box.setAttribute('role', 'listbox'); ta.parentNode.insertBefore(box, ta); }
    box.innerHTML = slash.items.map(function (c, i) { return '<button type="button" role="option" class="rvi-slash__item" data-act="slash" data-slash="' + i + '" aria-selected="' + (i === slash.active) + '"><b>' + esc(c.title || c.shortcut || 'Reply') + '</b><span>' + esc(String(c.body || c.text || c.content || '').slice(0, 80)) + '</span></button>'; }).join('');
  }
  function slashPick(i) {
    var c = slash.items[i], ta = document.getElementById('replyText'); if (!c || !ta) return;
    var body = String(c.body || c.text || c.content || ''), end = ta.selectionStart;
    ta.value = ta.value.slice(0, slash.start) + body + ta.value.slice(end); ta.selectionStart = ta.selectionEnd = slash.start + body.length; ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true })); slashClose();
  }
  function slashKey(e) {
    if (!slash.items.length) return false;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { slash.active = (slash.active + (k === 'ArrowDown' ? 1 : slash.items.length - 1)) % slash.items.length; document.querySelectorAll('.rvi-slash__item').forEach(function (b, i) { b.setAttribute('aria-selected', String(i === slash.active)); }); }
    else if (k === 'Enter' || k === 'Tab') slashPick(slash.active);
    else if (k === 'Escape') slashClose();
    else return false;
    e.preventDefault(); e.stopPropagation(); return true;
  }

  // a ticket that was raised to the tech team links to its issue (and back)
  function issueLink(t) {
    var id = t && t.linkedIssueId ? String(t.linkedIssueId).replace(/[^A-Za-z0-9_-]/g, '') : ''; if (!id) return '';
    return '<button type="button" class="rv-btn rv-btn--sm" title="This ticket was raised to the tech team" onclick="App.navigate(\'issue-detail\',{id:\'' + id + '\'})">Issue ' + esc(id) + ' &rarr;</button>';
  }
  function threadHtml(t) {
    return (t.thread || []).map(function (m) {
      var inc = m.type === 'incoming', note = m.type === 'note', who = m.fromName || m.from || (inc ? 'Customer' : 'Agent');
      // long emails (alerts, newsletters, quoted history) show the first part with a "Show full message" button
      var raw = m.body && String(m.body).trim() ? String(m.body).trim().replace(/\n{3,}/g, '\n\n').slice(0, 6000) : '';
      var long = raw.length > 700 || (raw.match(/\n/g) || []).length > 12;
      return '<div class="rvi-msg ' + (inc ? '' : (note ? 'rvi-msg--note' : 'rvi-msg--out')) + '">' + w.RV.avatar(who, null) + '<div class="rvi-msg__body"><div class="rvi-msg__who"><b>' + esc(who) + '</b>' + (note ? ' &middot; <span style="color:var(--rv-warning);font-weight:700">Internal note</span>' : '') + (m.timestamp ? ' &middot; ' + esc(ago(m.timestamp)) : '') + '</div>' +
        '<div class="rvi-bubble' + (long ? ' rvi-bubble--long is-clamped' : '') + '">' + (raw ? esc(raw) : '<span class="rv-hint">(No text content. Open the full page to see the original email.)</span>') + '</div>' +
        (long ? '<button type="button" class="rvi-more-msg" data-act="expand" aria-expanded="false">Show full message</button>' : '') + '</div></div>';
    }).join('') || '<div class="rv-hint" style="text-align:center">No messages yet.</div>';
  }
  function drawConv(keepScroll) {
    var a = A(), t = S.ticket, conv = document.getElementById('rviConv'); if (!t || !conv) return;
    var users = (S.users && S.users.users) || [];
    var priOpts = ['Critical', 'High', 'Medium', 'Low'];
    var stOpts = (S.statuses || []).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === t.status ? ' selected' : '') + '>' + esc(s.label || s.id) + '</option>'; }).join('');
    var asgOpts = '<option value="">Unassigned</option>' + users.map(function (u) { return '<option value="' + esc(u.email) + '"' + (String(u.email).toLowerCase() === String(t.assignedTo || '').toLowerCase() ? ' selected' : '') + '>' + esc(u.name || u.email) + '</option>'; }).join('');
    var thread = threadHtml(t);
    var draft = S.drafts[t.id + ':' + S.mode] || '';
    var isNote = S.mode === 'note';
    var who0 = t.fromName || t.from || 'Customer';
    conv.innerHTML =
      '<header class="rvi-conv__head"><button type="button" class="rv-iconbtn rvi-back" data-act="back" aria-label="Back to the ticket list">&larr;</button>' + w.RV.avatar(who0, null) +
        '<div class="rvi-conv__title"><h2 title="' + esc(t.subject) + '">' + esc(t.subject || '(No subject)') + '</h2><div class="rv-hint"><b class="rvi-conv__who">' + esc(who0) + '</b>' + (t.from && t.from !== who0 ? ' &lt;' + esc(t.from) + '&gt;' : '') + ' &middot; ' + esc(channelName(t.channel || t.source)) + ' &middot; ' + esc(t.id) + ' &middot; opened ' + esc(ago(t.createdDate)) + '</div></div>' +
        '<div class="rv-cluster" style="flex-wrap:nowrap">' + '<button type="button" class="rv-btn rv-btn--sm rvi-custbtn" data-act="cust" aria-label="Show customer details">Customer</button>' +
        w.RV.menu({ label: 'Ticket actions', items: [{ label: 'Open full page', onclick: "App.navigate('ticket-detail',{id:'" + String(t.id).replace(/[^A-Za-z0-9_-]/g, '') + "'})" }, { label: 'Snooze, escalate and more', onclick: "App._showTicketMoreMenu(this,'" + String(t.id).replace(/[^A-Za-z0-9_-]/g, '') + "')" }].concat(snoozeItems(t), ['-', currentView() === 'promo' ? { label: 'This is a real customer: move to inbox', onclick: "document.querySelector('#rviMoveBack').click()" } : null, { label: 'Mark as spam and block sender', onclick: "App._markTicketSpam('" + String(t.id).replace(/[^A-Za-z0-9_-]/g, '') + "')" }].filter(Boolean)) }) + '<button type="button" id="rviMoveBack" data-act="not-promo" hidden></button></div></header>' +
      '<div class="rvi-conv__bar"><select class="rv-select" id="c_status" data-conv="status" aria-label="Status">' + stOpts + '</select>' +
        '<select class="rv-select" id="c_priority" data-conv="priority" aria-label="Priority">' + priOpts.map(function (p) { return '<option' + (p === t.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
        '<select class="rv-select" id="c_assignee" data-conv="assignee" aria-label="Assignee">' + asgOpts + '</select>' + slaChip(t) + issueLink(t) +
        '<span style="flex:1"></span>' + (['resolved', 'closed'].indexOf(t.status) < 0 ? w.RV.btn({ label: 'Resolve', kind: 'primary', size: 'sm', icon: 'check', attrs: { 'data-act': 'resolve' } }) : '') + '</div>' +
      waitingNudge(t) + '<div class="rvi-thread" id="rviThread">' + thread + '</div>' +
      '<div class="rvi-composer' + (isNote ? ' rvi-composer--note' : '') + '">' +
        '<div class="rvi-composer__top"><div class="rv-tabs rv-tabs--pills" role="tablist" aria-label="Reply type"><button type="button" role="tab" class="rv-tab" data-act="mode" data-mode="reply" aria-selected="' + !isNote + '">Reply to customer</button><button type="button" role="tab" class="rv-tab" data-act="mode" data-mode="note" aria-selected="' + isNote + '">Internal note</button></div>' +
        '<span class="rv-hint rvi-composer__to">' + (isNote ? 'Only your team sees this' : 'To ' + esc(t.from || 'the customer')) + '</span></div>' +
        '<div id="aiSuggestBox_' + esc(t.id) + '"></div>' +
        '<textarea class="rv-textarea" id="replyText" aria-label="' + (isNote ? 'Internal note' : 'Reply') + '" placeholder="' + (isNote ? 'Write a note for your team...' : 'Write a reply... (type / for saved replies)') + '">' + esc(draft) + '</textarea>' +
        '<div class="rv-cluster">' + (isNote ? '' : w.RV.btn({ label: 'AI suggestion', icon: 'sparkle', size: 'sm', attrs: { 'data-act': 'ai', id: 'aiSuggestTrigger_' + t.id } })) +
          w.RV.btn({ label: 'Saved replies', size: 'sm', attrs: { 'data-act': 'canned' } }) + '<span style="flex:1"></span><span class="rvi-kbdhint"><kbd class="rvi-kbd">Ctrl</kbd> <kbd class="rvi-kbd">Enter</kbd></span>' +
          w.RV.btn({ label: isNote ? 'Add note' : 'Send reply', kind: 'primary', attrs: { 'data-act': 'send', id: 'rviSend' } }) + '</div></div>';
    if (!keepScroll) { var th = document.getElementById('rviThread'); if (th) th.scrollTop = th.scrollHeight; }
    var cb = document.getElementById('rviCustBody');
    if (cb) { cb.innerHTML = '<div id="crmPanel_' + esc(t.id) + '"></div>' + ((t.tags && t.tags.length) ? '<h3 style="margin-top:14px">Tags</h3><div class="rv-cluster">' + t.tags.map(function (g) { return w.RV.badge(g, 'accent'); }).join('') + '</div>' : '') + (t.disposition || t.type ? '<h3 style="margin-top:14px">Classification</h3><div class="rv-hint">' + esc([t.type, t.disposition].filter(Boolean).join(' / ')) + '</div>' : ''); if (a._loadCrmPanel) a._loadCrmPanel(t.id, t.from, t.fromName); }
  }

  // ---------- actions ----------
  async function bulkAssign(sel) {
    var a = A(), ids = a._selectedTickets ? Array.from(a._selectedTickets) : [], who = sel.value; if (!who || !ids.length) return;
    if (who === '__me') who = (a.currentUser || {}).email;
    var r = await a.callAsync('bulkAssignTickets', ids, who);
    if (!r || !r.success) { sel.value = ''; fail((r && r.error) || 'Nothing was assigned'); return; }
    w.RV.toast('Assigned ' + r.assigned + ' ticket' + (r.assigned === 1 ? '' : 's'), 'success'); a._selectedTickets.clear(); RVI.refresh();
  }
  function fail(msg) { w.RV.toast(msg || 'That did not work. Nothing was changed.', 'error'); }
  // The same ticket view is shown in the three-panel inbox and in Focus mode; these two keep whichever is on screen up to date.
  function reopen(id, keep) { return S.focus ? focusOpenId(id, keep) : RVI.open(id, keep); }
  function relist() { return S.focus ? focusRefresh() : RVI.refresh(); }
  function redraw(keep) { return S.focus ? drawFocusRead(keep) : drawConv(keep); }
  function isDone(status) { return ['resolved', 'closed'].indexOf(status) >= 0; }
  // Resolving or closing can require a disposition first (a setting). Returns true when one must be chosen.
  function needsDisposition(t, status) {
    var cfg = (S.statuses || []).filter(function (s) { return s.id === status; })[0];
    var needs = cfg ? cfg.requireClassification : (status === 'resolved' || status === 'closed');
    return !!(needs && A()._clsRequireDisposition && !t.disposition);
  }
  // Asks for a disposition, saves it, and only then runs `proceed`. Nothing moves if the save fails.
  function askDisposition(t, status, proceed) {
    var a = A(), id = t.id, disps = a._clsDispositions || [];
    var ov = w.RV.modal({ title: 'Choose a disposition', body: '<p style="margin:0 0 12px;color:var(--rv-text-muted)">A disposition is required before this ticket can be ' + esc(status) + '.</p><select class="rv-select" id="rviDisp"><option value="">Select why it is being closed</option>' + disps.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select>',
      foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Continue', kind: 'primary', attrs: { id: 'rviDispOk' } }) });
    ov.querySelector('#rviDispOk').addEventListener('click', async function () {
      var d = ov.querySelector('#rviDisp').value; if (!d) { w.RV.toast('Please choose a disposition', 'error'); return; }
      var r1 = await a.callAsync('updateTicketField', id, 'disposition', d);
      if (!r1 || r1.success === false) { fail((r1 && r1.error) || 'Could not save the disposition'); return; }
      t.disposition = d; w.RV.closeModal(ov); proceed();
    });
  }
  RVI.setStatus = async function (id, status, selEl) {
    var t = S.ticket; if (!t || t.id !== id) return;
    if (needsDisposition(t, status)) { if (selEl) selEl.value = t.status; askDisposition(t, status, function () { doStatus(id, status, null); }); return; }
    doStatus(id, status, selEl);
  };
  async function doStatus(id, status, selEl) {
    var a = A(); var r = await a.callAsync('updateTicketStatus', id, status);
    if (!r || r.success === false) { if (selEl && S.ticket) selEl.value = S.ticket.status; fail((r && r.error) || 'The status was not changed.'); return; }
    w.RV.toast('Status set to ' + statusLabel(status), 'success'); await reopen(id, true); relist();
  }
  async function setField(kind, id, value, selEl) {
    var a = A(), r = kind === 'priority' ? await a.callAsync('updateTicketPriority', id, value) : await a.callAsync('assignTicket', id, value);
    if (!r || r.success === false) { if (selEl && S.ticket) selEl.value = kind === 'priority' ? S.ticket.priority : (S.ticket.assignedTo || ''); fail((r && r.error) || 'That change was not saved.'); return; }
    w.RV.toast(kind === 'priority' ? 'Priority updated' : 'Assignee updated', 'success'); await reopen(id, true); relist();
  }
  async function send() {
    var a = A(), t = S.ticket, ta = document.getElementById('replyText'), btn = document.getElementById('rviSend'); if (!t || !ta || S.fBusy) return;
    var text = ta.value.trim(); if (!text) { w.RV.toast('Write something first', 'error'); return; }
    var isNote = S.mode === 'note'; S.fBusy = true; busy(true);
    var r = await a.callAsync('replyToTicket', t.id, text, isNote);
    S.fBusy = false; busy(false);
    if (!r || !r.success) { fail('Not sent: ' + String((r && r.error) || 'please try again').replace(/[.]+$/, '') + '. Your text is still here.'); return; }
    delete S.drafts[t.id + ':' + S.mode]; w.RV.toast(isNote ? 'Note added' : 'Reply sent', 'success');
    await reopen(t.id); relist();
  }
  // grey out the send buttons while a request is running so nothing is sent twice
  function busy(on) { document.querySelectorAll('#rviSend, #rvfSendNext').forEach(function (b) { b.disabled = on; b.classList.toggle('is-loading', on); }); }
  // ================= Focus mode =================
  // One calm queue sorted by urgency; open a ticket to read and answer it full width, then move on with
  // "Send and resolve, then next". It uses the same calls, drafts and status rules as the three-panel inbox.
  var PRI = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  var lc = function (s) { return String(s || '').toLowerCase(); };
  function focusOn() {
    if (S.focus == null) { var v = null; try { v = localStorage.getItem('tt_inbox_focus'); } catch (e) {} S.focus = v === '1' ? true : v === '0' ? false : w.innerWidth < 720; }
    return !!S.focus;
  }
  function focusQuery() { return { status: 'all', channel: 'all', priority: 'all', sort: 'sla', search: '', limit: 200, assignedTo: 'all', active: true, promo: 'exclude' }; }
  RVI.setFocus = function (on) { S.focus = !!on; S.sel = null; S.fOpen = null; S.fTab = 'needs'; try { localStorage.setItem('tt_inbox_focus', on ? '1' : '0'); } catch (e) {} A().renderTicketInbox(); };
  RVI.leaveFocus = function () { S.focus = false; S.fOpen = null; };   // a link that names a view (dashboard) shows the full inbox
  RVI.isFocus = function () { return focusOn(); };
  RVI.preselect = function (id) { S.sel = id; };   // the next inbox render opens this ticket
  RVI.startFocus = function () { S.focus = true; S.sel = null; S.fOpen = null; S.fTab = 'needs'; try { localStorage.setItem('tt_inbox_focus', '1'); } catch (e) {} A().navigate('ticket-inbox'); };
  function urgencyCmp(x, y) {
    var sx = x.slaBreached ? 0 : (x.slaRisk ? 1 : 2), sy = y.slaBreached ? 0 : (y.slaRisk ? 1 : 2);
    if (sx !== sy) return sx - sy;
    var px = PRI[x.priority] != null ? PRI[x.priority] : 4, py = PRI[y.priority] != null ? PRI[y.priority] : 4;
    if (px !== py) return px - py;
    if (!!x.unread !== !!y.unread) return x.unread ? -1 : 1;
    return (Date.parse(x.createdDate) || 0) - (Date.parse(y.createdDate) || 0);   // oldest first
  }
  function me() { return lc((A().currentUser || {}).email); }
  function needsYou(t) { return !t.awaitingCustomer && (!t.assignedTo || lc(t.assignedTo) === me()); }
  function fList() {
    var all = S.fAll || [], e = me(), tab = S.fTab, out;
    if (tab === 'resolved') return (S.fResolved || []).slice();
    if (tab === 'waiting') out = all.filter(function (t) { return t.awaitingCustomer; });
    else if (tab === 'mine') out = all.filter(function (t) { return lc(t.assignedTo) === e; });
    else if (tab === 'unassigned') out = all.filter(function (t) { return !t.assignedTo; });
    else if (tab === 'all') out = all.slice();
    else out = all.filter(needsYou);
    return out.sort(urgencyCmp);
  }
  function greeting() {
    var h = new Date().getHours(), u = A().currentUser || {}, first = String(u.name || u.email || '').split(/[ @]/)[0];
    return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '');
  }
  function statsHtml() {
    var c = S.counts || {}, needs = (S.fAll || []).filter(needsYou).length;
    var card = function (tab, label, n, hot) { return '<button type="button" class="rvf-stat' + (hot && n > 0 ? ' rvf-stat--hot' : '') + '" data-act="ftab" data-tab="' + tab + '" aria-pressed="' + (S.fTab === tab) + '"><span>' + label + '</span><b>' + n + '</b></button>'; };
    return card('needs', 'Needs you now', needs, true) + card('waiting', 'Waiting on customer', c.waiting || 0) + card('resolved', 'Resolved today', c.resolvedToday || 0);
  }
  function tabsHtml() {
    var items = [['needs', 'Needs you'], ['all', 'All open'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['waiting', 'Waiting'], ['resolved', 'Resolved today']];
    return '<div class="rv-tabs rv-tabs--pills rvf-tabs" role="tablist" aria-label="Queue">' + items.map(function (i) { return '<button type="button" role="tab" class="rv-tab" data-act="ftab" data-tab="' + i[0] + '" aria-selected="' + (S.fTab === i[0]) + '">' + i[1] + '</button>'; }).join('') + '</div>';
  }
  function itemHtml(t, i) {
    var who = t.fromName || t.from || 'Unknown', prev = (t.lastMessage && t.lastMessage.body) ? String(t.lastMessage.body).replace(/\s+/g, ' ').trim().slice(0, 130) : '';
    var flag = slaChip(t) || statusBadge(t.status);
    return '<button type="button" class="rvf-item' + (i === S.fCur ? ' is-focus' : '') + (t.unread ? ' is-unread' : '') + '" role="option" data-act="fopen" data-i="' + i + '" data-ticket-id="' + esc(t.id) + '">' +
      w.RV.avatar(who, 'lg') +
      '<span class="rvf-item__main"><span class="rvf-item__name"><b>' + esc(String(who).split('@')[0]) + '</b><span class="rvi-row__ch">' + esc(channelName(t.channel || t.source)) + '</span>' + (t.unread ? '<i class="rvi-row__dot rvf-dot" title="Unread"></i>' : '') + '</span>' +
      '<span class="rvf-item__subj">' + esc(t.subject || '(No subject)') + '</span>' + (prev ? '<span class="rvf-item__prev">' + esc(prev) + '</span>' : '') + '</span>' +
      '<span class="rvf-item__side">' + flag + '<span class="rv-hint">' + esc(ago(t.lastActivity || t.createdDate)) + '</span></span></button>';
  }
  function emptyQueue() {
    var m = { needs: ['check', 'You are all caught up', 'Nothing needs you right now. New customer messages will show up here.'], waiting: ['clock', 'Nothing is waiting on a customer', 'Tickets you have answered will wait here until the customer replies.'],
      resolved: ['check', 'Nothing resolved yet today', 'Tickets you resolve today will be listed here.'], mine: ['inbox', 'Nothing is assigned to you', 'Tickets assigned to you will appear here.'], unassigned: ['inbox', 'No unassigned tickets', 'Every open ticket has an owner.'], all: ['inbox', 'No open tickets', 'New customer messages will appear here. You can also create a ticket.'] }[S.fTab] || ['inbox', 'No tickets', ''];
    return w.RV.empty({ icon: m[0], title: m[1], text: m[2] });
  }
  function queueHtml() {
    var list = fList(); S.fIds = list.map(function (t) { return t.id; });
    if (S.fCur >= list.length) S.fCur = Math.max(0, list.length - 1);
    if (!list.length) return emptyQueue();
    return '<div class="rvf-q" id="rvfList" role="listbox" aria-label="Tickets">' + list.map(itemHtml).join('') + '</div>' +
      (S.fTab !== 'resolved' && S.fTotal > (S.fAll || []).length ? '<p class="rv-hint rvf-note">Showing the ' + S.fAll.length + ' most urgent of ' + S.fTotal + ' open tickets. Use the full inbox to see the rest.</p>' : '');
  }
  function paintQueue() {
    var q = function (id) { return document.getElementById(id); };
    if (q('rvfStats')) q('rvfStats').innerHTML = statsHtml();
    if (q('rvfTabs')) q('rvfTabs').innerHTML = tabsHtml();
    if (q('rvfBody')) q('rvfBody').innerHTML = queueHtml();
  }
  function drawFocus(area, banner) {
    area.innerHTML = '<div class="rv rvf' + (banner ? ' rvf--banner' : '') + (S.fOpen ? ' is-reading' : '') + '" id="rvf">' + (banner ? '<div class="rvi-banner">' + banner + '</div>' : '') +
      '<section class="rvf-queue" id="rvfQueue" aria-label="Your queue"><div class="rvf-head"><div><h1>' + esc(greeting()) + '</h1><p class="rv-hint">One queue, sorted by what needs you first.</p></div>' +
      '<button type="button" class="rv-btn rv-btn--sm" data-act="focus-off">Full inbox</button></div>' +
      '<div class="rvf-stats" id="rvfStats">' + statsHtml() + '</div><div id="rvfTabs">' + tabsHtml() + '</div><div id="rvfBody" class="rvf-body">' + queueHtml() + '</div></section>' +
      '<section class="rvf-read" id="rvfRead" aria-label="Conversation"></section>' +
      '<div class="rvf-keys" aria-hidden="true"><span><kbd class="rvi-kbd">J</kbd> <kbd class="rvi-kbd">K</kbd> move</span><span><kbd class="rvi-kbd">Enter</kbd> open</span><span><kbd class="rvi-kbd">R</kbd> reply</span><span><kbd class="rvi-kbd">E</kbd> resolve</span><span><kbd class="rvi-kbd">Esc</kbd> back</span></div></div>';
    bind(document.getElementById('rvf')); bindKeys();
    var badge = document.getElementById('ticketNewBadge'); if (badge) { if (S.counts.new > 0) { badge.style.display = ''; badge.textContent = S.counts.new; } else badge.style.display = 'none'; }
    if (S.fOpen) focusOpenId(S.fOpen, true);
  }
  // reload counts and the queue quietly (the ticket being read and any draft are left alone)
  async function focusRefresh() {
    var a = A(), r = await a.callAsync('getTickets', focusQuery());
    if (!r || !r.success || !document.getElementById('rvf')) return;
    S.fAll = r.tickets || []; S.fTotal = r.total != null ? r.total : S.fAll.length; S.counts = r.counts ? normCounts(r.counts) : S.counts; S.tickets = S.fAll; a.allTickets = S.fAll;
    if (S.fTab === 'resolved') await loadResolved();
    if (!S.fOpen) paintQueue(); else { var st = document.getElementById('rvfStats'); if (st) st.innerHTML = statsHtml(); }
    var badge = document.getElementById('ticketNewBadge'); if (badge) { if (S.counts.new > 0) { badge.style.display = ''; badge.textContent = S.counts.new; } else badge.style.display = 'none'; }
  }
  async function loadResolved() {
    var a = A(), day = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10), out = [];
    var rs = await Promise.all(['resolved', 'closed'].map(function (s) { return a.callAsync('getTickets', { status: s, sort: 'newest', limit: 100 }); }));
    rs.forEach(function (r) { if (r && r.success) out = out.concat((r.tickets || []).filter(function (t) { return String(t.resolvedDate || '').slice(0, 10) === day; })); });
    S.fResolved = out.sort(function (x, y) { return String(y.resolvedDate).localeCompare(String(x.resolvedDate)); });
  }
  async function focusTab(tab) {
    S.fTab = tab; S.fCur = 0;
    if (tab === 'resolved' && S.fResolved == null) { await loadResolved(); }
    paintQueue();
  }
  function moveFocus(d) {
    var items = document.querySelectorAll('#rvfList .rvf-item'); if (!items.length) return;
    S.fCur = Math.max(0, Math.min(items.length - 1, S.fCur + d));
    items.forEach(function (el, i) { el.classList.toggle('is-focus', i === S.fCur); });
    items[S.fCur].scrollIntoView({ block: 'nearest' });
  }
  async function focusOpenId(id, keep) {
    var a = A(), root = document.getElementById('rvf'), read = document.getElementById('rvfRead'); if (!root || !read) return;
    S.fOpen = id; var my = ++S.reqId, i = (S.fIds || []).indexOf(id); if (i >= 0) S.fCur = i;
    root.classList.add('is-reading');
    if (!keep || !S.ticket || S.ticket.id !== id) read.innerHTML = '<div class="rvf-loading">' + w.RV.skeleton(5) + '</div>';
    var res = await Promise.all([a.callAsync('getTicketById', id), S.users ? Promise.resolve(S.users) : a.callAsync('getUsers', true), S.cls ? Promise.resolve(S.cls) : a.callAsync('getClassificationConfig')]);
    if (my !== S.reqId) return;   // another ticket was opened, or the user went back
    var tr = res[0];
    if (!tr || !tr.success) { read.innerHTML = '<div class="rvf-rhead"><button type="button" class="rv-btn rv-btn--ghost" data-act="fback">&larr; Queue</button></div>' + w.RV.empty({ icon: 'alert', title: 'This ticket could not be loaded', text: (tr && tr.error) || 'It may have been deleted.' }); return; }
    S.ticket = tr.ticket; S.users = res[1]; S.cls = res[2];
    var cc = (S.cls && S.cls.config) || {}; a._clsDispositions = (cc.dispositions && cc.dispositions.length) ? cc.dispositions : a._clsDispositions; a._clsRequireDisposition = !!cc.requireDisposition;
    drawFocusRead(keep);
    a.callAsync('markTicketViewed', id);
  }
  function drawFocusRead(keep) {
    var a = A(), t = S.ticket, read = document.getElementById('rvfRead'); if (!t || !read) return;
    var ids = S.fIds || [], idx = ids.indexOf(t.id), n = ids.length, users = (S.users && S.users.users) || [];
    var who = t.fromName || t.from || 'Customer', isNote = S.mode === 'note', draft = S.drafts[t.id + ':' + S.mode] || '', done = isDone(t.status);
    var asgName = '', u = users.filter(function (x) { return lc(x.email) === lc(t.assignedTo); })[0]; if (t.assignedTo) asgName = u ? (u.name || u.email) : t.assignedTo;
    var stOpts = (S.statuses || []).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === t.status ? ' selected' : '') + '>' + esc(s.label || s.id) + '</option>'; }).join('');
    var asgOpts = '<option value="">Unassigned</option>' + users.map(function (x) { return '<option value="' + esc(x.email) + '"' + (lc(x.email) === lc(t.assignedTo) ? ' selected' : '') + '>' + esc(x.name || x.email) + '</option>'; }).join('');
    var safeId = String(t.id).replace(/[^A-Za-z0-9_-]/g, '');
    read.innerHTML =
      '<div class="rvf-rhead"><button type="button" class="rv-btn rv-btn--ghost" data-act="fback">&larr; Queue</button><span class="rv-hint" id="rvfPos" aria-live="polite">' + (idx >= 0 ? (idx + 1) + ' of ' + n : '') + '</span><span style="flex:1"></span>' +
        '<button type="button" class="rv-iconbtn" data-act="fprev" aria-label="Previous ticket (K)"' + (idx <= 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="rv-iconbtn" data-act="fnext" aria-label="Next ticket (J)"' + (idx < 0 || idx >= n - 1 ? ' disabled' : '') + '>&darr;</button>' +
        w.RV.menu({ label: 'Ticket actions', items: [{ label: 'Open full page', onclick: "App.navigate('ticket-detail',{id:'" + safeId + "'})" }, { label: 'Snooze, escalate and more', onclick: "App._showTicketMoreMenu(this,'" + safeId + "')" }].concat(snoozeItems(t), ['-', { label: 'Mark as spam and block sender', onclick: "App._markTicketSpam('" + safeId + "')" }]) }) + '</div>' +
      '<article class="rvf-card"><header class="rvf-card__head">' + w.RV.avatar(who, 'lg') + '<div style="flex:1;min-width:0"><h2>' + esc(t.subject || '(No subject)') + '</h2>' +
        '<div class="rv-hint"><b class="rvi-conv__who">' + esc(who) + '</b>' + (t.from && t.from !== who ? ' &lt;' + esc(t.from) + '&gt;' : '') + ' &middot; ' + esc(channelName(t.channel || t.source)) + ' &middot; ' + esc(t.id) + ' &middot; opened ' + esc(ago(t.createdDate)) + '</div>' +
        '<div class="rv-cluster" style="margin-top:8px">' + statusBadge(t.status) + w.RV.priority(t.priority) + slaChip(t) + (asgName ? w.RV.badge(asgName, '') : w.RV.badge('Unassigned', 'danger')) + issueLink(t) + '</div></div></header>' +
        '<div class="rvf-folds"><details class="rvf-fold"><summary>Status, priority and owner</summary><div class="rvf-fold__body">' +
          '<select class="rv-select" id="c_status" data-conv="status" aria-label="Status">' + stOpts + '</select>' +
          '<select class="rv-select" id="c_priority" data-conv="priority" aria-label="Priority">' + ['Critical', 'High', 'Medium', 'Low'].map(function (p) { return '<option' + (p === t.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
          '<select class="rv-select" id="c_assignee" data-conv="assignee" aria-label="Assignee">' + asgOpts + '</select></div></details>' +
        '<details class="rvf-fold" id="rvfCust"><summary data-act="fcust">Customer details</summary><div class="rvf-fold__body rvf-fold__body--block"><div id="crmPanel_' + esc(t.id) + '"><span class="rv-hint">Loading...</span></div>' + ((t.tags && t.tags.length) ? '<div class="rv-cluster" style="margin-top:10px">' + t.tags.map(function (g) { return w.RV.badge(g, 'accent'); }).join('') + '</div>' : '') + '</div></details></div>' +
        '<div class="rvi-thread rvf-thread" id="rviThread">' + threadHtml(t) + '</div></article>' + waitingNudge(t) +
      '<div class="rvf-composer' + (isNote ? ' rvi-composer--note' : '') + '">' +
        '<div class="rvi-composer__top"><div class="rv-tabs rv-tabs--pills" role="tablist" aria-label="Reply type"><button type="button" role="tab" class="rv-tab" data-act="mode" data-mode="reply" aria-selected="' + !isNote + '">Reply</button><button type="button" role="tab" class="rv-tab" data-act="mode" data-mode="note" aria-selected="' + isNote + '">Internal note</button></div>' +
        '<span class="rv-hint rvi-composer__to">' + (isNote ? 'Only your team sees this' : 'To ' + esc(t.from || 'the customer')) + '</span></div>' +
        '<div id="aiSuggestBox_' + esc(t.id) + '"></div>' +
        '<textarea class="rv-textarea" id="replyText" aria-label="' + (isNote ? 'Internal note' : 'Reply') + '" placeholder="' + (isNote ? 'Write a note for your team... (R)' : 'Write a reply... (R)') + '">' + esc(draft) + '</textarea>' +
        '<div class="rv-cluster">' + (isNote ? '' : w.RV.btn({ label: 'AI suggestion', icon: 'sparkle', size: 'sm', attrs: { 'data-act': 'ai', id: 'aiSuggestTrigger_' + t.id } })) + w.RV.btn({ label: 'Saved replies', size: 'sm', attrs: { 'data-act': 'canned' } }) +
          '<span style="flex:1"></span>' + w.RV.btn({ label: isNote ? 'Add note' : 'Send', attrs: { 'data-act': 'send', id: 'rviSend' } }) +
          (isNote ? '' : w.RV.btn({ label: done ? 'Send, then next' : 'Send & resolve, then next', kind: 'primary', attrs: { 'data-act': 'send-resolve', id: 'rvfSendNext' } })) + '</div>' +
        '<div class="rvi-kbdhint rvf-hintline" aria-hidden="true"><kbd class="rvi-kbd">R</kbd> reply &middot; <kbd class="rvi-kbd">E</kbd> resolve &middot; <kbd class="rvi-kbd">J</kbd> <kbd class="rvi-kbd">K</kbd> next / previous &middot; <kbd class="rvi-kbd">Esc</kbd> queue</div></div>';
    // open at the latest message (the thread scrolls inside the card; on a phone the page scrolls instead)
    if (!keep) { var sc = document.getElementById('contentArea'); if (sc) sc.scrollTop = 0; var th = document.getElementById('rviThread'); if (th) th.scrollTop = th.scrollHeight; }
  }
  // Move to the next ticket in the queue the user was working through. The finished ticket is dropped from it.
  function advance(doneId) {
    var ids = S.fIds || [], i = ids.indexOf(doneId); if (i >= 0) ids.splice(i, 1);
    S.fAll = (S.fAll || []).filter(function (x) { return x.id !== doneId; }); S.fResolved = null;
    ['reply', 'note'].forEach(function (m) { delete S.drafts[doneId + ':' + m]; });
    var next = i >= 0 && ids[i] != null ? ids[i] : null;
    if (next) focusOpenId(next); else focusBack();
    focusRefresh();
  }
  function focusBack() {
    S.fOpen = null; ++S.reqId; var root = document.getElementById('rvf'); if (root) root.classList.remove('is-reading');
    paintQueue(); var sc = document.getElementById('contentArea'); if (sc) sc.scrollTop = 0;
  }
  function focusStep(d) {
    var t = S.ticket, ids = S.fIds || [], i = t ? ids.indexOf(t.id) : -1, j = i + d; if (i < 0 || j < 0 || j >= ids.length) return;
    var ta = document.getElementById('replyText'); if (ta && t) S.drafts[t.id + ':' + S.mode] = ta.value;
    focusOpenId(ids[j]);
  }
  // Resolve the open ticket and move on. With a reply: send it first, resolve only if it was sent.
  async function focusResolve(withReply) {
    var a = A(), t = S.ticket; if (!t || S.fBusy) return;
    var ta = document.getElementById('replyText'), text = ta ? ta.value.trim() : '', isNote = S.mode === 'note', already = isDone(t.status);
    if (withReply && isNote) { w.RV.toast('Switch to Reply to send this to the customer', 'error'); return; }
    if (withReply && !text) { w.RV.toast('Write a reply first, or press E to resolve without one', 'error'); return; }
    if (!withReply && text && !isNote) { w.RV.toast('You have an unsent reply. Use "Send & resolve" to send it, or clear it first.', 'error'); return; }
    var run = async function () {
      if (S.fBusy) return; S.fBusy = true; busy(true);
      var ok = false;
      try {
        if (withReply) {
          var r = await a.callAsync('replyToTicket', t.id, text, false);
          if (!r || !r.success) { fail('Not sent: ' + String((r && r.error) || 'please try again').replace(/[.]+$/, '') + '. Your text is still here, and the ticket was not resolved.'); return; }
          delete S.drafts[t.id + ':reply'];
        }
        if (!already) {
          var r2 = await a.callAsync('updateTicketStatus', t.id, 'resolved');
          if (!r2 || r2.success === false) { fail((withReply ? 'Your reply was sent, but the ticket could not be resolved: ' : 'Not resolved: ') + String((r2 && r2.error) || 'please try again').replace(/[.]+$/, '') + '.'); if (withReply) { S.fBusy = false; await focusOpenId(t.id); } return; }
        }
        ok = true;
      } finally { S.fBusy = false; busy(false); }
      if (!ok) return;
      w.RV.toast(withReply ? (already ? 'Reply sent' : 'Reply sent and ticket resolved') : 'Ticket resolved', 'success');
      advance(t.id);
    };
    if (!already && needsDisposition(t, 'resolved')) askDisposition(t, 'resolved', run); else run();
  }
  // keyboard: only while the Focus screen is on, and never while typing or while a dialog is open
  function bindKeys() {
    if (S.fKeys) return; S.fKeys = true;
    document.addEventListener('keydown', function onKey(e) {
      if (!document.getElementById('rvf')) { document.removeEventListener('keydown', onKey, true); S.fKeys = false; return; }
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.rv-overlay')) return;
      var ae = document.activeElement, typing = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
      if (typing) { if (e.key === 'Escape' && !document.getElementById('rviSlash')) ae.blur(); return; }
      var k = e.key, reading = !!S.fOpen, took = true;
      if (k === 'j' || (k === 'ArrowDown' && !reading)) reading ? focusStep(1) : moveFocus(1);   // arrows only move in the queue; in a ticket they scroll
      else if (k === 'k' || (k === 'ArrowUp' && !reading)) reading ? focusStep(-1) : moveFocus(-1);
      else if (k === 'Enter' && !reading) { var it = document.querySelectorAll('#rvfList .rvf-item')[S.fCur]; if (it) focusOpenId(it.getAttribute('data-ticket-id')); else took = false; }
      else if (k === 'Escape' && reading) focusBack();
      else if ((k === 'r' || k === 'R') && reading) { var ta = document.getElementById('replyText'); if (ta) ta.focus(); else took = false; }
      else if ((k === 'e' || k === 'E') && reading) focusResolve(false);
      else took = false;
      // handled keys stop here, so the app's older single-key shortcuts (K = kanban, etc.) do not also fire
      if (took) { e.preventDefault(); e.stopPropagation(); }
    }, true);   // capture phase: runs before the app-wide shortcut handlers, which also blur a field on Esc
  }

  RVI.useClassic = function (on) { try { localStorage.setItem('tt_inbox_classic', on ? '1' : '0'); } catch (e) {} A().renderTicketInbox(); };

  // ---------- phone gestures: swipe right to take a ticket, swipe left to snooze it until tomorrow ----------
  async function swipeAct(id, kind) {
    var a = A(), r;
    if (kind === 'assign') r = await a.callAsync('assignTicket', id, (a.currentUser || {}).email);
    else { var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); r = await a.callAsync('snoozeTicket', id, d.toISOString()); }
    if (!r || !r.success) { fail((r && r.error) || 'That did not work'); return; }
    w.RV.toast(kind === 'assign' ? 'Assigned to you' : 'Snoozed until tomorrow 9am', 'success');
    if (S.focus) { if (kind !== 'assign') { S.fAll = (S.fAll || []).filter(function (x) { return x.id !== id; }); paintQueue(); } focusRefresh(); } else RVI.refresh();
  }
  function swipes(root) {
    var sw = null;
    root.addEventListener('touchstart', function (e) {
      var row = e.target.closest('.rvi-row, .rvf-item'); if (!row || e.target.closest('input,button:not(.rvf-item),select,a') || e.touches.length !== 1) return;
      sw = { row: row, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, lock: null };
    }, { passive: true });
    root.addEventListener('touchmove', function (e) {
      if (!sw) return; var t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      if (sw.lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) sw.lock = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
      if (sw.lock !== 'x') return;
      sw.dx = dx; sw.row.style.transform = 'translateX(' + Math.max(-140, Math.min(140, dx)) + 'px)'; sw.row.classList.toggle('is-swipe-r', dx > 70); sw.row.classList.toggle('is-swipe-l', dx < -70);
    }, { passive: true });
    root.addEventListener('touchend', function () {
      if (!sw) return; var x = sw; sw = null; x.row.style.transform = ''; x.row.classList.remove('is-swipe-r', 'is-swipe-l');
      if (x.lock !== 'x') return; var id = x.row.getAttribute('data-ticket-id');
      if (x.dx > 90) swipeAct(id, 'assign'); else if (x.dx < -90) swipeAct(id, 'snooze');
    });
    root.addEventListener('touchcancel', function () { if (sw) { sw.row.style.transform = ''; sw.row.classList.remove('is-swipe-r', 'is-swipe-l'); sw = null; } });
  }

  // ---------- events (one delegated set; no handler strings built from data) ----------
  var searchTimer = null;
  function bind(root) {
    if (!root) return;
    swipes(root);
    root.addEventListener('click', async function (e) {
      // a click on the list or the conversation closes whichever side panel is open
      if (!e.target.closest('.rvi-views, .rvi-cust, [data-act="views-panel"], [data-act="cust"], .rv-overlay, .rv-menu')) { root.classList.remove('rvi--views-open'); if (root.classList.contains('rvi--cust-open')) { root.classList.remove('rvi--cust-open'); S.custOpen = false; } }
      var el = e.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
      var act = el.getAttribute('data-act'), a = A();
      if (act === 'views-panel') { root.classList.toggle('rvi--views-open'); root.classList.remove('rvi--cust-open'); S.custOpen = false; return; }
      if (act === 'view' || act === 'saved') root.classList.remove('rvi--views-open');
      if (act === 'check') { e.stopPropagation(); a._toggleTicketSelect(el.getAttribute('data-ticket-id'), el.checked); return; }
      if (act === 'checkall') { a._selectAllTickets(el.checked); return; }
      if (act === 'open') { RVI.open(el.getAttribute('data-ticket-id')); return; }
      if (act === 'view') { RVI.setView(el.getAttribute('data-view')); a.renderTicketInbox(); return; }
      if (act === 'filters') { S.filtersOpen = !S.filtersOpen; var p = document.getElementById('rviFilters'); if (p) p.classList.toggle('is-open', S.filtersOpen); el.setAttribute('aria-expanded', String(S.filtersOpen)); return; }
      if (act === 'clear') { resetAll(); S.limit = 25; persist(); a.renderTicketInbox(); return; }
      if (act === 'chip') {
        var k = el.getAttribute('data-clear');
        if (k === 'status') a._ticketFilter = 'all'; else if (k === 'channel') a._ticketChannel = 'all'; else if (k === 'priority') a._ticketPriority = 'all'; else if (k === 'assignee') a._ticketAssignee = 'all';
        else if (k === 'team') a._ticketTeam = ''; else if (k === 'tag') a._ticketTag = ''; else if (k === 'dates') { a._ticketFrom = ''; a._ticketTo = ''; } else if (k === 'search') a._ticketSearch = '';
        persist(); a.renderTicketInbox(); return;
      }
      if (act === 'more') { S.limit += 25; RVI.refresh(); return; }
      if (act === 'saved') { w.TicketSavedViews.apply(el.getAttribute('data-id')); return; }
      if (act === 'saved-del') { w.TicketSavedViews.delete(el.getAttribute('data-id')); a.renderTicketInbox(); return; }
      if (act === 'save-view') { w.TicketSavedViews.promptSave(); return; }
      if (act === 'bulk-resolved') { a._bulkTicketAction('status', 'resolved'); return; }
      if (act === 'bulk-closed') { a._bulkTicketAction('status', 'closed'); return; }
      if (act === 'promo-close' || act === 'promo-block') {
        var block = act === 'promo-block', n0 = (S.counts || {}).promo || 0;
        var ov0 = w.RV.modal({ title: 'Close ' + n0 + ' promotions and alerts?', body: '<p style="margin:0">They are closed without emailing anyone.' + (block ? ' Their senders are also blocked, so they will not create tickets again.' : '') + ' You can still find them under Promotions and alerts.</p>',
          foot: w.RV.btn({ label: 'Cancel', onclick: "RV.closeModal(this.closest('.rv-overlay'))" }) + w.RV.btn({ label: 'Close ' + n0, kind: 'primary', attrs: { id: 'rviPromoOk' } }) });
        ov0.querySelector('#rviPromoOk').addEventListener('click', async function () {
          var r0 = await a.callAsync('closePromoTickets', { blockSenders: block });
          w.RV.closeModal(ov0);
          if (!r0 || !r0.success) { fail((r0 && r0.error) || 'Nothing was closed'); return; }
          w.RV.toast('Closed ' + r0.closed + ' tickets' + (block ? ' and blocked ' + r0.blocked + ' senders' : ''), 'success'); RVI.refresh();
        });
        return;
      }
      if (act === 'not-promo' && S.ticket) { var r1 = await a.callAsync('markNotPromo', S.ticket.id); if (!r1 || !r1.success) { fail('Could not move it'); return; } w.RV.toast('Moved back to your inbox', 'success'); RVI.refresh(); return; }
      if (act === 'bulk-delete') { a._bulkDeleteTickets(); return; }
      if (act === 'bulk-clear') { a._selectedTickets.clear(); document.querySelectorAll('.ticket-checkbox').forEach(function (c) { c.checked = false; }); a._updateTicketBulkBar(); return; }
      if (act === 'back') { root.classList.remove('is-reading'); S.sel = null; a._splitPaneTicketId = null; document.querySelectorAll('.rvi-row').forEach(function (r) { r.setAttribute('aria-selected', 'false'); }); return; }
      if (act === 'cust') { root.classList.toggle('rvi--cust-open'); S.custOpen = root.classList.contains('rvi--cust-open'); return; }
      if (act === 'resolve' && S.ticket) { RVI.setStatus(S.ticket.id, 'resolved', document.getElementById('c_status')); return; }
      if (act === 'mode') { var ta = document.getElementById('replyText'); if (ta && S.ticket) S.drafts[S.ticket.id + ':' + S.mode] = ta.value; S.mode = el.getAttribute('data-mode'); redraw(true); return; }
      if (act === 'slash') { slashPick(+el.getAttribute('data-slash')); return; }
      if (act === 'expand') { var bub = el.previousElementSibling, clamped = bub.classList.toggle('is-clamped'); el.textContent = clamped ? 'Show full message' : 'Show less'; el.setAttribute('aria-expanded', String(!clamped)); return; }
      if (act === 'focus-on') { RVI.setFocus(true); return; }
      if (act === 'focus-off') { RVI.setFocus(false); return; }
      if (act === 'ftab') { focusTab(el.getAttribute('data-tab')); return; }
      if (act === 'fopen') { S.fCur = +el.getAttribute('data-i') || 0; focusOpenId(el.getAttribute('data-ticket-id')); return; }
      if (act === 'fback') { focusBack(); return; }
      if (act === 'fprev') { focusStep(-1); return; }
      if (act === 'fnext') { focusStep(1); return; }
      if (act === 'fcust') { if (S.ticket && !el.closest('details').open && a._loadCrmPanel) a._loadCrmPanel(S.ticket.id, S.ticket.from, S.ticket.fromName); return; }
      if (act === 'send-resolve') { focusResolve(true); return; }
      if (act === 'ai' && S.ticket) { a._suggestAIReply(S.ticket.id); return; }
      if (act === 'canned') {
        if (!S.canned) { var cr = await a.callAsync('getCannedResponses'); S.canned = (cr && cr.responses) || []; }
        if (!S.canned.length) { w.RV.toast('No saved replies yet. Add some in Settings.', 'info'); return; }
        var ov = w.RV.modal({ title: 'Saved replies', body: '<div class="rv-stack" style="gap:6px">' + S.canned.map(function (c, i) { return '<button type="button" class="rv-menu__item" data-canned="' + i + '"><span><b>' + esc(c.title || c.shortcut || 'Reply') + '</b><br><span class="rv-hint">' + esc(String(c.body || c.text || c.content || '').slice(0, 90)) + '</span></span></button>'; }).join('') + '</div>' });
        ov.addEventListener('click', function (ev) { var b = ev.target.closest('[data-canned]'); if (!b) return; var c = S.canned[+b.getAttribute('data-canned')]; var ta2 = document.getElementById('replyText'); if (ta2 && c) { ta2.value = (ta2.value ? ta2.value + '\n' : '') + String(c.body || c.text || c.content || ''); ta2.dispatchEvent(new Event('input')); ta2.focus(); } w.RV.closeModal(ov); });
        return;
      }
      if (act === 'send') { send(); return; }
    });
    root.addEventListener('keydown', function (e) {
      if (e.target.id === 'replyText' && slashKey(e)) return;
      var row = e.target.closest && e.target.closest('.rvi-row[data-act="open"]');
      if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); RVI.open(row.getAttribute('data-ticket-id')); }
      else if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target === row) { var n = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling; if (n && n.classList.contains('rvi-row')) { e.preventDefault(); n.focus(); } }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'replyText') { e.preventDefault(); if (e.shiftKey && S.focus && S.mode !== 'note') focusResolve(true); else send(); }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'ticketSearch') { clearTimeout(searchTimer); var v = e.target.value; searchTimer = setTimeout(function () { A()._ticketSearch = v; change(); }, 350); }
      else if (e.target.id === 'replyText' && S.ticket) { S.drafts[S.ticket.id + ':' + S.mode] = e.target.value; slashUpdate(e.target); }
    });
    root.addEventListener('change', function (e) {
      var a = A(), el = e.target, f = el.getAttribute('data-filter'), c = el.getAttribute('data-conv');
      if (el.getAttribute('data-bulk') === 'assign') { bulkAssign(el); return; }
      if (f) {
        var v = el.value;
        if (f === 'f_status') { a._ticketFilter = v; a._ticketSla = ''; } else if (f === 'f_priority') { a._ticketPriority = v; a._ticketActive = false; } else if (f === 'f_channel') a._ticketChannel = v;
        else if (f === 'f_assignee') a._ticketAssignee = v; else if (f === 'f_team') a._ticketTeam = v; else if (f === 'f_tag') a._ticketTag = v;
        else if (f === 'f_from') a._ticketFrom = v; else if (f === 'f_to') a._ticketTo = v; else if (f === 'f_sort') a._ticketSort = v;
        S.filtersOpen = true; change(); return;
      }
      if (c && S.ticket) { if (c === 'status') RVI.setStatus(S.ticket.id, el.value, el); else if (c === 'priority') setField('priority', S.ticket.id, el.value, el); else if (c === 'assignee') setField('assignee', S.ticket.id, el.value, el); }
    });
  }

  w.RVI = RVI;
})(window);
