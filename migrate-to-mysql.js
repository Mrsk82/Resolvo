#!/usr/bin/env node
// Migrate all brands from SQLite (db.sqlite) → MySQL
// Run on VPS: node migrate-to-mysql.js
// Safe: does not delete SQLite files after migration

'use strict';
const fs   = require('fs');
const path = require('path');

const BRANDS_DIR = path.join(__dirname, 'data', 'brands');
const MYSQL_HOST     = process.env.MYSQL_HOST     || 'localhost';
const MYSQL_PORT     = process.env.MYSQL_PORT     || 3306;
const MYSQL_USER     = process.env.MYSQL_USER     || 'resolvo_user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'Resolvo@2024!';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'resolvo';

async function main(){
  let mysql, sqlite3;
  try{ mysql=require('mysql2/promise'); }catch(e){ console.error('Run: npm install mysql2'); process.exit(1); }
  try{ sqlite3=require('better-sqlite3'); }catch(e){ console.error('Run: npm install better-sqlite3'); process.exit(1); }

  const pool=mysql.createPool({
    host:MYSQL_HOST,port:MYSQL_PORT,user:MYSQL_USER,
    password:MYSQL_PASSWORD,database:MYSQL_DATABASE,
    waitForConnections:true,connectionLimit:5,charset:'utf8mb4',
  });

  // Create schema
  console.log('Creating MySQL schema...');
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_tickets(slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,data MEDIUMTEXT NOT NULL,PRIMARY KEY(slug,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_issues(slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,data MEDIUMTEXT NOT NULL,PRIMARY KEY(slug,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_users(slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,data MEDIUMTEXT NOT NULL,PRIMARY KEY(slug,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_comments(slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,data MEDIUMTEXT NOT NULL,PRIMARY KEY(slug,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_activity_log(id BIGINT AUTO_INCREMENT PRIMARY KEY,slug VARCHAR(100) NOT NULL,ts DATETIME,data MEDIUMTEXT NOT NULL,INDEX idx_slug_ts(slug,ts)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_processed_emails(slug VARCHAR(100) NOT NULL,id VARCHAR(255) NOT NULL,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(slug,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brand_kv(slug VARCHAR(100) NOT NULL,\`key\` VARCHAR(100) NOT NULL,value MEDIUMTEXT NOT NULL,PRIMARY KEY(slug,\`key\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log('Schema ready.\n');

  if(!fs.existsSync(BRANDS_DIR)){ console.log('No brands directory.'); await pool.end(); return; }

  const slugs=fs.readdirSync(BRANDS_DIR).filter(s=>fs.statSync(path.join(BRANDS_DIR,s)).isDirectory());
  console.log(`Found ${slugs.length} brand(s): ${slugs.join(', ')}\n`);

  let passed=0,failed=0;
  for(const slug of slugs){
    const sqlitePath=path.join(BRANDS_DIR,slug,'db.sqlite');
    const jsonPath=path.join(BRANDS_DIR,slug,'db.json');
    let data=null;

    if(fs.existsSync(sqlitePath)){
      console.log(`[${slug}] Reading from SQLite...`);
      try{
        const sdb=sqlite3(sqlitePath,{readonly:true});
        data={};
        const tables={tickets:'tickets',issues:'issues',users:'users',comments:'comments'};
        for(const[key,table]of Object.entries(tables)){
          try{data[key]=sdb.prepare(`SELECT data FROM ${table}`).all().map(r=>JSON.parse(r.data));}
          catch(e){data[key]=[];}
        }
        try{data.activityLog=sdb.prepare('SELECT data FROM activity_log ORDER BY rowid ASC').all().map(r=>JSON.parse(r.data));}catch(e){data.activityLog=[];}
        try{data.processedEmailIds=sdb.prepare('SELECT id FROM processed_email_ids').pluck().all();}catch(e){data.processedEmailIds=[];}
        const kvRows=sdb.prepare('SELECT key,value FROM kv').all();
        for(const r of kvRows){try{data[r.key]=JSON.parse(r.value);}catch(e){}}
        sdb.close();
      }catch(e){ console.error(`  [${slug}] SQLite read error:`,e.message); failed++; continue; }
    } else if(fs.existsSync(jsonPath)){
      console.log(`[${slug}] Reading from JSON...`);
      try{ data=JSON.parse(fs.readFileSync(jsonPath,'utf8')); }
      catch(e){ console.error(`  [${slug}] JSON read error:`,e.message); failed++; continue; }
    } else {
      console.log(`[${slug}] No data file found, skipping.`); continue;
    }

    try{
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const upsert=async(table,items)=>{
          if(!Array.isArray(items))return;
          for(const item of items){
            const id=String(item.id||item.email||Math.random());
            await conn.query(`INSERT INTO ${table}(slug,id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)`,[slug,id,JSON.stringify(item)]);
          }
        };
        await upsert('brand_tickets',data.tickets);
        await upsert('brand_issues',data.issues);
        await upsert('brand_users',data.users);
        await upsert('brand_comments',data.comments);
        if(Array.isArray(data.activityLog)){
          for(const entry of data.activityLog){
            const raw=entry.timestamp||entry.at||new Date().toISOString();
            const ts=new Date(raw).toISOString().slice(0,19).replace('T',' ');
            await conn.query('INSERT INTO brand_activity_log(slug,ts,data) VALUES(?,?,?)',[slug,ts,JSON.stringify(entry)]);
          }
        }
        if(Array.isArray(data.processedEmailIds)){
          for(const id of data.processedEmailIds){
            await conn.query('INSERT IGNORE INTO brand_processed_emails(slug,id) VALUES(?,?)',[slug,String(id)]);
          }
        }
        const skipKeys=new Set(['tickets','issues','users','comments','activityLog','processedEmailIds']);
        for(const[key,val]of Object.entries(data)){
          if(!skipKeys.has(key)&&val!==undefined){
            try{await conn.query('INSERT INTO brand_kv(slug,`key`,value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[slug,key,JSON.stringify(val)]);}catch(e){}
          }
        }
        await conn.commit();
        console.log(`  [${slug}] ✓ tickets:${(data.tickets||[]).length} users:${(data.users||[]).length} issues:${(data.issues||[]).length}`);
        passed++;
      }catch(e){
        await conn.rollback();
        throw e;
      }finally{ conn.release(); }
    }catch(e){ console.error(`  [${slug}] MySQL write error:`,e.message); failed++; }
  }

  await pool.end();
  console.log(`\nDone. ${passed} succeeded, ${failed} failed.`);
  process.exit(failed>0?1:0);
}

main().catch(e=>{ console.error('Fatal:',e.message); process.exit(1); });
