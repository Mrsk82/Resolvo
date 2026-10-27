/* Resolvo Settings (RVS): a landing page of cards with what needs attention, and a searchable side list around each section.
   The forms inside each section are the existing ones (App.renderUnifiedSettings fills #settingsContent); this file only draws the frame. */
(function (w) {
  'use strict';
  var RVS = {}, esc = function (s) { return w.RV.esc(s); };
  var GROUPS = [
    { key: 'Workspace', from: ['Core'], ico: '&#127970;', blurb: 'Company, hours, people and plan' },
    { key: 'Channels & replies', from: ['Email & Support'], ico: '&#9993;', blurb: 'Where tickets come from and how you answer' },
    { key: 'Workflow', from: ['Workflow'], ico: '&#9889;', blurb: 'Rules that move tickets along' },
    { key: 'Content', from: ['Content'], ico: '&#128218;', blurb: 'Help articles and a public roadmap' },
    { key: 'Integrations', from: ['Integrations'], ico: '&#128268;', blurb: 'Connect other tools' },
    { key: 'Security & privacy', from: ['Security', 'Compliance'], ico: '&#128737;', blurb: 'Protect accounts and data' }
  ];
  var DESC = {
    general: 'Company name, logo, support email and modules', sla: 'How fast you promise to reply and resolve, by priority', team: 'Invite people and set what they can do', 'shift-scheduling': 'Who is on duty and when',
    features: 'Your plan and what is switched on', 'advanced-features': 'AI, automation and extra tools for larger teams', 'api-tokens': 'Personal tokens for scripts', 'slack-alerts': 'Post new and breached tickets to Slack',
    security: 'Passwords, sessions and access controls', 'notify-prefs': 'What alerts and digests you get', 'data-export': 'Download your tickets and customers', email: 'Connect Gmail or IMAP so emails become tickets',
    canned: 'Saved replies for common questions', templates: 'Pre-filled tickets and acknowledgement templates', ooo: 'Auto-reply when nobody is online', 'csat-config': 'Ask customers to rate each resolved ticket',
    'nps-config': 'Periodic recommend-us survey', 'bot-rules': 'Instant answers from your knowledge base', 'queue-config': 'Share new tickets between agents', 'vip-config': 'Priority handling for key customers',
    'booking-config': 'Let customers book a time', 'customer-portal': 'A page where customers see their own tickets', 'ticket-classification': 'Ticket types and close reasons', 'status-management': 'The steps a ticket goes through',
    'issue-form': 'Choose the fields on the issue form', escalation: 'Warn or reassign when time runs short', automation: 'If this happens, do that', 'recurring-tkt': 'Create tickets on a schedule',
    'approval-rules': 'Manager sign-off before action', 'knowledge-base': 'Help articles for customers and the bot', roadmap: 'Show what you are building', integrations: 'Slack, WhatsApp, webhooks and more',
    'api-keys': 'Keys for other systems', 'developer-docs': 'API reference', 'two-fa': 'Second step when signing in', gdpr: 'Export or erase a customer’s data'
  };
  var CRM = [['Contacts', 'People you support and sell to', '/crm#contacts'], ['Companies', 'Organisations and accounts', '/crm#companies'], ['Deals & pipeline', 'Sales stages and values', '/crm#deals'], ['CRM dashboard', 'Pipeline value and won deals', '/crm']];
  var overview = null;
  function groupFor(tab) { var g = tab.group || 'Core'; return GROUPS.filter(function (x) { return x.from.indexOf(g) >= 0; })[0] || GROUPS[0]; }
  function stBadge(st) { return '<span class="rvs-st rvs-st--' + st + '">' + ({ ok: 'On', attn: 'Needs attention', off: 'Off' }[st] || '') + '</span>'; }
  async function load(app) { try { var r = await app.callAsync('getSettingsOverview'); overview = (r && r.success) ? r : { items: {}, attention: [] }; } catch (e) { overview = { items: {}, attention: [] }; } return overview; }
  function info(id) { return (overview && overview.items && overview.items[id]) || { st: 'off', v: '' }; }
  function go(id) { return "App.renderUnifiedSettings('" + String(id).replace(/[^A-Za-z0-9_-]/g, '') + "')"; }

  // ---- the landing page ----
  RVS.hub = async function (area, TABS, app) {
    await load(app);
    area.innerHTML = '<div class="rv rvs"><div class="rvs-head"><div><h1>Settings</h1><p class="rv-hint">Everything about how your workspace runs, grouped by what you are trying to do.</p></div>' +
      '<div class="rv-search rvs-search"><input id="rvsQ" class="rv-input" placeholder="Search all settings" aria-label="Search all settings" autocomplete="off"></div></div>' +
      '<div id="rvsAttn"></div><div class="rvs-hub" id="rvsHub"></div></div>';
    function draw(q) {
      q = (q || '').toLowerCase();
      var att = overview.attention || [];
      document.getElementById('rvsAttn').innerHTML = (!q && att.length) ? '<div class="rvs-label">Needs your attention</div><div class="rvs-attn">' + att.map(function (a) {
        return '<button type="button" class="rvs-acard" onclick="' + go(a.id) + '"><span aria-hidden="true">&#9888;&#65039;</span><div><b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span></div></button>'; }).join('') + '</div>' : '';
      var html = GROUPS.map(function (g) {
        var its = TABS.filter(function (t) { return groupFor(t) === g && (!q || (t.label + ' ' + (DESC[t.id] || '')).toLowerCase().indexOf(q) >= 0); });
        if (!its.length) return '';
        return '<section class="rvs-gcard"><h2><span aria-hidden="true">' + g.ico + '</span>' + esc(g.key) + '</h2><p class="rv-hint">' + esc(g.blurb) + '</p><div>' + its.map(function (t) {
          var i = info(t.id); return '<button type="button" class="rvs-glink" onclick="' + go(t.id) + '"><span>' + esc(t.label.replace(/^\S*\s?(?=Automation)/, '')) + '</span><small>' + (i.st === 'attn' ? stBadge('attn') : esc(i.v)) + '</small></button>'; }).join('') + '</div></section>'; }).join('');
      if (!q) html += '<section class="rvs-gcard"><h2><span aria-hidden="true">&#128101;</span>Customers (CRM)</h2><p class="rv-hint">Contacts, companies and deals</p><div>' + CRM.map(function (c) { return '<a class="rvs-glink" href="' + c[2] + '"><span>' + esc(c[0]) + '</span><small>' + esc(c[1]) + '</small></a>'; }).join('') + '</div></section>';
      document.getElementById('rvsHub').innerHTML = html || '<p class="rv-hint">Nothing matches. Try another word.</p>';
    }
    draw(''); var q = document.getElementById('rvsQ'); q.oninput = function () { draw(q.value); };
  };

  // ---- the frame around one section ----
  RVS.shell = async function (area, TABS, tid, app) {
    await load(app);
    var cur = TABS.filter(function (t) { return t.id === tid; })[0] || TABS[0], g = groupFor(cur), i = info(cur.id);
    area.innerHTML = '<div class="rv rvs rvs-wrap"><aside class="rvs-nav" id="rvsNav" aria-label="Settings sections"><button type="button" class="rv-btn rv-btn--sm rvs-close" id="rvsClose">&times; Close</button>' +
      '<button type="button" class="rv-btn rv-btn--sm rvs-all" onclick="App.renderUnifiedSettings()">&larr; All settings</button>' +
      '<div class="rv-search"><input id="rvsNq" class="rv-input" placeholder="Search settings" aria-label="Search settings" autocomplete="off"></div><div id="rvsList"></div></aside>' +
      '<section class="rvs-main"><button type="button" class="rv-btn rv-btn--sm rvs-menu" id="rvsMenu">&#9776; All settings</button>' +
      '<div class="rvs-crumb"><a onclick="App.renderUnifiedSettings()">Settings</a> &rsaquo; <span>' + esc(g.key) + '</span> &rsaquo; <b>' + esc(cur.label) + '</b></div>' +
      '<div class="rvs-title"><div><h1>' + esc(cur.label) + '</h1><p class="rv-hint">' + esc(DESC[cur.id] || '') + '</p></div>' + (i.st ? stBadge(i.st) : '') + '</div>' +
      '<div id="settingsContent" class="rvs-content"><div class="rvs-loading">' + w.RV.skeleton(4) + '</div></div></section></div>';
    function list(q) {
      q = (q || '').toLowerCase(); var html = '';
      GROUPS.forEach(function (gr) {
        var its = TABS.filter(function (t) { return groupFor(t) === gr && (!q || (t.label + ' ' + (DESC[t.id] || '')).toLowerCase().indexOf(q) >= 0); }); if (!its.length) return;
        html += '<details class="rvs-grp"' + (q || gr === g ? ' open' : '') + '><summary>' + esc(gr.key) + '</summary>' + its.map(function (t) {
          return '<button type="button" class="rvs-item" aria-current="' + (t.id === cur.id) + '" onclick="' + go(t.id) + '">' + esc(t.label) + (info(t.id).st === 'attn' ? '<i class="rvs-dot" title="Needs attention"></i>' : '') + '</button>'; }).join('') + '</details>';
      });
      document.getElementById('rvsList').innerHTML = html || '<p class="rv-hint" style="padding:8px">Nothing matches.</p>';
    }
    list(''); var nq = document.getElementById('rvsNq'); nq.oninput = function () { list(nq.value); };
    document.getElementById('rvsMenu').onclick = function () { document.getElementById('rvsNav').classList.add('open'); };
    document.getElementById('rvsClose').onclick = function () { document.getElementById('rvsNav').classList.remove('open'); };
  };
  RVS.refresh = function () { overview = null; };   // after saving something that changes a status
  w.RVS = RVS;
})(window);
