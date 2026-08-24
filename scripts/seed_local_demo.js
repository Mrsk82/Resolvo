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
    { id: 'MSG-1', type: 'customer', from: 'whatsapp:+918286063819', fromName: 'Asif Shaikh', body: 'Hi test Twilio Integration', timestamp: new Date().toISOString(), channel: 'whatsapp' },
    { id: 'MSG-2', type: 'reply', from: 'admin@demo.local', fromName: 'Admin User', body: 'Hi thanks reached', timestamp: new Date().toISOString(), channel: 'whatsapp' }
  ]
});

setKv('features', { whatsapp: true, whatsappNumber: '+14155238886', aiTriage: true });
setKv('whatsappConfig', { enabled: true, number: '+14155238886', accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', authToken: 'demo-token' });

db.close();
console.log('seeded demo brand + ticket at', BRAND_DIR);
console.log('\nLogin at http://localhost:3000 with: admin@demo.local / demo1234');
