#!/usr/bin/env node
// Migrate all brands from db.json → db.sqlite
// Safe: renames db.json → db.json.bak after success, never deletes data
// Run: node migrate-to-sqlite.js

'use strict';
const fs   = require('fs');
const path = require('path');

const BRANDS_DIR = path.join(__dirname, 'data', 'brands');

if (!fs.existsSync(BRANDS_DIR)) {
  console.log('No brands directory found. Nothing to migrate.');
  process.exit(0);
}

// ── Load better-sqlite3 ──────────────────────────────────────────────────
let _sqlite3;
try { _sqlite3 = require('better-sqlite3'); }
catch (e) {
  console.error('better-sqlite3 not found. Run: npm install better-sqlite3');
  process.exit(1);
}

// ── Schema ───────────────────────────────────────────────────────────────
const ROW_TABLES = { tickets:'tickets', issues:'issues', users:'users', comments:'comments' };
const KV_KEYS = [
  'settings','slaConfig','emailTicketing','features','featureFlags',
  'queueConfig','bookingConfig','slackAlerts','autoResolveRules',
  'sprints','dependencies','customFields','customFieldValues',
  'onCallSchedule','savedFilters','escalationRules','recurringTemplates',
  'commits','peerReviews','emailThreads','inboundRules','aiHistory',
  'tags','coAssignees','votes','timeLogs','watchers','reactions',
  'pinnedIssues','postMortems','auditTrail','announcements','teams',
];

function openDB(sqlitePath) {
  const db = _sqlite3(sqlitePath);
  db.pragma('journal_mode=WAL');
  db.pragma('synchronous=NORMAL');
  db.pragma('cache_size=-16000');
  db.pragma('temp_store=memory');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS issues(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity_log(
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS processed_email_ids(
      id TEXT PRIMARY KEY,ts TEXT DEFAULT(datetime('now')));
    CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tk_status   ON tickets(json_extract(data,'$.status'));
    CREATE INDEX IF NOT EXISTS idx_tk_priority ON tickets(json_extract(data,'$.priority'));
    CREATE INDEX IF NOT EXISTS idx_tk_assigned ON tickets(json_extract(data,'$.assignedTo'));
    CREATE INDEX IF NOT EXISTS idx_is_status   ON issues(json_extract(data,'$.status'));
    CREATE INDEX IF NOT EXISTS idx_is_assigned ON issues(json_extract(data,'$.assignedTo'));
    CREATE INDEX IF NOT EXISTS idx_us_email    ON users(json_extract(data,'$.email'));
    CREATE INDEX IF NOT EXISTS idx_cm_issue    ON comments(json_extract(data,'$.issueId'));
    CREATE INDEX IF NOT EXISTS idx_al_ts       ON activity_log(ts);
  `);
  return db;
}

function migrateBrand(slug, jsonPath) {
  const sqlitePath = path.join(BRANDS_DIR, slug, 'db.sqlite');

  // Parse JSON
  let data;
  try { data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); }
  catch (e) { console.error(`  [${slug}] Failed to parse JSON:`, e.message); return false; }

  const db = openDB(sqlitePath);
  let ok = true;

  try {
    db.transaction(() => {
      const upsert = (table, items) => {
        if (!Array.isArray(items)) return;
        const stmt = db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        for (const item of items) {
          const id = item.id || item.email || String(Date.now() + Math.random());
          stmt.run(String(id), JSON.stringify(item));
        }
      };

      // Row tables
      for (const [jsKey, table] of Object.entries(ROW_TABLES)) {
        if (Array.isArray(data[jsKey])) {
          console.log(`  [${slug}] ${jsKey}: ${data[jsKey].length} rows`);
          upsert(table, data[jsKey]);
        }
      }

      // Activity log
      if (Array.isArray(data.activityLog)) {
        console.log(`  [${slug}] activityLog: ${data.activityLog.length} rows`);
        const ins = db.prepare('INSERT INTO activity_log(ts,data) VALUES(?,?)');
        for (const entry of data.activityLog) {
          ins.run(entry.timestamp || entry.at || new Date().toISOString(), JSON.stringify(entry));
        }
      }

      // Processed email IDs
      if (Array.isArray(data.processedEmailIds)) {
        console.log(`  [${slug}] processedEmailIds: ${data.processedEmailIds.length} rows`);
        const ins = db.prepare('INSERT OR IGNORE INTO processed_email_ids(id) VALUES(?)');
        for (const id of data.processedEmailIds) ins.run(String(id));
      }

      // KV blobs
      const upsertKV = db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      const knownKeys = new Set([...Object.keys(ROW_TABLES), 'activityLog', 'processedEmailIds']);
      for (const [key, val] of Object.entries(data)) {
        if (!knownKeys.has(key) && val !== undefined) {
          try { upsertKV.run(key, JSON.stringify(val)); }
          catch (e) { console.warn(`  [${slug}] KV key "${key}" skipped:`, e.message); }
        }
      }
    })();
  } catch (e) {
    console.error(`  [${slug}] Transaction failed:`, e.message);
    ok = false;
  } finally {
    db.close();
  }

  if (ok) {
    // Rename original to .bak (safe — data preserved)
    const bakPath = jsonPath + '.bak';
    fs.renameSync(jsonPath, bakPath);
    console.log(`  [${slug}] ✓ Migrated. Original saved as db.json.bak`);
  }
  return ok;
}

// ── Main ─────────────────────────────────────────────────────────────────
const slugs = fs.readdirSync(BRANDS_DIR).filter(s =>
  fs.statSync(path.join(BRANDS_DIR, s)).isDirectory()
);

if (slugs.length === 0) {
  console.log('No brand directories found. Nothing to migrate.');
  process.exit(0);
}

console.log(`Found ${slugs.length} brand(s): ${slugs.join(', ')}\n`);

let passed = 0, failed = 0;
for (const slug of slugs) {
  const jsonPath = path.join(BRANDS_DIR, slug, 'db.json');
  const sqlitePath = path.join(BRANDS_DIR, slug, 'db.sqlite');

  if (!fs.existsSync(jsonPath)) {
    if (fs.existsSync(sqlitePath)) {
      console.log(`[${slug}] Already on SQLite — skipping.`);
      passed++;
    } else {
      console.log(`[${slug}] No db.json or db.sqlite found — skipping.`);
    }
    continue;
  }

  console.log(`[${slug}] Migrating...`);
  if (migrateBrand(slug, jsonPath)) passed++;
  else failed++;
}

console.log(`\nDone. ${passed} succeeded, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
