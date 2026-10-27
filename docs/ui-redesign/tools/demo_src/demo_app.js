/* Interactive demo of the new Resolvo. Everything below runs in the browser with made-up data (a fictional store, "Brightkart"). */
const ME = 'Rahul Mehta';
const AGENT_NAMES = ['Rahul Mehta', 'Ananya Rao', 'Karan Malhotra', 'Priya Sharma', 'Sneha Iyer'];
function mkTickets() {
  const M = (t, who, body, h) => ({ t, who, body, h });
  return [
    { id: 'T1', n: 'Kavya Saxena', ch: 'email', c: 'kavya.saxena@mailbox.example', s: 'Coupon code not working', p: 'Medium', st: 'new', as: '', ago: 50, sla: -2, un: 1, vip: 0, msgs: [M('in', 'Kavya Saxena', 'Hi, I tried the code WELCOME10 at checkout and it says invalid. Is it expired? I have a full cart waiting.', 50)] },
    { id: 'T2', n: 'Isha Reddy', ch: 'whatsapp', c: '+91 98765 43210', s: 'Refund for order #4901', p: 'High', st: 'new', as: '', ago: 2, sla: 3, un: 1, vip: 0, msgs: [M('in', 'Isha Reddy', 'I returned the item last week and the refund has not come yet. Please check.', 2)] },
    { id: 'T3', n: 'Sanjay Kapoor', ch: 'instagram', c: '@sanjay.kapoor', s: 'Coupon code not working', p: 'Medium', st: 'new', as: '', ago: 3, sla: 20, un: 1, vip: 0, msgs: [M('in', 'Sanjay Kapoor', 'The WELCOME10 code is not applying on my order. Can you help?', 3)] },
    { id: 'T4', n: 'Meera Kapoor', ch: 'email', c: 'meera.kapoor@mailbox.example', s: 'Order #4833 has not arrived', p: 'Critical', st: 'open', as: ME, ago: 5, sla: 1.5, un: 1, vip: 1, msgs: [M('in', 'Meera Kapoor', 'Hello, I ordered on 12 Oct and the tracking has not moved for 3 days. I need it for a function on Saturday. Can you tell me where it is?', 5)] },
    { id: 'T5', n: 'Rohit Das', ch: 'whatsapp', c: '+91 99887 11223', s: 'Need a GST invoice for order #4893', p: 'Low', st: 'open', as: ME, ago: 7, sla: 40, un: 0, vip: 0, msgs: [M('in', 'Rohit Das', 'Could you please send a GST invoice for my last order? Our company name and number are in the order notes.', 7)] },
    { id: 'T6', n: 'Divya Reddy', ch: 'email', c: 'divya.reddy@mailbox.example', s: 'Bulk order for corporate gifting', p: 'High', st: 'open', as: 'Karan Malhotra', ago: 4, sla: 6, un: 0, vip: 1, msgs: [M('in', 'Divya Reddy', 'We are planning Diwali gifts for 40 employees. Do you offer a discount, and can you print our logo?', 4)] },
    { id: 'T7', n: 'Vikram Bhatt', ch: 'whatsapp', c: '+91 90909 80808', s: 'Refund for order #4896', p: 'Medium', st: 'pending', as: 'Priya Sharma', ago: 9, sla: 14, un: 0, vip: 0, msgs: [M('in', 'Vikram Bhatt', 'I returned the item last week and the refund has not come yet.', 9), M('out', 'Priya Sharma', 'Hi Vikram, your refund was approved and takes 3 to 5 working days to reach your account. Sorry for the wait.', 8)] },
    { id: 'T8', n: 'Gaurav Gupta', ch: 'email', c: 'gaurav.gupta@mailbox.example', s: 'Cannot log in to my account', p: 'Medium', st: 'pending', as: 'Sneha Iyer', ago: 6, sla: 16, un: 0, vip: 0, msgs: [M('in', 'Gaurav Gupta', 'I forgot my password and the reset email is not arriving.', 6), M('out', 'Sneha Iyer', 'Hi Gaurav, I have reset it from our side. Please check your inbox for a new link.', 5)] },
    { id: 'T9', n: 'Neha Verma', ch: 'widget', c: 'neha.verma@mailbox.example', s: 'Size exchange request', p: 'Medium', st: 'pending', as: 'Ananya Rao', ago: 12, sla: 10, un: 0, vip: 0, msgs: [M('in', 'Neha Verma', 'The kurta I received is a size M but it runs small. Can I exchange it for an L?', 12), M('out', 'Ananya Rao', 'Of course Neha! I have arranged a free pickup and the L will ship as soon as the first one reaches us.', 11)] },
    { id: 'T10', n: 'Arjun Nair', ch: 'email', c: 'arjun.nair@mailbox.example', s: 'Damaged product on arrival', p: 'High', st: 'open', as: ME, ago: 8, sla: 4, un: 1, vip: 0, msgs: [M('in', 'Arjun Nair', 'The ceramic planter arrived with a crack. I have photos. What can we do?', 8)] },
    { id: 'T11', n: 'Lakshmi Menon', ch: 'whatsapp', c: '+91 97766 55443', s: 'Payment failed but money deducted', p: 'High', st: 'open', as: '', ago: 3, sla: 5, un: 1, vip: 0, msgs: [M('in', 'Lakshmi Menon', 'My payment failed at checkout but the amount was deducted from my bank. Order not placed.', 3)] },
    { id: 'T12', n: 'Harsh Joshi', ch: 'email', c: 'harsh.joshi@mailbox.example', s: 'Wrong item received', p: 'Medium', st: 'resolved', as: 'Priya Sharma', ago: 20, sla: 0, un: 0, vip: 0, msgs: [M('in', 'Harsh Joshi', 'I ordered the cotton bedsheet set but received cushion covers.', 20), M('out', 'Priya Sharma', 'So sorry Harsh. A replacement is on its way and the courier will collect the wrong item.', 19)], done: 1 }
  ];
}
function mkPromos() { return [['GrowthBox', 'news@mail.growthbox.example', 'Your weekly product update'], ['UptimeWatch', 'noreply@uptimewatch.example', 'Monitor is DOWN: brightkart.example'], ['Launch Daily', 'team@launchdaily.example', 'Ten tools founders loved this week'], ['CourierHub', 'hello@mail.courierhub.example', 'Rates are changing from 1 November'], ['Retail Today', 'digest@newsletter.retailtoday.example', 'The festive season playbook'], ['PayGate', 'noreply@paygate.example', 'Settlement report ready']].map((p, i) => ({ id: 'P' + i, n: p[0], c: p[1], s: p[2], ago: 2 + i * 7 })); }
function mkCust() { return [['Meera Kapoor', 'meera.kapoor@mailbox.example', 4, 1, 'vip'], ['Meera Kapoor', '+91 98111 22233 (WhatsApp)', 1, 0, 'active'], ['Divya Reddy', 'divya.reddy@mailbox.example', 5, 1, 'vip'], ['Kavya Saxena', 'kavya.saxena@mailbox.example', 2, 1, 'risk'], ['Isha Reddy', '+91 98765 43210', 3, 1, 'active'], ['Rohit Das', '+91 99887 11223', 2, 1, 'active'], ['Arjun Nair', 'arjun.nair@mailbox.example', 1, 1, 'active'], ['Harsh Joshi', 'harsh.joshi@mailbox.example', 3, 0, 'happy'], ['Neha Verma', 'neha.verma@mailbox.example', 2, 0, 'happy'], ['Gaurav Gupta', 'gaurav.gupta@mailbox.example', 1, 0, 'quiet']].map((c, i) => ({ id: 'C' + i, n: c[0], c: c[1], t: c[2], o: c[3], h: c[4], last: [2, 5, 4, 50, 2, 7, 8, 20, 12, 6][i] })); }
let D;
function reset() { D = { tk: mkTickets(), pr: mkPromos(), cu: mkCust(), view: 'today', inbox: { f: 'all', sel: null, cust: false, tab: 'needs' }, focus: { tab: 'needs', open: null, cur: 0 }, ins: { tab: 'overview', days: 14, cmp: true, sort: ['open', -1] }, set: { cur: null, q: '' }, resolvedToday: 4, mode: 'reply' }; }
reset();
const lastIn = t => t.msgs[t.msgs.length - 1].t === 'in';
const needs = t => !t.done && t.st !== 'resolved' && lastIn(t) && (!t.as || t.as === ME);
const waiting = t => !t.done && t.st !== 'resolved' && !lastIn(t);
const urg = (a, b) => ((a.sla < 0 ? 0 : a.sla < 4 ? 1 : 2) - (b.sla < 0 ? 0 : b.sla < 4 ? 1 : 2)) || ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[a.p] - { Critical: 0, High: 1, Medium: 2, Low: 3 }[b.p]) || b.ago - a.ago;
const openT = () => D.tk.filter(t => t.st !== 'resolved');
const ago = h => h < 1 ? Math.round(h * 60) + 'm ago' : h < 24 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago';
const CHN = { email: 'Email', whatsapp: 'WhatsApp', widget: 'Web widget', instagram: 'Instagram' };
const slaB = t => t.st === 'resolved' ? '' : t.sla < 0 ? '<span class="badge sla-breach">SLA breached</span>' : t.sla < 4 ? `<span class="badge sla-risk">SLA ${t.sla}h left</span>` : '';
const stBadge = s => `<span class="badge ${{ new: 'b-new', open: 'b-open', pending: 'b-pending', resolved: 'b-resolved' }[s]}"><i></i>${s[0].toUpperCase() + s.slice(1)}</span>`;
const prB = p => `<span class="badge p-${p}"><i></i>${p}</span>`;
function toast(m) { const t = document.createElement('div'); t.className = 'dtoast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

// ---------- shell ----------
const NAV = [['today', 'Dashboard', '⌂'], ['inbox', 'Ticket inbox', '✉'], ['customers', 'Customers', '👥'], ['insights', 'Insights', '▥'], ['settings', 'Settings', '⚙']];
const TIPS = {
  today: 'click a ticket under "Needs you now", or press "Work through them".', inbox: 'open a ticket, press "AI suggestion", send a reply, or open the Promotions tab.',
  focus: 'press J and K to move, Enter to open, then "Send & resolve, then next" or press E.', insights: 'switch to 30 days, open the Questions and Team tabs, click a column to sort.',
  customers: 'the banner at the top finds the same person on email and WhatsApp. Click Review, then Merge.', settings: 'search "slack", or open SLA Configuration and change a value.'
};
function shell() {
  const n = D.view === 'focus' ? 'inbox' : D.view;
  $('#nav').innerHTML = NAV.map(x => `<button class="nv" data-go="${x[0]}" aria-current="${x[0] === n}"><span aria-hidden="true">${x[2]}</span><b>${x[1]}</b>${x[0] === 'inbox' ? `<em>${D.tk.filter(needs).length}</em>` : ''}</button>`).join('');
  $('#tip').innerHTML = `<b>Try it</b> ${TIPS[D.view]} <button class="btn sm ghost" id="tipx" aria-label="Hide hint">✕</button>`;
}
function go(v, o) { D.view = v; if (o) Object.assign(D[v === 'focus' ? 'focus' : v], o); draw(); scrollTo(0, 0); }
function draw() { shell(); const f = { today, inbox, focus, insights, customers, settings }[D.view]; $('#main').innerHTML = f(); after(); }

// ---------- Today ----------
function kpis() { const o = openT(); return [['Total tickets', D.tk.length + 94], ['Open tickets', o.length + 11], ['Resolved', 95 + (D.resolvedToday - 4)], ['Avg. first reply', '2.4 h'], ['Happy customers', '92%']].map(k => `<div class="card kpi2"><span class="l">${k[0]}</span><span class="n">${k[1]}</span></div>`).join(''); }
function today() {
  const list = D.tk.filter(needs).sort(urg), rows = list.slice(0, 5).map(t => `<button class="now" data-open="${t.id}">${av(t.n)}<span class="m"><b>${esc(t.n)}</b><span>${esc(t.s)}</span></span>${slaB(t) || stBadge(t.st)}<em>${ago(t.ago)}</em></button>`).join('');
  const br = D.tk.filter(t => t.sla < 0 && t.st !== 'resolved').length, un = openT().filter(t => !t.as).length;
  return `<div class="pagehead"><div><h1>Good afternoon, Rahul</h1><p>Here is what is happening with your support today.</p></div></div>
  <section class="card" style="margin-top:16px"><div class="cardh"><h3>Needs you now (${list.length})</h3>${list.length ? '<button class="btn primary sm" data-go="focus">Work through them</button>' : ''}</div>${list.length ? `<div class="nowl">${rows}</div>` : '<div class="empty" style="padding:36px"><b style="color:var(--text)">You are all caught up</b>Nothing needs you right now.</div>'}</section>
  <div class="attn2">${br ? `<b style="color:var(--danger)">${br}</b> breached SLA` : ''}${br && un ? ' · ' : ''}${un ? `<b>${un}</b> unassigned` : ''}${!br && !un ? 'Nothing is past its target.' : ''}</div>
  <div class="kpis" style="margin-top:14px">${kpis()}</div>
  <section class="card" style="margin-top:14px"><div class="cardh"><h3>Ticket volume</h3></div><div class="cardb">${lineChart([{ v: CREATED.slice(-14), c: 'var(--info)' }], LAB.slice(-14), { h: 170 })}</div></section>`;
}

// ---------- Inbox ----------
function listFor() { const f = D.inbox.f; if (f === 'promo') return D.pr; let a = openT(); if (f === 'mine') a = a.filter(t => t.as === ME); else if (f === 'un') a = a.filter(t => !t.as); return a.sort((a, b) => a.ago - b.ago); }
function inbox() {
  const c = { all: openT().length, mine: openT().filter(t => t.as === ME).length, un: openT().filter(t => !t.as).length, promo: D.pr.length }, f = D.inbox.f, list = listFor(), selT = D.tk.find(t => t.id === D.inbox.sel);
  const pills = [['mine', 'Mine'], ['un', 'Unassigned'], ['all', 'All'], ['promo', 'Promotions']].map(p => `<button class="tab" role="tab" data-f="${p[0]}" aria-selected="${f === p[0]}">${p[1]}<em>${c[p[0]]}</em></button>`).join('');
  const rows = f === 'promo' ? list.map(p => `<div class="row-i"><span class="av sm">${esc(p.n[0])}</span><div style="min-width:0"><b class="clip">${esc(p.n)}</b><div class="clip" style="font-size:13px">${esc(p.s)}</div><div class="faint" style="font-size:12px">${esc(p.c)}</div></div><div style="text-align:right"><div class="faint" style="font-size:12px">${ago(p.ago)}</div><button class="btn sm" data-back="${p.id}">Move to inbox</button></div></div>`).join('') || '<div class="empty" style="padding:28px"><b style="color:var(--text)">Nothing here</b>Newsletters and alerts will collect here.</div>'
    : list.map(t => `<button class="row-i${t.id === D.inbox.sel ? ' sel' : ''}${t.un ? ' un' : ''}" data-t="${t.id}">${av(t.n)}<div style="min-width:0"><div class="nm"><b class="clip">${esc(t.n)}</b><span class="chip2">${CHN[t.ch]}</span></div><div class="sj clip">${esc(t.s)}</div><div class="pv clip">${esc(t.msgs[t.msgs.length - 1].body)}</div><div class="tg">${slaB(t)}${t.p === 'Critical' || t.p === 'High' ? prB(t.p) : ''}${t.st === 'new' || t.st === 'pending' ? stBadge(t.st) : ''}${t.as ? `<span class="own">${av(t.as, 'sm')}${esc(t.as.split(' ')[0])}</span>` : '<span class="own none">Unassigned</span>'}</div></div><div class="faint" style="font-size:12px">${ago(t.ago)}</div></button>`).join('') || '<div class="empty" style="padding:28px"><b style="color:var(--text)">No tickets</b></div>';
  const promoBar = f === 'promo' ? `<div class="promo"><b>Newsletters and automated alerts</b><span class="muted" style="font-size:13px">Kept out of your queue and your counts.</span>${D.pr.length ? `<div class="row"><button class="btn sm" data-closeall>Close all ${D.pr.length}</button><button class="btn sm" data-closeall="block">Close all and block senders</button></div>` : ''}</div>` : '';
  return `<div class="inb ${D.inbox.cust ? 'cust' : ''}"><section class="il"><div class="ilh"><b style="font-size:17px">Tickets</b><span class="faint" style="font-size:12px">${list.length} shown</span><span style="flex:1"></span><button class="btn sm" data-go="focus">Focus mode</button></div><div class="tabs pills" role="tablist">${pills}</div>${promoBar}<div class="irows">${rows}</div></section>
  <section class="ic">${selT ? conv(selT) : '<div class="empty" style="flex:1"><div style="font-size:28px">✉</div><b style="color:var(--text);font-size:17px;margin-top:6px">Select a ticket</b>Pick a conversation to read it and reply.</div>'}</section>
  ${selT && D.inbox.cust ? `<aside class="icu"><div class="label">Customer</div><div class="row" style="margin:10px 0">${av(selT.n, 'lg')}<div><b>${esc(selT.n)}</b>${selT.vip ? ' <span class="badge b-pending">VIP</span>' : ''}<div class="muted" style="font-size:12px">${esc(selT.c)}</div></div></div><div class="kpi"><div><b>${selT.vip ? 8 : 3}</b><span class="faint">Tickets</span></div><div><b>1</b><span class="faint">Open</span></div><div><b>${selT.vip ? 4.8 : 4.5}</b><span class="faint">CSAT</span></div></div><div class="label" style="margin:12px 0 6px">Earlier tickets</div><div class="card" style="padding:8px 10px;font-size:13px">Size exchange request <span class="faint">· 2w</span></div></aside>` : ''}</div>`;
}
function conv(t) {
  const th = t.msgs.map(m => `<div class="msg ${m.t === 'out' ? 'out' : m.t === 'note' ? 'note' : ''}">${av(m.who, 'sm')}<div><div class="when" style="margin:0 0 3px">${esc(m.who)} · ${ago(m.h)}</div><div class="bubble">${esc(m.body)}</div></div></div>`).join('');
  const wait = lastIn(t) && t.ago >= 4 && t.st !== 'resolved' ? `<div class="nudge">⏱ <b>${esc(t.n.split(' ')[0])} has been waiting ${Math.round(t.ago)} hours for a reply.</b>${t.sla < 0 ? ' The target time has passed.' : ''}</div>` : '';
  return `<div class="ch-head"><button class="btn icon ghost back" data-back-list aria-label="Back">←</button>${av(t.n)}<div style="flex:1;min-width:0"><h2 class="clip">${esc(t.s)}</h2><div class="muted" style="font-size:12px"><b style="color:var(--text)">${esc(t.n)}</b> · ${CHN[t.ch]} · ${t.id}</div></div><button class="btn sm" data-cust>Customer</button></div>
  <div class="cbar"><select data-st aria-label="Status">${['new', 'open', 'pending', 'resolved'].map(s => `<option ${t.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select aria-label="Priority">${['Critical', 'High', 'Medium', 'Low'].map(s => `<option ${t.p === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select data-as aria-label="Assignee"><option value="">Unassigned</option>${AGENT_NAMES.map(a => `<option ${t.as === a ? 'selected' : ''}>${a}</option>`).join('')}</select>${slaB(t)}<span style="flex:1"></span>${t.st !== 'resolved' ? '<button class="btn primary sm" data-resolve>✓ Resolve</button>' : ''}</div>${wait}
  <div class="thread">${th}</div><div class="comp"><div class="tabs"><button class="tab" data-mode="reply" aria-selected="${D.mode === 'reply'}">Reply to customer</button><button class="tab" data-mode="note" aria-selected="${D.mode === 'note'}">Internal note</button></div><div id="slashbox"></div><textarea class="compose" id="rt" placeholder="${D.mode === 'note' ? 'Write a note for your team…' : 'Write a reply… (type / for saved replies)'}" aria-label="Reply"></textarea><div class="row"><button class="btn sm" data-ai>✦ AI suggestion</button><button class="btn sm" data-canned>Saved replies</button><span style="flex:1"></span><button class="btn primary" data-send>${D.mode === 'note' ? 'Add note' : 'Send reply'}</button></div></div>`;
}
const CANNED = [['Refund timeline', 'Refunds reach your account within 3 to 5 working days after approval.'], ['Where is my order', 'Thanks for waiting. I am checking with the courier and will update you shortly.'], ['Coupon help', 'That code works on orders above Rs 999. I have applied the discount for you.']];
function aiText(t) { return `Hi ${t.n.split(' ')[0]}, I am sorry about this. I have looked into "${t.s.toLowerCase()}" and I am on it now. I will update you within 2 hours. Thank you for your patience.`; }

// ---------- Focus ----------
function fq() { const tab = D.focus.tab, all = openT(); const a = tab === 'waiting' ? all.filter(waiting) : tab === 'all' ? all.slice() : all.filter(needs); return a.sort(urg); }
function focus() {
  const q = fq(), F = D.focus, op = D.tk.find(t => t.id === F.open);
  if (op) {
    const i = q.findIndex(t => t.id === op.id), th = op.msgs.map(m => `<div class="msg ${m.t === 'out' ? 'out' : ''}">${av(m.who, 'sm')}<div><div class="when" style="margin:0 0 3px">${esc(m.who)} · ${ago(m.h)}</div><div class="bubble">${esc(m.body)}</div></div></div>`).join('');
    return `<div class="fwrap"><div class="rhead"><button class="btn ghost" data-fback>← Queue</button><span class="muted">${i >= 0 ? (i + 1) + ' of ' + q.length : ''}</span><span style="flex:1"></span><button class="btn icon" data-fstep="-1" aria-label="Previous">↑</button><button class="btn icon" data-fstep="1" aria-label="Next">↓</button></div>
    <article class="card" style="padding:0"><div class="row" style="align-items:flex-start;gap:12px;padding:18px">${av(op.n, 'lg')}<div style="flex:1;min-width:0"><h2 style="margin:0;font-size:20px">${esc(op.s)}</h2><div class="muted" style="font-size:13px"><b style="color:var(--text)">${esc(op.n)}</b> · ${CHN[op.ch]} · ${op.id}</div><div class="row" style="margin-top:8px;flex-wrap:wrap">${stBadge(op.st)}${prB(op.p)}${slaB(op)}</div></div></div><div class="stack" style="padding:0 18px 18px;gap:16px">${th}</div></article>
    <div class="card" style="padding:12px;margin-top:12px"><textarea class="compose" id="rt" placeholder="Write a reply… (R)" aria-label="Reply"></textarea><div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-ai>✦ AI suggestion</button><span style="flex:1"></span><button class="btn" data-fsend="0">Send</button><button class="btn primary" data-fsend="1">Send &amp; resolve, then next</button></div><div class="faint" style="font-size:12px;text-align:right;margin-top:6px"><span class="kbd">R</span> reply · <span class="kbd">E</span> resolve · <span class="kbd">J</span> <span class="kbd">K</span> next / previous · <span class="kbd">Esc</span> queue</div></div></div>`;
  }
  const nn = openT().filter(needs).length, wn = openT().filter(waiting).length;
  const items = q.map((t, i) => `<button class="fitem${i === F.cur ? ' foc' : ''}" data-fopen="${t.id}">${av(t.n, 'lg')}<div style="min-width:0"><div class="nm"><b class="clip">${esc(t.n)}</b><span class="chip2">${CHN[t.ch]}</span>${t.un ? '<i class="dot-unread"></i>' : ''}</div><div class="clip" style="font-weight:600">${esc(t.s)}</div><div class="pv clip">${esc(t.msgs[t.msgs.length - 1].body)}</div></div><div class="rt">${slaB(t) || stBadge(t.st)}<span class="faint" style="font-size:12px">${ago(t.ago)}</span></div></button>`).join('') || '<div class="empty card" style="padding:40px"><b style="color:var(--text);font-size:17px">You are all caught up</b>Nothing needs you right now.</div>';
  return `<div class="fwrap"><div class="pagehead"><div><h1>Good afternoon, Rahul</h1><p class="muted" style="font-size:13px">One queue, sorted by what needs you first.</p></div><button class="btn sm" data-go="inbox">Full inbox</button></div>
  <div class="fstats"><button class="stat ${nn ? 'hot' : ''}" data-ftab="needs" aria-pressed="${F.tab === 'needs'}"><span class="muted">Needs you now</span><b>${nn}</b></button><button class="stat" data-ftab="waiting" aria-pressed="${F.tab === 'waiting'}"><span class="muted">Waiting on customer</span><b>${wn}</b></button><button class="stat" aria-pressed="false" style="cursor:default"><span class="muted">Resolved today</span><b>${D.resolvedToday}</b></button></div>
  <div class="tabs" role="tablist">${[['needs', 'Needs you'], ['all', 'All open'], ['waiting', 'Waiting']].map(x => `<button class="tab" role="tab" data-ftab="${x[0]}" aria-selected="${F.tab === x[0]}">${x[1]}</button>`).join('')}</div><div class="fq">${items}</div></div>`;
}
function fsend(resolve) {
  const t = D.tk.find(x => x.id === D.focus.open), ta = $('#rt'), txt = ta ? ta.value.trim() : '';
  if (resolve === 1 && !txt) { toast('Write a reply first, or press E to resolve without one'); return; }
  const q = fq(), i = q.findIndex(x => x.id === t.id);
  if (txt) t.msgs.push({ t: 'out', who: ME, body: txt, h: 0 });
  if (resolve === 'e') { if (txt) { toast('You have an unsent reply. Use "Send & resolve" to send it, or clear it first.'); t.msgs.pop(); return; } }
  if (resolve) { t.st = 'resolved'; t.done = 1; D.resolvedToday++; toast(txt ? 'Reply sent and ticket resolved' : 'Ticket resolved'); const nq = fq(), next = nq[Math.min(i, nq.length - 1)]; D.focus.open = next ? next.id : null; if (!next) D.focus.cur = 0; } else { t.st = 'pending'; toast('Reply sent'); }
  draw();
}

// ---------- Insights ----------
const iv = () => { const n = D.ins.days, sl = a => a.slice(-n), pv = a => a.slice(-2 * n, -n); return { n, sl, pv, c: sum(sl(CREATED)), cp: sum(pv(CREATED)) || 1, r: sum(sl(RESOLVED)), rp: sum(pv(RESOLVED)) || 1 }; };
function insights() {
  const I = D.ins, v = iv(), seg = [7, 14, 30].map(n => `<button aria-pressed="${I.days === n}" data-days="${n}">${n} days</button>`).join('');
  const tabs = ['overview', 'questions', 'team'].map(t => `<button class="tab" role="tab" data-itab="${t}" aria-selected="${I.tab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  let body = '';
  if (I.tab === 'overview') {
    const dl = (a, b, good) => { const [d, t] = pct(a, b); return `<span class="delta ${d === 'flat' ? 'flat' : (good ? d === 'up' : d === 'dn') ? 'up' : 'dn'}">${t}</span>`; };
    const k = [['Tickets', v.c, dl(v.c, v.cp, 1), spark(v.sl(CREATED), 'var(--info)')], ['Resolved', v.r, dl(v.r, v.rp, 1), spark(v.sl(RESOLVED))], ['First reply', avg(v.sl(FRT)).toFixed(1) + ' h', dl(avg(v.sl(FRT)), avg(v.pv(FRT)) || 1, 0), ''], ['Resolved on time', Math.round(avg(v.sl(SLAP))) + '%', dl(avg(v.sl(SLAP)), avg(v.pv(SLAP)) || 1, 1), ''], ['Happy customers', '92%', dl(92, 88, 1), '']];
    const ser = [{ v: v.sl(CREATED), c: 'var(--info)' }, { v: v.sl(RESOLVED), c: 'var(--accent)' }]; if (I.cmp) ser.push({ v: v.pv(CREATED).length === v.n ? v.pv(CREATED) : v.sl(CREATED), c: 'var(--faint)', dash: 1 });
    body = `<div class="kpis">${k.map(x => `<div class="card kpi2"><span class="l">${x[0]}</span><span class="n">${x[1]}</span><div class="row" style="justify-content:space-between">${I.cmp ? x[2] : '<span></span>'}${x[3]}</div></div>`).join('')}</div>
    <section class="card" style="margin-top:14px"><div class="cardh"><h3>Tickets created and resolved</h3><div class="legend"><span><i style="background:var(--info)"></i>Created</span><span><i style="background:var(--accent)"></i>Resolved</span>${I.cmp ? '<span><i style="background:var(--faint)"></i>Previous period</span>' : ''}</div></div><div class="cardb">${lineChart(ser, LAB.slice(-v.n), { label: 'Tickets' })}</div></section>
    <div class="grid2" style="margin-top:14px"><section class="card"><div class="cardh"><h3>Where tickets come from</h3></div><div class="cardb">${hbars(CHANNELS.slice(0, 4).map(c => [c[0], Math.round(c[1] * v.n / 30), c[2]]))}</div></section><section class="card"><div class="cardh"><h3>What customers ask about</h3></div><div class="cardb">${hbars(REASONS.slice(0, 5).map(r => [r[0], Math.round(r[1] * v.n / 30)]))}</div></section></div>`;
  } else if (I.tab === 'questions') {
    const sla = Math.round(avg(v.sl(SLAP))), dow = [14, 12, 11, 10, 9, 4, 3];
    const Q = [['Are we answering fast enough?', `${sla >= 90 ? 'Yes. ' : 'Mostly. '}<em>${sla}%</em> of resolved tickets were done within target. First replies take ${avg(v.sl(FRT)).toFixed(1)} hours.`, lineChart([{ v: v.sl(RESOLVED), c: 'var(--accent)' }], LAB.slice(-v.n), { h: 120 })], ['Are we getting busier?', `Volume is <em>${pct(v.c, v.cp)[1]}</em> against the period before: ${v.c} tickets. Mondays are the busiest day.`, lineChart([{ v: v.sl(CREATED), c: 'var(--info)' }], LAB.slice(-v.n), { h: 120 })], ['Where do tickets come from?', '<em>Email</em> brings 45% of tickets, then WhatsApp with 29%. WhatsApp grew fastest.', hbars(CHANNELS.slice(0, 4).map(c => [c[0], c[1], c[2]]))], ['What do customers ask about?', 'Delivery and refunds make up <em>36%</em> of tickets. A help article on them could answer many before they reach you.', hbars(REASONS.slice(0, 4))], ['Who needs help?', '<em class="bad">Karan</em> has the slowest first replies (3.4 hours) and 2 tickets past target. Rahul has the most open (14).', ''], ['Are customers happy?', '<em>92%</em> of 43 survey replies were positive, up 6 points. Low scores cluster on late deliveries.', '']];
    body = `<div class="qs">${Q.map(q => `<article class="card q"><span class="label">${q[0]}</span><p class="a">${q[1]}</p><div>${q[2]}</div></article>`).join('')}</div>`;
  } else {
    const [k, d] = I.sort, ag = AGENTS.slice().sort((a, b) => (a[k] > b[k] ? 1 : -1) * d), mx = Math.max(...AGENTS.map(a => a.open)), cols = [['n', 'Agent'], ['open', 'Open'], ['res', 'Resolved'], ['frt', 'First reply (h)'], ['sla', 'On time'], ['csat', 'CSAT']];
    body = `<div class="alerts"><div class="al d"><span>⏱</span><div><b>Karan: 2 tickets past target</b><span>First replies average 3.4 hours, against a 2 hour goal.</span></div></div><div class="al w"><span>⚖️</span><div><b>Rahul has 14 open</b><span>Twice the team average. Consider reassigning 4 tickets.</span></div></div><div class="al g"><span>🌟</span><div><b>Ananya: 96% on time</b><span>Best on the team this period.</span></div></div></div>
    <section class="card" style="margin-top:14px"><div class="tw"><table class="t" id="tt"><thead><tr>${cols.map(c => `<th class="s" data-k="${c[0]}" ${c[0] === k ? `aria-sort="${d > 0 ? 'ascending' : 'descending'}"` : ''}>${c[1]}</th>`).join('')}</tr></thead><tbody>${ag.map(a => `<tr><td><span class="row">${av(a.n, a.c)}<b>${esc(a.n)}</b></span></td><td><div class="load"><b style="width:22px">${a.open}</b><div class="bar2"><i style="width:${a.open / mx * 100}%;background:${a.open > 12 ? 'var(--danger)' : a.open > 9 ? 'var(--warning)' : 'var(--accent)'}"></i></div></div></td><td>${a.res}</td><td><span class="badge ${a.frt > 3 ? 'p-High' : 'b-resolved'}">${a.frt}</span></td><td>${a.sla}%</td><td>${a.csat}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card" style="margin-top:14px"><div class="cardh"><h3>When tickets arrive</h3><span class="faint" style="font-size:12px">Darker means busier</span></div><div class="cardb"><div class="hm"><span></span>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span style="text-align:center">${x}</span>`).join('')}${['9-11', '11-13', '13-15', '15-17', '17-19', '19-21'].map((s, r) => `<span>${s}</span>${[0, 1, 2, 3, 4, 5, 6].map(c => `<i style="opacity:${Math.max(.08, (c > 4 ? .22 : .75) * (1 - Math.abs(r - 1.5) / 4) + ((r * 7 + c * 3) % 5) / 25).toFixed(2)}"></i>`).join('')}`).join('')}</div></div></section>`;
  }
  return `<div class="pagehead"><div><h1>Insights</h1><p>Promotions and automated alerts left out · sample data</p></div><div class="row" style="flex-wrap:wrap"><div class="seg" id="rng">${seg}</div>${I.tab === 'overview' ? `<label class="chipb" style="cursor:pointer"><input type="checkbox" id="cmpx" ${I.cmp ? 'checked' : ''} style="accent-color:var(--accent)"> Compare to previous</label>` : ''}</div></div><div class="tabs pills" style="margin:14px 0" role="tablist">${tabs}</div>${body}`;
}

// ---------- Customers ----------
const HB = { vip: 'VIP', risk: 'At risk', happy: 'Happy', active: 'Active', quiet: '' };
function customers() {
  const dup = D.cu.filter(c => c.n === 'Meera Kapoor').length > 1;
  return `<div class="pagehead"><div><h1>Customers</h1><p>Everyone who has contacted you, with their tickets in one place.</p></div></div>
  ${dup ? '<div class="banner" style="margin-top:14px"><span><b>1 possible duplicate.</b> The same person may appear more than once.</span><button class="btn sm" data-dupes>Review</button></div>' : ''}
  <section class="card" style="margin-top:14px"><div class="tw"><table class="t"><thead><tr><th>Customer</th><th>Tickets</th><th>Open</th><th>Last contact</th></tr></thead><tbody>${D.cu.map(c => `<tr><td><span class="row">${av(c.n)}<span><b>${esc(c.n)}</b>${HB[c.h] ? ` <span class="hb hb-${c.h}">${HB[c.h]}</span>` : ''}<div class="muted" style="font-size:12px">${esc(c.c)}</div></span></span></td><td>${c.t}</td><td>${c.o || '<span class="faint">0</span>'}</td><td class="muted">${ago(c.last)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

// ---------- Settings ----------
function settings() {
  const S = D.set, q = S.q.toLowerCase();
  if (S.cur) { const it = ALL.find(i => i.id === S.cur); return `<div class="crumb"><a data-sback>← Settings</a> › ${esc(it.g)} › <b style="color:var(--text)">${esc(it.l)}</b></div><div class="pagehead" style="margin:6px 0 14px"><div><h1>${esc(it.l)}</h1><p>${esc(it.d)}</p></div>${stB(it.st)}</div><div class="card" id="sform" style="max-width:820px">${formFor(it)}</div>${SAVEBAR}`; }
  const att = ALL.filter(i => i.st === 'attn');
  const groups = SET.map(g => { const its = g.items.filter(i => !q || (i.l + ' ' + i.d).toLowerCase().includes(q)); return its.length ? `<section class="card gcard"><h3>${g.ico} ${esc(g.name)}</h3><p class="muted" style="margin:0 0 8px;font-size:13px">${esc(g.blurb)}</p>${its.map(i => `<button class="glink" data-set="${i.id}"><span>${esc(i.l)}</span><small>${i.st === 'attn' ? stB('attn') : esc(i.v)}</small></button>`).join('')}</section>` : ''; }).join('') || '<p class="muted">Nothing matches. Try another word.</p>';
  return `<div class="pagehead"><div><h1>Settings</h1><p>Everything about how your workspace runs, grouped by what you are trying to do.</p></div><label class="search" style="max-width:320px"><span>⌕</span><input id="sq" placeholder="Search all settings" value="${esc(S.q)}" aria-label="Search settings"></label></div>
  ${!q && att.length ? `<div class="label" style="margin-top:16px">Needs your attention</div><div class="attn">${att.map(a => `<button class="acard" data-set="${a.id}"><span>⚠️</span><div><b>${esc(a.l)}</b><span>${esc(a.v)}. ${esc(a.d)}.</span></div></button>`).join('')}</div>` : ''}<div class="hub">${groups}</div>`;
}

// ---------- events ----------
function after() {
  const sv = $('#savebar'), f = $('#sform'); if (sv && f) wireSave(f, sv);
  const sq = $('#sq'); if (sq) sq.oninput = e => { D.set.q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('#sq'); n.focus(); n.setSelectionRange(pos, pos); };
  const cx = $('#cmpx'); if (cx) cx.onchange = () => { D.ins.cmp = cx.checked; draw(); };
  const rt = $('#rt'); if (rt) rt.oninput = slash;
  const th = $('.thread'); if (th) th.scrollTop = th.scrollHeight;
}
function slash() { const ta = $('#rt'), m = /(^|\s)\/([\w-]*)$/.exec(ta.value.slice(0, ta.selectionStart)), box = $('#slashbox'); if (!box) return; if (!m) { box.innerHTML = ''; return; } const q = m[2].toLowerCase(), it = CANNED.filter(c => !q || c[0].toLowerCase().includes(q)); box.innerHTML = it.length ? `<div class="slash">${it.map((c, i) => `<button type="button" data-slash="${CANNED.indexOf(c)}"><b>${esc(c[0])}</b><span>${esc(c[1].slice(0, 70))}</span></button>`).join('')}</div>` : ''; }
document.addEventListener('click', e => {
  const T = s => e.target.closest(s), g = T('[data-go]'), ti = T('[data-t]'), op = T('[data-open]');
  if (T('#tipx')) { $('#tip').style.display = 'none'; return; }
  if (T('#reset')) { reset(); draw(); toast('Demo reset'); return; }
  if (g) { go(g.dataset.go); return; }
  if (op) { D.view = 'inbox'; D.inbox.sel = op.dataset.open; D.inbox.f = 'all'; draw(); return; }
  if (T('[data-f]')) { D.inbox.f = T('[data-f]').dataset.f; D.inbox.sel = null; draw(); return; }
  if (ti) { D.inbox.sel = ti.dataset.t; D.tk.find(t => t.id === ti.dataset.t).un = 0; draw(); $('.inb').classList.add('reading'); return; }
  if (T('[data-back-list]')) { D.inbox.sel = null; draw(); return; }
  if (T('[data-cust]')) { D.inbox.cust = !D.inbox.cust; draw(); return; }
  if (T('[data-back]')) { const id = T('[data-back]').dataset.back, p = D.pr.find(x => x.id === id); D.pr = D.pr.filter(x => x.id !== id); D.tk.push({ id: 'M' + id, n: p.n, ch: 'email', c: p.c, s: p.s, p: 'Medium', st: 'new', as: '', ago: p.ago, sla: 10, un: 1, vip: 0, msgs: [{ t: 'in', who: p.n, body: 'Moved back to the inbox: this one is a real customer.', h: p.ago }] }); toast('Moved back to your inbox'); draw(); return; }
  if (T('[data-closeall]')) { const b = T('[data-closeall]').dataset.closeall; const n = D.pr.length; D.pr = []; toast(`Closed ${n} promotions${b ? ' and blocked their senders' : ''}. Nobody was emailed.`); draw(); return; }
  if (T('[data-mode]')) { D.mode = T('[data-mode]').dataset.mode; draw(); return; }
  if (T('[data-ai]')) { const t = D.tk.find(x => x.id === (D.view === 'focus' ? D.focus.open : D.inbox.sel)); $('#rt').value = aiText(t); toast('AI draft added. Edit it, then send.'); return; }
  if (T('[data-canned]')) { $('#rt').value = ($('#rt').value + ' ' + CANNED[0][1]).trim(); return; }
  if (T('[data-slash]')) { const c = CANNED[+T('[data-slash]').dataset.slash], ta = $('#rt'); ta.value = ta.value.replace(/(^|\s)\/[\w-]*$/, (m, a) => a + c[1]); $('#slashbox').innerHTML = ''; ta.focus(); return; }
  if (T('[data-send]')) { const t = D.tk.find(x => x.id === D.inbox.sel), ta = $('#rt'), v = ta.value.trim(); if (!v) { toast('Write something first'); return; } t.msgs.push({ t: D.mode === 'note' ? 'note' : 'out', who: ME, body: v, h: 0 }); if (D.mode === 'reply') { t.st = 'pending'; t.un = 0; } toast(D.mode === 'note' ? 'Note added' : 'Reply sent'); draw(); return; }
  if (T('[data-resolve]')) { const t = D.tk.find(x => x.id === D.inbox.sel); t.st = 'resolved'; t.done = 1; D.resolvedToday++; D.inbox.sel = null; toast('Ticket resolved'); draw(); return; }
  if (T('[data-ftab]')) { D.focus.tab = T('[data-ftab]').dataset.ftab; D.focus.cur = 0; draw(); return; }
  if (T('[data-fopen]')) { D.focus.open = T('[data-fopen]').dataset.fopen; draw(); return; }
  if (T('[data-fback]')) { D.focus.open = null; draw(); return; }
  if (T('[data-fstep]')) { fstep(+T('[data-fstep]').dataset.fstep); return; }
  if (T('[data-fsend]')) { fsend(+T('[data-fsend]').dataset.fsend); return; }
  if (T('[data-itab]')) { D.ins.tab = T('[data-itab]').dataset.itab; draw(); return; }
  if (T('#rng button')) { D.ins.days = +T('#rng button').dataset.days; draw(); return; }
  if (T('#tt th.s')) { const k = T('#tt th.s').dataset.k, s = D.ins.sort; D.ins.sort = [k, s[0] === k ? -s[1] : (k === 'n' || k === 'frt' ? 1 : -1)]; draw(); return; }
  if (T('[data-dupes]')) { const m = $('#modal'); m.innerHTML = `<div class="mcard"><h3 style="margin:0 0 6px">Possible duplicates</h3><p class="muted" style="margin:0 0 12px;font-size:13px">Merging joins their email addresses, phone numbers, tickets and deals under one customer. Nothing is deleted from your tickets.</p><div class="card" style="padding:12px"><div class="muted" style="font-size:12px;margin-bottom:6px">Same name</div><div><b>Meera Kapoor</b> <span class="muted" style="font-size:12px">meera.kapoor@mailbox.example · 4 tickets</span> <span class="faint">keep this one</span></div><div><b>Meera Kapoor</b> <span class="muted" style="font-size:12px">+91 98111 22233 · 1 ticket</span></div></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-mclose>Cancel</button><button class="btn primary" data-merge>Merge into Meera Kapoor</button></div></div>`; m.classList.add('on'); return; }
  if (T('[data-mclose]')) { $('#modal').classList.remove('on'); return; }
  if (T('[data-merge]')) { const a = D.cu.find(c => c.n === 'Meera Kapoor'); a.t += 1; a.c += ' + WhatsApp'; D.cu = D.cu.filter((c, i) => !(c.n === 'Meera Kapoor' && c !== a)); $('#modal').classList.remove('on'); toast('Merged into Meera Kapoor'); draw(); return; }
  if (T('[data-set]')) { D.set.cur = T('[data-set]').dataset.set; draw(); return; }
  if (T('[data-sback]')) { D.set.cur = null; draw(); return; }
});
document.addEventListener('change', e => { const t = D.tk.find(x => x.id === D.inbox.sel); if (!t) return; if (e.target.matches('[data-st]')) { t.st = e.target.value; if (t.st === 'resolved') { t.done = 1; D.resolvedToday++; } toast('Status set to ' + t.st); draw(); } else if (e.target.matches('[data-as]')) { t.as = e.target.value; toast('Assignee updated'); draw(); } });
function fstep(d) { const q = fq(), i = q.findIndex(t => t.id === D.focus.open), j = i + d; if (i < 0 || j < 0 || j >= q.length) return; D.focus.open = q[j].id; draw(); }
document.addEventListener('keydown', e => {
  if (D.view !== 'focus' || e.ctrlKey || e.metaKey || e.altKey || $('#modal.on')) return;
  const tag = document.activeElement && document.activeElement.tagName, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag); if (typing) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  const k = e.key, F = D.focus, q = fq();
  if (k === 'j' || (k === 'ArrowDown' && !F.open)) { e.preventDefault(); F.open ? fstep(1) : (F.cur = Math.min(q.length - 1, F.cur + 1), draw()); }
  else if (k === 'k' || (k === 'ArrowUp' && !F.open)) { e.preventDefault(); F.open ? fstep(-1) : (F.cur = Math.max(0, F.cur - 1), draw()); }
  else if (k === 'Enter' && !F.open) { const t = q[F.cur]; if (t) { e.preventDefault(); F.open = t.id; draw(); } }
  else if (k === 'Escape' && F.open) { e.preventDefault(); F.open = null; draw(); }
  else if ((k === 'r' || k === 'R') && F.open) { e.preventDefault(); $('#rt').focus(); }
  else if ((k === 'e' || k === 'E') && F.open) { e.preventDefault(); fsend('e'); }
});
$('#theme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark'; };
draw();
