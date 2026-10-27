/* Example data and helpers shared by the Settings and Insights samples. Nothing here is connected to real data. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
(function () { const t = $('#theme'); if (t) t.onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark'; }; addEventListener('message', e => { if (e.data && e.data.theme !== undefined) document.documentElement.dataset.theme = e.data.theme; }); })();

/* ---------- Settings: the real sections, grouped ---------- */
const SET = [
  { id: 'workspace', name: 'Workspace', ico: '🏢', blurb: 'Company, hours, people and plan', items: [
    { id: 'general', l: 'General', d: 'Company name, time zone, language', v: 'Asia/Kolkata · English', st: 'ok' },
    { id: 'sla', l: 'SLA Configuration', d: 'How fast you promise to reply and resolve', v: '4 priorities', st: 'ok' },
    { id: 'team', l: 'Team & Roles', d: 'Invite people and set what they can do', v: '6 people', st: 'ok' },
    { id: 'shift', l: 'Shift Scheduling', d: 'Who is on duty and when', v: 'Not set', st: 'off' },
    { id: 'plan', l: 'Features & Plan', d: 'Your plan and what is switched on', v: 'Enterprise', st: 'ok' },
    { id: 'adv', l: 'Advanced Features', d: 'Extra tools for larger teams', v: '', st: 'off' },
    { id: 'notif', l: 'My Notifications', d: 'What alerts you get, and where', v: 'Email + bell', st: 'ok' },
    { id: 'export', l: 'Data Export', d: 'Download your tickets and customers', v: '', st: 'off' } ] },
  { id: 'support', name: 'Channels & replies', ico: '✉️', blurb: 'Where tickets come from and how you answer', items: [
    { id: 'email', l: 'Email & Ticketing', d: 'Connect Gmail or IMAP so emails become tickets', v: 'Not connected', st: 'attn' },
    { id: 'canned', l: 'Canned Responses', d: 'Saved replies for common questions', v: '12 replies', st: 'ok' },
    { id: 'templates', l: 'Ticket Templates', d: 'Pre-filled tickets for repeat requests', v: '3 templates', st: 'ok' },
    { id: 'ooo', l: 'Out of Office', d: 'Auto-reply when nobody is online', v: 'Off', st: 'off' },
    { id: 'csat', l: 'CSAT Settings', d: 'Ask customers to rate each resolved ticket', v: 'On', st: 'ok' },
    { id: 'nps', l: 'NPS Settings', d: 'Periodic recommend-us survey', v: 'Off', st: 'off' },
    { id: 'bot', l: 'Auto-Reply Bot', d: 'Instant answers from your knowledge base', v: 'On · 3 rules', st: 'ok' },
    { id: 'queue', l: 'Assignment Queue', d: 'Share new tickets between agents', v: '10 per agent', st: 'ok' },
    { id: 'vip', l: 'VIP Customers', d: 'Priority handling for key accounts', v: '4 customers', st: 'ok' },
    { id: 'booking', l: 'Appointment Booking', d: 'Let customers book a time', v: 'Off', st: 'off' },
    { id: 'portal', l: 'Customer Portal', d: 'A page where customers see their tickets', v: 'Off', st: 'off' } ] },
  { id: 'workflow', name: 'Workflow', ico: '⚡', blurb: 'Rules that move tickets along', items: [
    { id: 'class', l: 'Ticket Classification', d: 'Types and dispositions', v: '8 types', st: 'ok' },
    { id: 'status', l: 'Ticket Statuses', d: 'The steps a ticket goes through', v: '7 statuses', st: 'ok' },
    { id: 'form', l: 'Issue Form Builder', d: 'Custom fields on issues', v: '', st: 'off' },
    { id: 'esc', l: 'Escalation Rules', d: 'Warn or reassign when time runs short', v: '2 rules', st: 'ok' },
    { id: 'auto', l: 'Automation Rules', d: 'If this happens, do that', v: '5 rules', st: 'ok' },
    { id: 'recur', l: 'Recurring Tickets', d: 'Create tickets on a schedule', v: '', st: 'off' },
    { id: 'approve', l: 'Approval Workflows', d: 'Manager sign-off before action', v: '', st: 'off' } ] },
  { id: 'content', name: 'Content', ico: '📚', blurb: 'Help articles and public roadmap', items: [
    { id: 'kb', l: 'Knowledge Base', d: 'Help articles for customers and the bot', v: '24 articles', st: 'ok' },
    { id: 'road', l: 'Roadmap', d: 'Show what you are building', v: 'Off', st: 'off' } ] },
  { id: 'integrations', name: 'Integrations', ico: '🔌', blurb: 'Connect other tools', items: [
    { id: 'integ', l: 'Integrations', d: 'Slack, WhatsApp, webhooks and more', v: '1 connected', st: 'ok' },
    { id: 'slack', l: 'Slack Alerts', d: 'Post new and breached tickets to Slack', v: 'Not set up', st: 'attn' },
    { id: 'tokens', l: 'API Tokens', d: 'Personal tokens for scripts', v: '', st: 'off' },
    { id: 'keys', l: 'API Keys', d: 'Keys for other systems', v: '1 key', st: 'ok' },
    { id: 'docs', l: 'Developer Docs', d: 'API reference', v: '', st: 'off' } ] },
  { id: 'security', name: 'Security & privacy', ico: '🛡️', blurb: 'Protect accounts and data', items: [
    { id: 'sec', l: 'Security', d: 'Passwords and sessions', v: 'Standard', st: 'ok' },
    { id: '2fa', l: 'Two-Factor Auth', d: 'Second step when signing in', v: 'Off for 5 people', st: 'attn' },
    { id: 'gdpr', l: 'GDPR & Privacy', d: 'Export or erase a customer’s data', v: '', st: 'off' } ] }
];
const ALL = SET.flatMap(g => g.items.map(i => ({ ...i, g: g.name, gid: g.id })));
const stB = s => `<span class="st ${s}">${{ ok: 'On', attn: 'Needs attention', off: 'Off' }[s]}</span>`;

/* the same detail screen in every settings sample, so the layouts can be compared fairly */
function slaForm(prefix = 's') {
  const rows = [['Critical', '30 min', '4 hours'], ['High', '1 hour', '8 hours'], ['Medium', '4 hours', '24 hours'], ['Low', '8 hours', '72 hours']];
  return `<section class="sec"><h3>Response targets</h3><p class="sub">How quickly you promise to reply and to resolve, by priority. Tickets turn amber at 80% of the time and red when it is passed.</p>
   <div class="tw"><table class="t"><thead><tr><th>Priority</th><th>First reply within</th><th>Resolve within</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><span class="badge p-${r[0]}">${r[0]}</span></td><td><input class="input" style="max-width:130px" aria-label="${r[0]} first reply" value="${r[1]}" data-track></td><td><input class="input" style="max-width:130px" aria-label="${r[0]} resolve" value="${r[2]}" data-track></td></tr>`).join('')}</tbody></table></div></section>
  <section class="sec"><h3>Business hours</h3><p class="sub">The clock only runs during these hours.</p>
   <div class="line"><div><b>Count business hours only</b><span class="d">Off means the clock runs 24 hours a day</span></div><label class="switch"><input type="checkbox" checked data-track aria-label="Business hours only"><i></i></label></div>
   <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<button class="chipb" aria-pressed="${i < 6}" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')!=='true');document.dispatchEvent(new Event('tracked'))">${d}</button>`).join('')}<span class="muted" style="margin-left:6px">10:00 to 19:00 India time</span></div></section>
  <section class="sec"><h3>When time is running out</h3><p class="sub">What happens before a ticket breaches.</p>
   <div class="line"><div><b>Warn the assignee at 80%</b><span class="d">A bell and an email</span></div><label class="switch"><input type="checkbox" checked data-track aria-label="Warn assignee"><i></i></label></div>
   <div class="line"><div><b>Tell the team lead at 100%</b><span class="d">When the target is passed</span></div><label class="switch"><input type="checkbox" checked data-track aria-label="Tell lead"><i></i></label></div>
   <div class="line"><div><b>Post to Slack</b><span class="d">Needs Slack Alerts to be set up</span></div><label class="switch"><input type="checkbox" data-track aria-label="Post to Slack"><i></i></label></div></section>`;
}
function genericForm(item) {
  return `<section class="sec"><h3>${esc(item.l)}</h3><p class="sub">${esc(item.d)}.</p>
   <div class="line"><div><b>Turn on ${esc(item.l)}</b><span class="d">You can change this any time</span></div><label class="switch"><input type="checkbox" ${item.st === 'ok' ? 'checked' : ''} data-track aria-label="Turn on"><i></i></label></div>
   <div class="grid2" style="margin-top:8px"><div class="field"><label>Name shown to customers</label><input class="input" value="Resolvo Support" data-track></div><div class="field"><label>Reply-to address</label><input class="input" value="support@yourcompany.com" data-track></div></div></section>`;
}
const formFor = it => it.id === 'sla' ? slaForm() : genericForm(it);
/* unsaved-changes bar used by the samples */
function wireSave(root, bar) {
  const on = () => bar.classList.add('on');
  root.addEventListener('input', e => { if (e.target.matches('[data-track]')) on(); }); root.addEventListener('change', e => { if (e.target.matches('[data-track]')) on(); }); document.addEventListener('tracked', on);
  $('.discard', bar).onclick = () => { bar.classList.remove('on'); root.dispatchEvent(new Event('discard')); };
  $('.save', bar).onclick = () => { bar.classList.remove('on'); const t = document.createElement('div'); t.textContent = 'Saved'; t.style.cssText = 'position:fixed;top:16px;right:16px;background:var(--success);color:#fff;padding:8px 14px;border-radius:10px;font-weight:700;z-index:99'; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); };
}
const SAVEBAR = '<div class="savebar" id="savebar" role="status"><span>You have unsaved changes</span><button class="btn sm ghost discard" style="color:inherit">Discard</button><button class="btn sm primary save">Save changes</button></div>';

/* ---------- Insights: 30 days of example numbers ---------- */
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const R = rnd(42), DAYS = 30, NOW = new Date(2026, 9, 26);
const LAB = Array.from({ length: DAYS }, (_, i) => { const d = new Date(NOW - (DAYS - 1 - i) * 864e5); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); });
const CREATED = Array.from({ length: DAYS }, (_, i) => { const wd = new Date(NOW - (DAYS - 1 - i) * 864e5).getDay(); return Math.round((wd === 0 || wd === 6 ? 14 : 30) + R() * 12 + i * .25); });
const RESOLVED = CREATED.map((c, i) => Math.round(c * (.82 + R() * .22)));
const FRT = Array.from({ length: DAYS }, (_, i) => +(2.6 - i * .018 + R() * .7).toFixed(1));
const SLAP = Array.from({ length: DAYS }, (_, i) => Math.min(99, Math.round(86 + i * .22 + R() * 5)));
const CSATP = Array.from({ length: DAYS }, () => +(4.1 + R() * .6).toFixed(1));
const sum = a => a.reduce((x, y) => x + y, 0), avg = a => sum(a) / a.length;
const AGENTS = [
  { n: 'Rahul Mehta', c: 'c1', open: 14, res: 96, frt: 1.8, sla: 94, csat: 4.7, over: 3 }, { n: 'Ananya Rao', c: '', open: 9, res: 88, frt: 2.1, sla: 96, csat: 4.8, over: 0 },
  { n: 'Karan Malhotra', c: 'c2', open: 7, res: 61, frt: 3.4, sla: 83, csat: 4.2, over: 2 }, { n: 'Priya Sharma', c: 'c3', open: 11, res: 74, frt: 2.6, sla: 90, csat: 4.5, over: 1 }, { n: 'Sneha Iyer', c: 'c4', open: 5, res: 52, frt: 2.2, sla: 92, csat: 4.6, over: 0 }
];
const CHANNELS = [['Email', 412, 'var(--info)'], ['WhatsApp', 268, 'var(--wa)'], ['Web widget', 131, '#6D5BD0'], ['Instagram', 74, '#C13584'], ['Calls', 29, '#0EA5A4']];
const REASONS = [['Order not delivered', 188], ['Refund status', 143], ['Size exchange', 121], ['Coupon not working', 97], ['Payment failed', 64], ['Other', 301]];
function av(n, cls = '') { const c = ['', 'c1', 'c2', 'c3', 'c4'][(n.length) % 5]; return `<span class="av sm ${c} ${cls}">${esc(n[0])}</span>`; }

/* inline SVG line/area chart, drawn to one scale */
function lineChart(series, labels, o = {}) {
  const W = 640, H = o.h || 220, L = 34, B = 22, T = 10, Rr = 8, all = series.flatMap(s => s.v), max = o.max || Math.ceil(Math.max(...all) * 1.1 / (o.step || 10)) * (o.step || 10), min = 0, tk = o.ticks || 4;
  const x = i => L + i * (W - L - Rr) / (labels.length - 1), y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const grid = Array.from({ length: tk + 1 }, (_, k) => k / tk).map(f => { const v = Math.round(max * f * 10) / 10, yy = y(v); return `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end">${v}</text>`; }).join('');
  const tick = Math.max(1, Math.ceil(labels.length / 7)), xt = labels.map((l, i) => i % tick === 0 || i === labels.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === labels.length - 1 ? 'end' : 'middle'}">${l}</text>` : '').join('');
  const paths = series.map((s, k) => { const d = s.v.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''), area = k === 0 ? `<path d="${d}L${x(labels.length - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${s.c}" opacity=".10"/>` : ''; return `${area}<path d="${d}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Chart')}">${grid}${xt}${paths}</svg>`;
}
function spark(v, c = 'var(--accent)', w = 96, h = 28) { const mx = Math.max(...v), mn = Math.min(...v), x = i => i * (w - 2) / (v.length - 1) + 1, y = a => h - 3 - (a - mn) / ((mx - mn) || 1) * (h - 6); return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${v.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/></svg>`; }
function hbars(items, fmt = v => v, color) { const mx = Math.max(...items.map(i => i[1])); return items.map(i => `<div class="hbar"><span class="clip">${esc(i[0])}</span><div class="bar"><i style="width:${i[1] / mx * 100}%;background:${i[2] || color || 'var(--accent)'}"></i></div><b style="text-align:right">${fmt(i[1])}</b></div>`).join(''); }
const pct = (a, b) => { const d = (a - b) / b * 100; return Math.abs(d) < .5 ? ['flat', '0%'] : [d > 0 ? 'up' : 'dn', (d > 0 ? '+' : '') + d.toFixed(0) + '%']; };
