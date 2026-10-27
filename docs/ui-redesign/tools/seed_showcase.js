// Builds a fictional, realistic workspace ("Brightkart Support", a made-up home-and-lifestyle store) in the LOCAL data folder,
// used for website screenshots and demos. All names, emails and numbers are invented. Nothing is sent anywhere.
// Usage: node seed_showcase.js        (login afterwards: admin@showcase.local / demo1234)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
const SLUG = 'showcase', dir = path.join(ROOT, 'data', 'brands', SLUG);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const IST = 5.5 * 3600000, iso = ms => new Date(ms + IST).toISOString().replace('Z', '+05:30');

// 1. start from the demo workspace's empty-ish structure
fs.mkdirSync(dir, { recursive: true });
for (const f of ['db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm']) { try { fs.rmSync(path.join(dir, f)); } catch (e) {} }
// copy through SQLite's own backup so the demo workspace's write-ahead log is included (a plain file copy can be malformed)
const src = new Database(path.join(ROOT, 'data', 'brands', 'demo', 'db.sqlite'), { readonly: true });
src.backup(path.join(dir, 'db.sqlite')).then(() => { src.close(); main(); }).catch(e => { console.error('backup failed', e.message); process.exit(1); });
function main() {
const db = new Database(path.join(dir, 'db.sqlite'));
['tickets', 'issues', 'comments', 'crm_contacts', 'crm_companies', 'crm_deals', 'crm_activities', 'crm_outreach', 'ticket_assets', 'activity_log', 'processed_email_ids'].forEach(t => { try { db.prepare('DELETE FROM ' + t).run(); } catch (e) {} });
db.prepare("DELETE FROM kv WHERE key IN ('pushSubs','aiAgents','aiApprovals','aiAuditLog','aiCostLog','aiDecisions','aiMessages','aiOrg','aiTasks','customerProfiles','npsSurveys','socialEvents','rootCauseReports','auditTrail')").run();
const hash = JSON.parse(db.prepare("SELECT data FROM users WHERE id='USR-001'").get().data).passwordHash;
db.prepare('DELETE FROM users').run();
const now = Date.now();

// 2. the team
const TEAM = [['Rahul Mehta', 'rahul@showcase.local', 'Admin', 'Support Lead'], ['Ananya Rao', 'ananya@showcase.local', 'Agent', 'Support'], ['Karan Malhotra', 'karan@showcase.local', 'Agent', 'Support'], ['Priya Sharma', 'priya@showcase.local', 'Agent', 'Orders'], ['Sneha Iyer', 'sneha@showcase.local', 'Agent', 'Orders']];
TEAM.unshift(['Admin User', 'admin@showcase.local', 'Admin', 'Support Lead']);
const putU = db.prepare('INSERT INTO users(id,data) VALUES(?,?)');
TEAM.forEach((t, i) => putU.run('USR-' + (100 + i), JSON.stringify({ id: 'USR-' + (100 + i), email: t[1], name: i === 0 ? 'Rahul Mehta' : t[0], team: t[3], role: t[2], skill: '', slackId: '', maxTickets: 20, active: true, createdDate: iso(now - 200 * 864e5), firstLogin: false, availabilityStatus: 'available', passwordHash: hash })));
const AGENTS = TEAM.slice(2).map(t => t[1]), ME = 'admin@showcase.local';

// 3. customers and tickets
const FIRST = ['Meera', 'Arjun', 'Divya', 'Rohit', 'Neha', 'Vikram', 'Pooja', 'Aditya', 'Kavya', 'Sanjay', 'Isha', 'Manish', 'Tanvi', 'Nikhil', 'Ritu', 'Harsh', 'Anjali', 'Varun', 'Shreya', 'Deepak', 'Lakshmi', 'Imran', 'Sunita', 'Gaurav'];
const LAST = ['Kapoor', 'Nair', 'Joshi', 'Verma', 'Bhatt', 'Reddy', 'Gupta', 'Menon', 'Shah', 'Pillai', 'Das', 'Saxena', 'Chopra', 'Rao', 'Khan', 'Bose'];
const CUST = Array.from({ length: 30 }, (_, i) => { const f = FIRST[i % FIRST.length], l = LAST[(i * 5 + 3) % LAST.length]; return { name: f + ' ' + l, email: (f + '.' + l).toLowerCase() + '@mailbox.example', phone: '+9198' + String(10000000 + Math.floor(rnd() * 89999999)) }; });
const VIPS = new Set([2, 9, 17]);
const TOPICS = [
  ['Order #{n} has not arrived', 'Hi, I ordered on {d} and the tracking has not moved for 3 days. Can you tell me where it is?', 'Hello {f}, I checked with the courier and your parcel is out for delivery today. I will update you by evening.', 'delivery'],
  ['Refund for order #{n}', 'I returned the item last week and the refund has not come yet. Please check.', 'Hi {f}, your refund was approved and takes 3 to 5 working days to reach your account. Sorry for the wait.', 'refund'],
  ['Size exchange request', 'The kurta I received is a size M but it runs small. Can I exchange it for an L?', 'Of course {f}! I have arranged a free pickup and the L will ship as soon as the first one reaches us.', 'exchange'],
  ['Coupon code not working', 'I tried the code WELCOME10 at checkout and it says invalid. Is it expired?', 'Hi {f}, the code works on orders above Rs 999. I have applied the discount to your cart manually.', 'coupon'],
  ['Payment failed but money deducted', 'My payment failed at checkout but the amount was deducted from my bank. Order not placed.', 'Hi {f}, the amount is reversed automatically within 5 days. I have also noted your reference for our payments team.', 'payment'],
  ['Need a GST invoice for order #{n}', 'Could you please send a GST invoice for my last order? Our company name and number are in the order notes.', 'Done {f}, the GST invoice is attached to your order email.', 'invoice'],
  ['Wrong item received', 'I ordered the cotton bedsheet set but received a set of cushion covers. Please help.', 'So sorry {f}. A replacement is on its way and the courier will collect the wrong item.', 'wrong item'],
  ['Damaged product on arrival', 'The ceramic planter arrived with a crack. I have photos. What can we do?', 'Thank you for the photos {f}. We are sending a replacement today at no cost.', 'damage'],
  ['Bulk order for corporate gifting', 'We are planning Diwali gifts for 40 employees. Do you offer a discount and can you print our logo?', 'Great to hear {f}! For 40 pieces we offer 12% off with logo printing. I will send a quote shortly.', 'bulk'],
  ['Cannot log in to my account', 'I forgot my password and the reset email is not arriving.', 'Hi {f}, I have reset it from our side. Please check your inbox for a new link.', 'account']
];
const CH = ['email', 'email', 'email', 'whatsapp', 'whatsapp', 'widget', 'instagram'];
const tickets = [], put = db.prepare('INSERT OR REPLACE INTO tickets(id,data) VALUES(?,?)');
let n = 4800, id = 0;
for (let d = 29; d >= 0; d--) {
  const wd = new Date(now - d * 864e5).getDay(), per = wd === 0 || wd === 6 ? 1 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < per; k++) {
    const ci = Math.floor(rnd() * CUST.length), c = CUST[ci], tp = pick(TOPICS), ch = (ci < 3 && rnd() < .5) ? pick(CH) : CH[ci % CH.length];   // a customer keeps one channel, except three who use two
    const createdMs = now - d * 864e5 - Math.floor(rnd() * 9 * 3600000) - (d === 0 ? 3600000 : 0);
    if (createdMs > now - 1800000) continue;
    const from = ch === 'whatsapp' ? 'whatsapp:' + c.phone : ch === 'instagram' ? 'instagram:' + c.name.toLowerCase().replace(/\W/g, '_') : c.email;
    const pr = (() => { const r = rnd(); return r < .08 ? 'Critical' : r < .33 ? 'High' : r < .88 ? 'Medium' : 'Low'; })();
    const old = d > 2, agent = pick(AGENTS), replied = old ? rnd() < .96 : rnd() < .45, frtH = .3 + rnd() * 4.5;
    let status = old ? (rnd() < .99 ? (rnd() < .78 ? 'resolved' : 'closed') : 'open') : (replied ? (rnd() < .5 ? 'pending' : 'open') : (rnd() < .6 ? 'new' : 'open'));
    const body = tp[1].replace('{d}', new Date(createdMs - 5 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), tid = 'TKT-' + (0x10000 + (id++) * 977).toString(16).toUpperCase();
    const thread = [{ id: 'MSG-' + tid + '-1', type: 'incoming', from, fromName: c.name, body, timestamp: iso(createdMs) }];
    if (replied) thread.push({ id: 'MSG-' + tid + '-2', type: 'reply', from: agent, fromName: TEAM.find(t => t[1] === agent)[0], body: tp[2].replace('{f}', c.name.split(' ')[0]), timestamp: iso(createdMs + frtH * 3600000), sentAsEmail: ch === 'email' });
    const slow = agent === 'karan@showcase.local' ? .2 : .07, done = status === 'resolved' || status === 'closed', resMs = done ? createdMs + (frtH + 0.5 + rnd() * (pr === 'Critical' ? 2.2 : pr === 'High' ? 5.5 : pr === 'Medium' ? 17 : 44)) * (rnd() < slow ? 2.4 : 1) * 3600000 : 0;
    const t = { id: tid, subject: tp[0].replace('{n}', String(n++)), from, fromName: c.name, body, status, priority: pr, assignedTo: (status === 'new' && rnd() < .7) ? '' : (rnd() < .12 ? ME : agent), createdDate: iso(createdMs), lastActivity: iso(done ? resMs : createdMs + (replied ? frtH * 3600000 : 0)), channel: ch, source: ch, tags: [tp[3]], type: '', cc: [], isVIP: VIPS.has(ci), thread };
    if (done) { t.resolvedDate = iso(resMs); if (rnd() < .5) t.csatRating = rnd() < .87 ? 'yes' : 'no'; if (t.csatRating) { t.csatSent = true; t.csatAt = iso(resMs + 3600000); } }
    t.viewedBy = status === 'new' ? {} : { [ME]: t.lastActivity };
    tickets.push(t);
  }
}
// a few older open tickets so the "past target" views have something real to show
for (let i = 0; i < 2; i++) { const t = tickets.filter(x => x.status === 'resolved' && x.priority !== 'Low')[i * 7 + 2]; if (t) { t.status = i % 2 ? 'open' : 'pending'; delete t.resolvedDate; delete t.csatRating; delete t.csatSent; delete t.csatAt; } }
// newsletters and alerts that landed as tickets before the filter existed
[['news@mail.growthbox.example', 'GrowthBox', 'Your weekly product update', 'Big news this week. Unsubscribe any time at the bottom of this email.'], ['noreply@uptimewatch.example', 'UptimeWatch', 'Monitor is DOWN: brightkart.example', 'We detected an incident on your monitor.'], ['team@launchdaily.example', 'Launch Daily', 'Ten tools founders loved this week', 'Read this in your browser. To stop receiving these emails, update your email preferences.'], ['hello@mail.courierhub.example', 'CourierHub', 'Rates are changing from 1 November', 'You are receiving this email because you signed up. Unsubscribe here.'], ['digest@newsletter.retailtoday.example', 'Retail Today', 'The festive season playbook', 'View this email in your browser. Manage preferences.'], ['noreply@paygate.example', 'PayGate', 'Settlement report ready', 'Your daily settlement report is ready to download.']].forEach((p, i) => {
  const ms = now - (i * 7 + 2) * 3600000, tid = 'TKT-PRM' + (100 + i);
  tickets.push({ id: tid, subject: p[2], from: p[0], fromName: p[1], body: p[3], status: 'new', priority: 'Medium', assignedTo: '', createdDate: iso(ms), lastActivity: iso(ms), channel: 'email', source: 'email', tags: [], type: '', cc: [], thread: [{ id: 'MSG-' + tid, type: 'incoming', from: p[0], fromName: p[1], body: p[3], timestamp: iso(ms) }] });
});
db.transaction(() => tickets.forEach(t => put.run(t.id, JSON.stringify(t))))();

// 4. settings so Settings, Insights and the dashboard look lived-in
const kv = db.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)');
kv.run('settings', JSON.stringify({ APP_NAME: 'Brightkart Support', SUPPORT_EMAIL: 'support@brightkart.example', SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/showcase', MODULES: 'Orders,Delivery,Payments,Account,Catalog' }));
kv.run('emailTicketing', JSON.stringify({ enabled: true, user: 'support@brightkart.example', host: '', senderBlocklist: '' }));
kv.run('queueConfig', JSON.stringify({ enabled: true, mode: 'round-robin', maxPerAgent: 10 }));
kv.run('csatConfig', JSON.stringify({ enabled: true, delayMinutes: 0, skipAutomated: true }));
kv.run('vipConfig', JSON.stringify({ emails: [CUST[2].email, CUST[9].email, CUST[17].email], domains: [], autoNotify: true, autoTag: true, slaMultiplier: 1 }));
kv.run('cannedResponses', JSON.stringify([['Refund timeline', 'refund', 'Refunds reach your account within 3 to 5 working days after approval.'], ['Where is my order', 'track', 'Thanks for waiting. I am checking with the courier and will update you shortly.'], ['Size exchange', 'size', 'Happy to exchange it. I will arrange a free pickup and ship the new size right away.'], ['Coupon help', 'coupon', 'That code works on orders above Rs 999. I have applied the discount for you.'], ['GST invoice', 'gst', 'I have attached the GST invoice to your order email.'], ['Thank you', 'thanks', 'Thank you for your patience. Is there anything else I can help with?']].map((r, i) => ({ id: 'CAN-' + i, title: r[0], shortcut: r[1], body: r[2], createdBy: ME, createdAt: iso(now - 40 * 864e5) }))));
kv.run('knowledgeBase', JSON.stringify(['How to track your order', 'Our return and refund policy', 'Exchanging a size', 'Using coupon codes', 'Getting a GST invoice', 'Delivery times by city'].map((t, i) => ({ id: 'KB-' + i, title: t, body: t + '. Written by the Brightkart team.', status: 'published', createdDate: iso(now - 60 * 864e5) }))));
kv.run('automationRules', JSON.stringify([{ id: 'AR-1', name: 'Tag refund tickets', enabled: true }, { id: 'AR-2', name: 'Escalate VIP tickets', enabled: true }, { id: 'AR-3', name: 'Auto-assign orders to Priya and Sneha', enabled: true }]));
kv.run('escalationRules', JSON.stringify([{ id: 'ES-1', name: 'Unassigned for 2 hours', enabled: true }, { id: 'ES-2', name: 'Critical not answered in 30 minutes', enabled: true }]));
kv.run('botRules', JSON.stringify([{ id: 'B1', name: 'Where is my order', enabled: true }, { id: 'B2', name: 'Refund status', enabled: true }, { id: 'B3', name: 'Coupon not working', enabled: true }]));
db.close();

// 5. register the workspace (local owner file only)
const op = path.join(ROOT, 'data', 'owner.json'), owner = JSON.parse(fs.readFileSync(op, 'utf8'));
owner.brands = (owner.brands || []).filter(b => b.slug !== SLUG);
owner.brands.push({ id: 'BRD-SHOWCASE', slug: SLUG, name: 'Brightkart Support', logoUrl: '', accentColor: '#10B981', theme: 'resolvo', status: 'active', tier: 'Enterprise', majorAdminEmail: 'admin@showcase.local', createdDate: iso(now - 200 * 864e5), lastActive: iso(now), limits: { maxUsers: 20 }, featureOverrides: { EMAIL_TICKETING_ENABLED: true, QUEUE_ENABLED: true, KANBAN_ENABLED: true }, billing: { status: 'paid' } });
fs.writeFileSync(op, JSON.stringify(owner, null, 2));
console.log('showcase workspace ready:', tickets.length, 'tickets. Login admin@showcase.local / demo1234');
}
