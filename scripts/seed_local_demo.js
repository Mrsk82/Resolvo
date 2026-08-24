// Local-only seed script for UI preview — creates a fake brand/user/ticket.
// Run with: node scripts/seed_local_demo.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BRAND_SLUG = 'demo';
const BRAND_DIR = path.join(DATA_DIR, 'brands', BRAND_SLUG);

fs.mkdirSync(BRAND_DIR, { recursive: true });

const ownerPath = path.join(DATA_DIR, 'owner.json');
const owner = {
  email: 'owner@demo.local',
  name: 'Platform Owner',
  passwordHash: 'demo1234',
  brands: [{
    id: 'BRD-DEMO',
    slug: BRAND_SLUG,
    name: 'Demo Support',
    logoUrl: '',
    accentColor: '#f5a623',
    theme: 'midnight',
    status: 'active',
    tier: 'Enterprise',
    majorAdminEmail: 'admin@demo.local',
    createdDate: '2026-01-01T00:00:00.000Z',
    lastActive: new Date().toISOString(),
    limits: { maxUsers: 20 },
    featureOverrides: { EMAIL_TICKETING_ENABLED: true, QUEUE_ENABLED: true, KANBAN_ENABLED: true },
    billing: { status: 'paid' }
  }]
};
fs.writeFileSync(ownerPath, JSON.stringify(owner, null, 2));
console.log('wrote', ownerPath);

const db = new Database(path.join(BRAND_DIR, 'db.sqlite'));
db.pragma('journal_mode=WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS issues(id TEXT PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activity_log(rowid INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS processed_email_ids(id TEXT PRIMARY KEY,ts TEXT DEFAULT(datetime('now')));
  CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);

const upsert = (table, id, data) => db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id, JSON.stringify(data));
const setKv = (key, value) => db.prepare(`INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, JSON.stringify(value));

upsert('users', 'USR-001', {
  id: 'USR-001', email: 'admin@demo.local', name: 'Admin User', team: 'Engineering',
  role: 'Admin', skill: '', slackId: '', maxTickets: 10, active: true,
  createdDate: '2026-01-01T00:00:00.000Z', passwordHash: 'demo1234', firstLogin: false
});

upsert('tickets', 'TKT-DEMO0001', {
  id: 'TKT-DEMO0001',
  subject: 'WhatsApp: Hi test Twilio Integration',
  body: 'Hi test Twilio Integration',
  from: 'whatsapp:+918286063819',
  fromName: 'Asif Shaikh',
  whatsappFrom: '918286063819',
  channel: 'whatsapp',
  status: 'open',
  priority: 'Medium',
  createdAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  thread: [
    { id: 'MSG-1', type: 'incoming', from: 'whatsapp:+918286063819', fromName: 'Asif Shaikh', body: 'Hi test Twilio Integration', timestamp: new Date().toISOString(), channel: 'whatsapp' },
    { id: 'MSG-2', type: 'reply', from: 'admin@demo.local', fromName: 'Admin User', body: 'Hi thanks reached', timestamp: new Date().toISOString(), channel: 'whatsapp' }
  ]
});

setKv('features', { whatsapp: true, whatsappNumber: '+14155238886', aiTriage: true });
setKv('whatsappConfig', { enabled: true, number: '+14155238886', accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', authToken: 'demo-token' });

// Wide fixed-width marketing-style email, reproducing the "scattered" rendering bug
var marketingHtml = '<table width="700" cellpadding="0" cellspacing="0" style="width:700px;background:#f3f4f6;"><tr><td style="padding:24px;"><p style="margin:0 0 12px;color:#374151;">Discover top features and the highest-rated tools.</p><table width="700" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;background:#fff;border:1px solid #e5e7eb;"><img src="https://placehold.co/160x40?text=Capterra" width="160" height="40" style="display:block;"><a href="#" style="display:inline-block;margin-top:16px;padding:10px 28px;border:2px solid #2563eb;border-radius:24px;color:#2563eb;text-decoration:none;font-weight:700;">EXPLORE</a></td></tr></table></td></tr></table>';

upsert('tickets', 'TKT-DEMO0002', {
  id: 'TKT-DEMO0002',
  subject: 'Overwhelmed by choice? Try these tools',
  body: marketingHtml,
  from: 'teamcapterra@e.capterra.com',
  fromName: 'Team Capterra',
  channel: 'email',
  status: 'new',
  priority: 'Medium',
  createdAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  thread: [
    { id: 'MSG-3', type: 'incoming', from: 'teamcapterra@e.capterra.com', fromName: 'Team Capterra', body: '', emailHtml: marketingHtml, timestamp: new Date().toISOString() }
  ]
});

db.close();
console.log('seeded demo brand + ticket at', BRAND_DIR);
console.log('\nLogin at http://localhost:3000 with: admin@demo.local / demo1234');
