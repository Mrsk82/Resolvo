// TechTrack — Multi-Tenant SaaS Server
require('dotenv').config();
const express=require('express'),cors=require('cors'),path=require('path'),fs=require('fs'),{v4:uuidv4}=require('uuid');
const bcrypt=require('bcryptjs');
const app=express(),PORT=process.env.PORT||3000;
// BASE_URL is a getter so it always reflects the latest value (updated via /api/owner/base-url)
Object.defineProperty(global,'BASE_URL',{
  get:()=>global.BASE_URL_OVERRIDE||process.env.BASE_URL||`http://localhost:${PORT}`,
  configurable:true
});
const OWNER_PATH=path.join(__dirname,'data','owner.json'),BRANDS_DIR=path.join(__dirname,'data','brands');
// Auto-create data directories on fresh deploy (VPS without data/)
const fs_init=require('fs');
if(!fs_init.existsSync(BRANDS_DIR))fs_init.mkdirSync(BRANDS_DIR,{recursive:true});
app.use(cors());app.use(express.json({limit:'20mb'}));
app.use(express.static(path.join(__dirname,'public')));
app.set('trust proxy',1); // trust ngrok/Railway proxy for req.ip

// ── Password helpers ──────────────────────────────────────────────────────────
function hashPwd(plain){return bcrypt.hashSync(plain,10);}
function checkPwd(plain,hash){
  if(!hash||!plain)return false;
  if(hash.startsWith('$2'))return bcrypt.compareSync(plain,hash); // bcrypt
  return plain===hash; // legacy plain-text (migrated on next login)
}

// ── Rate limiting (5 attempts per 15 min per IP) ───────────────────────────────
const loginAttempts={};
function isRateLimited(ip){
  const now=Date.now(),k=ip||'unknown';
  if(!loginAttempts[k]||now>loginAttempts[k].resetAt)loginAttempts[k]={count:0,resetAt:now+900000};
  return++loginAttempts[k].count>5;
}
function clearRateLimit(ip){delete loginAttempts[ip||'unknown'];}

// ── Session expiry (8h default, 30 days with remember-me) ─────────────────────
const SESSION_8H=8*3600000, SESSION_30D=30*24*3600000;
function getSessionUser(req){
  const t=req.headers['x-session-token'];
  if(!t||!sessions[t])return null;
  if(sessions[t].expiresAt&&Date.now()>sessions[t].expiresAt){delete sessions[t];return null;}
  return sessions[t];
}

// ── Password reset tokens (in-memory, 1h TTL) ─────────────────────────────────
// Password reset tokens — stored in owner.json so they survive server restarts
// DB CHANGE: adds owner.pwdResetTokens — backward safe
function getPwdResetTokens(){const o=readOwner();return o.pwdResetTokens||{};}
function savePwdResetToken(token,data){const o=readOwner();o.pwdResetTokens=o.pwdResetTokens||{};o.pwdResetTokens[token]=data;// Clean expired tokens
Object.keys(o.pwdResetTokens).forEach(k=>{if(o.pwdResetTokens[k].expiresAt<Date.now())delete o.pwdResetTokens[k];});writeOwner(o);}
function deletePwdResetToken(token){const o=readOwner();if(o.pwdResetTokens)delete o.pwdResetTokens[token];writeOwner(o);}
const pwdResetTokens={}; // kept for legacy compat

// ── Webhook helper ─────────────────────────────────────────────────────────────
async function fireWebhook(url,payload){
  if(!url||url==='false'||!url.startsWith('http'))return;
  try{const axios=require('axios');await axios.post(url,payload,{timeout:5000});}
  catch(e){console.error('[Webhook] Failed:',e.message);}
}

// ── Invite tokens ──────────────────────────────────────────────────────────────
const inviteTokens={}; // { token: { brandSlug, brandName, expiresAt, role } }

// ── TIER FEATURE DEFAULTS ──────────────────────────────────────────────────
// Owner assigns tier per brand → tier sets what features are ON by default
// Owner can then override individual features per brand via Owner Portal
const _base={KANBAN_ENABLED:false,SPRINTS_ENABLED:false,AI_ENABLED:false,EMAIL_TRIAGE_ENABLED:false,PEER_REVIEW_ENABLED:false,ON_CALL_ENABLED:false,TIME_LOGGING_ENABLED:false,CUSTOM_FIELDS_ENABLED:false,RELEASE_NOTES_ENABLED:false,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:false,DEPENDENCY_GRAPH_ENABLED:false,WATCHERS_ENABLED:true,REACTIONS_ENABLED:false,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:false,BULK_ACTIONS_ENABLED:false,ANNOUNCEMENT_BAR_ENABLED:false,ISSUE_TEMPLATES_ENABLED:false,API_INTEGRATION_ENABLED:false,ANALYTICS_ENABLED:false,WORKLOAD_ENABLED:false,SLA_REPORT_ENABLED:false,
  // New features
  EMAIL_TICKETING_ENABLED:false,QUEUE_ENABLED:false,APPOINTMENT_BOOKING_ENABLED:false,KNOWLEDGE_BASE_ENABLED:false,ROADMAP_ENABLED:false,API_KEYS_ENABLED:false,TWO_FA_ENABLED:false,APPROVAL_WORKFLOWS_ENABLED:false,CUSTOMER_PORTAL_ENABLED:false,WIDGET_ENABLED:false,GDPR_TOOLS_ENABLED:false,SLA_POLICIES_ENABLED:false,COST_REPORT_ENABLED:false,AGENT_COACHING_ENABLED:false,IMPACT_SCORE_ENABLED:false};
const _pro={...{KANBAN_ENABLED:true,SPRINTS_ENABLED:true,AI_ENABLED:true,PEER_REVIEW_ENABLED:true,ON_CALL_ENABLED:true,TIME_LOGGING_ENABLED:true,CUSTOM_FIELDS_ENABLED:true,RELEASE_NOTES_ENABLED:true,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:true,DEPENDENCY_GRAPH_ENABLED:true,WATCHERS_ENABLED:true,REACTIONS_ENABLED:true,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:true,BULK_ACTIONS_ENABLED:true,ANNOUNCEMENT_BAR_ENABLED:true,ISSUE_TEMPLATES_ENABLED:true,ANALYTICS_ENABLED:true,WORKLOAD_ENABLED:true,SLA_REPORT_ENABLED:true,
  EMAIL_TICKETING_ENABLED:true,QUEUE_ENABLED:true,KNOWLEDGE_BASE_ENABLED:true,ROADMAP_ENABLED:true,TWO_FA_ENABLED:true,APPROVAL_WORKFLOWS_ENABLED:true,IMPACT_SCORE_ENABLED:true}};
const TIER_FEATURES={
  Free:_base,
  Pro:_pro,
  Enterprise:{..._pro,EMAIL_TRIAGE_ENABLED:true,API_INTEGRATION_ENABLED:true,API_KEYS_ENABLED:true,APPOINTMENT_BOOKING_ENABLED:true,CUSTOMER_PORTAL_ENABLED:true,WIDGET_ENABLED:true,GDPR_TOOLS_ENABLED:true,SLA_POLICIES_ENABLED:true,COST_REPORT_ENABLED:true,AGENT_COACHING_ENABLED:true},
  Trial:{..._pro,EMAIL_TRIAGE_ENABLED:false,API_INTEGRATION_ENABLED:false,API_KEYS_ENABLED:false,CUSTOMER_PORTAL_ENABLED:false,WIDGET_ENABLED:false,GDPR_TOOLS_ENABLED:false}
};
const FEATURE_META=[
  // Workflow
  {key:'KANBAN_ENABLED',label:'Kanban Board',group:'Workflow',tier:'Pro'},
  {key:'SPRINTS_ENABLED',label:'Sprints & Burndown',group:'Workflow',tier:'Pro'},
  {key:'BULK_ACTIONS_ENABLED',label:'Bulk Actions',group:'Workflow',tier:'Pro'},
  {key:'DEPENDENCY_GRAPH_ENABLED',label:'Dependencies',group:'Workflow',tier:'Pro'},
  {key:'ISSUE_TEMPLATES_ENABLED',label:'Issue Templates',group:'Workflow',tier:'Pro'},
  {key:'APPROVAL_WORKFLOWS_ENABLED',label:'Approval Workflows',group:'Workflow',tier:'Pro'},
  // Intelligence
  {key:'AI_ENABLED',label:'AI / Gemini',group:'Intelligence',tier:'Pro'},
  {key:'EMAIL_TRIAGE_ENABLED',label:'Email Triage (AI)',group:'Intelligence',tier:'Enterprise'},
  {key:'FULL_TEXT_SEARCH_ENABLED',label:'Full Text Search',group:'Intelligence',tier:'Free'},
  {key:'IMPACT_SCORE_ENABLED',label:'Issue Impact Score',group:'Intelligence',tier:'Pro'},
  // Email & Ticketing
  {key:'EMAIL_TICKETING_ENABLED',label:'Email Ticketing Inbox',group:'Email & Support',tier:'Pro'},
  {key:'QUEUE_ENABLED',label:'Smart Queue / Auto-assign',group:'Email & Support',tier:'Pro'},
  {key:'KNOWLEDGE_BASE_ENABLED',label:'Knowledge Base',group:'Email & Support',tier:'Pro'},
  {key:'APPOINTMENT_BOOKING_ENABLED',label:'Appointment Booking',group:'Email & Support',tier:'Enterprise'},
  {key:'CUSTOMER_PORTAL_ENABLED',label:'Customer Self-Service Portal',group:'Email & Support',tier:'Enterprise'},
  {key:'WIDGET_ENABLED',label:'Embeddable Feedback Widget',group:'Email & Support',tier:'Enterprise'},
  // Reporting
  {key:'ANALYTICS_ENABLED',label:'Analytics',group:'Reporting',tier:'Pro'},
  {key:'WORKLOAD_ENABLED',label:'Workload View',group:'Reporting',tier:'Pro'},
  {key:'SLA_REPORT_ENABLED',label:'SLA Report',group:'Reporting',tier:'Pro'},
  {key:'RELEASE_NOTES_ENABLED',label:'Release Notes',group:'Reporting',tier:'Pro'},
  {key:'POSTMORTEM_ENABLED',label:'Post-Mortems',group:'Reporting',tier:'Pro'},
  {key:'COST_REPORT_ENABLED',label:'Cost Report',group:'Reporting',tier:'Enterprise'},
  {key:'AGENT_COACHING_ENABLED',label:'Agent Coaching Dashboard',group:'Reporting',tier:'Enterprise'},
  // Collaboration
  {key:'PEER_REVIEW_ENABLED',label:'Peer Review',group:'Collaboration',tier:'Pro'},
  {key:'ON_CALL_ENABLED',label:'On-Call Schedule',group:'Collaboration',tier:'Pro'},
  {key:'TIME_LOGGING_ENABLED',label:'Time Logging',group:'Collaboration',tier:'Pro'},
  {key:'WATCHERS_ENABLED',label:'Watchers',group:'Collaboration',tier:'Free'},
  // Customisation
  {key:'CUSTOM_FIELDS_ENABLED',label:'Custom Fields',group:'Customisation',tier:'Pro'},
  {key:'TAGS_ENABLED',label:'Issue Tags',group:'Customisation',tier:'Pro'},
  {key:'REACTIONS_ENABLED',label:'Comment Reactions',group:'Customisation',tier:'Pro'},
  {key:'PINNED_ISSUES_ENABLED',label:'Pinned Issues',group:'Customisation',tier:'Free'},
  {key:'ANNOUNCEMENT_BAR_ENABLED',label:'Announcement Bar',group:'Customisation',tier:'Pro'},
  {key:'ROADMAP_ENABLED',label:'Public Roadmap',group:'Customisation',tier:'Pro'},
  // Compliance & Security
  {key:'AUDIT_TRAIL_ENABLED',label:'Audit Trail',group:'Compliance',tier:'Free'},
  {key:'TWO_FA_ENABLED',label:'Two-Factor Auth (2FA)',group:'Compliance',tier:'Pro'},
  {key:'GDPR_TOOLS_ENABLED',label:'GDPR / Data Erasure Tools',group:'Compliance',tier:'Enterprise'},
  {key:'SLA_POLICIES_ENABLED',label:'Customer SLA Policies',group:'Compliance',tier:'Enterprise'},
  // Integrations
  {key:'API_INTEGRATION_ENABLED',label:'Jira/ServiceNow API Sync',group:'Integrations',tier:'Enterprise'},
  {key:'API_KEYS_ENABLED',label:'API Key Access',group:'Integrations',tier:'Enterprise'},
];
function resolveFeatureFlags(brand,adf){return{...(TIER_FEATURES[brand.tier]||TIER_FEATURES.Free),...(adf||{}),...(brand.featureOverrides||{})};}
// Server-side feature gate — returns error object if feature disabled
function requireFeature(flags,key){
  if(!flags[key])return{success:false,error:`Feature not available on your plan. Contact your platform admin to enable ${key}.`,featureRequired:key};
  return null;
}
function ownerAuditLog(owner,action,details,by){owner.auditLog=owner.auditLog||[];owner.auditLog.unshift({id:uuidv4().substring(0,8),action,details,by,timestamp:new Date().toISOString()});if(owner.auditLog.length>500)owner.auditLog=owner.auditLog.slice(0,500);}
function readOwner(){return JSON.parse(fs.readFileSync(OWNER_PATH,'utf8'));}
function writeOwner(d){fs.writeFileSync(OWNER_PATH,JSON.stringify(d,null,2),'utf8');}
function brandDbPath(slug){return path.join(BRANDS_DIR,slug,'db.json');}

// ══════════════════════════════════════════════════════════════════════════
// MYSQL DATABASE LAYER
// Single MySQL database, all brands share tables with slug as partition key.
// Interface unchanged — readBrandDB / writeBrandDB same JS object shape.
// Config: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE env vars
// ══════════════════════════════════════════════════════════════════════════
const _mysql=require('mysql2/promise');
let _mysqlPool=null;
let _mysqlReady=false;

function _getPool(){
  if(_mysqlPool)return _mysqlPool;
  _mysqlPool=_mysql.createPool({
    host:    process.env.MYSQL_HOST||'localhost',
    port:    parseInt(process.env.MYSQL_PORT||'3306'),
    user:    process.env.MYSQL_USER||'resolvo_user',
    password:process.env.MYSQL_PASSWORD||'Resolvo@2024!',
    database:process.env.MYSQL_DATABASE||'resolvo',
    waitForConnections:true,
    connectionLimit:10,
    charset:'utf8mb4',
  });
  return _mysqlPool;
}

// Initialise schema once on startup
async function _initMySQL(){
  const pool=_getPool();
  const conn=await pool.getConnection();
  try{
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_tickets(
      slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,
      data MEDIUMTEXT NOT NULL,
      status_col VARCHAR(50) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))) VIRTUAL,
      priority_col VARCHAR(50) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data,'$.priority'))) VIRTUAL,
      assigned_col VARCHAR(100) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data,'$.assignedTo'))) VIRTUAL,
      PRIMARY KEY(slug,id),
      INDEX idx_status(slug,status_col),
      INDEX idx_priority(slug,priority_col),
      INDEX idx_assigned(slug,assigned_col)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_issues(
      slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,
      data MEDIUMTEXT NOT NULL,
      PRIMARY KEY(slug,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_users(
      slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,
      data MEDIUMTEXT NOT NULL,
      email_col VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data,'$.email'))) VIRTUAL,
      PRIMARY KEY(slug,id),
      INDEX idx_email(slug,email_col)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_comments(
      slug VARCHAR(100) NOT NULL,id VARCHAR(100) NOT NULL,
      data MEDIUMTEXT NOT NULL,
      PRIMARY KEY(slug,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_activity_log(
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(100) NOT NULL,ts DATETIME,
      data MEDIUMTEXT NOT NULL,
      INDEX idx_slug_ts(slug,ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_processed_emails(
      slug VARCHAR(100) NOT NULL,id VARCHAR(255) NOT NULL,
      ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(slug,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS brand_kv(
      slug VARCHAR(100) NOT NULL,\`key\` VARCHAR(100) NOT NULL,
      value MEDIUMTEXT NOT NULL,
      PRIMARY KEY(slug,\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    _mysqlReady=true;
    console.log('[MySQL] Schema ready');
  }finally{conn.release();}
}
_initMySQL().catch(e=>console.error('[MySQL] Init failed:',e.message));

const ROW_TABLES={tickets:'brand_tickets',issues:'brand_issues',users:'brand_users',comments:'brand_comments'};
const KV_KEYS=[
  'settings','slaConfig','emailTicketing','features','featureFlags',
  'queueConfig','bookingConfig','slackAlerts','autoResolveRules',
  'sprints','dependencies','customFields','customFieldValues',
  'onCallSchedule','savedFilters','escalationRules','recurringTemplates',
  'commits','peerReviews','emailThreads','inboundRules','aiHistory',
  'tags','coAssignees','votes','timeLogs','watchers','reactions',
  'pinnedIssues','postMortems','auditTrail','announcements','teams',
];

// In-memory cache per brand to keep reads fast (invalidated on every write)
const _brandCache={};

function readBrandDB(slug){
  if(_brandCache[slug])return _brandCache[slug];
  // Sync fallback — read from SQLite file if MySQL not ready yet
  // (handles cold-start race condition)
  if(!_mysqlReady){
    const sqlitePath=path.join(BRANDS_DIR,slug,'db.sqlite');
    if(fs.existsSync(sqlitePath)){
      try{
        const _sq=require('better-sqlite3');
        const sdb=_sq(sqlitePath,{readonly:true});
        const result={};
        for(const[jsKey,]of Object.entries(ROW_TABLES)){
          const t=jsKey==='tickets'?'tickets':jsKey==='issues'?'issues':jsKey==='users'?'users':'comments';
          try{result[jsKey]=sdb.prepare(`SELECT data FROM ${t}`).all().map(r=>JSON.parse(r.data));}catch(e){result[jsKey]=[];}
        }
        result.activityLog=[];
        try{result.activityLog=sdb.prepare('SELECT data FROM activity_log ORDER BY rowid ASC').all().map(r=>JSON.parse(r.data));}catch(e){}
        result.processedEmailIds=[];
        try{result.processedEmailIds=sdb.prepare('SELECT id FROM processed_email_ids').pluck().all();}catch(e){}
        const kvRows=sdb.prepare('SELECT key,value FROM kv').all();
        for(const r of kvRows){try{result[r.key]=JSON.parse(r.value);}catch(e){}}
        sdb.close();
        return result;
      }catch(e){}
    }
    const jsonPath=brandDbPath(slug);
    if(fs.existsSync(jsonPath)){try{return JSON.parse(fs.readFileSync(jsonPath,'utf8'));}catch(e){}}
    return {};
  }
  // Should not reach here in normal flow — async reads handled by readBrandDBAsync
  return _brandCache[slug]||{};
}

async function readBrandDBAsync(slug){
  if(_brandCache[slug])return _brandCache[slug];
  if(!_mysqlReady){return readBrandDB(slug);}
  const pool=_getPool();
  const result={};
  const [[tickets]]=await pool.query('SELECT id,data FROM brand_tickets WHERE slug=?',[slug]);
  result.tickets=(tickets||[]).map(r=>{try{return JSON.parse(r.data);}catch(e){return null;}}).filter(Boolean);
  const [[issues]]=await pool.query('SELECT id,data FROM brand_issues WHERE slug=?',[slug]);
  result.issues=(issues||[]).map(r=>{try{return JSON.parse(r.data);}catch(e){return null;}}).filter(Boolean);
  const [[users]]=await pool.query('SELECT id,data FROM brand_users WHERE slug=?',[slug]);
  result.users=(users||[]).map(r=>{try{return JSON.parse(r.data);}catch(e){return null;}}).filter(Boolean);
  const [[comments]]=await pool.query('SELECT id,data FROM brand_comments WHERE slug=?',[slug]);
  result.comments=(comments||[]).map(r=>{try{return JSON.parse(r.data);}catch(e){return null;}}).filter(Boolean);
  const [[actLog]]=await pool.query('SELECT data FROM brand_activity_log WHERE slug=? ORDER BY id ASC',[slug]);
  result.activityLog=(actLog||[]).map(r=>{try{return JSON.parse(r.data);}catch(e){return null;}}).filter(Boolean);
  const [[emailIds]]=await pool.query('SELECT id FROM brand_processed_emails WHERE slug=?',[slug]);
  result.processedEmailIds=(emailIds||[]).map(r=>r.id);
  const [[kvRows]]=await pool.query('SELECT `key`,value FROM brand_kv WHERE slug=?',[slug]);
  for(const r of(kvRows||[])){try{result[r.key]=JSON.parse(r.value);}catch(e){}}
  _brandCache[slug]=result;
  return result;
}

function writeBrandDB(slug,data){
  // Invalidate cache
  delete _brandCache[slug];
  if(!_mysqlReady){
    // Fallback: write to SQLite if MySQL not ready
    const sqlitePath=path.join(BRANDS_DIR,slug,'db.sqlite');
    if(fs.existsSync(sqlitePath)){
      try{
        const _sq=require('better-sqlite3');
        const sdb=_sq(sqlitePath);
        sdb.pragma('journal_mode=WAL');
        const upsert=(table,items)=>{
          if(!Array.isArray(items))return;
          const stmt=sdb.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
          const newIds=new Set();
          for(const item of items){const id=item.id||item.email||String(Math.random());newIds.add(id);stmt.run(id,JSON.stringify(item));}
          const existing=sdb.prepare(`SELECT id FROM ${table}`).pluck().all();
          const del=sdb.prepare(`DELETE FROM ${table} WHERE id=?`);
          for(const id of existing){if(!newIds.has(id))del.run(id);}
        };
        sdb.transaction(()=>{
          upsert('tickets',data.tickets);upsert('issues',data.issues);
          upsert('users',data.users);upsert('comments',data.comments);
          const upsertKV=sdb.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
          for(const key of KV_KEYS){if(data[key]!==undefined)upsertKV.run(key,JSON.stringify(data[key]));}
        })();
        sdb.close();
        return;
      }catch(e){console.error('[DB] SQLite fallback write failed:',e.message);}
    }
    // Last resort: JSON
    const jsonPath=brandDbPath(slug);
    const dir=path.join(BRANDS_DIR,slug);
    if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(jsonPath,JSON.stringify(data,null,2),'utf8');
    return;
  }
  // Async write — fire and forget with error logging
  _writeBrandDBAsync(slug,data).catch(e=>console.error('[MySQL] writeBrandDB failed for',slug,e.message));
}

async function _writeBrandDBAsync(slug,data){
  const pool=_getPool();
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    // Upsert row tables
    const upsertRows=async(table,items)=>{
      if(!Array.isArray(items)||items.length===0){
        await conn.query(`DELETE FROM ${table} WHERE slug=?`,[slug]);
        return;
      }
      const newIds=new Set();
      for(const item of items){
        const id=String(item.id||item.email||Math.random());
        newIds.add(id);
        await conn.query(`INSERT INTO ${table}(slug,id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)`,[slug,id,JSON.stringify(item)]);
      }
      // Delete removed rows
      const [existing]=await conn.query(`SELECT id FROM ${table} WHERE slug=?`,[slug]);
      for(const row of existing){
        if(!newIds.has(row.id))await conn.query(`DELETE FROM ${table} WHERE slug=? AND id=?`,[slug,row.id]);
      }
    };
    await upsertRows('brand_tickets',data.tickets);
    await upsertRows('brand_issues',data.issues);
    await upsertRows('brand_users',data.users);
    await upsertRows('brand_comments',data.comments);
    // Activity log — append only, capped at 2000
    if(Array.isArray(data.activityLog)&&data.activityLog.length>0){
      const [[countRow]]=await conn.query('SELECT COUNT(*) as c FROM brand_activity_log WHERE slug=?',[slug]);
      const stored=countRow[0]?countRow[0].c:0;
      const newEntries=data.activityLog.slice(stored);
      for(const entry of newEntries){
        const ts=entry.timestamp||entry.at||new Date().toISOString();
        await conn.query('INSERT INTO brand_activity_log(slug,ts,data) VALUES(?,?,?)',[slug,ts,JSON.stringify(entry)]);
      }
      // Cap at 2000
      await conn.query(`DELETE FROM brand_activity_log WHERE slug=? AND id NOT IN (
        SELECT id FROM (SELECT id FROM brand_activity_log WHERE slug=? ORDER BY id DESC LIMIT 2000) t)`,[slug,slug]);
    }
    // Processed email IDs
    if(Array.isArray(data.processedEmailIds)){
      for(const id of data.processedEmailIds.slice(-5000)){
        await conn.query('INSERT IGNORE INTO brand_processed_emails(slug,id) VALUES(?,?)',[slug,String(id)]);
      }
    }
    // KV blobs
    const knownKeys=new Set([...Object.keys(ROW_TABLES),'activityLog','processedEmailIds']);
    const allKvKeys=[...KV_KEYS];
    for(const[key,val]of Object.entries(data)){if(!knownKeys.has(key))allKvKeys.push(key);}
    for(const key of [...new Set(allKvKeys)]){
      if(data[key]!==undefined){
        try{await conn.query('INSERT INTO brand_kv(slug,`key`,value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[slug,key,JSON.stringify(data[key])]);}
        catch(e){}
      }
    }
    await conn.commit();
  }catch(e){
    await conn.rollback();
    throw e;
  }finally{conn.release();}
}
function generateId(p){return p+'-'+uuidv4().substring(0,8).toUpperCase();}
function generateIssueId(slug){const db=readBrandDB(slug);return 'ISS-'+String((db.issues||[]).length+1).padStart(4,'0');}
function logActivity(db,issueId,action,user){db.activityLog=db.activityLog||[];db.activityLog.push({issueId,action,user,timestamp:new Date().toISOString()});}
function defaultBrandDB(brandName,email,name,pass){
  const now=new Date().toISOString();
  return{users:[{id:'USR-'+uuidv4().substring(0,8).toUpperCase(),email,name:name||email.split('@')[0],team:'Management',role:'Admin',skill:'',slackId:'',maxTickets:50,active:true,createdDate:now,passwordHash:pass||email.split('@')[0]+'123',firstLogin:true}],issues:[],comments:[],activityLog:[],slaConfig:{Critical:4,High:8,Medium:24,Low:72},settings:{AUTO_ASSIGN_ENABLED:'false',DUPLICATE_DETECTION_ENABLED:'true',MODULES:'API,Dashboard,Reports,Authentication,Database,UI,Integration,Backend,Frontend,DevOps',APP_NAME:brandName,GEMINI_API_KEY:'',SLACK_WEBHOOK_URL:'',WEBHOOK_ALERT_URL:'',WEBHOOK_CRITICAL_ONLY:'false',GOOGLE_CALENDAR_ID:'false'},sprints:[],dependencies:[],customFields:[],customFieldValues:[],onCallSchedule:[],savedFilters:[],escalationRules:[],recurringTemplates:[],commits:[],peerReviews:[],emailThreads:[],inboundRules:[],aiHistory:[],tags:[],coAssignees:[],votes:[],timeLogs:[],watchers:[],reactions:[],pinnedIssues:[],featureFlags:{},postMortems:[],auditTrail:[],announcements:[],teams:[]};
}

// EMAIL
let _mailer=null;
function getMailer(){
  if(_mailer)return _mailer;
  const en=String(process.env.EMAIL_ENABLED||'').toLowerCase();
  if(!['true','1','yes'].includes(en))return null;
  const user=process.env.EMAIL_USER||'',pass=(process.env.EMAIL_PASS||'').replace(/\s/g,'');
  if(!user||!pass){console.warn('[Email] Missing EMAIL_USER/EMAIL_PASS');return null;}
  try{const nm=require('nodemailer');_mailer=nm.createTransport({service:'gmail',auth:{user,pass}});console.log('[Email] Ready:',user);return _mailer;}
  catch(e){console.error('[Email] Failed:',e.message);return null;}
}
// Owner FROM address — always shows contact@resolvogroup.com
// regardless of which Gmail account is actually sending
const OWNER_FROM_EMAIL = process.env.OWNER_EMAIL || 'contact@resolvogroup.com';
const OWNER_FROM = `"Resolvo" <${OWNER_FROM_EMAIL}>`;

async function sendEmail(to,subject,html,text,fromOverride){
  const t=getMailer();if(!t){console.log('[Email] SKIPPED:',to);return;}
  // Always show contact@resolvogroup.com as sender for owner emails
  const fromAddr=fromOverride||OWNER_FROM;
  try{
    await t.sendMail({
      from:fromAddr,
      to,
      subject,
      text:text||subject,
      html,
      replyTo:OWNER_FROM_EMAIL // replies go to contact@resolvogroup.com
    });
    console.log('[Email] ✓:',to);
  }
  catch(e){console.error('[Email] ✗',e.message);_mailer=null;}
}
// Feature A: Per-brand mailer — uses brand's own SMTP email if configured
const _brandMailers={};
function getBrandMailer(slug){
  try{
    const db=readBrandDB(slug);
    const s=db.settings||{};
    const bEmail=s.BRAND_NOTIFY_EMAIL||'';
    const bPass=(s.BRAND_NOTIFY_PASS||'').replace(/\s/g,'');
    if(!bEmail||!bPass)return null;
    // Use brand name from owner.json, not generic APP_NAME
    const owner=readOwner();
    const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
    const displayName=brand.name||s.APP_NAME||'Support';
    if(_brandMailers[bEmail])return{mailer:_brandMailers[bEmail],from:`"${displayName}" <${bEmail}>`};
    const nm=require('nodemailer');
    const t=nm.createTransport({service:'gmail',auth:{user:bEmail,pass:bPass}});
    _brandMailers[bEmail]=t;
    console.log('[BrandEmail] Ready:',bEmail,'for slug:',slug);
    return{mailer:t,from:`"${displayName}" <${bEmail}>`};
  }catch(e){return null;}
}
async function sendBrandEmail(slug,to,subject,html,text){
  const bm=getBrandMailer(slug);
  if(bm){
    try{await bm.mailer.sendMail({from:bm.from,to,subject,text:text||subject,html});console.log('[BrandEmail] ✓:',to);return;}
    catch(e){
      console.error('[BrandEmail] ✗',e.message);
      // SMTP configured but failed — alert brand admin
      try{
        const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
        const adminEmail=brand.majorAdminEmail;
        if(adminEmail){
          const errHtml=`<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border-left:4px solid #ef4444;"><h3 style="color:#ef4444;margin:0 0 12px;">⚠️ Email Send Failed — ${brand.name||slug}</h3><p style="font-size:14px;color:#374151;">An email to <strong>${to}</strong> could not be sent because your SMTP credentials failed.</p><p style="font-size:14px;color:#374151;"><strong>Subject:</strong> ${subject}</p><p style="font-size:14px;color:#374151;"><strong>Error:</strong> ${e.message}</p><p style="font-size:13px;color:#6b7280;margin-top:16px;">Please check your brand email settings: Settings → Email & Ticketing → Brand Email SMTP.</p><a href="${BASE_URL}" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#ef4444;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Fix Email Settings →</a></div>`;
          await sendEmail(adminEmail,`⚠️ Email send failed for ${brand.name||slug}`,errHtml,`Email to ${to} failed: ${e.message}. Check your SMTP settings.`);
        }
      }catch(_){}
      return;
    }
  } else {
    // No brand SMTP configured — do NOT send to customer, notify brand admin instead
    try{
      const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
      const adminEmail=brand.majorAdminEmail;
      if(adminEmail){
        const warnHtml=`<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border-left:4px solid #f59e0b;"><h3 style="color:#f59e0b;margin:0 0 12px;">📧 Configure Your Brand Email — ${brand.name||slug}</h3><p style="font-size:14px;color:#374151;">An email to your customer <strong>${to}</strong> was <strong>not sent</strong> because your brand email is not configured.</p><p style="font-size:14px;color:#374151;"><strong>Pending subject:</strong> ${subject}</p><p style="font-size:14px;color:#6b7280;margin-top:12px;">To send auto-acknowledgements, ticket replies, and notifications from your own email address, you need to set up your brand SMTP:</p><ol style="font-size:14px;color:#374151;line-height:2;padding-left:20px;"><li>Go to <strong>Settings → Email & Ticketing</strong></li><li>Click <strong>Configure Brand Email</strong></li><li>Enter your Gmail or SMTP credentials</li><li>Click <strong>Test & Save</strong></li></ol><a href="${BASE_URL}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#10B981;color:#000;border-radius:8px;text-decoration:none;font-weight:700;">Configure Email Now →</a><p style="font-size:12px;color:#9ca3af;margin-top:16px;">Until configured, no automated emails will be sent to your customers.</p></div>`;
        await sendEmail(adminEmail,`📧 Action Required: Configure your brand email — ${brand.name||slug}`,warnHtml,`Email to ${to} was not sent. Configure your brand SMTP in Settings → Email & Ticketing.`);
        console.log(`[BrandEmail] No SMTP for ${slug} — notified admin ${adminEmail}`);
      }
    }catch(_){}
  }
}
function cr(label,val,vs){return`<tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;width:110px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;">${label}</td><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;${vs||'color:#111827;'}">${val}</td></tr>`;}
function shell(c){return`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;"><tr><td align="center"><table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">${c}<tr><td style="padding:24px 0;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Powered by <strong>TechTrack</strong> · Do not reply</p></td></tr></table></td></tr></table></body></html>`;}

function brandWelcomeHTML(user,brandName,brandColor,ip,loginUrl){
  const c=brandColor||'#f5a623';const rc={Admin:'#7c3aed',Developer:'#b45309',CS:'#1d4ed8',Sales:'#065f46',QA:'#9d174d',Product:'#0f766e'}[user.role]||'#6b7280';
  return shell(`<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,${c},${c}cc);border-radius:16px 16px 0 0;"><tr><td style="padding:44px 40px;text-align:center;"><div style="font-size:40px;margin-bottom:14px;">👋</div><h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;">Welcome to ${brandName}</h1><p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Your account is ready.</p></td></tr></table></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="padding:32px 40px 20px;"><p style="font-size:15px;color:#374151;">Hi <strong>${user.name||user.email.split('@')[0]}</strong>, use the credentials below to log in.</p></td></tr><tr><td style="padding:0 40px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;"><tr><td style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;">Login Details</td></tr>${cr('Email','<span style="font-family:monospace;color:#2563eb;">'+user.email+'</span>')}${cr('Password','<span style="font-family:monospace;font-weight:700;color:'+c+';background:'+c+'15;padding:3px 10px;border-radius:6px;">'+ip+'</span>')}${cr('Role','<span style="display:inline-block;padding:3px 12px;border-radius:20px;background:'+rc+'15;color:'+rc+';font-size:12px;font-weight:700;">'+user.role+'</span>')}${cr('URL','<a href="'+loginUrl+'" style="color:#2563eb;font-family:monospace;text-decoration:none;">'+loginUrl+'</a>','color:#2563eb;')}</table></td></tr><tr><td style="padding:0 40px 36px;text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:14px 44px;border-radius:10px;background:${c};color:#fff;font-size:15px;font-weight:700;text-decoration:none;">Log In Now &rarr;</a></td></tr></table></td></tr>`);
}
function majorAdminWelcomeHTML(admin,brandName,brandColor,ip,loginUrl){
  const c=brandColor||'#f5a623';
  return shell(`<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1e293b,${c}dd);border-radius:16px 16px 0 0;"><tr><td style="padding:50px 40px 44px;text-align:center;"><div style="font-size:36px;margin-bottom:16px;">🏢</div><h1 style="margin:0;font-size:30px;font-weight:800;color:#fff;">${brandName} is Live</h1><p style="margin:12px 0 0;font-size:15px;color:rgba(255,255,255,0.75);">Your workspace is ready. You are the Administrator.</p></td></tr></table></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="padding:32px 40px 20px;"><p style="font-size:15px;color:#374151;">Hi <strong>${admin.name}</strong> — log in and invite your team.</p></td></tr><tr><td style="padding:0 40px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;"><tr><td style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;">Admin Credentials</td></tr>${cr('URL','<a href="'+loginUrl+'" style="color:#2563eb;font-family:monospace;text-decoration:none;">'+loginUrl+'</a>','color:#2563eb;')}${cr('Email','<span style="font-family:monospace;color:#2563eb;">'+admin.email+'</span>')}${cr('Password','<span style="font-family:monospace;font-weight:700;color:'+c+';background:'+c+'15;padding:3px 10px;border-radius:6px;">'+ip+'</span>')}${cr('Access','<span style="display:inline-block;padding:3px 12px;border-radius:20px;background:'+c+'22;color:'+c+';font-size:12px;font-weight:700;">⭐ Major Admin</span>')}</table></td></tr><tr><td style="padding:0 40px 36px;text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:16px 52px;border-radius:12px;background:linear-gradient(135deg,${c},${c}cc);color:#fff;font-size:16px;font-weight:700;text-decoration:none;">Enter Your Platform &rarr;</a></td></tr></table></td></tr>`);
}
function issueAssignedHTML(issue,brandName,brandColor,assigneeName,loginUrl){
  const c=brandColor||'#f5a623';const pc={Critical:'#dc2626',High:'#d97706',Medium:'#ca8a04',Low:'#16a34a'}[issue.priority]||'#6b7280';
  return shell(`<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:16px 16px 0 0;"><tr><td style="padding:36px 40px;"><p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,0.4);">${brandName} · Issue Assigned</p><h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">${issue.title}</h1><p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.45);font-family:monospace;">${issue.id} · ${issue.module||'General'}</p></td></tr></table></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="padding:28px 40px 20px;"><p style="font-size:15px;color:#374151;">Hi <strong>${assigneeName}</strong>, a new issue has been assigned to you.</p></td></tr><tr><td style="padding:0 40px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;"><tr><td style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;">Issue Details</td></tr>${cr('Priority','<span style="display:inline-block;padding:3px 12px;border-radius:20px;background:'+pc+'15;color:'+pc+';font-size:12px;font-weight:700;">'+issue.priority+'</span>')}${cr('Environment',issue.environment||'—')}${cr('SLA',issue.slaHours+'h to resolve')}</table></td></tr><tr><td style="padding:0 40px 36px;text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:13px 40px;border-radius:10px;background:${c};color:#fff;font-size:14px;font-weight:700;text-decoration:none;">View Issue &rarr;</a></td></tr></table></td></tr>`);
}
function statusUpdateHTML(issue,newStatus,changedBy,brandName,brandColor,loginUrl){
  const sc={Open:'#7c3aed',Acknowledged:'#2563eb',WIP:'#d97706',Testing:'#be185d',Resolved:'#16a34a',Closed:'#6b7280',Blocked:'#dc2626',Reopened:'#dc2626'}[newStatus]||'#6b7280';
  const em={Resolved:'✅',Closed:'🔒',Blocked:'🚨',WIP:'⚙️',Testing:'🧪',Reopened:'🔄',Open:'📬',Acknowledged:'👀'}[newStatus]||'📋';
  return shell(`<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,${sc}ee,${sc}99);border-radius:16px 16px 0 0;"><tr><td style="padding:36px 40px;text-align:center;"><div style="font-size:40px;margin-bottom:10px;">${em}</div><p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,0.65);">${brandName} · Status Update</p><h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">Issue ${newStatus}</h1></td></tr></table></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="padding:28px 40px 16px;"><p style="font-size:15px;color:#374151;"><strong>${changedBy}</strong> updated the status of an issue you're involved in.</p></td></tr><tr><td style="padding:0 40px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;"><tr><td style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;">What Changed</td></tr>${cr('Issue','<strong>'+issue.title+'</strong>')}${cr('ID','<span style="font-family:monospace;color:#6b7280;">'+issue.id+'</span>')}${cr('Status','<span style="display:inline-block;padding:4px 14px;border-radius:20px;background:'+sc+'18;color:'+sc+';font-size:13px;font-weight:700;border:1px solid '+sc+'33;">'+newStatus+'</span>')}${cr('By',changedBy)}</table></td></tr><tr><td style="padding:0 40px 36px;text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:13px 40px;border-radius:10px;background:${sc};color:#fff;font-size:14px;font-weight:700;text-decoration:none;">View Issue &rarr;</a></td></tr></table></td></tr>`);
}
function testEmailHTML(){
  return shell(`<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#10b981,#059669);border-radius:16px 16px 0 0;"><tr><td style="padding:44px 40px;text-align:center;"><div style="font-size:48px;margin-bottom:14px;">✅</div><h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;">Email is Working!</h1><p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">TechTrack email notifications are configured correctly.</p></td></tr></table></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="padding:32px 40px 36px;">${[['👤 User added','Welcome email with credentials'],['🎫 Issue assigned','Assignee notified instantly'],['📊 Status changed','Raised-by + assignee updated'],['📣 Announcements','Team-wide alerts']].map(([i,t])=>`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;font-weight:600;color:#111827;">${i}</span><span style="font-size:13px;color:#6b7280;">${t}</span></div>`).join('')}</td></tr></table></td></tr>`);
}

// SESSION
const sessions={};
function getSessionUser(req){const t=req.headers['x-session-token'];return t?(sessions[t]||null):null;}

// AUTH
app.post('/api/login',(req,res)=>{
  const{email,password,rememberMe}=req.body;
  if(!email||!password)return res.json({success:false,error:'Email and password required.'});

  // Rate limit check
  const clientIp=req.ip||'unknown';
  if(isRateLimited(clientIp))return res.json({success:false,error:'Too many login attempts. Please wait 15 minutes and try again.',rateLimited:true});

  const ttl=rememberMe?SESSION_30D:SESSION_8H;
  const owner=readOwner();

  // Maintenance mode check (owner can always login, brands cannot)
  if(owner.maintenanceMode&&email!==owner.email){
    return res.json({success:false,maintenance:true,error:owner.maintenanceMessage||'Platform is under maintenance. Please try again later.',scheduledEnd:owner.maintenanceEnd||null});
  }

  // Owner login
  if(email===owner.email){
    if(!checkPwd(password,owner.passwordHash))return res.json({success:false,error:'Invalid password.'});
    clearRateLimit(clientIp);
    const token=uuidv4();
    sessions[token]={isOwner:true,email:owner.email,name:owner.name,expiresAt:Date.now()+SESSION_30D};
    return res.json({success:true,token,isOwner:true,user:{email:owner.email,name:owner.name}});
  }

  // Brand user login
  for(const brand of(owner.brands||[])){
    if(brand.status!=='active')continue;
    let db;try{db=readBrandDB(brand.slug);}catch(e){continue;}
    const user=(db.users||[]).find(u=>u.email===email&&(u.active===true||u.active==='true'));
    if(!user)continue;
    if(!checkPwd(password,user.passwordHash))return res.json({success:false,error:'Invalid password.'});

    clearRateLimit(clientIp);

    // Auto-migrate plain-text password to bcrypt on first successful login
    if(!user.passwordHash.startsWith('$2')){
      const ui=(db.users||[]).findIndex(u=>u.id===user.id);
      if(ui>=0){db.users[ui].passwordHash=hashPwd(password);writeBrandDB(brand.slug,db);}
    }

    const token=uuidv4(),bdf=db.featureFlags||{};
    sessions[token]={isOwner:false,brandSlug:brand.slug,brandName:brand.name,brandAccentColor:brand.accentColor||'#f5a623',brandTheme:brand.theme||'midnight',brandLogoUrl:brand.logoUrl||'',brandTier:brand.tier||'Free',resolvedFeatureFlags:resolveFeatureFlags(brand,bdf),isMajorAdmin:user.role==='Admin',firstLogin:user.firstLogin===true,mustChangePassword:user.mustChangePassword===true,id:user.id,email:user.email,name:user.name,team:user.team,role:user.role,skill:user.skill,slackId:user.slackId,maxTickets:user.maxTickets,active:user.active,expiresAt:Date.now()+ttl};
    const od=readOwner();const bi=od.brands.findIndex(b=>b.slug===brand.slug);
    if(bi>=0){od.brands[bi].lastActive=new Date().toISOString();writeOwner(od);}
    return res.json({success:true,token,isOwner:false,user:sessions[token]});
  }
  return res.json({success:false,error:'Account not found. Check your email or contact your administrator.'});
});

app.post('/api/logout',(req,res)=>{const t=req.headers['x-session-token'];if(t)delete sessions[t];res.json({success:true});});

// ── Forgot password ────────────────────────────────────────────────────────────
app.post('/api/forgot-password',async(req,res)=>{
  const{email}=req.body;
  if(!email)return res.json({success:false,error:'Email required.'});
  const owner=readOwner();
  for(const brand of(owner.brands||[])){
    let db;try{db=readBrandDB(brand.slug);}catch(e){continue;}
    const user=(db.users||[]).find(u=>u.email===email&&u.active);
    if(!user)continue;
    const resetToken=uuidv4();
    // Store in owner.json so token survives server restarts
    savePwdResetToken(resetToken,{email,brandSlug:brand.slug,expiresAt:Date.now()+3600000});
    const resetUrl=`${BASE_URL}/reset-password?token=${resetToken}`;
    await sendBrandEmail(brand.slug,email,'Reset Your Password — '+brand.name,
      `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#f0f2f5;font-family:-apple-system,sans-serif;padding:40px 16px;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><div style="background:linear-gradient(135deg,#f5a623,#ff6b35);padding:40px;text-align:center;"><div style="font-size:36px;margin-bottom:12px;">🔑</div><h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">Password Reset</h1><p style="margin:10px 0 0;color:rgba(255,255,255,0.85);">Click below to set a new password. Link expires in 1 hour.</p></div><div style="padding:32px 40px;"><p style="color:#374151;">Hi <strong>${user.name||user.email}</strong>, we received a request to reset your password for <strong>${brand.name}</strong>.</p><div style="text-align:center;margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;padding:14px 44px;border-radius:10px;background:#f5a623;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">Reset Password →</a></div><p style="font-size:12px;color:#9ca3af;">If you didn't request this, ignore this email. Your password won't change.</p><p style="font-size:11px;color:#d1d5db;word-break:break-all;">Link: ${resetUrl}</p></div></div></body></html>`,
      `Reset your password: ${resetUrl}`
    );
    return res.json({success:true,message:'Password reset email sent.'});
  }
  // Don't reveal if email exists for security
  return res.json({success:true,message:'If that email exists, a reset link has been sent.'});
});

// ── Reset password (from email link) ──────────────────────────────────────────
app.post('/api/reset-password',(req,res)=>{
  const{token,newPassword}=req.body;
  if(!token||!newPassword||newPassword.length<6)return res.json({success:false,error:'Token and new password (min 6 chars) required.'});
  // Check both in-memory (legacy) and persistent storage
  const entry=pwdResetTokens[token]||getPwdResetTokens()[token];
  if(!entry||Date.now()>entry.expiresAt){
    delete pwdResetTokens[token];
    deletePwdResetToken(token);
    return res.json({success:false,error:'Reset link expired or invalid. Please request a new one.'});
  }
  const db=readBrandDB(entry.brandSlug);
  const idx=(db.users||[]).findIndex(u=>u.email===entry.email);
  if(idx<0)return res.json({success:false,error:'User not found.'});
  db.users[idx].passwordHash=hashPwd(newPassword);
  db.users[idx].mustChangePassword=false;
  db.users[idx].firstLogin=false;
  writeBrandDB(entry.brandSlug,db);
  delete pwdResetTokens[token];
  deletePwdResetToken(token);
  res.json({success:true,message:'Password updated successfully. You can now log in.'});
});

// ── Brand invitation link ──────────────────────────────────────────────────────
app.post('/api/invite/create',async(req,res)=>{
  const su=getSessionUser(req);
  if(!su||su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const{role,expiryHours}=req.body;
  const token=uuidv4().substring(0,12).toUpperCase();
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===su.brandSlug)||{};
  inviteTokens[token]={brandSlug:su.brandSlug,brandName:su.brandName,brandColor:brand.accentColor||'#f5a623',role:role||'Developer',expiresAt:Date.now()+(expiryHours||48)*3600000,createdBy:su.email};
  const inviteUrl=`${BASE_URL}/join?invite=${token}`;
  res.json({success:true,token,inviteUrl,expiresIn:`${expiryHours||48} hours`});
});

app.get('/api/invite/:token',(req,res)=>{
  const entry=inviteTokens[req.params.token];
  if(!entry||Date.now()>entry.expiresAt)return res.json({success:false,error:'Invite link expired or invalid.'});
  res.json({success:true,brandName:entry.brandName,brandColor:entry.brandColor,role:entry.role});
});

app.post('/api/invite/:token/accept',async(req,res)=>{
  const entry=inviteTokens[req.params.token];
  if(!entry||Date.now()>entry.expiresAt)return res.json({success:false,error:'Invite link expired or invalid.'});
  const{name,email,password}=req.body;
  if(!name||!email||!password||password.length<6)return res.json({success:false,error:'Name, email, and password (min 6 chars) required.'});
  const db=readBrandDB(entry.brandSlug);
  if((db.users||[]).find(u=>u.email===email))return res.json({success:false,error:'Email already registered in this workspace.'});
  const uid=generateId('USR');
  db.users=db.users||[];
  db.users.push({id:uid,email,name,team:'',role:entry.role,skill:'',slackId:'',maxTickets:10,active:true,createdDate:new Date().toISOString(),passwordHash:hashPwd(password),firstLogin:false,joinedViaInvite:true});
  writeBrandDB(entry.brandSlug,db);
  delete inviteTokens[req.params.token];
  res.json({success:true,message:'Account created! You can now log in.',email,brandName:entry.brandName});
});

// ── Public status page API ─────────────────────────────────────────────────────
app.get('/api/status',(req,res)=>{
  const{brand}=req.query;
  if(!brand)return res.json({success:false,error:'brand query param required'});
  const owner=readOwner();const b=(owner.brands||[]).find(x=>x.slug===brand);
  if(!b||b.status!=='active')return res.json({success:false,error:'Brand not found'});
  let db;try{db=readBrandDB(brand);}catch(e){return res.json({success:false,error:'Data unavailable'});}
  const issues=db.issues||[];const now=new Date();
  const critical=issues.filter(i=>i.priority==='Critical'&&!['Resolved','Release Required','Closed'].includes(i.status)).length;
  const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status)).length;
  const health=critical>0?'degraded':open>10?'partial':'operational';
  const healthColors={operational:'#16a34a',partial:'#d97706',degraded:'#dc2626'};
  const healthLabels={operational:'All Systems Operational',partial:'Partial Degradation',degraded:'Active Critical Incidents'};
  res.json({success:true,brand:b.name,status:health,label:healthLabels[health],color:healthColors[health],stats:{open,critical,resolvedToday:issues.filter(i=>i.resolvedDate&&i.resolvedDate.startsWith(now.toISOString().split('T')[0])).length},updatedAt:now.toISOString()});
});

// Status page HTML
app.get('/status',(req,res)=>{
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>System Status</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:500px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;}
  .brand{font-size:22px;font-weight:800;color:#111827;margin-bottom:8px;}
  .dot{width:14px;height:14px;border-radius:50%;display:inline-block;margin-right:8px;}
  .status-label{font-size:18px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-bottom:20px;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px;}
  .stat{background:#f9fafb;border-radius:10px;padding:16px;}
  .stat-val{font-size:26px;font-weight:800;color:#111827;}
  .stat-label{font-size:12px;color:#6b7280;margin-top:4px;}
  .ts{font-size:12px;color:#9ca3af;margin-top:20px;}
  </style></head><body>
  <div class="card" id="card"><p style="color:#6b7280">Loading status...</p></div>
  <script>
  const brand=new URLSearchParams(location.search).get('brand')||'konnect';
  fetch('/api/status?brand='+brand).then(r=>r.json()).then(d=>{
    if(!d.success){document.getElementById('card').innerHTML='<p style="color:#dc2626">Status unavailable</p>';return;}
    document.getElementById('card').innerHTML='<div class="brand">'+d.brand+'</div><div class="status-label"><span class="dot" style="background:'+d.color+'"></span>'+d.label+'</div><div class="grid"><div class="stat"><div class="stat-val">'+d.stats.open+'</div><div class="stat-label">Open Issues</div></div><div class="stat"><div class="stat-val" style="color:'+( d.stats.critical>0?'#dc2626':'#16a34a')+'">'+d.stats.critical+'</div><div class="stat-label">Critical</div></div><div class="stat"><div class="stat-val" style="color:#16a34a">'+d.stats.resolvedToday+'</div><div class="stat-label">Resolved Today</div></div></div><p class="ts">Updated: '+new Date(d.updatedAt).toLocaleString()+'</p>';
  });
  </script></body></html>`);
});

// OWNER ONLY MIDDLEWARE
function ownerOnly(req,res,next){const u=getSessionUser(req);if(!u||!u.isOwner)return res.json({success:false,error:'Owner access required.'});req.owner=u;next();}

app.get('/api/owner/me',ownerOnly,(req,res)=>res.json({success:true,owner:{email:req.owner.email,name:req.owner.name}}));
app.get('/api/owner/audit-log',ownerOnly,(req,res)=>{const o=readOwner();res.json({success:true,log:(o.auditLog||[]).slice(0,100)});});
app.get('/api/owner/stats',ownerOnly,(req,res)=>{
  const owner=readOwner();let tu=0,ti=0,to=0;const bs=[];
  for(const b of(owner.brands||[])){try{const db=readBrandDB(b.slug);const u=(db.users||[]).filter(u=>u.active).length,i=(db.issues||[]).length,o=(db.issues||[]).filter(x=>!['Resolved','Release Required','Closed'].includes(x.status)).length;tu+=u;ti+=i;to+=o;bs.push({slug:b.slug,name:b.name,tier:b.tier,status:b.status,users:u,issues:i,open:o,lastActive:b.lastActive});}catch(e){bs.push({slug:b.slug,name:b.name,tier:b.tier,status:b.status,users:0,issues:0,open:0,lastActive:null});}}
  res.json({success:true,stats:{brands:(owner.brands||[]).length,users:tu,issues:ti,openIssues:to},brandStats:bs,owner:{email:owner.email,name:owner.name}});
});
// ══════════════════════════════════════════════════════════════════════════
// OWNER POWER FEATURES — All 15
// ══════════════════════════════════════════════════════════════════════════

// 1. CROSS-BRAND ANALYTICS — aggregate metrics across all brands
app.get('/api/owner/cross-brand-analytics',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const result=[];
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    try{
      const db=readBrandDB(b.slug);
      const issues=db.issues||[];const tickets=db.tickets||[];const users=db.users||[];
      const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const resolved=issues.filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate);
      const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d;});
      const avgRes=resolved.length>0?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10:null;
      const slaCompliance=issues.length>0?Math.round((1-breached.length/Math.max(open.length,1))*100):100;
      const newTickets=tickets.filter(t=>t.status==='new').length;
      result.push({slug:b.slug,name:b.name,tier:b.tier,accentColor:b.accentColor,lastActive:b.lastActive,totalIssues:issues.length,openIssues:open.length,resolvedIssues:resolved.length,slaBreached:breached.length,slaCompliance,avgResolutionHours:avgRes,totalTickets:tickets.length,newTickets,activeUsers:users.filter(u=>u.active).length,criticalIssues:open.filter(i=>i.priority==='Critical').length});
    }catch(e){result.push({slug:b.slug,name:b.name,tier:b.tier,error:true});}
  }
  res.json({success:true,brands:result,totals:{issues:result.reduce((s,b)=>s+(b.totalIssues||0),0),open:result.reduce((s,b)=>s+(b.openIssues||0),0),tickets:result.reduce((s,b)=>s+(b.totalTickets||0),0),newTickets:result.reduce((s,b)=>s+(b.newTickets||0),0),critical:result.reduce((s,b)=>s+(b.criticalIssues||0),0),users:result.reduce((s,b)=>s+(b.activeUsers||0),0)}});
});

// 2. BRAND HEALTH SCORES
app.get('/api/owner/brand-health',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const scores=(owner.brands||[]).map(b=>{
    if(b.status!=='active')return{...b,health:0,grade:'F',reasons:['Brand is suspended']};
    try{
      const db=readBrandDB(b.slug);const issues=db.issues||[];const users=db.users||[];const tickets=db.tickets||[];
      let score=100,reasons=[],goods=[];
      const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d;});
      const activeUsers=users.filter(u=>u.active).length;
      const lastActiveDays=b.lastActive?(now-new Date(b.lastActive))/86400000:999;
      // Deductions
      if(breached.length>0){score-=Math.min(25,breached.length*5);reasons.push(`${breached.length} SLA breach${breached.length>1?'es':''}`);}
      if(open.filter(i=>i.priority==='Critical').length>0){score-=15;reasons.push('Active critical issues');}
      if(lastActiveDays>14){score-=10;reasons.push('No activity in 14+ days');}
      if(activeUsers<2){score-=10;reasons.push('Less than 2 active users');}
      if(!db.emailTicketing?.enabled&&tickets.length===0){score-=5;reasons.push('Email ticketing not set up');}
      // Bonuses
      if(breached.length===0&&open.length>0){goods.push('100% SLA compliance');}
      if(activeUsers>=5){goods.push(`${activeUsers} active users`);}
      if(tickets.filter(t=>t.status==='resolved'||t.status==='closed').length>5){goods.push('Active ticket resolution');}
      score=Math.max(0,Math.min(100,score));
      const grade=score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'F';
      return{slug:b.slug,name:b.name,tier:b.tier,accentColor:b.accentColor,health:score,grade,reasons,goods,openIssues:open.length,slaBreached:breached.length,activeUsers,lastActiveDays:Math.round(lastActiveDays)};
    }catch(e){return{slug:b.slug,name:b.name,tier:b.tier,health:0,grade:'F',reasons:['Data unavailable'],goods:[]};}
  }).sort((a,b)=>a.health-b.health);
  res.json({success:true,scores,critical:scores.filter(s=>s.health<40).length,atRisk:scores.filter(s=>s.health<65).length});
});

// 3. FEATURE USAGE HEATMAP
app.get('/api/owner/feature-usage',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const brandUsage=(owner.brands||[]).filter(b=>b.status==='active').map(b=>{
    try{
      const db=readBrandDB(b.slug);
      const flags=db.featureFlags||{};
      const usage={kanban:(db.issues||[]).filter(i=>i.status==='WIP').length>0,sprints:(db.sprints||[]).length>0,emailTicketing:db.emailTicketing?.enabled===true,customFields:(db.customFields||[]).length>0,teams:(db.teams||[]).length>0,ai:flags.AI_ENABLED===true,announcements:(db.announcements||[]).filter(a=>a.active).length>0,timeLogs:(db.timeLogs||[]).length>0,tags:(db.tags||[]).length>0};
      const usedCount=Object.values(usage).filter(Boolean).length;
      return{slug:b.slug,name:b.name,tier:b.tier,usage,usedCount,totalFeatures:Object.keys(usage).length};
    }catch(e){return{slug:b.slug,name:b.name,tier:b.tier,usage:{},usedCount:0,totalFeatures:9};}
  });
  const featureTotals={};if(brandUsage.length>0){Object.keys(brandUsage[0].usage).forEach(k=>{featureTotals[k]=brandUsage.filter(b=>b.usage[k]).length;});}
  res.json({success:true,brands:brandUsage,featureTotals,totalBrands:brandUsage.length});
});

// 4. BULK OWNER ANNOUNCEMENT — email all Major Admins
app.post('/api/owner/bulk-announce',ownerOnly,async(req,res)=>{
  const{subject,message,type}=req.body;
  if(!subject||!message)return res.json({success:false,error:'subject and message required'});
  const owner=readOwner();let sent=0,failed=0;
  for(const b of(owner.brands||[])){
    if(b.status!=='active'||!b.majorAdminEmail)continue;
    try{
      await sendEmail(b.majorAdminEmail,`[Resolvo Platform] ${subject}`,
        `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:32px 16px;"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <div style="background:${type==='critical'?'#DC2626':type==='warning'?'#D97706':'#F5A623'};padding:24px 32px;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,.7);">Platform Announcement · ${b.name}</p><h2 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#fff;">${subject}</h2></div>
        <div style="padding:24px 32px;"><p style="color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</p><p style="color:#9ca3af;font-size:12px;margin-top:20px;">This announcement was sent to all platform administrators by the Resolvo platform team.</p></div>
        </div></body></html>`,
        `${subject}\n\n${message}`
      );
      sent++;
      // Also push as in-app announcement
      try{const db=readBrandDB(b.slug);db.announcements=db.announcements||[];db.announcements.push({id:generateId('ANN'),message:`📣 Platform: ${subject} — ${message.substring(0,150)}${message.length>150?'...':''}`,type:type||'info',active:true,expiresAt:null,createdBy:'platform',createdAt:new Date().toISOString()});writeBrandDB(b.slug,db);}catch(e){}
    }catch(e){failed++;}
  }
  ownerAuditLog(readOwner(),'bulk_announcement',{subject,sentTo:sent,failed},req.owner.email);const o=readOwner();ownerAuditLog(o,'bulk_announcement',{subject,sent,failed},req.owner.email);writeOwner(o);
  res.json({success:true,sent,failed,total:(owner.brands||[]).filter(b=>b.status==='active').length});
});

// 5. CROSS-BRAND SEARCH
app.get('/api/owner/search',ownerOnly,(req,res)=>{
  const{q,type}=req.query;
  if(!q||q.length<2)return res.json({success:false,error:'Query too short'});
  const owner=readOwner();const results=[];const ql=q.toLowerCase();
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    try{
      const db=readBrandDB(b.slug);
      if(!type||type==='issues'){(db.issues||[]).filter(i=>i.title.toLowerCase().includes(ql)||(i.description||'').toLowerCase().includes(ql)).slice(0,5).forEach(i=>results.push({type:'issue',brandSlug:b.slug,brandName:b.name,id:i.id,title:i.title,status:i.status,priority:i.priority}));}
      if(!type||type==='tickets'){(db.tickets||[]).filter(t=>t.subject.toLowerCase().includes(ql)||(t.from||'').toLowerCase().includes(ql)).slice(0,5).forEach(t=>results.push({type:'ticket',brandSlug:b.slug,brandName:b.name,id:t.id,title:t.subject,status:t.status,from:t.from}));}
      if(!type||type==='users'){(db.users||[]).filter(u=>(u.name||'').toLowerCase().includes(ql)||u.email.toLowerCase().includes(ql)).slice(0,3).forEach(u=>results.push({type:'user',brandSlug:b.slug,brandName:b.name,id:u.id,title:u.name||u.email,email:u.email,role:u.role}));}
    }catch(e){}
  }
  res.json({success:true,results:results.slice(0,30),total:results.length,query:q});
});

// 6. SLA LEAGUE TABLE
app.get('/api/owner/sla-league',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const league=(owner.brands||[]).filter(b=>b.status==='active').map(b=>{
    try{
      const db=readBrandDB(b.slug);const issues=db.issues||[];
      const resolved=issues.filter(i=>['Resolved','Release Required'].includes(i.status));
      const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d;});
      const compliance=open.length>0?Math.round((1-breached.length/open.length)*100):100;
      const avgRes=resolved.length>0?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10:null;
      return{slug:b.slug,name:b.name,tier:b.tier,compliance,breached:breached.length,openIssues:open.length,totalIssues:issues.length,avgResolutionHours:avgRes};
    }catch(e){return{slug:b.slug,name:b.name,tier:b.tier,compliance:0,breached:0,openIssues:0,totalIssues:0,avgResolutionHours:null};}
  }).sort((a,b)=>b.compliance-a.compliance);
  league.forEach((b,i)=>b.rank=i+1);
  res.json({success:true,league});
});

// 7. BILLING / INVOICE TRACKER
app.get('/api/owner/billing',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const billing=(owner.brands||[]).map(b=>({slug:b.slug,name:b.name,tier:b.tier,status:b.status,...(b.billing||{status:'unknown',amount:0,currency:'INR',dueDate:null,lastPaid:null,notes:''})}));
  res.json({success:true,billing,mrr:billing.filter(b=>b.billing?.status==='paid').reduce((s,b)=>s+(b.billing?.amount||0),0)});
});

app.put('/api/owner/billing/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);
  if(idx===-1)return res.json({success:false,error:'Brand not found'});
  owner.brands[idx].billing={...(owner.brands[idx].billing||{}),...req.body};
  ownerAuditLog(owner,'billing_updated',{brandSlug:req.params.slug,status:req.body.status},req.owner.email);
  writeOwner(owner);res.json({success:true});
});

// 8. BRAND ONBOARDING SCORE
app.get('/api/owner/onboarding-scores',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const scores=(owner.brands||[]).map(b=>{
    const steps=[];
    try{
      const db=readBrandDB(b.slug);
      const checks=[
        {key:'users_added',label:'Users Added',done:(db.users||[]).filter(u=>u.active).length>1,weight:20},
        {key:'issue_created',label:'First Issue Created',done:(db.issues||[]).length>0,weight:15},
        {key:'sla_configured',label:'SLA Rules Configured',done:Object.keys(db.slaConfig||{}).length>0,weight:15},
        {key:'email_ticketing',label:'Email Ticketing Connected',done:db.emailTicketing?.enabled===true,weight:15},
        {key:'team_created',label:'Team Created',done:(db.teams||[]).length>0,weight:10},
        {key:'announcement_sent',label:'First Announcement Sent',done:(db.announcements||[]).length>0,weight:10},
        {key:'custom_modules',label:'Modules Customised',done:(db.settings?.MODULES||'').split(',').length>5,weight:5},
        {key:'gemini_key',label:'AI Key Configured',done:!!(db.settings?.GEMINI_API_KEY),weight:5},
        {key:'webhook',label:'Webhook/Integration Set',done:!!(db.settings?.SLACK_WEBHOOK_URL||db.settings?.EXTERNAL_API_TYPE),weight:5},
      ];
      const score=checks.reduce((s,c)=>s+(c.done?c.weight:0),0);
      steps.push(...checks);
      return{slug:b.slug,name:b.name,tier:b.tier,score,steps,incomplete:checks.filter(c=>!c.done).map(c=>c.label)};
    }catch(e){return{slug:b.slug,name:b.name,tier:b.tier,score:0,steps:[],incomplete:[]};}
  });
  res.json({success:true,scores:scores.sort((a,b)=>a.score-b.score),avgScore:scores.length?Math.round(scores.reduce((s,b)=>s+b.score,0)/scores.length):0});
});

// 9. CLONE BRAND CONFIG
app.post('/api/owner/clone-config',ownerOnly,(req,res)=>{
  const{fromSlug,toSlug}=req.body;
  if(!fromSlug||!toSlug)return res.json({success:false,error:'fromSlug and toSlug required'});
  const owner=readOwner();
  const fromBrand=(owner.brands||[]).find(b=>b.slug===fromSlug);
  const toBrand=(owner.brands||[]).find(b=>b.slug===toSlug);
  if(!fromBrand)return res.json({success:false,error:'Source brand not found'});
  if(!toBrand)return res.json({success:false,error:'Target brand not found'});
  try{
    const fromDb=readBrandDB(fromSlug);const toDb=readBrandDB(toSlug);
    // Copy settings (not users/issues/data)
    toDb.settings={...fromDb.settings,APP_NAME:toDb.settings?.APP_NAME||toBrand.name};
    toDb.slaConfig={...fromDb.slaConfig};
    toDb.featureFlags={...fromDb.featureFlags};
    toDb.customFields=(fromDb.customFields||[]).map(f=>({...f,id:generateId('CF')}));
    toDb.escalationRules=(fromDb.escalationRules||[]).map(r=>({...r,id:generateId('ESC')}));
    toDb.recurringTemplates=(fromDb.recurringTemplates||[]).map(t=>({...t,id:generateId('TPL')}));
    toDb.workingHours={...fromDb.workingHours};
    writeBrandDB(toSlug,toDb);
    ownerAuditLog(owner,'config_cloned',{from:fromSlug,to:toSlug},req.owner.email);writeOwner(owner);
    res.json({success:true,cloned:['settings','slaConfig','featureFlags','customFields','escalationRules','recurringTemplates','workingHours']});
  }catch(e){res.json({success:false,error:e.message});}
});

// 10. TRIAL EXPIRY MANAGEMENT
app.get('/api/owner/trial-status',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const trials=(owner.brands||[]).filter(b=>b.tier==='Trial'&&b.status==='active').map(b=>{
    const created=new Date(b.createdDate||now);const trialDays=14;const expiresAt=new Date(created.getTime()+trialDays*86400000);const daysLeft=Math.ceil((expiresAt-now)/86400000);
    return{slug:b.slug,name:b.name,majorAdminEmail:b.majorAdminEmail,createdDate:b.createdDate,expiresAt:expiresAt.toISOString(),daysLeft,expired:daysLeft<=0,expiringSoon:daysLeft>0&&daysLeft<=3};
  });
  res.json({success:true,trials,expired:trials.filter(t=>t.expired).length,expiringSoon:trials.filter(t=>t.expiringSoon).length});
});

app.post('/api/owner/trial-notify',ownerOnly,async(req,res)=>{
  const{slug,daysLeft}=req.body;
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug);
  if(!brand)return res.json({success:false,error:'Brand not found'});
  await sendEmail(brand.majorAdminEmail,`Your Resolvo trial ${daysLeft<=0?'has expired':`expires in ${daysLeft} day${daysLeft!==1?'s':''}`}`,
    `<div style="font-family:Arial;background:#f0f2f5;padding:32px 16px;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;">
    <h2 style="color:#${daysLeft<=0?'DC2626':'D97706'};">⏰ ${daysLeft<=0?'Your trial has expired':'Trial Ending Soon'}</h2>
    <p style="color:#374151;">Hi, your Resolvo trial for <strong>${brand.name}</strong> ${daysLeft<=0?'expired today':'will expire in '+daysLeft+' day'+(daysLeft!==1?'s':'')}.</p>
    <p style="color:#374151;">To continue using all Pro features, please upgrade your plan. Contact your platform administrator.</p>
    </div></div>`,
    `Your Resolvo trial for ${brand.name} ${daysLeft<=0?'has expired':'expires in '+daysLeft+' days'}.`
  );
  res.json({success:true});
});

// 11. TIER RECOMMENDATIONS
app.get('/api/owner/tier-recommendations',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const recs=(owner.brands||[]).filter(b=>b.status==='active').map(b=>{
    try{
      const db=readBrandDB(b.slug);const issues=db.issues||[];const tickets=db.tickets||[];const users=(db.users||[]).filter(u=>u.active).length;
      const monthAgo=new Date(now-30*86400000);const recentIssues=issues.filter(i=>new Date(i.createdDate)>monthAgo).length;const recentTickets=tickets.filter(t=>new Date(t.createdDate||now)>monthAgo).length;
      const recs=[];let suggestedTier=b.tier;
      if(b.tier==='Free'&&(recentIssues>20||recentTickets>50||users>5)){suggestedTier='Pro';recs.push(`${recentIssues} issues and ${users} users this month — Pro unlocks Kanban, AI, analytics`);}
      if(b.tier==='Free'&&users>=b.limits?.maxUsers){suggestedTier='Pro';recs.push(`At user limit (${users}/${b.limits?.maxUsers}) — upgrade for more capacity`);}
      if(b.tier==='Pro'&&(recentIssues>100||recentTickets>200)){suggestedTier='Enterprise';recs.push(`High volume (${recentIssues} issues/month) — Enterprise adds API integration and email triage`);}
      const shouldUpgrade=suggestedTier!==b.tier;
      return{slug:b.slug,name:b.name,currentTier:b.tier,suggestedTier,shouldUpgrade,reasons:recs,stats:{recentIssues,recentTickets,users}};
    }catch(e){return null;}
  }).filter(Boolean).filter(r=>r.shouldUpgrade);
  res.json({success:true,recommendations:recs,count:recs.length});
});

// 12. BRAND COMPARISON REPORT
app.get('/api/owner/compare',ownerOnly,(req,res)=>{
  const{slugs}=req.query;
  const brandSlugs=(slugs||'').split(',').filter(Boolean);
  if(brandSlugs.length<2)return res.json({success:false,error:'Provide at least 2 brand slugs'});
  const owner=readOwner();const now=new Date();
  const comparison=brandSlugs.map(slug=>{
    const brand=(owner.brands||[]).find(b=>b.slug===slug);
    if(!brand)return null;
    try{
      const db=readBrandDB(slug);const issues=db.issues||[];const tickets=db.tickets||[];const users=(db.users||[]).filter(u=>u.active);
      const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const resolved=issues.filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate);
      const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d;});
      const avgRes=resolved.length>0?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10:null;
      const csatSurveys=db.csatSurveys||[];const responded=csatSurveys.filter(s=>s.rating!==null);const avgCSAT=responded.length>0?Math.round(responded.reduce((s,sv)=>s+(sv.rating||0),0)/responded.length*10)/10:null;
      return{slug,name:brand.name,tier:brand.tier,metrics:{totalIssues:issues.length,openIssues:open.length,resolvedIssues:resolved.length,slaCompliance:open.length>0?Math.round((1-breached.length/open.length)*100):100,avgResolutionHours:avgRes,totalTickets:tickets.length,resolvedTickets:tickets.filter(t=>t.status==='resolved'||t.status==='closed').length,activeUsers:users.length,avgCSAT}};
    }catch(e){return{slug,name:brand?.name||slug,tier:brand?.tier||'?',metrics:{}};}
  }).filter(Boolean);
  res.json({success:true,comparison,metrics:['totalIssues','openIssues','resolvedIssues','slaCompliance','avgResolutionHours','totalTickets','resolvedTickets','activeUsers','avgCSAT']});
});

// 13. CROSS-BRAND WEBHOOK on critical issues (stored in owner.json)
app.get('/api/owner/webhook-config',ownerOnly,(req,res)=>{
  const owner=readOwner();res.json({success:true,webhookUrl:owner.globalWebhookUrl||'',webhookEnabled:owner.globalWebhookEnabled||false});
});
app.post('/api/owner/webhook-config',ownerOnly,(req,res)=>{
  const owner=readOwner();owner.globalWebhookUrl=req.body.url||'';owner.globalWebhookEnabled=!!req.body.enabled;writeOwner(owner);res.json({success:true});
});

// ══════════════════════════════════════════════════════════════════════════
// REVENUE INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════

// MRR Dashboard
app.get('/api/owner/mrr',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const tierPricing={Free:0,Trial:0,Pro:999,Enterprise:2499};
  const brands=(owner.brands||[]);
  const activeBrands=brands.filter(b=>b.status==='active');
  const mrr=activeBrands.reduce((s,b)=>s+(b.billing?.amount||tierPricing[b.tier]||0),0);
  // Monthly trend (last 6 months based on brand creation + tier changes in audit log)
  const now=new Date();
  const months=[];
  for(let m=5;m>=0;m--){const d=new Date(now.getFullYear(),now.getMonth()-m,1);months.push({month:d.toLocaleString('default',{month:'short',year:'2-digit'}),date:d.toISOString().split('T')[0]});}
  const mrrTrend=months.map(mo=>{
    const active=brands.filter(b=>new Date(b.createdDate||'2000-01-01')<=new Date(mo.date+'T23:59:59')&&b.status==='active');
    const val=active.reduce((s,b)=>s+(b.billing?.amount||tierPricing[b.tier]||0),0);
    return{month:mo.month,mrr:val,brands:active.length};
  });
  const tierBreakdown={};activeBrands.forEach(b=>{tierBreakdown[b.tier]=(tierBreakdown[b.tier]||0)+1;});
  const tierRevenue={};activeBrands.forEach(b=>{tierRevenue[b.tier]=(tierRevenue[b.tier]||0)+(b.billing?.amount||tierPricing[b.tier]||0);});
  res.json({success:true,mrr,activeBrands:activeBrands.length,mrrTrend,tierBreakdown,tierRevenue,avgMrrPerBrand:activeBrands.length?Math.round(mrr/activeBrands.length):0});
});

// Churn Risk Score
app.get('/api/owner/churn-risk',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const scores=(owner.brands||[]).filter(b=>b.status==='active').map(b=>{
    let risk=0,reasons=[];
    const lastActive=b.lastActive?new Date(b.lastActive):null;
    const daysSinceActive=lastActive?Math.floor((now-lastActive)/86400000):999;
    const createdDaysAgo=Math.floor((now-new Date(b.createdDate||now))/86400000);
    try{
      const db=readBrandDB(b.slug);
      const users=(db.users||[]).filter(u=>u.active).length;
      const recentIssues=(db.issues||[]).filter(i=>new Date(i.createdDate)>new Date(now-30*86400000)).length;
      const recentTickets=(db.tickets||[]).filter(t=>new Date(t.createdDate||now)>new Date(now-30*86400000)).length;
      if(daysSinceActive>21){risk+=30;reasons.push('No activity for '+daysSinceActive+' days');}
      else if(daysSinceActive>10){risk+=15;reasons.push('Low activity ('+daysSinceActive+'d)');}
      if(users<2){risk+=20;reasons.push('Only '+users+' active user'+(users===1?'':'s'));}
      if(recentIssues===0&&createdDaysAgo>14){risk+=15;reasons.push('No issues created this month');}
      if(b.tier==='Free'&&createdDaysAgo>30){risk+=10;reasons.push('Still on Free tier after 30d');}
      if(b.tier==='Trial'&&createdDaysAgo>10){risk+=20;reasons.push('Trial not converted');}
    }catch(e){risk+=10;}
    risk=Math.min(100,risk);
    return{slug:b.slug,name:b.name,tier:b.tier,riskScore:risk,riskLevel:risk>=70?'critical':risk>=40?'high':risk>=20?'medium':'low',reasons,daysSinceActive,lastActive:b.lastActive};
  }).sort((a,b)=>b.riskScore-a.riskScore);
  res.json({success:true,scores,critical:scores.filter(s=>s.riskLevel==='critical').length,high:scores.filter(s=>s.riskLevel==='high').length});
});

// Cohort Analysis
app.get('/api/owner/cohorts',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const cohortMap={};
  (owner.brands||[]).forEach(b=>{
    const d=new Date(b.createdDate||now);
    const key=d.toLocaleString('default',{month:'short',year:'numeric'});
    if(!cohortMap[key])cohortMap[key]={month:key,date:d.toISOString(),total:0,active:0,churned:0,upgraded:0,tiers:{}};
    cohortMap[key].total++;
    if(b.status==='active')cohortMap[key].active++;
    else cohortMap[key].churned++;
    if(b.tier==='Pro'||b.tier==='Enterprise')cohortMap[key].upgraded++;
    cohortMap[key].tiers[b.tier]=(cohortMap[key].tiers[b.tier]||0)+1;
  });
  const cohorts=Object.values(cohortMap).sort((a,b)=>new Date(a.date)-new Date(b.date));
  cohorts.forEach(c=>{c.retentionRate=c.total>0?Math.round(c.active/c.total*100):0;c.upgradeRate=c.total>0?Math.round(c.upgraded/c.total*100):0;});
  res.json({success:true,cohorts});
});

// Invoice Generator
app.get('/api/owner/invoice/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug);
  if(!brand)return res.json({success:false,error:'Brand not found'});
  const tierPricing={Free:0,Trial:0,Pro:999,Enterprise:2499};
  const amount=brand.billing?.amount||tierPricing[brand.tier]||0;
  const now=new Date();const invoiceId='INV-'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+'-'+req.params.slug.toUpperCase().substring(0,6);
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${invoiceId}</title>
  <style>body{font-family:Arial,sans-serif;color:#111827;padding:40px;max-width:700px;margin:0 auto;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #F5A623;}
  .logo{font-size:24px;font-weight:800;color:#F5A623;}.inv-id{font-size:13px;color:#6b7280;}
  .section{margin-bottom:24px;}.label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px;}
  .value{font-size:14px;color:#374151;}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;}thead{background:#f9fafb;}
  th{padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;}
  td{padding:12px 14px;border-bottom:1px solid #f3f4f6;font-size:14px;}
  .total-row{font-weight:800;font-size:16px;background:#fff7ed;}
  .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;}
  @media print{body{padding:20px;}.no-print{display:none;}}</style></head><body>
  <div class="header"><div><div class="logo">⟳ Resolvo</div><div style="font-size:12px;color:#6b7280;margin-top:4px;">SaaS Platform</div></div>
  <div style="text-align:right;"><div style="font-size:20px;font-weight:800;color:#111827;">INVOICE</div><div class="inv-id">${invoiceId}</div><div style="font-size:12px;color:#6b7280;margin-top:4px;">Date: ${now.toLocaleDateString()}</div></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px;">
  <div class="section"><div class="label">Billed To</div><div style="font-size:16px;font-weight:700;color:#111827;">${brand.name}</div><div class="value">${brand.majorAdminEmail||''}</div></div>
  <div class="section"><div class="label">Period</div><div class="value">${now.toLocaleString('default',{month:'long',year:'numeric'})}</div><div class="label" style="margin-top:8px;">Due Date</div><div class="value">${new Date(now.getFullYear(),now.getMonth()+1,15).toLocaleDateString()}</div></div></div>
  <table><thead><tr><th>Description</th><th>Tier</th><th>Qty</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
  <tr><td>Resolvo ${brand.tier} Plan — Monthly Subscription</td><td>${brand.tier}</td><td>1</td><td style="text-align:right;font-weight:700;">₹${amount.toLocaleString()}</td></tr>
  </tbody><tfoot><tr class="total-row"><td colspan="3" style="text-align:right;">Total Due</td><td style="text-align:right;color:#F5A623;">₹${amount.toLocaleString()}</td></tr></tfoot></table>
  ${amount===0?'<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;">This tier is currently free of charge.</div>':''}
  <div class="footer">Resolvo SaaS Platform · Payment due within 30 days · Thank you for your business</div>
  <div class="no-print" style="margin-top:20px;text-align:center;"><button onclick="window.print()" style="background:#F5A623;color:#0D0E14;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;">🖨 Print / Save PDF</button></div>
  </body></html>`;
  res.send(html);
});

// ══════════════════════════════════════════════════════════════════════════
// PLATFORM OPERATIONS
// ══════════════════════════════════════════════════════════════════════════

// Database Size Monitor
app.get('/api/owner/db-monitor',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const stats=(owner.brands||[]).map(b=>{
    try{
      const p=brandDbPath(b.slug);const size=fs.existsSync(p)?fs.statSync(p).size:0;
      const db=readBrandDB(b.slug);
      return{slug:b.slug,name:b.name,sizeBytes:size,sizeKB:Math.round(size/1024*10)/10,sizeMB:Math.round(size/1048576*100)/100,records:{issues:(db.issues||[]).length,tickets:(db.tickets||[]).length,comments:(db.comments||[]).length,activityLog:(db.activityLog||[]).length,processedEmailIds:(db.processedEmailIds||[]).length},warning:size>5*1048576,critical:size>10*1048576};
    }catch(e){return{slug:b.slug,name:b.name,sizeBytes:0,sizeKB:0,sizeMB:0,records:{},warning:false,critical:false};}
  }).sort((a,b)=>b.sizeBytes-a.sizeBytes);
  const ownerSize=fs.existsSync(OWNER_PATH)?fs.statSync(OWNER_PATH).size:0;
  const totalBytes=stats.reduce((s,b)=>s+b.sizeBytes,0)+ownerSize;
  res.json({success:true,stats,totalBytes,totalKB:Math.round(totalBytes/1024),ownerFileSizeKB:Math.round(ownerSize/1024),warnings:stats.filter(s=>s.warning).length});
});

// Maintenance Mode
app.get('/api/owner/maintenance',ownerOnly,(req,res)=>{
  const owner=readOwner();res.json({success:true,enabled:owner.maintenanceMode||false,message:owner.maintenanceMessage||'',scheduledEnd:owner.maintenanceEnd||null});
});
app.post('/api/owner/maintenance',ownerOnly,(req,res)=>{
  const owner=readOwner();owner.maintenanceMode=!!req.body.enabled;owner.maintenanceMessage=req.body.message||'Platform is under maintenance. Back soon.';owner.maintenanceEnd=req.body.scheduledEnd||null;
  ownerAuditLog(owner,'maintenance_mode',{enabled:owner.maintenanceMode},req.owner.email);writeOwner(owner);res.json({success:true});
});

// Active Sessions Monitor
app.get('/api/owner/sessions',ownerOnly,(req,res)=>{
  const now=Date.now();
  const activeSessions=Object.entries(sessions).map(([token,sess])=>{
    if(sess.isOwner)return null;
    if(sess.expiresAt&&now>sess.expiresAt)return null;
    return{token:token.substring(0,8)+'...',brandSlug:sess.brandSlug,brandName:sess.brandName,email:sess.email,name:sess.name,role:sess.role,isImpersonating:sess.isImpersonating||false,expiresAt:sess.expiresAt?new Date(sess.expiresAt).toISOString():null};
  }).filter(Boolean);
  res.json({success:true,sessions:activeSessions,total:activeSessions.length});
});
app.delete('/api/owner/sessions/:token',ownerOnly,(req,res)=>{
  const tokenPrefix=req.params.token;
  const toDelete=Object.keys(sessions).filter(t=>t.startsWith(tokenPrefix));
  toDelete.forEach(t=>delete sessions[t]);
  res.json({success:true,deleted:toDelete.length});
});
app.delete('/api/owner/sessions',ownerOnly,(req,res)=>{
  // Force-logout all brand sessions (keep owner sessions)
  const deleted=Object.keys(sessions).filter(t=>{if(sessions[t].isOwner)return false;delete sessions[t];return true;}).length;
  ownerAuditLog(readOwner(),'force_logout_all',{sessionsCleared:deleted},req.owner.email);writeOwner(readOwner());
  res.json({success:true,deleted});
});

// Brand Activity Log (cross-brand live feed)
app.get('/api/owner/activity-feed',ownerOnly,(req,res)=>{
  const owner=readOwner();const limit=parseInt(req.query.limit)||50;
  const allActivity=[];
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    try{const db=readBrandDB(b.slug);(db.activityLog||[]).forEach(l=>allActivity.push({...l,brandSlug:b.slug,brandName:b.name,brandColor:b.accentColor||'#F5A623'}));}catch(e){}
  }
  allActivity.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  res.json({success:true,activities:allActivity.slice(0,limit),total:allActivity.length});
});

// Bulk Config Push — apply a setting change to ALL brands
app.post('/api/owner/bulk-config',ownerOnly,(req,res)=>{
  const{key,value,scope}=req.body;// scope: 'all' | 'pro' | 'enterprise'
  if(!key||value===undefined)return res.json({success:false,error:'key and value required'});
  const owner=readOwner();let updated=0;
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    if(scope==='pro'&&b.tier!=='Pro')continue;
    if(scope==='enterprise'&&b.tier!=='Enterprise')continue;
    try{const db=readBrandDB(b.slug);db.settings=db.settings||{};db.settings[key]=value;writeBrandDB(b.slug,db);updated++;}catch(e){}
  }
  ownerAuditLog(owner,'bulk_config_push',{key,value,scope,updated},req.owner.email);writeOwner(owner);
  res.json({success:true,updated});
});

// Failed Login Monitor
app.get('/api/owner/security',ownerOnly,(req,res)=>{
  const attempts=Object.entries(loginAttempts).map(([ip,data])=>({ip,count:data.count,resetAt:new Date(data.resetAt).toISOString(),blocked:data.count>5}));
  res.json({success:true,attempts:attempts.sort((a,b)=>b.count-a.count),blocked:attempts.filter(a=>a.blocked).length,total:attempts.length});
});

// Data Retention Policy
app.get('/api/owner/retention',ownerOnly,(req,res)=>{
  const owner=readOwner();res.json({success:true,policy:owner.retentionPolicy||{enabled:false,closedTicketsDays:90,resolvedIssuesDays:180,activityLogDays:365}});
});
app.post('/api/owner/retention',ownerOnly,(req,res)=>{
  const owner=readOwner();owner.retentionPolicy={...req.body};writeOwner(owner);res.json({success:true});
});
app.post('/api/owner/retention/run',ownerOnly,(req,res)=>{
  const owner=readOwner();const policy=owner.retentionPolicy;
  if(!policy||!policy.enabled)return res.json({success:false,error:'Retention policy not enabled'});
  const now=Date.now();let totalDeleted={tickets:0,issues:0,logs:0};
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    try{
      const db=readBrandDB(b.slug);
      if(policy.closedTicketsDays){const cutoff=now-policy.closedTicketsDays*86400000;const before=db.tickets?.length||0;db.tickets=(db.tickets||[]).filter(t=>!['closed','resolved'].includes(t.status)||new Date(t.lastActivity||t.createdDate||now)>cutoff);totalDeleted.tickets+=before-(db.tickets.length);}
      if(policy.resolvedIssuesDays){const cutoff=now-policy.resolvedIssuesDays*86400000;const before=db.issues?.length||0;db.issues=(db.issues||[]).filter(i=>!['Release Required','Closed'].includes(i.status)||new Date(i.resolvedDate||now)>cutoff);totalDeleted.issues+=before-(db.issues.length);}
      if(policy.activityLogDays){const cutoff=now-policy.activityLogDays*86400000;const before=db.activityLog?.length||0;db.activityLog=(db.activityLog||[]).filter(l=>new Date(l.timestamp||now)>cutoff);totalDeleted.logs+=before-(db.activityLog.length);}
      writeBrandDB(b.slug,db);
    }catch(e){}
  }
  ownerAuditLog(owner,'retention_run',totalDeleted,req.owner.email);writeOwner(owner);
  res.json({success:true,deleted:totalDeleted});
});

// Owner Profile
app.get('/api/owner/profile',ownerOnly,(req,res)=>{
  const owner=readOwner();res.json({success:true,profile:{email:owner.email,name:owner.name,avatar:owner.avatar||'',joinedDate:owner.joinedDate||null}});
});
app.put('/api/owner/profile',ownerOnly,(req,res)=>{
  const owner=readOwner();if(req.body.name)owner.name=req.body.name;if(req.body.avatar!==undefined)owner.avatar=req.body.avatar;
  if(req.body.newPassword&&req.body.newPassword.length>=6){if(req.body.currentPassword!==owner.passwordHash)return res.json({success:false,error:'Current password incorrect'});owner.passwordHash=req.body.newPassword;}
  writeOwner(owner);
  // Update active sessions
  Object.values(sessions).filter(s=>s.isOwner).forEach(s=>{s.name=owner.name;});
  res.json({success:true});
});

// ══════════════════════════════════════════════════════════════════════════
// GROWTH & ENGAGEMENT
// ══════════════════════════════════════════════════════════════════════════

// Brand CRM Notes
app.get('/api/owner/crm-notes/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug);
  if(!brand)return res.json({success:false,error:'Not found'});
  res.json({success:true,notes:brand.crmNotes||[]});
});
app.post('/api/owner/crm-notes/:slug',ownerOnly,(req,res)=>{
  const{text,followUpDate}=req.body;if(!text)return res.json({success:false,error:'text required'});
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);
  if(idx===-1)return res.json({success:false,error:'Not found'});
  owner.brands[idx].crmNotes=owner.brands[idx].crmNotes||[];
  owner.brands[idx].crmNotes.unshift({id:generateId('NOTE'),text,followUpDate:followUpDate||null,createdAt:new Date().toISOString(),by:req.owner.email});
  writeOwner(owner);res.json({success:true});
});
app.delete('/api/owner/crm-notes/:slug/:noteId',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);
  if(idx===-1)return res.json({success:false,error:'Not found'});
  owner.brands[idx].crmNotes=(owner.brands[idx].crmNotes||[]).filter(n=>n.id!==req.params.noteId);
  writeOwner(owner);res.json({success:true});
});

// Feature Request Voting
app.get('/api/owner/feature-requests',ownerOnly,(req,res)=>{
  const owner=readOwner();
  // Aggregate votes from all brands
  const allRequests={};
  for(const b of(owner.brands||[])){
    if(b.status!=='active')continue;
    try{const db=readBrandDB(b.slug);(db.featureRequests||[]).forEach(r=>{if(!allRequests[r.feature])allRequests[r.feature]={feature:r.feature,votes:0,brands:[]};allRequests[r.feature].votes++;allRequests[r.feature].brands.push(b.name);});}catch(e){}
  }
  const sorted=Object.values(allRequests).sort((a,b)=>b.votes-a.votes);
  res.json({success:true,requests:sorted,total:sorted.length});
});

// Owner Support Inbox (Major Admins → Owner)
app.get('/api/owner/support-inbox',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const tickets=(owner.supportTickets||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({success:true,tickets,open:tickets.filter(t=>t.status!=='closed').length});
});
app.post('/api/owner/support-inbox/:ticketId/reply',ownerOnly,async(req,res)=>{
  const{reply}=req.body;const owner=readOwner();
  const idx=(owner.supportTickets||[]).findIndex(t=>t.id===req.params.ticketId);
  if(idx===-1)return res.json({success:false,error:'Ticket not found'});
  owner.supportTickets[idx].replies=owner.supportTickets[idx].replies||[];
  owner.supportTickets[idx].replies.push({text:reply,by:owner.email,at:new Date().toISOString()});
  owner.supportTickets[idx].status='replied';
  const ticket=owner.supportTickets[idx];
  writeOwner(owner);
  if(ticket.from){await sendEmail(ticket.from,`Re: ${ticket.subject}`,`<div style="font-family:Arial;padding:24px;background:#f0f2f5;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;"><p style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${reply}</p><p style="font-size:12px;color:#9ca3af;margin-top:16px;">— Resolvo Platform Team</p></div></div>`,reply);}
  res.json({success:true});
});

// Brand tags
app.put('/api/owner/brands/:slug/tags',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);
  if(idx===-1)return res.json({success:false,error:'Not found'});
  owner.brands[idx].tags=req.body.tags||[];writeOwner(owner);res.json({success:true});
});

// Export brands CSV
app.get('/api/owner/export-csv',ownerOnly,(req,res)=>{
  const owner=readOwner();const now=new Date();
  const headers=['slug','name','tier','status','majorAdminEmail','createdDate','lastActive','maxUsers','tags','billingStatus'];
  const rows=(owner.brands||[]).map(b=>[b.slug,b.name,b.tier,b.status,b.majorAdminEmail,b.createdDate||'',b.lastActive||'',(b.limits?.maxUsers||0),(b.tags||[]).join(';'),(b.billing?.status||'unknown')].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv=[headers.join(','),...rows].join('\n');
  res.setHeader('Content-Disposition',`attachment; filename=resolvo-brands-${now.toISOString().split('T')[0]}.csv`);
  res.setHeader('Content-Type','text/csv');res.send(csv);
});

// ── OWNER CRM — Prospect tracking (owner-only, not visible to brands) ─────────
// DB CHANGE: adds owner.prospects — backward safe
app.get('/api/owner/prospects',ownerOnly,(req,res)=>{
  const owner=readOwner();
  res.json({success:true,prospects:(owner.prospects||[]).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))});
});
app.post('/api/owner/prospects',ownerOnly,(req,res)=>{
  const{name,email,company,status,notes,source}=req.body;
  const owner=readOwner();owner.prospects=owner.prospects||[];
  const id=uuidv4().substring(0,8);const now=new Date().toISOString();
  owner.prospects.push({id,name,email,company,status:status||'lead',notes:notes||'',source:source||'manual',createdAt:now,updatedAt:now,lastContact:null});
  writeOwner(owner);res.json({success:true,id});
});
app.put('/api/owner/prospects/:id',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.prospects||[]).findIndex(p=>p.id===req.params.id);
  if(idx===-1)return res.json({success:false,error:'Not found'});
  Object.assign(owner.prospects[idx],req.body,{updatedAt:new Date().toISOString()});
  writeOwner(owner);res.json({success:true});
});
app.delete('/api/owner/prospects/:id',ownerOnly,(req,res)=>{
  const owner=readOwner();owner.prospects=(owner.prospects||[]).filter(p=>p.id!==req.params.id);
  writeOwner(owner);res.json({success:true});
});

// ── REFERRAL SYSTEM (owner-only feature) ─────────────────────────────────────
// DB CHANGE: adds owner.referrals — backward safe
app.post('/api/owner/referral/generate/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug);
  if(!brand)return res.json({success:false,error:'Brand not found'});
  owner.referrals=owner.referrals||{};
  const code=req.params.slug.substring(0,6).toUpperCase()+Math.random().toString(36).substring(2,5).toUpperCase();
  owner.referrals[code]={slug:req.params.slug,brandName:brand.name,email:brand.majorAdminEmail,createdAt:new Date().toISOString(),uses:0,freeMonthsEarned:0};
  // Also store on brand
  const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);
  if(idx>=0)owner.brands[idx].referralCode=code;
  writeOwner(owner);
  const referralUrl=`${BASE_URL}/signup?ref=${code}`;
  res.json({success:true,code,url:referralUrl});
});
app.get('/api/owner/referrals',ownerOnly,(req,res)=>{
  const owner=readOwner();
  const refs=Object.entries(owner.referrals||{}).map(([code,r])=>({code,...r}));
  res.json({success:true,referrals:refs});
});
// When signup includes ?ref= code, credit the referrer
// (handled in /api/signup — checks req.body.ref)

// ── ONBOARDING CHECKLIST for new brand admins ─────────────────────────────────
app.get('/api/onboarding-status',(req,res)=>{
  const su=getSessionUser(req);if(!su||su.isOwner)return res.json({success:false});
  const db=readBrandDB(su.brandSlug);
  const steps=[
    {id:'create_issue',label:'Create your first issue',done:(db.issues||[]).length>0,link:'#create-issue',icon:'🎫'},
    {id:'invite_user',label:'Invite a teammate',done:(db.users||[]).length>1,link:'#user-management',icon:'👥'},
    {id:'connect_email',label:'Connect email inbox',done:!!(db.emailTicketing?.enabled),link:'#email-ticketing',icon:'📬'},
    {id:'set_sla',label:'Configure SLA rules',done:!!(db.slaConfig?.Critical),link:'#sla-settings',icon:'⏱'},
    {id:'setup_queue',label:'Enable assignment queue',done:!!(db.queueConfig?.enabled),link:'#settings|queue-config',icon:'🔄'},
    {id:'view_reports',label:'Check your first report',done:!!(db.activityLog?.length>5),link:'#reports',icon:'📊'},
  ];
  const completed=steps.filter(s=>s.done).length;
  return res.json({success:true,steps,completed,total:steps.length,percent:Math.round(completed/steps.length*100)});
});

// ── GA4 ANALYTICS placeholder route ──────────────────────────────────────────
app.get('/api/ga4-config',(req,res)=>{
  res.json({measurementId:process.env.GA4_ID||''});
});

// Platform version info
app.get('/api/owner/platform-info',ownerOnly,(req,res)=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8'));
  const owner=readOwner();
  res.json({success:true,version:pkg.version||'1.0.0',name:'Resolvo',nodeVersion:process.version,uptime:Math.round(process.uptime()),memoryMB:Math.round(process.memoryUsage().rss/1048576),env:process.env.NODE_ENV||'production',baseUrl:BASE_URL,brands:(owner.brands||[]).length,emailEnabled:['true','1','yes'].includes((process.env.EMAIL_ENABLED||'').toLowerCase())});
});

// Check maintenance mode (public endpoint for brand users)
app.get('/api/maintenance-status',(req,res)=>{
  const owner=readOwner();res.json({maintenance:owner.maintenanceMode||false,message:owner.maintenanceMessage||'',scheduledEnd:owner.maintenanceEnd||null});
});

// Brand support ticket (Major Admin → Owner)
app.post('/api/owner-support',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const{subject,message}=req.body;if(!subject||!message)return res.json({success:false,error:'subject and message required'});
  const owner=readOwner();owner.supportTickets=owner.supportTickets||[];
  const ticket={id:generateId('OST'),subject,message,from:su.email,fromName:su.name||su.email,brandSlug:su.brandSlug,brandName:su.brandName,status:'open',createdAt:new Date().toISOString(),replies:[]};
  owner.supportTickets.unshift(ticket);writeOwner(owner);
  sendEmail(owner.email,`[Support] ${subject} — ${su.brandName}`,`<div style="font-family:Arial;padding:24px;background:#f0f2f5;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;"><h3 style="margin:0 0 12px;color:#F5A623;">Support Request from ${su.brandName}</h3><p style="font-size:13px;color:#6b7280;margin-bottom:4px;"><strong>From:</strong> ${su.email}</p><p style="font-size:13px;color:#6b7280;margin-bottom:16px;"><strong>Brand:</strong> ${su.brandName}</p><div style="background:#f9fafb;border-radius:8px;padding:14px;font-size:14px;color:#374151;line-height:1.7;">${message}</div><p style="font-size:12px;color:#9ca3af;margin-top:12px;">Ticket ID: ${ticket.id}</p></div></div>`,`Support ticket from ${su.brandName}: ${subject}\n\n${message}`).catch(()=>{});
  res.json({success:true,ticketId:ticket.id});
});

// Brand admin views THEIR OWN support tickets (and owner's replies)
app.get('/api/my-support-tickets',(req,res)=>{
  const su=getSessionUser(req);
  if(!su||su.isOwner)return res.json({success:false,error:'Not logged in as brand user'});
  const owner=readOwner();
  // Return only tickets from this brand
  const myTickets=(owner.supportTickets||[])
    .filter(t=>t.brandSlug===su.brandSlug)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const hasUnreadReplies=myTickets.some(t=>(t.replies||[]).length>0&&!t.seenByBrand);
  res.json({success:true,tickets:myTickets,unread:myTickets.filter(t=>(t.replies||[]).length>0&&!t.seenByBrand).length});
});

// Mark ticket replies as seen
app.post('/api/my-support-tickets/:id/seen',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false});
  const owner=readOwner();
  const idx=(owner.supportTickets||[]).findIndex(t=>t.id===req.params.id&&t.brandSlug===su.brandSlug);
  if(idx>=0){owner.supportTickets[idx].seenByBrand=true;writeOwner(owner);}
  res.json({success:true});
});

app.get('/api/owner/brands',ownerOnly,(req,res)=>{
  const owner=readOwner();
  res.json({success:true,brands:(owner.brands||[]).map(b=>{let s={users:0,issues:0,openIssues:0};try{const db=readBrandDB(b.slug);s.users=(db.users||[]).filter(u=>u.active).length;s.issues=(db.issues||[]).length;s.openIssues=(db.issues||[]).filter(i=>!['Resolved','Release Required','Closed'].includes(i.status)).length;}catch(e){}return{...b,stats:s};})});
});
app.post('/api/owner/brands',ownerOnly,async(req,res)=>{
  const{name,slug,majorAdminEmail,majorAdminName,majorAdminPassword,accentColor,theme,tier,logoUrl,maxUsers,maxIssues}=req.body;
  if(!name||!slug||!majorAdminEmail)return res.json({success:false,error:'name,slug,majorAdminEmail required.'});
  const cs=slug.toLowerCase().replace(/[^a-z0-9-]/g,'-');const owner=readOwner();
  if((owner.brands||[]).find(b=>b.slug===cs))return res.json({success:false,error:`Slug "${cs}" already exists.`});
  fs.mkdirSync(path.join(BRANDS_DIR,cs),{recursive:true});
  const ip=majorAdminPassword||majorAdminEmail.split('@')[0]+'123';
  writeBrandDB(cs,defaultBrandDB(name,majorAdminEmail,majorAdminName,ip));
  const brand={id:generateId('BRD'),slug:cs,name,logoUrl:logoUrl||'',accentColor:accentColor||'#f5a623',theme:theme||'midnight',status:'active',tier:tier||'Free',majorAdminEmail,createdDate:new Date().toISOString(),lastActive:null,limits:{maxUsers:maxUsers||20,maxIssues:maxIssues||1000}};
  owner.brands=owner.brands||[];owner.brands.push(brand);ownerAuditLog(owner,'brand_created',{brandSlug:cs,brandName:name},req.owner.email);writeOwner(owner);
  await sendEmail(majorAdminEmail,`Your ${name} TechTrack Platform is Ready`,majorAdminWelcomeHTML({email:majorAdminEmail,name:majorAdminName||majorAdminEmail.split('@')[0]},name,accentColor,ip,BASE_URL),`Platform: ${BASE_URL} | Email: ${majorAdminEmail} | Pass: ${ip}`);
  res.json({success:true,brand,initialPassword:ip});
});
app.put('/api/owner/brands/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);if(idx===-1)return res.json({success:false,error:'Not found.'});
  const prev=owner.brands[idx].tier;
  ['name','logoUrl','accentColor','theme','status','tier','limits'].forEach(k=>{if(req.body[k]!==undefined)owner.brands[idx][k]=req.body[k];});
  if(req.body.tier&&req.body.tier!==prev)ownerAuditLog(owner,'tier_changed',{brandSlug:req.params.slug,from:prev,to:req.body.tier},req.owner.email);
  if(req.body.status)ownerAuditLog(owner,'brand_status_changed',{brandSlug:req.params.slug,status:req.body.status},req.owner.email);
  writeOwner(owner);res.json({success:true});
});
app.delete('/api/owner/brands/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);if(idx===-1)return res.json({success:false,error:'Not found.'});
  owner.brands[idx].status='suspended';ownerAuditLog(owner,'brand_suspended',{brandSlug:req.params.slug},req.owner.email);writeOwner(owner);res.json({success:true});
});
app.post('/api/owner/impersonate/:slug',ownerOnly,(req,res)=>{
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug);
  if(!brand)return res.json({success:false,error:'Not found.'});if(brand.status!=='active')return res.json({success:false,error:'Not active.'});
  let bdf={};try{bdf=readBrandDB(brand.slug).featureFlags||{};}catch(e){}
  const token=uuidv4();
  sessions[token]={isOwner:false,isImpersonating:true,impersonatedBy:req.owner.email,brandSlug:brand.slug,brandName:brand.name,brandAccentColor:brand.accentColor||'#f5a623',brandTheme:brand.theme||'midnight',brandLogoUrl:brand.logoUrl||'',brandTier:brand.tier||'Free',resolvedFeatureFlags:resolveFeatureFlags(brand,bdf),isMajorAdmin:true,id:'GHOST',email:req.owner.email,name:'👁 '+req.owner.name+' (Owner)',team:'Owner',role:'Admin',active:true};
  const od=readOwner();ownerAuditLog(od,'brand_impersonated',{brandSlug:brand.slug,brandName:brand.name},req.owner.email);writeOwner(od);
  res.json({success:true,token,brand,user:sessions[token]});
});
app.get('/api/owner/brands/:slug/features',ownerOnly,(req,res)=>{
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug);if(!brand)return res.json({success:false,error:'Not found'});
  let adf={};try{adf=readBrandDB(brand.slug).featureFlags||{};}catch(e){}
  res.json({success:true,resolved:resolveFeatureFlags(brand,adf),tierDefaults:TIER_FEATURES[brand.tier]||TIER_FEATURES.Free,overrides:brand.featureOverrides||{},adminFlags:adf,meta:FEATURE_META,tierPackages:Object.keys(TIER_FEATURES)});
});
app.put('/api/owner/brands/:slug/features',ownerOnly,(req,res)=>{
  const owner=readOwner();const idx=(owner.brands||[]).findIndex(b=>b.slug===req.params.slug);if(idx===-1)return res.json({success:false,error:'Not found'});
  if(req.body.overrides!==undefined)owner.brands[idx].featureOverrides={...(owner.brands[idx].featureOverrides||{}),...req.body.overrides};
  if(req.body.resetKey)delete(owner.brands[idx].featureOverrides||{})[req.body.resetKey];
  if(req.body.resetAll)owner.brands[idx].featureOverrides={};
  ownerAuditLog(owner,'feature_override_changed',{brandSlug:req.params.slug},req.owner.email);writeOwner(owner);
  res.json({success:true,resolved:resolveFeatureFlags(owner.brands[idx])});
});
app.post('/api/test-email',async(req,res)=>{const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});const to=req.body.to||su.email;try{await sendEmail(to,'✅ TechTrack Email Test',testEmailHTML(),`Email test OK → ${to}`);res.json({success:true,message:`Sent to ${to}`});}catch(e){res.json({success:false,error:e.message});}});

// BRAND API DISPATCHER
app.post('/api/call',async(req,res)=>{
  const{fn,args=[]}=req.body;const su=getSessionUser(req);
  if(!su||su.isOwner)return res.json({success:false,error:'Brand session required.'});
  const slug=su.brandSlug,rDB=()=>readBrandDB(slug),wDB=d=>writeBrandDB(slug,d);
  // Resolved feature flags for this brand (owner always has all flags)
  const ff=su.isOwner?Object.fromEntries(Object.keys(TIER_FEATURES.Enterprise).map(k=>[k,true])):su.resolvedFeatureFlags||{};

  const aH={
    addUser:async ud=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB(),owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug)||{},lim=brand.limits||{maxUsers:20};
      if((db.users||[]).filter(u=>u.active).length>=(lim.maxUsers||20))return{success:false,error:`User limit reached (${lim.maxUsers}).`};
      if((db.users||[]).find(u=>u.email===ud.email))return{success:false,error:'Email already registered.'};
      const uid=generateId('USR'),ip=ud.password||ud.email.split('@')[0]+'123';
      const nu={id:uid,email:ud.email,name:ud.name,team:ud.team,role:ud.role,skill:ud.skill||'',slackId:ud.slackId||'',maxTickets:ud.maxTickets||10,active:true,createdDate:new Date().toISOString(),passwordHash:ip,firstLogin:true};
      db.users=db.users||[];db.users.push(nu);wDB(db);
      await sendBrandEmail(slug,ud.email,`Welcome to ${su.brandName}`,brandWelcomeHTML(nu,su.brandName,brand.accentColor||'#f5a623',ip,BASE_URL),`Login: ${BASE_URL} | Email: ${ud.email} | Pass: ${ip}`);
      return{success:true,userId:uid};
    },
    createIssue:async id=>{
      const db=rDB();
      if((db.settings||{}).DUPLICATE_DETECTION_ENABLED==='true'){const ws=(id.title||'').toLowerCase().split(' ').filter(w=>w.length>3);const dupes=(db.issues||[]).filter(issue=>{if(['Resolved','Release Required'].includes(issue.status))return false;const iw=issue.title.toLowerCase().split(' ').filter(w=>w.length>3);return ws.filter(w=>iw.includes(w)).length>=Math.min(3,ws.length*0.5);}).slice(0,5);if(dupes.length>0)return{success:false,duplicates:dupes,message:'Possible duplicate issues found'};}
      const issueId=generateIssueId(slug),slaHours=(db.slaConfig||{Critical:4,High:8,Medium:24,Low:72})[id.priority]||24;
      const issue={id:issueId,title:id.title,description:id.description,module:id.module||'',priority:id.priority,status:'Open',environment:id.environment||'',raisedBy:su.email,assignedTo:id.assignedTo||'',createdDate:new Date().toISOString(),startedDate:'',resolvedDate:'',closedDate:'',impact:id.impact||'',slaHours,attachmentUrl:id.attachmentUrl||'',sprintId:id.sprintId||''};
      db.issues=db.issues||[];db.issues.push(issue);logActivity(db,issueId,'Issue Created',su.email);
      // Auto-detect revenue impact if provided
      if(id.revenueImpact){db.issues[db.issues.length-1].revenueImpact=parseFloat(id.revenueImpact)||0;db.issues[db.issues.length-1].revenueCurrency=id.revenueCurrency||'INR';}
      wDB(db);
      // Regression check (async, non-blocking)
      const regCheck=(()=>{
        const words=issue.title.toLowerCase().split(/\W+/).filter(w=>w.length>3);
        const resolved=(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status)&&i.id!==issueId);
        const regressions=resolved.filter(i=>{const iw=i.title.toLowerCase().split(/\W+/).filter(w=>w.length>3);return words.filter(w=>iw.includes(w)).length/Math.max(words.length,iw.length,1)>=0.5;});
        if(regressions.length>0){
          logActivity(db,issueId,`⚠️ Possible regression — similar to ${regressions.map(r=>r.id).join(', ')} which were previously resolved`,su.email);
          db.issues[db.issues.length-1].possibleRegression=true;db.issues[db.issues.length-1].regressionOf=regressions.map(r=>r.id);
          writeBrandDB(slug,db);
        }
      })();
      const o2=readOwner(),b2=(o2.brands||[]).find(b=>b.slug===slug)||{};
      if(issue.assignedTo){const db2=rDB();const assignee=(db2.users||[]).find(u=>u.email===issue.assignedTo);if(assignee){const prefs=assignee.notifyPrefs||{};if(prefs.onAssigned!==false)sendBrandEmail(slug,assignee.email,`[${su.brandName}] Issue Assigned: ${issueId}`,issueAssignedHTML(issue,su.brandName,b2.accentColor||'#f5a623',assignee.name||assignee.email,BASE_URL),`Issue ${issueId} assigned`).catch(console.error);}}
      // Webhook on issue created (brand-level)
      const whUrl=(b2.settings&&b2.settings.WEBHOOK_ALERT_URL)||((rDB().settings||{}).WEBHOOK_ALERT_URL)||'';
      fireWebhook(whUrl,{event:'issue.created',issueId,title:issue.title,priority:issue.priority,brandName:su.brandName,raisedBy:su.email,url:BASE_URL}).catch(()=>{});
      // Cross-brand owner webhook for critical issues
      if(issue.priority==='Critical'){
        try{const owner=readOwner();if(owner.globalWebhookEnabled&&owner.globalWebhookUrl){fireWebhook(owner.globalWebhookUrl,{event:'critical_issue.created',issueId,title:issue.title,priority:issue.priority,brandSlug:slug,brandName:su.brandName,raisedBy:su.email,url:BASE_URL}).catch(()=>{});}}catch(e){}
      }
      return{success:true,issueId};
    },
    updateIssueStatus:async(issueId,newStatus,comment)=>{
      const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Issue not found'};
      db.issues[idx].status=newStatus;const now=new Date().toISOString();
      if(newStatus==='WIP'&&!db.issues[idx].startedDate)db.issues[idx].startedDate=now;
      if(['Resolved','Release Required'].includes(newStatus))db.issues[idx].resolvedDate=now;
      if(newStatus==='Closed')db.issues[idx].closedDate=now;
      logActivity(db,issueId,`Status changed to ${newStatus}`,su.email);
      if(comment){db.comments=db.comments||[];db.comments.push({id:generateId('CMT'),issueId,userEmail:su.email,comment,timestamp:now});}
      const issue=db.issues[idx];wDB(db);
      const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};
      const recipients=[...new Set([issue.raisedBy,issue.assignedTo].filter(Boolean).filter(e=>e!==su.email))];
      const db3=rDB();
      for(const email of recipients){
        const usr=(db3.users||[]).find(u=>u.email===email);const prefs=(usr&&usr.notifyPrefs)||{};
        if(prefs.onStatusChange===false)continue;
        if(prefs.onCriticalOnly&&issue.priority!=='Critical')continue;
        sendBrandEmail(slug,email,`[${su.brandName}] ${issueId} → ${newStatus}`,statusUpdateHTML(issue,newStatus,su.name||su.email,su.brandName,b.accentColor||'#f5a623',BASE_URL),`Issue ${issueId}: ${newStatus}`).catch(()=>{});
      }
      return{success:true};
    },
    changePassword:async(uid,np,currentPwd)=>{
      if(!np||np.length<6)return{success:false,error:'Password must be at least 6 characters.'};
      if(su.role!=='Admin'&&su.id!==uid)return{success:false,error:'Not authorized'};
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);
      if(idx===-1)return{success:false,error:'Not found'};
      // If changing own password, verify current password
      if(su.id===uid&&su.role!=='Admin'&&currentPwd){
        if(!checkPwd(currentPwd,db.users[idx].passwordHash))return{success:false,error:'Current password is incorrect.'};
      }
      db.users[idx].passwordHash=hashPwd(np);
      db.users[idx].mustChangePassword=false;
      db.users[idx].firstLogin=false;
      // Update session
      const t=req.headers['x-session-token'];
      if(t&&sessions[t]){sessions[t].mustChangePassword=false;sessions[t].firstLogin=false;}
      wDB(db);return{success:true};
    },
    // Force password change for a user (admin sets flag)
    forcePasswordChange:async(uid)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);
      if(idx===-1)return{success:false,error:'Not found'};
      db.users[idx].mustChangePassword=true;wDB(db);return{success:true};
    },
    // Duplicate/clone an issue
    duplicateIssue:async(issueId)=>{
      const db=rDB();const issue=(db.issues||[]).find(i=>i.id===issueId);
      if(!issue)return{success:false,error:'Issue not found'};
      const newId=generateIssueId(slug);
      const clone={...issue,id:newId,title:'[COPY] '+issue.title,status:'Open',createdDate:new Date().toISOString(),raisedBy:su.email,startedDate:'',resolvedDate:'',closedDate:'',sprintId:''};
      db.issues=db.issues||[];db.issues.push(clone);
      logActivity(db,newId,'Issue duplicated from '+issueId,su.email);wDB(db);
      return{success:true,issueId:newId};
    },
    // Generate invite link
    createInviteLink:async(role,expiryHours)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const token=uuidv4().substring(0,12).toUpperCase();
      const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
      inviteTokens[token]={brandSlug:slug,brandName:su.brandName,brandColor:brand.accentColor||'#f5a623',role:role||'Developer',expiresAt:Date.now()+(expiryHours||48)*3600000,createdBy:su.email};
      return{success:true,token,inviteUrl:`${BASE_URL}/join?invite=${token}`,expiresIn:`${expiryHours||48} hours`};
    },
    // Session info (for expiry check from frontend)
    getSessionInfo:()=>{
      const t=req.headers['x-session-token'];
      const s=t?sessions[t]:null;
      return{success:true,expiresAt:s?s.expiresAt:null,expiresIn:s&&s.expiresAt?Math.max(0,Math.round((s.expiresAt-Date.now())/60000)):0};
    },
    resendWelcomeEmail:async uid=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();const user=(db.users||[]).find(u=>u.id===uid);if(!user)return{success:false,error:'Not found'};const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};await sendBrandEmail(slug,user.email,`Your ${su.brandName} Account`,brandWelcomeHTML(user,su.brandName,b.accentColor||'#f5a623',user.passwordHash,BASE_URL),`Login: ${BASE_URL}`);return{success:true};},
    sendTestEmail:async to=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};await sendBrandEmail(slug,to||su.email,`✅ TechTrack Email Test`,testEmailHTML(),'Email test OK');return{success:true};},
    completeBrandSetup:async sd=>{if(!su.isMajorAdmin)return{success:false,error:'Major Admin only'};const db=rDB();if(sd.appName){db.settings=db.settings||{};db.settings.APP_NAME=sd.appName;}const ui=(db.users||[]).findIndex(u=>u.email===su.email);if(ui>=0){db.users[ui].firstLogin=false;if(sd.adminName)db.users[ui].name=sd.adminName;}wDB(db);const o=readOwner(),bi=(o.brands||[]).findIndex(b=>b.slug===slug);if(bi>=0){if(sd.accentColor)o.brands[bi].accentColor=sd.accentColor;if(sd.theme)o.brands[bi].theme=sd.theme;if(sd.logoUrl!==undefined)o.brands[bi].logoUrl=sd.logoUrl;if(sd.appName)o.brands[bi].name=sd.appName;writeOwner(o);}const t=req.headers['x-session-token'];if(t&&sessions[t])Object.assign(sessions[t],{brandName:sd.appName||su.brandName,brandAccentColor:sd.accentColor||su.brandAccentColor,brandTheme:sd.theme||su.brandTheme,firstLogin:false});return{success:true};},
    updateBrandProfile:async updates=>{if(!su.isMajorAdmin)return{success:false,error:'Major Admin only'};const o=readOwner(),bi=(o.brands||[]).findIndex(b=>b.slug===slug);if(bi<0)return{success:false,error:'Not found'};['name','logoUrl','accentColor','theme'].forEach(k=>{if(updates[k]!==undefined)o.brands[bi][k]=updates[k];});writeOwner(o);return{success:true};},
    pollEmailInbox:async()=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};try{await pollBrandInbox(slug);return{success:true,message:'Inbox polled. New emails converted to tickets.'};}catch(e){return{success:false,error:e.message||String(e)};}},
    testBrandEmail:async(toEmail)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      try{
        await sendBrandEmail(slug,toEmail||su.email,'✅ Brand Email Test — Resolvo',`<div style="font-family:Arial;padding:24px;"><h2>✅ Brand Email Configured</h2><p>Your brand email is working correctly. All issue alerts, welcome emails and ticket replies will now send from this address.</p></div>`,`Brand email test OK`);
        const db=rDB();db.settings=db.settings||{};db.settings.BRAND_EMAIL_TESTED=true;wDB(db);
        return{success:true,message:`Test email sent to ${toEmail||su.email}`};
      }catch(e){return{success:false,error:e.message};}
    },
    replyToTicket:async(ticketId,replyText,isNote)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      const ticket=db.tickets[idx];
      const msgId=generateId('MSG');
      const now=new Date().toISOString();
      const msg={id:msgId,type:isNote?'note':'reply',from:su.email,fromName:su.name||su.email,body:replyText,timestamp:now,sentAsEmail:!isNote};
      db.tickets[idx].thread=db.tickets[idx].thread||[];db.tickets[idx].thread.push(msg);
      db.tickets[idx].lastActivity=now;
      if(db.tickets[idx].status==='new'&&!isNote)db.tickets[idx].status='open';
      // Track first response time (first agent reply)
      if(!isNote&&!db.tickets[idx].firstResponseAt&&su.email!==db.tickets[idx].from){
        db.tickets[idx].firstResponseAt=now;
        const createdAt=new Date(db.tickets[idx].createdDate||db.tickets[idx].lastActivity);
        db.tickets[idx].firstResponseMinutes=Math.round((new Date(now)-createdAt)/60000);
      }
      // Resume SLA if paused (customer replied = agent's turn)
      if(!isNote&&db.tickets[idx].slaPaused&&su.email!==db.tickets[idx].from){
        const pausedMs=db.tickets[idx].slaPausedMs||0;
        const extraMs=db.tickets[idx].slaPausedAt?Date.now()-new Date(db.tickets[idx].slaPausedAt).getTime():0;
        db.tickets[idx].slaExtraMs=(pausedMs+extraMs);
        db.tickets[idx].slaPaused=false;db.tickets[idx].slaPausedAt=null;
      }
      // Add timeline event
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:isNote?'note_added':'reply_sent',by:su.email,byName:su.name||su.email,at:now,detail:replyText.substring(0,120)});
      wDB(db);
      if(!isNote&&ticket.from){
        const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        const brandName=brand.name||'Support';const brandColor=brand.accentColor||'#F5A623';
        await sendBrandEmail(slug,ticket.from,`Re: [${brandName}] ${ticket.subject}`,
          `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:24px 16px;"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="background:${brandColor};padding:16px 24px;display:flex;align-items:center;gap:12px;"><div style="font-size:13px;font-weight:700;color:#fff;">${brandName} Support</div><div style="margin-left:auto;font-size:11px;color:rgba(255,255,255,.7);">${ticketId}</div></div><div style="padding:24px 28px;"><p style="color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;margin:0 0 20px;">${replyText}</p><hr style="border:none;border-top:1px solid #f0f2f5;margin:0 0 16px;"><p style="color:#9ca3af;font-size:12px;margin:0;">Reply to this email to continue the conversation &nbsp;·&nbsp; Ref: ${ticketId}</p></div></div></body></html>`,
          replyText
        );
        for(const ccEmail of (ticket.cc||[])){
          sendBrandEmail(slug,ccEmail,`CC: Re: [${brandName}] ${ticket.subject}`,`<p>${replyText}</p><p style="color:#9ca3af;font-size:12px;">You are CC'd on ticket ${ticketId}</p>`,replyText).catch(()=>{});
        }
      }
      // Notify watchers
      const dbFresh=rDB();const updatedTicket=(dbFresh.tickets||[]).find(t=>t.id===ticketId);
      if(updatedTicket&&!isNote){
        const brand2=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        (updatedTicket.watchers||[]).filter(w=>w!==su.email).forEach(wEmail=>{
          const wu=(dbFresh.users||[]).find(u=>u.email===wEmail);
          sendBrandEmail(slug,wEmail,`[Watching] New reply on ${ticketId}: ${updatedTicket.subject}`,
            `<p>Hi ${wu?.name||wEmail},</p><p>${su.name||su.email} replied to a ticket you're watching.</p><p><strong>${updatedTicket.subject}</strong></p><p style="background:#f9fafb;padding:12px;border-radius:8px;">${replyText.substring(0,300)}</p><a href="${BASE_URL}">View ticket →</a>`,
            `New reply on ${ticketId}`).catch(()=>{});
        });
      }
      return{success:true,msgId};
    },
  };

  const sH={
    getCurrentUser:()=>({success:true,user:su}),
    getUsers:ao=>{const db=rDB();let u=db.users||[];if(ao)u=u.filter(u=>u.active);return{success:true,users:u.map(u=>({...u,passwordHash:undefined}))};},
    getDevelopers:()=>{const db=rDB();return{success:true,developers:(db.users||[]).filter(u=>u.role==='Developer'&&u.active).map(u=>({...u,passwordHash:undefined}))};},
    updateUser:(uid,ud)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);if(idx===-1)return{success:false,error:'Not found'};['name','team','role','skill','slackId','maxTickets','active'].forEach(f=>{if(ud[f]!==undefined)db.users[idx][f]=ud[f];});wDB(db);return{success:true};},
    getUserActivity:uid=>{const db=rDB();const user=(db.users||[]).find(u=>u.id===uid);if(!user)return{success:false,error:'Not found'};const logs=(db.activityLog||[]).filter(l=>l.user===user.email);return{success:true,logs:logs.slice(-50).reverse(),totalActions:logs.length,issuesRaised:(db.issues||[]).filter(i=>i.raisedBy===user.email).length,issuesResolved:(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status)&&i.assignedTo===user.email).length};},
    checkDuplicates:title=>{const db=rDB(),ws=(title||'').toLowerCase().split(' ').filter(w=>w.length>3);return{success:true,duplicates:(db.issues||[]).filter(issue=>{if(['Resolved','Release Required'].includes(issue.status))return false;const iw=issue.title.toLowerCase().split(' ').filter(w=>w.length>3);return ws.filter(w=>iw.includes(w)).length>=Math.min(3,ws.length*0.5);}).slice(0,5)};},
    addComment:(issueId,ct)=>{
      const db=rDB(),cid=generateId('CMT'),now=new Date().toISOString();
      db.comments=db.comments||[];db.comments.push({id:cid,issueId,userEmail:su.email,comment:ct,timestamp:now});
      logActivity(db,issueId,'Comment added',su.email);wDB(db);
      // @mention detection — notify mentioned users
      const mentions=[...new Set((ct.match(/@([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi)||[]).map(m=>m.slice(1)))];
      if(mentions.length){
        const issue=(db.issues||[]).find(i=>i.id===issueId);
        const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};
        mentions.filter(m=>m!==su.email).forEach(mentionEmail=>{
          const mentionedUser=(db.users||[]).find(u=>u.email===mentionEmail);
          if(mentionedUser){
            sendBrandEmail(slug,mentionEmail,`[${su.brandName}] You were mentioned in ${issueId}`,
              `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#f0f2f5;font-family:-apple-system,sans-serif;padding:30px 16px;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);"><div style="background:linear-gradient(135deg,${b.accentColor||'#f5a623'},${b.accentColor||'#f5a623'}cc);padding:32px;text-align:center;"><div style="font-size:32px;margin-bottom:10px;">💬</div><h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">You were mentioned</h1></div><div style="padding:28px 32px;"><p style="color:#374151;margin:0 0 14px;">Hi <strong>${mentionedUser.name||mentionEmail}</strong>, <strong>${su.name||su.email}</strong> mentioned you in a comment on <strong>${issue?issue.title:issueId}</strong>.</p><div style="background:#f9fafb;border-radius:10px;padding:14px 16px;border-left:4px solid ${b.accentColor||'#f5a623'};margin-bottom:20px;"><p style="margin:0;font-size:13px;color:#374151;font-style:italic;">"${ct.substring(0,200)}${ct.length>200?'...':''}"</p></div><div style="text-align:center;"><a href="${BASE_URL}" style="display:inline-block;padding:12px 36px;border-radius:8px;background:${b.accentColor||'#f5a623'};color:#fff;font-size:14px;font-weight:700;text-decoration:none;">View Issue →</a></div></div></div></body></html>`,
              `${su.name||su.email} mentioned you: "${ct.substring(0,100)}"`
            ).catch(()=>{});
          }
        });
      }
      return{success:true,commentId:cid};
    },
    addCommentWithMentions:(issueId,ct)=>{
      const db=rDB(),cid=generateId('CMT'),now=new Date().toISOString();
      db.comments=db.comments||[];db.comments.push({id:cid,issueId,userEmail:su.email,comment:ct,timestamp:now});
      logActivity(db,issueId,'Comment added',su.email);wDB(db);
      // @mention detection
      const mentions=[...new Set((ct.match(/@([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi)||[]).map(m=>m.slice(1)))];
      if(mentions.length){
        const issue=(db.issues||[]).find(i=>i.id===issueId);
        const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};
        mentions.filter(m=>m!==su.email).forEach(mentionEmail=>{
          const mu=(db.users||[]).find(u=>u.email===mentionEmail);
          if(mu)sendBrandEmail(slug,mentionEmail,`[${su.brandName}] You were mentioned in ${issueId}`,`<p>Hi ${mu.name||mentionEmail}, ${su.name||su.email} mentioned you in a comment on issue ${issueId}. <a href="${BASE_URL}">View issue</a></p>`,`${su.name} mentioned you on issue ${issueId}`).catch(()=>{});
        });
      }
      return{success:true,commentId:cid};
    },
    getComments:issueId=>{const db=rDB();return{success:true,comments:(db.comments||[]).filter(c=>c.issueId===issueId)};},
    getActivityLog:issueId=>{const db=rDB();let l=db.activityLog||[];if(issueId)l=l.filter(x=>x.issueId===issueId);return{success:true,logs:l.slice().reverse()};},
    getIssues:filters=>{
      const db=rDB(),now=new Date();
      let issues=(db.issues||[]).map(issue=>{const sd=new Date(new Date(issue.createdDate).getTime()+issue.slaHours*3600000),hr=(sd-now)/3600000;return{...issue,slaDeadline:sd.toISOString(),slaBreached:now>sd&&!['Resolved','Release Required'].includes(issue.status),slaHoursRemaining:Math.round(hr*10)/10,slaRisk:hr>0&&hr<issue.slaHours*0.2};});
      if(filters){if(filters.status&&filters.status!=='all')issues=issues.filter(i=>i.status===filters.status);if(filters.priority&&filters.priority!=='all')issues=issues.filter(i=>i.priority===filters.priority);if(filters.module&&filters.module!=='all')issues=issues.filter(i=>i.module===filters.module);if(filters.assignedTo&&filters.assignedTo!=='all')issues=issues.filter(i=>i.assignedTo===filters.assignedTo);if(filters.raisedBy)issues=issues.filter(i=>i.raisedBy===filters.raisedBy);if(filters.dateFrom)issues=issues.filter(i=>new Date(i.createdDate)>=new Date(filters.dateFrom));if(filters.dateTo)issues=issues.filter(i=>new Date(i.createdDate)<=new Date(filters.dateTo));}
      return{success:true,issues:issues.reverse()};
    },
    getIssueById:issueId=>{const db=rDB(),now=new Date(),issue=(db.issues||[]).find(i=>i.id===issueId);if(!issue)return{success:false,error:'Not found'};const sd=new Date(new Date(issue.createdDate).getTime()+issue.slaHours*3600000),hr=(sd-now)/3600000;return{success:true,issue:{...issue,slaDeadline:sd.toISOString(),slaBreached:now>sd&&!['Resolved','Release Required'].includes(issue.status),slaHoursRemaining:Math.round(hr*10)/10,slaRisk:hr>0&&hr<issue.slaHours*0.2}};},
    updateIssuePriority:(issueId,p)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].priority=p;logActivity(db,issueId,`Priority changed to ${p}`,su.email);wDB(db);return{success:true};},
    assignIssue:(issueId,de)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].assignedTo=de;logActivity(db,issueId,`Assigned to ${de}`,su.email);wDB(db);return{success:true};},
    getDashboardStats:()=>{
      const db=rDB(),now=new Date();
      const issues=(db.issues||[]).map(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return{...i,slaBreached:now>d&&!['Resolved','Release Required'].includes(i.status)};});
      const stats={total:issues.length,open:issues.filter(i=>i.status==='Open').length,inProgress:issues.filter(i=>i.status==='WIP').length,critical:issues.filter(i=>i.priority==='Critical'&&!['Resolved','Release Required'].includes(i.status)).length,slaBreached:issues.filter(i=>i.slaBreached).length,resolved:issues.filter(i=>i.status==='Resolved').length,closed:issues.filter(i=>i.status==='Release Required').length};
      const mc={},pc={Critical:0,High:0,Medium:0,Low:0},dw={};
      issues.forEach(i=>{if(i.module)mc[i.module]=(mc[i.module]||0)+1;if(pc[i.priority]!==undefined)pc[i.priority]++;});
      issues.filter(i=>!['Resolved','Release Required'].includes(i.status)).forEach(i=>{if(i.assignedTo)dw[i.assignedTo]=(dw[i.assignedTo]||0)+1;});
      const trend=[];for(let d=6;d>=0;d--){const date=new Date();date.setDate(date.getDate()-d);const ds=date.toISOString().split('T')[0];trend.push({date:ds,count:issues.filter(i=>i.resolvedDate&&i.resolvedDate.startsWith(ds)).length});}
      const si=issues.filter(i=>i.status==='WIP').reduce((acc,i)=>{acc[i.priority]=(acc[i.priority]||0)+1;return acc;},{Critical:0,High:0,Medium:0,Low:0});
      const dwst={},dwsip={};
      issues.filter(i=>!['Resolved','Release Required'].includes(i.status)).forEach(i=>{if(i.assignedTo){if(!dwst[i.assignedTo])dwst[i.assignedTo]={Critical:0,High:0,Medium:0,Low:0};dwst[i.assignedTo][i.priority]++;}});
      issues.filter(i=>i.status==='WIP').forEach(i=>{if(i.assignedTo){if(!dwsip[i.assignedTo])dwsip[i.assignedTo]={Critical:0,High:0,Medium:0,Low:0};dwsip[i.assignedTo][i.priority]++;}});
      const aging=issues.filter(i=>i.status==='WIP').map(i=>{const d=Math.floor((now-new Date(i.createdDate))/86400000);return d<=2?'0–2 days':d<=5?'3–5 days':d<=10?'6–10 days':'10+ days';}).reduce((acc,b)=>{acc[b]=(acc[b]||0)+1;return acc;},{'0–2 days':0,'3–5 days':0,'6–10 days':0,'10+ days':0});
      return{success:true,stats,moduleCount:mc,priorityCount:pc,devWorkload:dw,trend,severityTotal:pc,severityInProgress:si,devWorkloadSeverityTotal:dwst,devWorkloadSeverityInProgress:dwsip,aging};
    },
    getDevPerformance:()=>{const db=rDB(),dm={};(db.issues||[]).forEach(issue=>{if(!issue.assignedTo)return;if(!dm[issue.assignedTo])dm[issue.assignedTo]={email:issue.assignedTo,resolved:0,totalResolutionHours:0,reopened:0};if(['Resolved','Release Required'].includes(issue.status)&&issue.resolvedDate&&issue.createdDate){dm[issue.assignedTo].resolved++;dm[issue.assignedTo].totalResolutionHours+=(new Date(issue.resolvedDate)-new Date(issue.createdDate))/3600000;}if(issue.status==='Reopened')dm[issue.assignedTo].reopened++;});return{success:true,performance:Object.values(dm).map(d=>({...d,avgResolutionHours:d.resolved>0?Math.round(d.totalResolutionHours/d.resolved):0}))};},
    getModules:()=>{const db=rDB(),s=(db.settings||{}).MODULES;return{success:true,modules:s?s.split(',').map(m=>m.trim()):['API','Dashboard','Reports','Authentication','Database','UI','Integration','Backend','Frontend','DevOps']};},
    updateModules:ma=>{const db=rDB();db.settings=db.settings||{};db.settings.MODULES=ma.join(',');wDB(db);return{success:true};},
    getSettings:()=>{const db=rDB();return{success:true,settings:db.settings||{}};},
    updateSetting:(k,v)=>{const db=rDB();db.settings=db.settings||{};db.settings[k]=v;wDB(db);return{success:true};},
    getSLAConfig:()=>{const db=rDB();return{success:true,config:db.slaConfig||{Critical:4,High:8,Medium:24,Low:72}};},
    updateSLAConfig:(p,h)=>{const db=rDB();db.slaConfig=db.slaConfig||{};db.slaConfig[p]=h;wDB(db);return{success:true};},
    getKanbanData:()=>{const db=rDB(),now=new Date(),cols=['Open','Acknowledged','WIP','Testing','Blocked','Need Info'],board={};cols.forEach(s=>{board[s]=[];});(db.issues||[]).filter(i=>cols.includes(i.status)).forEach(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);board[i.status].push({...i,slaBreached:now>d});});return{success:true,board,columns:cols};},
    getSprints:()=>{const db=rDB();return{success:true,sprints:db.sprints||[]};},
    createSprint:data=>{const db=rDB(),s={id:generateId('SPR'),...data,createdDate:new Date().toISOString()};db.sprints=db.sprints||[];db.sprints.push(s);wDB(db);return{success:true,sprintId:s.id};},
    assignIssueToSprint:(ii,si)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===ii);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].sprintId=si;wDB(db);return{success:true};},
    getSprintIssues:si=>{const db=rDB();return{success:true,issues:(db.issues||[]).filter(i=>i.sprintId===si)};},
    getBurndownData:si=>{const db=rDB(),issues=si?(db.issues||[]).filter(i=>i.sprintId===si):db.issues||[],total=issues.length,data=[];for(let d=9;d>=0;d--){const date=new Date();date.setDate(date.getDate()-d);const ds=date.toISOString().split('T')[0],resolved=issues.filter(i=>i.resolvedDate&&i.resolvedDate.substring(0,10)<=ds).length;data.push({date:ds,remaining:total-resolved,resolved});}return{success:true,data,total};},
    getSprintVelocity:()=>{const db=rDB();return{success:true,sprints:(db.sprints||[]).map(sp=>{const i=(db.issues||[]).filter(i=>i.sprintId===sp.id);return{...sp,total:i.length,resolved:i.filter(i=>i.status==='Resolved').length};})};},
    addDependency:(ii,bi)=>{const db=rDB();db.dependencies=db.dependencies||[];if(!db.dependencies.find(d=>d.issueId===ii&&d.blockedBy===bi))db.dependencies.push({id:generateId('DEP'),issueId:ii,blockedBy:bi});wDB(db);return{success:true};},
    removeDependency:(ii,bi)=>{const db=rDB();db.dependencies=(db.dependencies||[]).filter(d=>!(d.issueId===ii&&d.blockedBy===bi));wDB(db);return{success:true};},
    getIssueDependencies:ii=>{const db=rDB();return{success:true,dependencies:(db.dependencies||[]).filter(d=>d.issueId===ii)};},
    getCustomFields:()=>{const db=rDB();return{success:true,fields:db.customFields||[]};},
    saveCustomField:f=>{const db=rDB();db.customFields=db.customFields||[];const idx=db.customFields.findIndex(x=>x.id===f.id);if(idx>=0)db.customFields[idx]=f;else db.customFields.push({...f,id:generateId('CF')});wDB(db);return{success:true};},
    deleteCustomField:id=>{const db=rDB();db.customFields=(db.customFields||[]).filter(f=>f.id!==id);wDB(db);return{success:true};},
    getCustomFieldValues:ii=>{const db=rDB();return{success:true,values:(db.customFieldValues||[]).filter(v=>v.issueId===ii)};},
    saveCustomFieldValues:(ii,vals)=>{const db=rDB();db.customFieldValues=(db.customFieldValues||[]).filter(v=>v.issueId!==ii);(vals||[]).forEach(v=>db.customFieldValues.push({...v,issueId:ii}));wDB(db);return{success:true};},
    getOnCallSchedule:()=>{const db=rDB();return{success:true,schedule:db.onCallSchedule||[]};},
    getCurrentOnCall:()=>{const db=rDB(),now=new Date();return{success:true,current:(db.onCallSchedule||[]).find(e=>new Date(e.start)<=now&&new Date(e.end)>=now)||null};},
    saveOnCallEntry:e=>{const db=rDB();db.onCallSchedule=db.onCallSchedule||[];db.onCallSchedule.push({...e,id:generateId('OC')});wDB(db);return{success:true};},
    getSavedFilters:()=>{const db=rDB();return{success:true,filters:db.savedFilters||[]};},
    saveFilter:(n,f,s)=>{const db=rDB();db.savedFilters=db.savedFilters||[];db.savedFilters.push({id:generateId('FLT'),name:n,filters:f,shared:s,owner:su.email});wDB(db);return{success:true};},
    deleteSavedFilter:id=>{const db=rDB();db.savedFilters=(db.savedFilters||[]).filter(f=>f.id!==id);wDB(db);return{success:true};},
    getMTTRStats:()=>{const db=rDB(),r=(db.issues||[]).filter(i=>i.status==='Resolved'&&i.resolvedDate&&i.createdDate),t=r.length,avg=t>0?r.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/t:0;return{success:true,mttr:Math.round(avg*10)/10,total:t};},
    getRecurringPatterns:()=>{const db=rDB(),mc={};(db.issues||[]).forEach(i=>{if(i.module)mc[i.module]=(mc[i.module]||0)+1;});return{success:true,patterns:Object.entries(mc).filter(([,c])=>c>=3).map(([module,count])=>({module,count})).sort((a,b)=>b.count-a.count)};},
    getWorkloadData:()=>{const db=rDB();return{success:true,workload:(db.users||[]).filter(u=>u.role==='Developer'&&u.active).map(u=>{const a=(db.issues||[]).filter(i=>i.assignedTo===u.email&&!['Resolved','Release Required'].includes(i.status));return{email:u.email,name:u.name,count:a.length,maxTickets:u.maxTickets||10};})};},
    getEscalationRules:()=>{const db=rDB();return{success:true,rules:db.escalationRules||[]};},
    saveEscalationRule:r=>{const db=rDB();db.escalationRules=db.escalationRules||[];db.escalationRules.push({...r,id:generateId('ESC')});wDB(db);return{success:true};},
    deleteEscalationRule:id=>{const db=rDB();db.escalationRules=(db.escalationRules||[]).filter(r=>r.id!==id);wDB(db);return{success:true};},
    runEscalationCheck:()=>({success:true,escalated:0}),
    getRecurringTemplates:()=>{const db=rDB();return{success:true,templates:db.recurringTemplates||[]};},
    saveRecurringTemplate:t=>{const db=rDB();db.recurringTemplates=db.recurringTemplates||[];db.recurringTemplates.push({...t,id:generateId('TPL')});wDB(db);return{success:true};},
    deleteRecurringTemplate:id=>{const db=rDB();db.recurringTemplates=(db.recurringTemplates||[]).filter(t=>t.id!==id);wDB(db);return{success:true};},
    linkCommitToIssue:(ii,cd)=>{const db=rDB();db.commits=db.commits||[];db.commits.push({...cd,issueId:ii,linkedAt:new Date().toISOString()});wDB(db);return{success:true};},
    getIssueCommits:ii=>{const db=rDB();return{success:true,commits:(db.commits||[]).filter(c=>c.issueId===ii)};},
    requestPeerReview:(ii,re)=>{const db=rDB();db.peerReviews=db.peerReviews||[];db.peerReviews.push({id:generateId('REV'),issueId:ii,reviewer:re,status:'Pending',requestedBy:su.email,requestedAt:new Date().toISOString()});wDB(db);return{success:true};},
    submitPeerReview:(rid,dec,com)=>{const db=rDB();const idx=(db.peerReviews||[]).findIndex(r=>r.id===rid);if(idx===-1)return{success:false,error:'Not found'};db.peerReviews[idx].status=dec;db.peerReviews[idx].comment=com;db.peerReviews[idx].reviewedAt=new Date().toISOString();wDB(db);return{success:true};},
    getPendingReviews:()=>{const db=rDB(),r=(db.peerReviews||[]).filter(r=>r.reviewer===su.email&&r.status==='Pending');return{success:true,reviews:r.map(r=>{const issue=(db.issues||[]).find(i=>i.id===r.issueId);return{...r,issueTitle:issue?issue.title:r.issueId};})};},
    generatePostMortem:ii=>{const db=rDB(),issue=(db.issues||[]).find(i=>i.id===ii);if(!issue)return{success:false,error:'Not found'};const pm={id:generateId('PM'),issueId:ii,title:issue.title,priority:issue.priority,module:issue.module,raisedBy:issue.raisedBy,assignedTo:issue.assignedTo,createdDate:issue.createdDate,resolvedDate:issue.resolvedDate,resolutionTime:issue.resolvedDate?Math.round((new Date(issue.resolvedDate)-new Date(issue.createdDate))/3600000)+'h':'Unresolved',timeline:(db.comments||[]).filter(c=>c.issueId===ii).map(c=>({time:c.timestamp,user:c.userEmail,note:c.comment})),generatedAt:new Date().toISOString()};db.postMortems=db.postMortems||[];db.postMortems.push(pm);wDB(db);return{success:true,postMortem:pm};},
    getPostMortem:ii=>{const db=rDB();return{success:true,postMortem:(db.postMortems||[]).find(p=>p.issueId===ii)||null};},
    generateReleaseNotes:(fd,td)=>{const db=rDB(),from=new Date(fd),to=new Date(td),r=(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&new Date(i.resolvedDate)>=from&&new Date(i.resolvedDate)<=to);return{success:true,notes:r.map(i=>`- [${i.priority}] ${i.id}: ${i.title} (${i.module||'General'})`).join('\n'),count:r.length};},
    getAuditTrail:f=>{const db=rDB();let l=db.activityLog||[];if(f&&f.issueId)l=l.filter(x=>x.issueId===f.issueId);return{success:true,trail:l.slice().reverse()};},
    processAIQuery:()=>({success:false,error:'Server-side AI not configured.'}),
    getAIQueryHistory:lim=>{const db=rDB(),l=(db.aiHistory||[]).slice(0,lim||50);return{success:true,history:l,queries:l};},
    setGeminiApiKey:k=>{const db=rDB();db.settings=db.settings||{};db.settings.GEMINI_API_KEY=k;wDB(db);return{success:true};},
    getGeminiStatus:()=>{const db=rDB();return{success:true,configured:!!((db.settings||{}).GEMINI_API_KEY||process.env.GEMINI_API_KEY||'')};},
    getIssueTags:ii=>{const db=rDB();return{success:true,tags:(db.tags||[]).filter(t=>t.issueId===ii)};},
    addIssueTag:(ii,label,color)=>{const db=rDB();db.tags=db.tags||[];db.tags.push({id:generateId('TAG'),issueId:ii,label,color});wDB(db);return{success:true};},
    removeIssueTag:id=>{const db=rDB();db.tags=(db.tags||[]).filter(t=>t.id!==id);wDB(db);return{success:true};},
    getAllTags:()=>{const db=rDB();return{success:true,tags:db.tags||[]};},
    getCoAssignees:ii=>{const db=rDB();return{success:true,coAssignees:(db.coAssignees||[]).filter(c=>c.issueId===ii)};},
    addCoAssignee:(ii,email)=>{const db=rDB();db.coAssignees=db.coAssignees||[];if(!db.coAssignees.find(c=>c.issueId===ii&&c.email===email))db.coAssignees.push({issueId:ii,email});wDB(db);return{success:true};},
    removeCoAssignee:(ii,email)=>{const db=rDB();db.coAssignees=(db.coAssignees||[]).filter(c=>!(c.issueId===ii&&c.email===email));wDB(db);return{success:true};},
    voteIssue:ii=>{const db=rDB();db.votes=db.votes||[];const ex=db.votes.find(v=>v.issueId===ii&&v.email===su.email);if(ex)db.votes=db.votes.filter(v=>!(v.issueId===ii&&v.email===su.email));else db.votes.push({issueId:ii,email:su.email});wDB(db);return{success:true,voted:!ex};},
    getVoteCounts:()=>{const db=rDB(),c={};(db.votes||[]).forEach(v=>{c[v.issueId]=(c[v.issueId]||0)+1;});return{success:true,counts:c};},
    setIssueDueDate:(ii,dd)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===ii);if(idx===-1)return{success:false};db.issues[idx].dueDate=dd;wDB(db);return{success:true};},
    logTime:(ii,h,n,d)=>{const db=rDB();db.timeLogs=db.timeLogs||[];db.timeLogs.push({id:generateId('TL'),issueId:ii,hours:h,note:n,date:d||new Date().toISOString().split('T')[0],loggedBy:su.email,loggedAt:new Date().toISOString()});wDB(db);return{success:true};},
    getTimeLogs:ii=>{const db=rDB();return{success:true,logs:(db.timeLogs||[]).filter(l=>l.issueId===ii)};},
    toggleWatcher:(ii,ue)=>{const db=rDB();db.watchers=db.watchers||[];const ex=db.watchers.find(w=>w.issueId===ii&&w.email===ue);if(ex)db.watchers=db.watchers.filter(w=>!(w.issueId===ii&&w.email===ue));else db.watchers.push({issueId:ii,email:ue});wDB(db);return{success:true,watching:!ex};},
    getWatchers:ii=>{const db=rDB();return{success:true,watchers:(db.watchers||[]).filter(w=>w.issueId===ii)};},
    toggleReaction:(cid,emoji)=>{const db=rDB();db.reactions=db.reactions||[];const ex=db.reactions.find(r=>r.commentId===cid&&r.emoji===emoji&&r.email===su.email);if(ex)db.reactions=db.reactions.filter(r=>!(r.commentId===cid&&r.emoji===emoji&&r.email===su.email));else db.reactions.push({commentId:cid,emoji,email:su.email});wDB(db);return{success:true};},
    getReactions:ii=>{const db=rDB(),cids=(db.comments||[]).filter(c=>c.issueId===ii).map(c=>c.id);return{success:true,reactions:(db.reactions||[]).filter(r=>cids.includes(r.commentId))};},
    togglePinnedIssue:ii=>{const db=rDB();db.pinnedIssues=db.pinnedIssues||[];const ex=db.pinnedIssues.find(p=>p.issueId===ii&&p.email===su.email);if(ex)db.pinnedIssues=db.pinnedIssues.filter(p=>!(p.issueId===ii&&p.email===su.email));else db.pinnedIssues.push({issueId:ii,email:su.email});wDB(db);return{success:true,pinned:!ex};},
    getPinnedIssues:()=>{const db=rDB(),now=new Date();return{success:true,issues:(db.pinnedIssues||[]).filter(p=>p.email===su.email).map(p=>{const issue=(db.issues||[]).find(i=>i.id===p.issueId);if(!issue)return null;const d=new Date(new Date(issue.createdDate).getTime()+issue.slaHours*3600000);return{...issue,slaBreached:now>d};}).filter(Boolean)};},
    fullTextSearch:q=>{const db=rDB(),ql=(q||'').toLowerCase();return{success:true,results:(db.issues||[]).filter(i=>i.title.toLowerCase().includes(ql)||(i.description||'').toLowerCase().includes(ql)||i.id.toLowerCase().includes(ql)).slice(0,20)};},
    getAllFeatureFlags:()=>{const db=rDB(),owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug);if(brand)return{success:true,flags:resolveFeatureFlags(brand,db.featureFlags||{}),tier:brand.tier,overrides:brand.featureOverrides||{}};return{success:true,flags:db.featureFlags||{}};},
    // Feature flags are OWNER-controlled only — brand admins cannot change them
    updateFeatureFlags:fo=>{
      // Block brand admin from changing feature flags — owner portal only
      return{success:false,error:'Feature access is managed by the platform administrator. Contact your admin to enable features.'};
    },
    isFeatureEnabled:key=>{const db=rDB(),owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug);if(brand)return{success:true,enabled:resolveFeatureFlags(brand,db.featureFlags||{})[key]===true};return{success:true,enabled:(db.featureFlags||{})[key]===true};},
    getBrandFeatureAccess:()=>{const db=rDB(),owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug);if(!brand)return{success:false,error:'Not found'};return{success:true,resolved:resolveFeatureFlags(brand,db.featureFlags||{}),tier:brand.tier,meta:FEATURE_META,overrides:brand.featureOverrides||{}};},
    getModuleHealthScores:()=>{const db=rDB(),mc={},mcc={};(db.issues||[]).filter(i=>!['Resolved','Release Required'].includes(i.status)).forEach(i=>{if(i.module){mc[i.module]=(mc[i.module]||0)+1;if(i.priority==='Critical')mcc[i.module]=(mcc[i.module]||0)+1;}});return{success:true,scores:Object.keys(mc).map(m=>({module:m,open:mc[m],critical:mcc[m]||0,health:Math.max(0,100-mc[m]*5-(mcc[m]||0)*20)}))};},
    getSLAComplianceReport:(fd,td)=>{const db=rDB(),from=new Date(fd),to=new Date(td),now=new Date(),issues=(db.issues||[]).filter(i=>new Date(i.createdDate)>=from&&new Date(i.createdDate)<=to),breached=issues.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d&&!['Resolved','Release Required'].includes(i.status);}).length;return{success:true,total:issues.length,breached,compliant:issues.length-breached};},
    getPlatformStats:()=>{const db=rDB(),now=new Date(),issues=db.issues||[],owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug)||{};return{success:true,users:{total:(db.users||[]).length,active:(db.users||[]).filter(u=>u.active).length,byRole:(db.users||[]).reduce((a,u)=>{a[u.role]=(a[u.role]||0)+1;return a;},{})},issues:{total:issues.length,open:issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status)).length,resolved:issues.filter(i=>['Resolved','Release Required'].includes(i.status)).length,slaBreached:issues.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d&&!['Resolved','Release Required'].includes(i.status);}).length},data:{comments:(db.comments||[]).length,activityLogs:(db.activityLog||[]).length,sprints:(db.sprints||[]).length,customFields:(db.customFields||[]).length,dbSizeKB:Math.round(fs.statSync(brandDbPath(slug)).size/1024)},settings:db.settings||{},featureFlags:db.featureFlags||{},brand:{name:brand.name,tier:brand.tier,limits:brand.limits,accentColor:brand.accentColor,theme:brand.theme,logoUrl:brand.logoUrl}};},
    exportAllData:()=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};return{success:true,data:rDB(),exportedAt:new Date().toISOString()};},
    exportIssuesCSV:()=>{const db=rDB(),h=['IssueID','Title','Priority','Status','Module','RaisedBy','AssignedTo','CreatedDate','ResolvedDate','SLAHours'];return{success:true,csv:[h.join(','),...(db.issues||[]).map(i=>h.map(hh=>`"${(i[hh.charAt(0).toLowerCase()+hh.slice(1)]||'').toString().replace(/"/g,'""')}"`).join(','))].join('\n')};},
    uploadFile:(fn,mt,b64)=>{const dir=path.join(__dirname,'public','uploads');if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const ext=fn.split('.').pop(),sn=generateId('FILE')+'.'+ext;fs.writeFileSync(path.join(dir,sn),Buffer.from(b64,'base64'));return{success:true,url:'/uploads/'+sn,fileId:sn};},
    getAnnouncements:()=>{const db=rDB(),now=new Date().toISOString();return{success:true,announcements:(db.announcements||[]).filter(a=>a.active&&(!a.expiresAt||a.expiresAt>now))};},
    saveAnnouncement:(msg,type,exp)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.announcements=db.announcements||[];db.announcements.push({id:generateId('ANN'),message:msg,type:type||'info',active:true,expiresAt:exp||null,createdBy:su.email,createdAt:new Date().toISOString()});wDB(db);return{success:true};},
    getActiveAnnouncements:()=>{const db=rDB();return{success:true,announcements:db.announcements||[]};},
    updateAnnouncement:(id,updates)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();const idx=(db.announcements||[]).findIndex(a=>a.id===id);if(idx>=0){db.announcements[idx]={...db.announcements[idx],...updates};wDB(db);}return{success:true};},
    deleteAnnouncement:id=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.announcements=(db.announcements||[]).filter(a=>a.id!==id);wDB(db);return{success:true};},
    bulkUpdateIssues:(ids,action,value)=>{const db=rDB();let updated=0;const now=new Date().toISOString();(ids||[]).forEach(id=>{const idx=(db.issues||[]).findIndex(i=>i.id===id);if(idx===-1)return;if(action==='status'){db.issues[idx].status=value;if(value==='WIP'&&!db.issues[idx].startedDate)db.issues[idx].startedDate=now;if(['Resolved','Release Required'].includes(value))db.issues[idx].resolvedDate=now;if(value==='Closed')db.issues[idx].closedDate=now;logActivity(db,id,`Status changed to ${value}`,su.email);}else if(action==='priority'){db.issues[idx].priority=value;logActivity(db,id,`Priority changed to ${value}`,su.email);}else if(action==='assign'){db.issues[idx].assignedTo=value;logActivity(db,id,`Assigned to ${value}`,su.email);}else if(action==='module'){db.issues[idx].module=value;logActivity(db,id,`Module changed to ${value}`,su.email);}updated++;});wDB(db);return{success:true,updated};},
    getTeams:()=>{const db=rDB();return{success:true,teams:db.teams||[]};},
    saveTeam:t=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.teams=db.teams||[];const idx=db.teams.findIndex(x=>x.id===t.id);if(idx>=0)db.teams[idx]=t;else db.teams.push({...t,id:generateId('TM'),createdAt:new Date().toISOString()});wDB(db);return{success:true};},
    deleteTeam:id=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.teams=(db.teams||[]).filter(t=>t.id!==id);wDB(db);return{success:true};},
    assignUserToTeam:(uid,tid)=>{const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);if(idx<0)return{success:false,error:'Not found'};db.users[idx].teamId=tid;wDB(db);return{success:true};},
    getWorkingHours:()=>{const db=rDB();return{success:true,workingHours:db.workingHours||{startHour:9,endHour:18,timezone:'UTC',workDays:[1,2,3,4,5]}};},
    saveWorkingHours:wh=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.workingHours=wh;wDB(db);return{success:true};},
    getModuleSLARules:()=>{const db=rDB();return{success:true,rules:db.moduleSLARules||[]};},
    getBrandProfile:()=>{const owner=readOwner(),brand=(owner.brands||[]).find(b=>b.slug===slug);return{success:true,brand:brand||{}};},
    // ── SUPPORT TICKETS (Freshdesk-style) ────────────────────────────────────────
    getTickets:(filters)=>{
      const gate=requireFeature(ff,'EMAIL_TICKETING_ENABLED');if(gate)return gate;
      const db=rDB();
      let tickets=(db.tickets||[]).slice().sort((a,b)=>new Date(b.lastActivity||b.createdDate)-new Date(a.lastActivity||a.createdDate));
      if(filters){
        // My Queue filter — assigned to current user, not resolved/closed
        // Case-insensitive match to handle any email casing differences
        if(filters.status==='mine'){
          const myEmail=(su.email||'').toLowerCase().trim();
          tickets=tickets.filter(t=>(t.assignedTo||'').toLowerCase().trim()===myEmail&&!['resolved','closed'].includes(t.status));
        }
        // Unassigned filter — no agent, not resolved/closed
        else if(filters.status==='unassigned')tickets=tickets.filter(t=>!t.assignedTo&&!['resolved','closed'].includes(t.status));
        else if(filters.status&&filters.status!=='all')tickets=tickets.filter(t=>t.status===filters.status);
        if(filters.priority&&filters.priority!=='all')tickets=tickets.filter(t=>t.priority===filters.priority);
        if(filters.assignedTo&&filters.assignedTo!=='all')tickets=tickets.filter(t=>t.assignedTo===filters.assignedTo);
        if(filters.search){const q=filters.search.toLowerCase();tickets=tickets.filter(t=>t.subject.toLowerCase().includes(q)||t.from.toLowerCase().includes(q)||(t.fromName||'').toLowerCase().includes(q)||t.id.toLowerCase().includes(q));}
      }
      // Return list without full thread for performance
      return{success:true,tickets:tickets.map(t=>({...t,thread:undefined,threadCount:(t.thread||[]).length,lastMessage:(t.thread||[]).filter(m=>m.type==='incoming').slice(-1)[0]})),counts:{all:(db.tickets||[]).length,new:(db.tickets||[]).filter(t=>t.status==='new').length,open:(db.tickets||[]).filter(t=>t.status==='open').length,pending:(db.tickets||[]).filter(t=>t.status==='pending').length,resolved:(db.tickets||[]).filter(t=>t.status==='resolved').length,closed:(db.tickets||[]).filter(t=>t.status==='closed').length}};
    },
    getTicketById:(ticketId)=>{
      const db=rDB();const ticket=(db.tickets||[]).find(t=>t.id===ticketId);
      if(!ticket)return{success:false,error:'Ticket not found'};
      return{success:true,ticket};
    },
    updateTicketStatus:(ticketId,status)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      const prevStatus=db.tickets[idx].status;
      const now=new Date().toISOString();
      db.tickets[idx].status=status;
      db.tickets[idx].lastActivity=now;
      if(status==='resolved'||status==='closed')db.tickets[idx].resolvedDate=now;
      // Add timeline event
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'status_changed',by:su.email,byName:su.name||su.email,at:now,detail:`${prevStatus} → ${status}`});
      wDB(db);
      if(status==='resolved'||status==='closed'){sendSlackAlert(slug,'resolved',db.tickets[idx]).catch(()=>{});}
      const ticket=db.tickets[idx];
      // Don't send CSAT to automated senders — they cause bounce loops
      const isAutomatedSender=/^(mailer-daemon|postmaster|noreply|no-reply|donotreply|bounce|daemon|system|notification|alert|automated|newsletter|unsubscribe)@/i.test(ticket.from||'');
      // Send 1-click CSAT on resolve (only to real humans)
      if(status==='resolved'&&ticket.from&&!ticket.csatSent&&!isAutomatedSender){
        const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        const brandName=brand.name||'Support';const brandColor=brand.accentColor||'#10B981';
        const csatToken=Buffer.from(JSON.stringify({ticketId,slug,email:ticket.from,ts:Date.now()})).toString('base64url');
        const csatUrl=`${BASE_URL}/csat-ticket?token=${csatToken}`;
        db.tickets[idx].csatToken=csatToken;db.tickets[idx].csatSent=true;
        writeBrandDB(slug,rDB());
        // Use brand email so customer sees reply from the brand, not contact@resolvogroup.com
        sendBrandEmail(slug,ticket.from,`✅ Your issue has been resolved — [${brandName}] ${ticket.subject}`,
          `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:24px 16px;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="background:${brandColor};padding:20px 24px;text-align:center;"><div style="font-size:32px;margin-bottom:6px;">✅</div><h2 style="margin:0;color:#fff;font-size:18px;">Issue Resolved</h2></div><div style="padding:28px;text-align:center;"><p style="color:#374151;font-size:14px;margin:0 0 20px;">Hi there! Your support request has been resolved. Was this helpful?</p><div style="display:flex;gap:12px;justify-content:center;margin:0 0 20px;"><a href="${csatUrl}&rating=yes" style="background:#10B981;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">👍 Yes</a><a href="${csatUrl}&rating=no" style="background:#EF4444;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">👎 No</a></div><p style="color:#9ca3af;font-size:12px;margin:0;">Ref: ${ticketId}</p></div></div></body></html>`,
          `Your ticket ${ticketId} has been resolved. Was this helpful? Reply YES or NO.`
        ).catch(()=>{});
      }
      // Notify watchers — use brand email
      const brand2=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
      (ticket.watchers||[]).filter(w=>w!==su.email).forEach(wEmail=>{
        sendBrandEmail(slug,wEmail,`[Watching] Ticket ${ticketId} status: ${status}`,
          `<p>Ticket <strong>${ticket.subject}</strong> was updated to <strong>${status}</strong> by ${su.name||su.email}.</p><a href="${BASE_URL}">View ticket →</a>`,
          `Ticket ${ticketId} is now ${status}`).catch(()=>{});
      });

      // ── QUEUE PULL: Fill agent bucket when ticket resolved ──────────────────
      // Pulls tickets from unassigned until agent's bucket is FULL (maxTickets)
      if((status==='resolved'||status==='closed')){
        const freshDb=rDB();
        const qcfg=freshDb.queueConfig||{};
        if(qcfg.enabled&&!qcfg.frozen){
          const SPAM_RE=/^(mailer-daemon|postmaster|noreply|no-reply|donotreply|bounce|daemon|system|notification|automated|newsletter)@/i;
          const SPAM_SUBJ=/^(delivery status|undeliverable|auto-?reply|out of office|automatic reply|failure notice|returned mail|non-?delivery|bounced mail|read receipt)/i;

          // Get all real unassigned new tickets (no spam)
          const getUnassigned=()=>(freshDb.tickets||[]).filter(t=>
            !t.assignedTo&&t.status==='new'&&t.id!==ticketId&&
            !SPAM_RE.test(t.from||'')&&!SPAM_SUBJ.test(t.subject||'')&&!t.autoResolved
          ).sort((a,b)=>new Date(a.createdDate)-new Date(b.createdDate));

          const resolver=su.email;
          const resolverUser=(freshDb.users||[]).find(u=>u.email===resolver);
          const resolverMax=resolverUser?.maxTickets||10;
          const resolverStatus=resolverUser?.availabilityStatus||'available';
          const inQueue=!!(qcfg.agents||[]).find(a=>a.email===resolver&&a.inQueue);

          let totalAssigned=0;

          // Keep filling until bucket is full OR no more unassigned tickets
          while(true){
            const currentOpen=(freshDb.tickets||[]).filter(t=>
              t.assignedTo===resolver&&!['resolved','closed'].includes(t.status)
            ).length;
            const capacity=resolverMax-currentOpen;
            if(capacity<=0||resolverStatus==='away')break; // bucket full or away

            const unassigned=getUnassigned();
            if(!unassigned.length)break; // no more tickets to assign

            // Assign to resolver (if in queue and has capacity) or next agent
            let nextAgent=null;
            if(inQueue&&capacity>0)nextAgent=resolver;
            else nextAgent=autoAssignAgent(freshDb,unassigned[0]);

            if(!nextAgent)break;

            const nextIdx=(freshDb.tickets||[]).findIndex(t=>t.id===unassigned[0].id);
            if(nextIdx>=0){
              freshDb.tickets[nextIdx].assignedTo=nextAgent;
              freshDb.tickets[nextIdx].lastActivity=new Date().toISOString();
              freshDb.tickets[nextIdx].status='open';
              freshDb.tickets[nextIdx].timeline=freshDb.tickets[nextIdx].timeline||[];
              freshDb.tickets[nextIdx].timeline.push({
                event:'auto_assigned_from_queue',by:'system',byName:'Queue System',
                at:new Date().toISOString(),
                detail:`Bucket fill: assigned to ${nextAgent} (${currentOpen+1}/${resolverMax})`
              });
              totalAssigned++;
            } else break;
          }

          if(totalAssigned>0){
            writeBrandDB(slug,freshDb);
            console.log(`[Queue] Filled ${resolver} bucket: +${totalAssigned} tickets after ${ticketId} resolved`);
          }
        }
      }

      return{success:true};
    },
    updateTicketPriority:(ticketId,priority)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      db.tickets[idx].priority=priority;db.tickets[idx].lastActivity=new Date().toISOString();wDB(db);return{success:true};
    },
    assignTicket:(ticketId,agentEmail)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      db.tickets[idx].assignedTo=agentEmail;db.tickets[idx].lastActivity=new Date().toISOString();wDB(db);
      sendSlackAlert(slug,'assigned',db.tickets[idx]).catch(()=>{});
      return{success:true};
    },
    addTicketNote:(ticketId,noteText)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      const note={id:generateId('NOTE'),type:'note',from:su.email,fromName:su.name||su.email,body:noteText,timestamp:new Date().toISOString()};
      db.tickets[idx].thread=db.tickets[idx].thread||[];db.tickets[idx].thread.push(note);
      db.tickets[idx].lastActivity=new Date().toISOString();wDB(db);return{success:true,noteId:note.id};
    },
    addTicketTag:(ticketId,tag)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      db.tickets[idx].tags=db.tickets[idx].tags||[];
      if(!db.tickets[idx].tags.includes(tag))db.tickets[idx].tags.push(tag);
      wDB(db);return{success:true};
    },
    removeTicketTag:(ticketId,tag)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Ticket not found'};
      db.tickets[idx].tags=(db.tickets[idx].tags||[]).filter(t=>t!==tag);wDB(db);return{success:true};
    },
    // ── BULK TICKET ACTIONS ────────────────────────────────────────────────────
    bulkUpdateTickets:(ids,action,value)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();let updated=0;
      const now=new Date().toISOString();
      (ids||[]).forEach(id=>{
        const idx=(db.tickets||[]).findIndex(t=>t.id===id);
        if(idx===-1)return;
        if(action==='status'){db.tickets[idx].status=value;db.tickets[idx].lastActivity=now;}
        else if(action==='assign'){db.tickets[idx].assignedTo=value;db.tickets[idx].lastActivity=now;}
        else if(action==='delete'){db.tickets.splice(idx,1);updated++;return;}
        updated++;
      });
      wDB(db);return{success:true,updated};
    },
    // Close all NEW tickets at once (clear spam batch)
    bulkCloseByStatus:(status,reason)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const now=new Date().toISOString();
      let count=0;
      (db.tickets||[]).forEach(t=>{
        if(t.status===status){t.status='closed';t.lastActivity=now;count++;}
      });
      wDB(db);return{success:true,closed:count};
    },
    // Get ticket stats for header badges
    // ══════════════════════════════════════════════════════════════════════════
    // AI INTELLIGENCE FEATURES
    // ══════════════════════════════════════════════════════════════════════════

    // 1. REGRESSION DETECTOR — did this issue come back after being resolved?
    detectRegression:(title,description)=>{
      const db=rDB();
      const words=(title||'').toLowerCase().split(/\W+/).filter(w=>w.length>3);
      const resolved=(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status));
      const matches=resolved.map(i=>{
        const iw=i.title.toLowerCase().split(/\W+/).filter(w=>w.length>3);
        const common=words.filter(w=>iw.includes(w));
        const score=common.length/Math.max(words.length,iw.length,1);
        return{issue:i,score,commonWords:common};
      }).filter(r=>r.score>=0.45).sort((a,b)=>b.score-a.score).slice(0,3);
      return{success:true,isRegression:matches.length>0,matches:matches.map(m=>({id:m.issue.id,title:m.issue.title,resolvedDate:m.issue.resolvedDate,assignedTo:m.issue.assignedTo,similarity:Math.round(m.score*100)}))};
    },

    // 2. REVENUE IMPACT — update and get revenue-tagged issues
    updateRevenueImpact:(issueId,revenueAmount,currency)=>{
      const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.issues[idx].revenueImpact=parseFloat(revenueAmount)||0;
      db.issues[idx].revenueCurrency=currency||'INR';
      logActivity(db,issueId,`Revenue impact set: ${currency||'INR'} ${revenueAmount}`,su.email);
      wDB(db);return{success:true};
    },
    getRevenueDashboard:()=>{
      const db=rDB();const now=new Date();
      const issues=db.issues||[];
      const tagged=issues.filter(i=>i.revenueImpact>0);
      const atRisk=tagged.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const protected_=tagged.filter(i=>['Resolved','Release Required'].includes(i.status));
      const totalAtRisk=atRisk.reduce((s,i)=>s+(i.revenueImpact||0),0);
      const totalProtected=protected_.reduce((s,i)=>s+(i.revenueImpact||0),0);
      const byPriority={Critical:0,High:0,Medium:0,Low:0};
      atRisk.forEach(i=>{if(byPriority[i.priority]!==undefined)byPriority[i.priority]+=i.revenueImpact||0;});
      return{success:true,totalAtRisk,totalProtected,atRiskCount:atRisk.length,protectedCount:protected_.length,byPriority,topAtRisk:atRisk.sort((a,b)=>(b.revenueImpact||0)-(a.revenueImpact||0)).slice(0,5).map(i=>({id:i.id,title:i.title,priority:i.priority,revenue:i.revenueImpact,currency:i.revenueCurrency||'INR',assignedTo:i.assignedTo}))};
    },

    // 3. SENTIMENT ANALYSIS — score tickets/comments for frustration level
    analyzeSentiment:(text)=>{
      const t=(text||'').toLowerCase();
      const angry=['extremely frustrated','very disappointed','unacceptable','cancel','lawsuit','terrible','worst','useless','incompetent','disgusting','ridiculous','pathetic','waste of money','refund','escalate','manager','ceo','going viral','twitter','review'];
      const worried=['frustrated','disappointed','unhappy','concerned','issue','still broken','been waiting','urgent','asap','deadline','client is asking','affecting revenue','losing customers','critical'];
      const neutral=['thanks','please','hello','hi','regards','appreciate','kindly','help'];
      const happyW=['thank you','great','excellent','resolved','working','perfect','happy','pleased','satisfied'];
      let score=50;
      angry.forEach(w=>{if(t.includes(w))score-=8;});
      worried.forEach(w=>{if(t.includes(w))score-=3;});
      neutral.forEach(w=>{if(t.includes(w))score+=2;});
      happyW.forEach(w=>{if(t.includes(w))score+=5;});
      // Caps and exclamation boost anger
      const caps=(text.match(/[A-Z]{3,}/g)||[]).length;
      const excl=(text.match(/!/g)||[]).length;
      score-=(caps*2+excl*1.5);
      score=Math.max(0,Math.min(100,Math.round(score)));
      const level=score<25?'critical':score<45?'angry':score<65?'worried':score<80?'neutral':'happy';
      return{success:true,score,level,shouldEscalate:score<35};
    },

    // 4. CUSTOMER HEALTH SCORE — per email address
    getCustomerHealthScores:()=>{
      const db=rDB();const tickets=db.tickets||[];const now=new Date();
      const emailMap={};
      tickets.forEach(t=>{
        if(!t.from)return;
        const e=t.from;
        if(!emailMap[e])emailMap[e]={email:e,name:t.fromName||e,tickets:[],totalTickets:0,unresolvedTickets:0,avgResponseHours:null,lastTicketDate:null,sentimentScores:[],resolvedTickets:0};
        emailMap[e].tickets.push(t);
        emailMap[e].totalTickets++;
        if(!['resolved','closed'].includes(t.status))emailMap[e].unresolvedTickets++;
        else emailMap[e].resolvedTickets++;
        const d=new Date(t.createdDate||t.lastActivity||now);
        if(!emailMap[e].lastTicketDate||d>new Date(emailMap[e].lastTicketDate))emailMap[e].lastTicketDate=d.toISOString();
        const firstMsg=(t.thread||[])[0];
        if(firstMsg&&firstMsg.body){
          // Simple sentiment from first message body (sync call, no async)
          const bodyLow=(firstMsg.body||'').toLowerCase();
          const angryWords=['frustrated','disappointed','cancel','unacceptable','terrible','worst'];
          const angryCount=angryWords.filter(w=>bodyLow.includes(w)).length;
          emailMap[e].sentimentScores.push(Math.max(0,100-angryCount*15));
        }
      });
      const scores=Object.values(emailMap).map(e=>{
        const avgSentiment=e.sentimentScores.length>0?Math.round(e.sentimentScores.reduce((s,v)=>s+v,0)/e.sentimentScores.length):75;
        const unresolvedPenalty=Math.min(40,e.unresolvedTickets*8);
        const volumePenalty=Math.min(20,Math.max(0,(e.totalTickets-3)*2));
        const recencyBonus=e.lastTicketDate&&(now-new Date(e.lastTicketDate))<86400000*7?-5:0; // recent = more risk
        const health=Math.max(0,Math.min(100,avgSentiment-unresolvedPenalty-volumePenalty+recencyBonus));
        const risk=health<30?'critical':health<50?'high':health<70?'medium':'low';
        return{email:e.email,name:e.name,health,risk,totalTickets:e.totalTickets,unresolvedTickets:e.unresolvedTickets,resolvedTickets:e.resolvedTickets,lastTicketDate:e.lastTicketDate,avgSentiment};
      }).sort((a,b)=>a.health-b.health);
      return{success:true,scores,atRisk:scores.filter(s=>s.health<50).length,critical:scores.filter(s=>s.health<30).length};
    },

    // 5. PREDICTIVE SLA BREACH — estimate likelihood before it happens
    predictSLABreach:(issueId)=>{
      const db=rDB();const issue=(db.issues||[]).find(i=>i.id===issueId);
      if(!issue)return{success:false,error:'Not found'};
      const now=new Date();
      const created=new Date(issue.createdDate);
      const deadline=new Date(created.getTime()+issue.slaHours*3600000);
      const hoursLeft=(deadline-now)/3600000;
      const elapsed=(now-created)/3600000;
      const totalHours=issue.slaHours;
      // Historical resolution time for this priority
      const resolved=(db.issues||[]).filter(i=>i.priority===issue.priority&&['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate&&i.assignedTo===issue.assignedTo);
      const avgHist=resolved.length>0?resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length:null;
      // Developer current load
      const devOpen=(db.issues||[]).filter(i=>i.assignedTo===issue.assignedTo&&!['Resolved','Release Required','Closed'].includes(i.status)&&i.id!==issueId).length;
      let breachProb=0;
      if(issue.slaBreached)breachProb=100;
      else{
        const pctElapsed=elapsed/totalHours;
        breachProb+=pctElapsed*40;
        if(avgHist&&avgHist>hoursLeft)breachProb+=30;
        if(devOpen>5)breachProb+=15;
        if(devOpen>10)breachProb+=10;
        if(issue.status==='Open'&&pctElapsed>0.5)breachProb+=15;
        breachProb=Math.min(95,Math.max(0,Math.round(breachProb)));
      }
      const riskLevel=breachProb>70?'critical':breachProb>45?'high':breachProb>25?'medium':'low';
      return{success:true,issueId,breachProbability:breachProb,riskLevel,hoursLeft:Math.round(hoursLeft*10)/10,hoursElapsed:Math.round(elapsed*10)/10,avgHistoricalHours:avgHist?Math.round(avgHist*10)/10:null,devOpenIssues:devOpen,recommendation:breachProb>60?'Reassign or escalate immediately':'Monitor closely'};
    },

    // 6. ROOT CAUSE CLUSTERING — group similar issues automatically
    getRootCauseClusters:()=>{
      const db=rDB();
      const issues=(db.issues||[]).filter(i=>!['Closed'].includes(i.status));
      const clusters=[];
      const assigned=new Set();
      issues.forEach((issue,idx)=>{
        if(assigned.has(issue.id))return;
        const words=issue.title.toLowerCase().split(/\W+/).filter(w=>w.length>3);
        const similar=issues.filter((other,oidx)=>{
          if(other.id===issue.id||assigned.has(other.id))return false;
          const ow=other.title.toLowerCase().split(/\W+/).filter(w=>w.length>3);
          const common=words.filter(w=>ow.includes(w));
          return common.length/Math.max(words.length,ow.length,1)>=0.4;
        });
        if(similar.length>0){
          [issue,...similar].forEach(i=>assigned.add(i.id));
          const group=[issue,...similar];
          const critCount=group.filter(i=>i.priority==='Critical').length;
          const totalRevenue=group.reduce((s,i)=>s+(i.revenueImpact||0),0);
          clusters.push({id:'CL-'+clusters.length,title:issue.title,issues:group.map(i=>({id:i.id,title:i.title,priority:i.priority,status:i.status,assignedTo:i.assignedTo})),count:group.length,hasCritical:critCount>0,totalRevenue,suggestedRootCause:issue.module||'Unknown module',modules:[...new Set(group.map(i=>i.module).filter(Boolean))]});
        }
      });
      return{success:true,clusters:clusters.sort((a,b)=>b.count-a.count),totalClustered:clusters.reduce((s,c)=>s+c.count,0)};
    },

    // 7. CSAT — send satisfaction survey after ticket resolve, get results
    sendCSATSurvey:async(ticketId)=>{
      const db=rDB();const ticket=(db.tickets||[]).find(t=>t.id===ticketId);
      if(!ticket)return{success:false,error:'Not found'};
      if(!ticket.from)return{success:false,error:'No customer email'};
      const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
      const surveyToken=generateId('CSAT');
      db.csatSurveys=db.csatSurveys||[];
      db.csatSurveys.push({token:surveyToken,ticketId,customerEmail:ticket.from,brandSlug:slug,createdAt:new Date().toISOString(),rating:null,comment:null,respondedAt:null});
      wDB(db);
      const surveyUrl=`${BASE_URL}/csat?token=${surveyToken}`;
      await sendBrandEmail(slug,ticket.from,`How did we do? — ${brand.name||'Support'}`,
        `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:32px 16px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
          <div style="background:#F5A623;padding:28px 32px;text-align:center;">
            <h2 style="margin:0;color:#0D0E14;font-size:20px;font-weight:800;">How did we do?</h2>
            <p style="margin:6px 0 0;color:rgba(0,0,0,.6);font-size:13px;">Your ticket ${ticketId} has been resolved</p>
          </div>
          <div style="padding:28px 32px;text-align:center;">
            <p style="color:#374151;font-size:14px;margin:0 0 20px;">Hi ${ticket.fromName||'there'}, how satisfied were you with our support?</p>
            <div style="display:flex;justify-content:center;gap:10px;margin-bottom:20px;">
              ${[1,2,3,4,5].map(n=>`<a href="${surveyUrl}&rating=${n}" style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#f9fafb;border:2px solid #e5e7eb;line-height:44px;font-size:20px;text-decoration:none;text-align:center;">${['😞','😕','😐','🙂','😄'][n-1]}</a>`).join('')}
            </div>
            <p style="color:#9ca3af;font-size:12px;">1 = Very Unsatisfied &nbsp;·&nbsp; 5 = Very Satisfied</p>
          </div>
        </div></body></html>`,
        `Rate our support: ${surveyUrl}`
      );
      return{success:true,surveyToken,surveyUrl};
    },
    getCSATResults:()=>{
      const db=rDB();const surveys=db.csatSurveys||[];
      const responded=surveys.filter(s=>s.rating!==null);
      const avgRating=responded.length>0?Math.round(responded.reduce((s,sv)=>s+(sv.rating||0),0)/responded.length*10)/10:null;
      const dist={1:0,2:0,3:0,4:0,5:0};responded.forEach(s=>{if(dist[s.rating]!==undefined)dist[s.rating]++;});
      return{success:true,total:surveys.length,responded:responded.length,responseRate:surveys.length>0?Math.round(responded.length/surveys.length*100):0,avgRating,distribution:dist,recentFeedback:responded.filter(s=>s.comment).slice(-5).reverse()};
    },

    // 8. SMART REPLY DRAFTS (via Gemini)
    getSmartReplyDrafts:async(ticketId)=>{
      const db=rDB();const ticket=(db.tickets||[]).find(t=>t.id===ticketId);
      if(!ticket)return{success:false,error:'Not found'};
      const geminiKey=(db.settings||{}).GEMINI_API_KEY||process.env.GEMINI_API_KEY||'';
      if(!geminiKey)return{success:false,error:'Gemini API key not configured in Settings → Integrations'};
      const firstMsg=(ticket.thread||[])[0]?.body||'';
      const prompt=`You are a helpful support agent. A customer sent this support ticket:\n\nSubject: ${ticket.subject}\nMessage: ${firstMsg.substring(0,500)}\n\nGenerate 3 different draft replies:\n1. Quick acknowledgement (2-3 sentences)\n2. Detailed helpful response (asking for more info if needed)\n3. Empathetic response if customer seems frustrated\n\nFormat as JSON: {"drafts":[{"label":"Quick Ack","text":"..."},{"label":"Detailed","text":"..."},{"label":"Empathetic","text":"..."}]}`;
      try{
        const axios=require('axios');
        const res=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,{contents:[{parts:[{text:prompt}]}]},{timeout:15000});
        const raw=res.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
        const match=raw.match(/\{[\s\S]*\}/);
        if(match){const parsed=JSON.parse(match[0]);return{success:true,drafts:parsed.drafts||[]};}
        return{success:false,error:'Could not parse AI response'};
      }catch(e){return{success:false,error:'Gemini error: '+e.message};}
    },

    // 9. POST-INCIDENT REPORT GENERATOR (Gemini)
    generatePostIncidentReport:async(issueId)=>{
      const db=rDB();const issue=(db.issues||[]).find(i=>i.id===issueId);
      if(!issue)return{success:false,error:'Not found'};
      const comments=(db.comments||[]).filter(c=>c.issueId===issueId);
      const activity=(db.activityLog||[]).filter(l=>l.issueId===issueId);
      const geminiKey=(db.settings||{}).GEMINI_API_KEY||process.env.GEMINI_API_KEY||'';
      if(!geminiKey)return{success:false,error:'Gemini API key not configured'};
      const resHours=issue.resolvedDate?Math.round((new Date(issue.resolvedDate)-new Date(issue.createdDate))/360000)/10:null;
      const timeline=[...activity.map(a=>({time:a.timestamp,event:a.action,user:a.user})),...comments.map(c=>({time:c.timestamp,event:'Comment: '+c.comment.substring(0,100),user:c.userEmail}))].sort((a,b)=>new Date(a.time)-new Date(b.time));
      const prompt=`Generate a professional post-incident report for this engineering issue:\n\nIssue ID: ${issueId}\nTitle: ${issue.title}\nPriority: ${issue.priority}\nModule: ${issue.module||'Unknown'}\nEnvironment: ${issue.environment||'Unknown'}\nCreated: ${issue.createdDate}\nResolved: ${issue.resolvedDate||'Unresolved'}\nResolution Time: ${resHours?resHours+'h':'N/A'}\nDescription: ${(issue.description||'').substring(0,300)}\nTimeline: ${JSON.stringify(timeline.slice(0,10))}\n\nGenerate a concise post-incident report with: Executive Summary, Timeline of Events, Root Cause Analysis, Impact Assessment, Resolution Steps, Prevention Measures.\nFormat as JSON: {"executive_summary":"...","timeline":"...","root_cause":"...","impact":"...","resolution":"...","prevention":"...","severity":"..."}`;
      try{
        const axios=require('axios');
        const res=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,{contents:[{parts:[{text:prompt}]}]},{timeout:20000});
        const raw=res.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
        const match=raw.match(/\{[\s\S]*\}/);
        if(match){
          const report=JSON.parse(match[0]);
          // Save report
          db.postIncidentReports=db.postIncidentReports||[];
          db.postIncidentReports.push({...report,issueId,generatedAt:new Date().toISOString(),generatedBy:su.email});
          wDB(db);
          return{success:true,report};
        }
        return{success:false,error:'Could not parse AI response'};
      }catch(e){return{success:false,error:'Gemini error: '+e.message};}
    },

    // 10. ZERO-TOUCH AUTO-RESOLVE RULES
    getAutoResolveRules:()=>{const db=rDB();return{success:true,rules:db.autoResolveRules||[]};},
    saveAutoResolveRule:(rule)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.autoResolveRules=db.autoResolveRules||[];
      const idx=db.autoResolveRules.findIndex(r=>r.id===rule.id);
      if(idx>=0)db.autoResolveRules[idx]=rule;
      else db.autoResolveRules.push({...rule,id:generateId('ARR'),createdAt:new Date().toISOString()});
      wDB(db);return{success:true};
    },
    deleteAutoResolveRule:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.autoResolveRules=(db.autoResolveRules||[]).filter(r=>r.id!==id);wDB(db);return{success:true};
    },
    checkAutoResolve:(ticketId)=>{
      const db=rDB();const ticket=(db.tickets||[]).find(t=>t.id===ticketId);
      if(!ticket)return{success:false};
      const rules=(db.autoResolveRules||[]).filter(r=>r.enabled);
      for(const rule of rules){
        const subjectMatch=!rule.subjectPattern||new RegExp(rule.subjectPattern,'i').test(ticket.subject||'');
        const senderMatch=!rule.senderPattern||new RegExp(rule.senderPattern,'i').test(ticket.from||'');
        if(subjectMatch&&senderMatch){
          // Auto-resolve the ticket
          const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
          if(idx>=0){
            db.tickets[idx].status='resolved';
            db.tickets[idx].lastActivity=new Date().toISOString();
            db.tickets[idx].autoResolved=true;
            db.tickets[idx].autoResolvedByRule=rule.id;
            if(rule.replyMessage){
              db.tickets[idx].thread=db.tickets[idx].thread||[];
              db.tickets[idx].thread.push({id:generateId('MSG'),type:'reply',from:'system',fromName:'Auto-Resolve',body:rule.replyMessage,timestamp:new Date().toISOString(),sentAsEmail:true});
            }
          }
          wDB(db);
          return{success:true,matched:true,ruleId:rule.id,ruleName:rule.name};
        }
      }
      return{success:true,matched:false};
    },

    // ── REPORTS ────────────────────────────────────────────────────────────────
    getUserLevelReport:(filters)=>{
      const db=rDB();const now=new Date();
      const dateFrom=filters?.dateFrom?new Date(filters.dateFrom):null;
      const dateTo=filters?.dateTo?new Date(filters.dateTo+'T23:59:59'):null;
      const users=(db.users||[]).filter(u=>u.active);
      let issues=db.issues||[];
      let tickets=db.tickets||[];
      if(dateFrom)issues=issues.filter(i=>new Date(i.createdDate)>=dateFrom);
      if(dateTo)issues=issues.filter(i=>new Date(i.createdDate)<=dateTo);
      if(dateFrom)tickets=tickets.filter(t=>new Date(t.createdDate||t.lastActivity)>=dateFrom);
      if(dateTo)tickets=tickets.filter(t=>new Date(t.createdDate||t.lastActivity)<=dateTo);
      return{success:true,users:users.map(u=>{
        const raised=issues.filter(i=>i.raisedBy===u.email);
        const assigned=issues.filter(i=>i.assignedTo===u.email);
        const resolved=assigned.filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate);
        const breached=assigned.filter(i=>{
          const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);
          return now>d&&!['Resolved','Release Required'].includes(i.status);
        });
        const avgResolutionHours=resolved.length>0
          ?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10
          :null;
        const open=assigned.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
        const ticketsHandled=tickets.filter(t=>t.assignedTo===u.email);
        const ticketsResolved=ticketsHandled.filter(t=>t.status==='resolved'||t.status==='closed');
        return{
          id:u.id,email:u.email,name:u.name,role:u.role,team:u.team,
          issuesRaised:raised.length,
          issuesAssigned:assigned.length,
          issuesResolved:resolved.length,
          issuesOpen:open.length,
          slaBreached:breached.length,
          avgResolutionHours,
          slaComplianceRate:assigned.length>0?Math.round((1-breached.length/assigned.length)*100):null,
          ticketsHandled:ticketsHandled.length,
          ticketsResolved:ticketsResolved.length,
          lastActivity:(db.activityLog||[]).filter(l=>l.user===u.email).slice(-1)[0]?.timestamp||null
        };
      })};
    },
    getEmailTicketingReport:(dateFrom,dateTo)=>{
      const db=rDB();
      const tickets=db.tickets||[];
      const now=new Date();
      const from=dateFrom?new Date(dateFrom):new Date(Date.now()-30*86400000);
      const to=dateTo?new Date(dateTo):now;
      const inRange=tickets.filter(t=>new Date(t.createdDate||t.lastActivity||now)>=from&&new Date(t.createdDate||now)<=to);
      // Top senders (exclude system/recurring)
      const senderMap={};inRange.filter(t=>t.from&&!t.from.includes('system@')).forEach(t=>{const k=t.from;senderMap[k]=(senderMap[k]||0)+1;});
      const topSenders=Object.entries(senderMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([email,count])=>({email,count}));
      // By day
      const dayMap={};inRange.forEach(t=>{const d=(t.createdDate||'').substring(0,10);if(d)dayMap[d]=(dayMap[d]||0)+1;});
      const byDay=Object.entries(dayMap).sort().map(([date,count])=>({date,count}));
      // FIX: withReplies = tickets that have at least one AGENT reply (not just the original incoming message)
      const withReply=inRange.filter(t=>(t.thread||[]).some(m=>m.type==='reply'&&m.from!==t.from));
      // FIX: avg response uses firstResponseMinutes if available, else calculate from first agent reply
      const avgResponseHours=withReply.length>0?
        Math.round(withReply.reduce((s,t)=>{
          if(t.firstResponseMinutes!=null)return s+t.firstResponseMinutes/60;
          const first=(t.thread||[]).find(m=>m.type==='reply'&&m.from!==t.from);
          return s+(first?((new Date(first.timestamp)-new Date(t.createdDate||first.timestamp))/3600000):0);
        },0)/withReply.length*10)/10:null;
      // CSAT stats
      const csatScores=inRange.filter(t=>t.csatRating!=null);
      const csatPositive=csatScores.filter(t=>t.csatRating==='yes').length;
      const csatRate=csatScores.length>0?Math.round(csatPositive/csatScores.length*100):null;
      return{success:true,
        total:inRange.length,
        byStatus:{new:inRange.filter(t=>t.status==='new').length,open:inRange.filter(t=>t.status==='open').length,pending:inRange.filter(t=>t.status==='pending').length,resolved:inRange.filter(t=>t.status==='resolved').length,closed:inRange.filter(t=>t.status==='closed').length},
        withReplies:withReply.length,
        avgResponseHours,
        resolutionRate:inRange.length>0?Math.round((inRange.filter(t=>t.status==='resolved'||t.status==='closed').length/inRange.length)*100):0,
        csatRate,csatResponses:csatScores.length,csatPositive,
        topSenders,byDay,
        totalAll:tickets.length,
        dateRange:{from:from.toISOString().split('T')[0],to:to.toISOString().split('T')[0]}
      };
    },
    getMyIssueReport:(filters)=>{
      const db=rDB();const now=new Date();const email=su.email;
      const dateFrom=filters?.dateFrom?new Date(filters.dateFrom):null;
      const dateTo=filters?.dateTo?new Date(filters.dateTo+'T23:59:59'):null;
      const inRange=i=>{const d=new Date(i.createdDate);return(!dateFrom||d>=dateFrom)&&(!dateTo||d<=dateTo);};
      const raised=(db.issues||[]).filter(i=>i.raisedBy===email&&inRange(i));
      const assigned=(db.issues||[]).filter(i=>i.assignedTo===email&&inRange(i));
      const resolved=assigned.filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate);
      const open=assigned.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);return now>d;});
      const atRisk=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+i.slaHours*3600000);const hr=(d-now)/3600000;return hr>0&&hr<i.slaHours*0.2;});
      const avgRes=resolved.length>0?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10:null;
      const byPriority={Critical:0,High:0,Medium:0,Low:0};open.forEach(i=>{if(byPriority[i.priority]!==undefined)byPriority[i.priority]++;});
      const trend=[];for(let d=6;d>=0;d--){const date=new Date();date.setDate(date.getDate()-d);const ds=date.toISOString().split('T')[0];trend.push({date:ds,resolved:resolved.filter(i=>i.resolvedDate&&i.resolvedDate.startsWith(ds)).length,raised:raised.filter(i=>i.createdDate&&i.createdDate.startsWith(ds)).length});}
      const timeLogs=(db.timeLogs||[]).filter(l=>l.loggedBy===email);
      const totalHoursLogged=Math.round(timeLogs.reduce((s,l)=>s+(parseFloat(l.hours)||0),0)*10)/10;
      return{success:true,email,name:su.name,role:su.role,
        issuesRaised:raised.length,issuesAssigned:assigned.length,issuesResolved:resolved.length,
        issuesOpen:open.length,slaBreached:breached.length,atRisk:atRisk.length,
        avgResolutionHours:avgRes,
        slaComplianceRate:assigned.length>0?Math.round((1-breached.length/assigned.length)*100):100,
        byPriority,trend,totalHoursLogged,
        recentResolved:resolved.slice(-5).reverse(),
        openIssues:open.slice(0,10)
      };
    },
    getAllIssuesReport:(filters)=>{
      const db=rDB();const now=new Date();
      let issues=db.issues||[];
      if(filters){
        if(filters.dateFrom)issues=issues.filter(i=>new Date(i.createdDate)>=new Date(filters.dateFrom));
        if(filters.dateTo)issues=issues.filter(i=>new Date(i.createdDate)<=new Date(filters.dateTo));
        if(filters.module&&filters.module!=='all')issues=issues.filter(i=>i.module===filters.module);
        if(filters.priority&&filters.priority!=='all')issues=issues.filter(i=>i.priority===filters.priority);
        if(filters.assignedTo&&filters.assignedTo!=='all')issues=issues.filter(i=>i.assignedTo===filters.assignedTo);
      }
      const byStatus={Open:0,WIP:0,Testing:0,Resolved:0,Closed:0,Blocked:0,Acknowledged:0};
      issues.forEach(i=>{if(byStatus[i.status]!==undefined)byStatus[i.status]++;});
      const byPriority={Critical:0,High:0,Medium:0,Low:0};
      issues.forEach(i=>{if(byPriority[i.priority]!==undefined)byPriority[i.priority]++;});
      const byModule={};issues.forEach(i=>{if(i.module){byModule[i.module]=(byModule[i.module]||0)+1;}});
      // FIX: include Closed in resolved count for avg resolution time
      const resolved=issues.filter(i=>['Resolved','Release Required','Closed'].includes(i.status)&&i.resolvedDate&&i.createdDate);
      const avgResHours=resolved.length>0?Math.round(resolved.reduce((s,i)=>s+(new Date(i.resolvedDate||i.closedDate)-new Date(i.createdDate))/3600000,0)/resolved.length*10)/10:null;
      // FIX: SLA breached only counts open issues (resolved ones met SLA by definition)
      const openIssues=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const breached=openIssues.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000+(i.slaExtraMs||0));return now>d;});
      // FIX: SLA compliance = open issues that are within SLA / total open (not total issues)
      const slaComplianceRate=openIssues.length>0?Math.round((1-breached.length/openIssues.length)*100):(issues.length>0?100:null);
      const byAssignee={};issues.forEach(i=>{if(i.assignedTo){byAssignee[i.assignedTo]=(byAssignee[i.assignedTo]||0)+1;}});
      const trend=[];for(let d=29;d>=0;d--){const date=new Date();date.setDate(date.getDate()-d);const ds=date.toISOString().split('T')[0];trend.push({date:ds,created:issues.filter(i=>i.createdDate&&i.createdDate.startsWith(ds)).length,resolved:resolved.filter(i=>i.resolvedDate&&i.resolvedDate.startsWith(ds)).length});}
      return{success:true,total:issues.length,byStatus,byPriority,byModule,byAssignee,avgResHours,slaBreached:breached.length,slaComplianceRate,openCount:openIssues.length,trend,totalResolved:resolved.length,filters};
    },
    getTicketCounts:()=>{
      const db=rDB();const tickets=db.tickets||[];
      return{success:true,counts:{
        all:tickets.length,new:tickets.filter(t=>t.status==='new').length,
        open:tickets.filter(t=>t.status==='open').length,
        pending:tickets.filter(t=>t.status==='pending').length,
        resolved:tickets.filter(t=>t.status==='resolved').length,
        closed:tickets.filter(t=>t.status==='closed').length
      }};
    },
    deleteTicket:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.tickets=(db.tickets||[]).filter(t=>t.id!==ticketId);wDB(db);return{success:true};
    },
    markTicketSpam:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      // Auto-add sender to blocklist
      const senderDomain=(db.tickets[idx].from||'').split('@')[1]||'';
      const senderEmail=db.tickets[idx].from||'';
      db.emailTicketing=db.emailTicketing||{};
      const existing=(db.emailTicketing.senderBlocklist||'').split(',').filter(Boolean);
      if(!existing.includes(senderEmail))existing.push(senderEmail);
      db.emailTicketing.senderBlocklist=existing.join(',');
      // Remove ticket
      db.tickets.splice(idx,1);
      wDB(db);return{success:true,blockedSender:senderEmail};
    },
    raiseTicketToIssue:(ticketId,issueData)=>{
      const db=rDB();const tIdx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(tIdx===-1)return{success:false,error:'Ticket not found'};
      const ticket=db.tickets[tIdx];
      // Create a proper issue from the ticket
      const issueId=generateIssueId(slug);
      const slaHours=(db.slaConfig||{Critical:4,High:8,Medium:24,Low:72})[issueData.priority||ticket.priority]||24;
      const issue={
        id:issueId,title:issueData.title||ticket.subject,description:issueData.description||((ticket.thread||[])[0]?.body||''),
        module:issueData.module||ticket.module||'',priority:issueData.priority||ticket.priority,status:'Open',
        environment:issueData.environment||'',raisedBy:su.email,assignedTo:issueData.assignedTo||'',
        createdDate:new Date().toISOString(),startedDate:'',resolvedDate:'',closedDate:'',
        impact:issueData.impact||'',slaHours,attachmentUrl:'',sprintId:'',
        source:'ticket',linkedTicketId:ticketId,
        customerEmail:ticket.from,customerName:ticket.fromName
      };
      db.issues=db.issues||[];db.issues.push(issue);
      logActivity(db,issueId,`Issue raised from support ticket ${ticketId}`,su.email);
      // Link ticket to issue
      db.tickets[tIdx].linkedIssueId=issueId;
      db.tickets[tIdx].status='open';
      db.tickets[tIdx].lastActivity=new Date().toISOString();
      // Add note to ticket thread
      db.tickets[tIdx].thread=db.tickets[tIdx].thread||[];
      db.tickets[tIdx].thread.push({id:generateId('NOTE'),type:'note',from:su.email,fromName:su.name||su.email,body:`Issue ${issueId} raised to tech team by ${su.name||su.email}`,timestamp:new Date().toISOString()});
      wDB(db);return{success:true,issueId};
    },
    getEmailTicketingConfig:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const c=db.emailTicketing||{};
      return{success:true,config:{...c,pass:c.pass?'••••••••':''}};
    },
    resetEmailCrawlDate:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      if(!db.emailTicketing)return{success:false,error:'Email ticketing not configured'};
      const newDate=new Date().toISOString();
      db.emailTicketing.enabledAt=newDate;
      // Clear processed IDs so emails from new date can be fetched fresh
      db.processedEmailIds=[];
      wDB(db);
      console.log(`[EmailTicket] Crawl date reset to ${newDate} for ${slug}`);
      return{success:true,enabledAt:newDate};
    },
    saveEmailTicketingConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      try{
        const db=rDB();
        const existing=db.emailTicketing||{};
        const existingPass=existing.pass||'';
        const newPass=config.pass&&!config.pass.startsWith('•')
          ?config.pass.replace(/\s/g,'')
          :existingPass;

        // enabledAt = the boundary date. Only emails ON OR AFTER this date are fetched.
        // - If enabling and no date exists yet → set to NOW (no old emails ever crawled)
        // - If already had a date → keep it (so re-enabling continues from same point)
        // - If disabling → keep the date so re-enabling doesn't reset
        const enabledAt = config.enabled
          ? (existing.enabledAt || new Date().toISOString())  // always ensure a date when enabled
          : (existing.enabledAt || null);                      // keep date even when disabled

        db.emailTicketing={...config,pass:newPass,tls:true,enabledAt};
        wDB(db);

        // Start or stop poller
        try{
          if(config.enabled){
            startEmailPoller(slug);
            console.log(`[EmailTicket] Enabled for ${slug} — crawling only from ${enabledAt}`);
          } else {
            // STOP poller immediately
            if(activePollers[slug]){
              activePollers[slug].stop();
              delete activePollers[slug];
              console.log(`[EmailTicket] Poller STOPPED for ${slug}`);
            }
          }
        }catch(cronErr){
          console.error('[EmailTicket] Poller error (config saved):', cronErr.message);
        }
        return{success:true, enabledAt};
      }catch(e){
        return{success:false,error:'Save failed: '+(e.message||String(e))};
      }
    },
    // NOTE: pollEmailInbox moved to asyncHandlers below
    getEmailTickets:()=>{const db=rDB();const tickets=(db.issues||[]).filter(i=>i.source==='email');return{success:true,tickets};},
    getDigestConfig:()=>{const db=rDB();return{success:true,digest:db.digestConfig||{enabled:false,frequency:'daily',time:'09:00',recipients:[]}};},
    saveDigestConfig:c=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.digestConfig=c;wDB(db);return{success:true};},
    getServerIssueTemplates:()=>{const db=rDB();return{success:true,templates:db.issueTemplates||[]};},
    saveIssueTemplate:(tmpl)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.issueTemplates=db.issueTemplates||[];
      const id=tmpl.id||generateId('ITPL');
      const idx=db.issueTemplates.findIndex(t=>t.id===id);
      if(idx>=0)db.issueTemplates[idx]={...tmpl,id};
      else db.issueTemplates.push({...tmpl,id,createdBy:su.email,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteIssueTemplate:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.issueTemplates=(db.issueTemplates||[]).filter(t=>t.id!==id);wDB(db);return{success:true};
    },

    // ── FEATURE B: DATA EXPORT ─────────────────────────────────────────────
    // DB CHANGE: none — read-only exports
    exportIssuesCSV:(filters)=>{
      const db=rDB();const now=new Date();
      let issues=db.issues||[];
      if(filters){
        if(filters.status&&filters.status!=='all')issues=issues.filter(i=>i.status===filters.status);
        if(filters.priority&&filters.priority!=='all')issues=issues.filter(i=>i.priority===filters.priority);
        if(filters.assignedTo&&filters.assignedTo!=='all')issues=issues.filter(i=>i.assignedTo===filters.assignedTo);
        if(filters.dateFrom)issues=issues.filter(i=>new Date(i.createdDate)>=new Date(filters.dateFrom));
        if(filters.dateTo)issues=issues.filter(i=>new Date(i.createdDate)<=new Date(filters.dateTo));
      }
      const rows=issues.map(i=>{
        const sla=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000);
        const breached=now>sla&&!['Resolved','Release Required','Closed'].includes(i.status);
        const resHours=i.resolvedDate&&i.createdDate?Math.round((new Date(i.resolvedDate)-new Date(i.createdDate))/360000)/10:null;
        return[i.id,i.title?.replace(/,/g,' '),i.status,i.priority,i.module||'',i.assignedTo||'',i.raisedBy||'',(i.createdDate||'').substring(0,10),(i.resolvedDate||'').substring(0,10),breached?'Yes':'No',resHours??'',i.slaHours||24,i.environment||'',i.impact||'',i.revenueImpact||''].join(',');
      });
      const header='ID,Title,Status,Priority,Module,AssignedTo,RaisedBy,CreatedDate,ResolvedDate,SLABreached,ResolutionHours,SLAHours,Environment,Impact,RevenueImpact';
      return{success:true,csv:header+'\n'+rows.join('\n'),count:issues.length};
    },
    exportTicketsCSV:()=>{
      const db=rDB();
      const tickets=db.tickets||[];
      const rows=tickets.map(t=>{
        const threadCount=(t.thread||[]).length;
        const agentReplies=(t.thread||[]).filter(m=>m.type==='reply'&&m.from!==t.from).length;
        return[t.id,(t.subject||'').replace(/,/g,' '),t.status,t.priority||'Medium',(t.from||'').replace(/,/g,' '),t.assignedTo||'',(t.createdDate||'').substring(0,10),(t.resolvedDate||'').substring(0,10),threadCount,agentReplies,t.firstResponseMinutes??'',t.csatRating||'',t.csatScore??'',(t.tags||[]).join(';')].join(',');
      });
      const header='ID,Subject,Status,Priority,From,AssignedTo,CreatedDate,ResolvedDate,ThreadMessages,AgentReplies,FirstResponseMin,CSAT,CSATScore,Tags';
      return{success:true,csv:header+'\n'+rows.join('\n'),count:tickets.length};
    },
    exportUsersCSV:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const users=db.users||[];
      const issues=db.issues||[];
      const tickets=db.tickets||[];
      const rows=users.map(u=>{
        const raised=issues.filter(i=>i.raisedBy===u.email).length;
        const resolved=issues.filter(i=>i.assignedTo===u.email&&['Resolved','Release Required','Closed'].includes(i.status)).length;
        const tHandled=tickets.filter(t=>t.assignedTo===u.email).length;
        return[u.id,u.email,u.name,u.role,u.team||'',u.active?'Yes':'No',(u.createdDate||'').substring(0,10),raised,resolved,tHandled].join(',');
      });
      const header='ID,Email,Name,Role,Team,Active,CreatedDate,IssuesRaised,IssuesResolved,TicketsHandled';
      return{success:true,csv:header+'\n'+rows.join('\n'),count:users.length};
    },
    exportAuditCSV:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const logs=(db.auditTrail||db.activityLog||[]);
      const rows=logs.map(l=>[l.id||'',l.issueId||'',l.action||l.activity||'',(l.user||l.by||'').replace(/,/g,' '),(l.timestamp||l.at||'').substring(0,19),(l.details?JSON.stringify(l.details).replace(/,/g,';').replace(/"/g,''):'')].join(','));
      const header='ID,IssueID,Action,User,Timestamp,Details';
      return{success:true,csv:header+'\n'+rows.join('\n'),count:logs.length};
    },

    // ── FEATURE C: ISSUE FORM CUSTOMIZATION ────────────────────────────────
    // DB CHANGE: adds db.issueFormConfig = {} — backward safe, defaults used if absent
    getIssueFormConfig:()=>{
      const db=rDB();
      const defaults=[
        {key:'title',label:'Title',type:'text',required:true,visible:true,order:1},
        {key:'priority',label:'Priority',type:'select',options:['Critical','High','Medium','Low'],required:true,visible:true,order:2},
        {key:'module',label:'Module',type:'select',options:[],required:false,visible:true,order:3},
        {key:'description',label:'Description',type:'textarea',required:false,visible:true,order:4},
        {key:'assignedTo',label:'Assign To',type:'user',required:false,visible:true,order:5},
        {key:'environment',label:'Environment',type:'text',required:false,visible:true,order:6},
        {key:'impact',label:'Business Impact',type:'textarea',required:false,visible:true,order:7},
        {key:'revenueImpact',label:'Revenue Impact (₹)',type:'number',required:false,visible:false,order:8},
        {key:'attachmentUrl',label:'Attachment URL',type:'url',required:false,visible:true,order:9},
      ];
      const saved=db.issueFormConfig||{};
      // Merge saved config over defaults — adds new defaults, keeps user customizations
      const fields=defaults.map(d=>{const s=(saved.fields||[]).find(f=>f.key===d.key);return s?{...d,...s}:d;});
      return{success:true,fields:fields.sort((a,b)=>a.order-b.order),customSections:saved.customSections||[]};
    },
    saveIssueFormConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      // DB CHANGE: adds db.issueFormConfig — never touches existing issues
      db.issueFormConfig=db.issueFormConfig||{};
      db.issueFormConfig.fields=config.fields||[];
      db.issueFormConfig.customSections=config.customSections||[];
      db.issueFormConfig.updatedAt=new Date().toISOString();
      db.issueFormConfig.updatedBy=su.email;
      wDB(db);return{success:true};
    },

    // ── FEATURE E: NOTIFICATION PREFERENCES ───────────────────────────────
    // DB CHANGE: adds user.notifyPrefs = {} — backward safe
    getNotifyPrefs:()=>{
      const db=rDB();const user=(db.users||[]).find(u=>u.email===su.email);
      const defaults={onAssigned:true,onMention:true,onStatusChange:true,onSLABreach:true,onCriticalOnly:false,onNewTicket:true,onTicketReply:true,digestEnabled:false,digestFreq:'daily'};
      return{success:true,prefs:{...defaults,...(user?.notifyPrefs||{})}};
    },
    saveNotifyPrefs:(prefs)=>{
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.email===su.email);
      if(idx===-1)return{success:false,error:'User not found'};
      // DB CHANGE: adds user.notifyPrefs — never touches other user fields
      db.users[idx].notifyPrefs={...(db.users[idx].notifyPrefs||{}),...prefs};
      wDB(db);return{success:true};
    },

    // ── FEATURE F: SAVED VIEWS ─────────────────────────────────────────────
    // DB CHANGE: uses existing db.savedFilters array — backward safe
    getSavedViews:()=>{const db=rDB();return{success:true,views:db.savedFilters||[]};},
    saveView:(name,filters,shared,icon)=>{
      const db=rDB();db.savedFilters=db.savedFilters||[];
      const id=generateId('VW');
      db.savedFilters.push({id,name,filters:filters||{},shared:!!shared,icon:icon||'🔖',createdBy:su.email,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteView:(id)=>{
      const db=rDB();
      const view=(db.savedFilters||[]).find(v=>v.id===id);
      if(view&&view.createdBy!==su.email&&su.role!=='Admin')return{success:false,error:'Not your view'};
      db.savedFilters=(db.savedFilters||[]).filter(v=>v.id!==id);
      wDB(db);return{success:true};
    },

    // ── FEATURE A: BRAND EMAIL PROFILE ────────────────────────────────────
    // DB CHANGE: adds db.settings.BRAND_NOTIFY_EMAIL / BRAND_NOTIFY_PASS — backward safe
    getBrandEmailProfile:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const s=db.settings||{};
      return{success:true,email:s.BRAND_NOTIFY_EMAIL||'',hasPass:!!(s.BRAND_NOTIFY_PASS),testSent:s.BRAND_EMAIL_TESTED||false};
    },
    saveBrandEmailProfile:(email,pass)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.settings=db.settings||{};
      db.settings.BRAND_NOTIFY_EMAIL=email||'';
      if(pass&&!pass.startsWith('•'))db.settings.BRAND_NOTIFY_PASS=pass.replace(/\s/g,'');
      // Clear cached mailer so it picks up new credentials
      if(db.settings.BRAND_NOTIFY_EMAIL)delete _brandMailers[db.settings.BRAND_NOTIFY_EMAIL];
      wDB(db);return{success:true};
    },
    // testBrandEmail is ASYNC — moved to aH below

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 1: TICKET TIME BOMB — Escalation chain
    // ══════════════════════════════════════════════════════════════════════
    getTicketEscalation:(ticketId)=>{
      const db=rDB();const t=(db.tickets||[]).find(x=>x.id===ticketId);
      if(!t)return{success:false,error:'Not found'};
      const rules=(db.escalationRules||[]).filter(r=>r.enabled);
      const ageMs=Date.now()-new Date(t.createdDate||t.lastActivity).getTime();
      const ageHours=ageMs/3600000;
      const triggered=rules.filter(r=>ageHours>=r.afterHours&&!t.escalations?.includes(r.id));
      return{success:true,ageHours:Math.round(ageHours*10)/10,triggered,rules,escalations:t.escalations||[]};
    },
    saveEscalationRule:(rule)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.escalationRules=db.escalationRules||[];
      const id=rule.id||generateId('ESC');
      const idx=db.escalationRules.findIndex(r=>r.id===id);
      if(idx>=0)db.escalationRules[idx]={...rule,id};
      else db.escalationRules.push({...rule,id,enabled:true,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    getEscalationRules:()=>{const db=rDB();return{success:true,rules:db.escalationRules||[]};},
    deleteEscalationRule:(id)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.escalationRules=(db.escalationRules||[]).filter(r=>r.id!==id);wDB(db);return{success:true};},

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 2: LIVE COLLABORATION — Typing indicator
    // ══════════════════════════════════════════════════════════════════════
    setTypingState:(ticketId)=>{
      typingStates[slug]=typingStates[slug]||{};
      typingStates[slug][ticketId]={email:su.email,name:su.name||su.email,at:Date.now()};
      return{success:true};
    },
    getTypingState:(ticketId)=>{
      const state=typingStates[slug]?.[ticketId];
      if(!state||Date.now()-state.at>5000)return{success:true,typing:null};
      if(state.email===su.email)return{success:true,typing:null};
      return{success:true,typing:state};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 3: TICKET DNA — Full audit timeline
    // ══════════════════════════════════════════════════════════════════════
    getTicketTimeline:(ticketId)=>{
      const db=rDB();const t=(db.tickets||[]).find(x=>x.id===ticketId);
      if(!t)return{success:false,error:'Not found'};
      const events=[];
      events.push({event:'created',by:t.fromName||t.from||'Customer',at:t.createdDate||t.lastActivity,detail:t.subject});
      (t.timeline||[]).forEach(e=>events.push(e));
      (t.thread||[]).forEach(msg=>{
        if(!events.find(e=>e.at===msg.timestamp&&e.by===msg.from)){
          events.push({event:msg.type,by:msg.fromName||msg.from,at:msg.timestamp,detail:msg.body?.substring(0,100)});
        }
      });
      events.sort((a,b)=>new Date(a.at)-new Date(b.at));
      return{success:true,timeline:events,firstResponseMinutes:t.firstResponseMinutes,resolvedDate:t.resolvedDate,createdDate:t.createdDate};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 4: CC THREADING
    // ══════════════════════════════════════════════════════════════════════
    addTicketCC:(ticketId,email)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].cc=db.tickets[idx].cc||[];
      if(!db.tickets[idx].cc.includes(email))db.tickets[idx].cc.push(email);
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'cc_added',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:email});
      wDB(db);return{success:true};
    },
    removeTicketCC:(ticketId,email)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].cc=(db.tickets[idx].cc||[]).filter(e=>e!==email);
      wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 5: CANNED RESPONSES
    // ══════════════════════════════════════════════════════════════════════
    getCannedResponses:()=>{const db=rDB();return{success:true,responses:db.cannedResponses||[]};},
    saveCannedResponse:(resp)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.cannedResponses=db.cannedResponses||[];
      const id=resp.id||generateId('CAN');
      const idx=db.cannedResponses.findIndex(r=>r.id===id);
      if(idx>=0)db.cannedResponses[idx]={...resp,id};
      else db.cannedResponses.push({...resp,id,createdBy:su.email,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteCannedResponse:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.cannedResponses=(db.cannedResponses||[]).filter(r=>r.id!==id);wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 7: EMAIL SOURCE TAG ROUTING (Inbound Routes)
    // ══════════════════════════════════════════════════════════════════════
    getInboundRoutes:()=>{const db=rDB();return{success:true,routes:db.inboundRoutes||[]};},
    saveInboundRoute:(route)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.inboundRoutes=db.inboundRoutes||[];
      const id=route.id||generateId('RTE');
      const idx=db.inboundRoutes.findIndex(r=>r.id===id);
      if(idx>=0)db.inboundRoutes[idx]={...route,id};
      else db.inboundRoutes.push({...route,id,enabled:true,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteInboundRoute:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.inboundRoutes=(db.inboundRoutes||[]).filter(r=>r.id!==id);wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 8: OUT-OF-OFFICE AUTO REPLY
    // ══════════════════════════════════════════════════════════════════════
    getOOOConfig:()=>{const db=rDB();return{success:true,config:db.oooConfig||{enabled:false,message:'We are currently out of office. We will respond within 24 hours.',startDate:'',endDate:'',expectedResponseHours:24}};},
    saveOOOConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.oooConfig=config;wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 9: TICKET TEMPLATES WITH REQUIRED FIELDS
    // ══════════════════════════════════════════════════════════════════════
    getTicketTemplates:()=>{const db=rDB();return{success:true,templates:db.ticketTemplates||[]};},
    // Create ticket manually (from UI, not email)
    // DB CHANGE: adds to db.tickets — backward safe
    createManualTicket:(data)=>{
      // Any active user can create a manual ticket on behalf of a customer
      const db=rDB();
      const id=generateTicketId(slug);
      const now=new Date().toISOString();
      // Apply VIP flag
      const vip=db.vipConfig||{};
      const fromEmail=(data.customerEmail||'').toLowerCase();
      const isVIP=(vip.emails||[]).some(e=>fromEmail===e.toLowerCase())||(vip.domains||[]).some(d=>fromEmail.endsWith('@'+d.toLowerCase()));
      const tags=data.tags?data.tags.split(',').map(t=>t.trim()).filter(Boolean):[];
      if(isVIP&&!tags.includes('VIP'))tags.unshift('VIP');
      // Round robin auto-assign if not manually assigned
      const assignedTo=data.assignedTo||autoAssignAgent(db,{subject:data.subject,from:data.customerEmail,priority:data.priority})||'';
      const ticket={
        id,subject:data.subject||'(No subject)',
        from:data.customerEmail||'manual@internal',
        fromName:data.customerName||data.customerEmail||'Manual Ticket',
        body:data.body||'',status:'open',priority:data.priority||'Medium',
        assignedTo,createdDate:now,lastActivity:now,
        thread:[{id:generateId('MSG'),type:'incoming',from:data.customerEmail||'manual@internal',fromName:data.customerName||'Customer',body:data.body||'',timestamp:now}],
        tags,source:'manual',isVIP,
        cc:data.cc?data.cc.split(',').map(e=>e.trim()).filter(Boolean):[],
        templateId:data.templateId||null,customFields:data.customFields||{}
      };
      db.tickets=db.tickets||[];db.tickets.unshift(ticket);
      wDB(db);
      return{success:true,ticketId:id};
    },

    // ── FEATURE 1: QUEUE CONFIG & ROUND ROBIN ─────────────────────────────
    // DB CHANGE: adds db.queueConfig — backward safe
    getQueueConfig:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const gate=requireFeature(ff,'QUEUE_ENABLED');if(gate)return gate;
      const db=rDB();
      // Include ALL active users in queue (any role can receive tickets)
      const users=(db.users||[]).filter(u=>u.active);
      const cfg=db.queueConfig||{enabled:false,mode:'roundrobin',lastIndex:0,agents:[]};
      // Merge with current users
      const agents=users.map(u=>{
        const saved=(cfg.agents||[]).find(a=>a.email===u.email);
        return{email:u.email,name:u.name||u.email,inQueue:saved?saved.inQueue:true,role:u.role};
      });
      return{success:true,config:{...cfg,agents}};
    },
    saveQueueConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const prev=db.queueConfig||{};
      db.queueConfig={
        enabled:config.enabled||false,
        mode:config.mode||'roundrobin',
        lastIndex:prev.lastIndex||0,
        frozen:config.frozen||false,
        priorityRouting:config.priorityRouting||false,
        depthWarningThreshold:config.depthWarningThreshold||5,
        agents:config.agents||[],
        routingRules:config.routingRules||[],
        timeRules:config.timeRules||[]
      };
      wDB(db);
      // Auto-distribute existing unassigned tickets when queue is turned ON
      let autoDistributed=0;
      if(config.enabled&&!prev.enabled){
        const spamRe=/^(mailer-daemon|postmaster|noreply|no-reply|donotreply|bounce|daemon|system|notification|automated|newsletter)@/i;
        const unassigned=(db.tickets||[]).filter(t=>!t.assignedTo&&t.status==='new'&&!spamRe.test(t.from||'')&&!t.autoResolved)
          .sort((a,b)=>new Date(a.createdDate)-new Date(b.createdDate));
        for(const t of unassigned){
          const agent=autoAssignAgent(db,t);
          if(agent){
            const idx=(db.tickets||[]).findIndex(x=>x.id===t.id);
            if(idx>=0){
              db.tickets[idx].assignedTo=agent;
              db.tickets[idx].lastActivity=new Date().toISOString();
              if(db.tickets[idx].status==='new')db.tickets[idx].status='open';
              autoDistributed++;
            }
          }
        }
        if(autoDistributed>0){wDB(db);console.log(`[Queue] Auto-distributed ${autoDistributed} tickets on queue enable for ${slug}`);}
      }
      return{success:true,autoDistributed};
    },
    // Distribute all existing unassigned tickets to queue agents
    distributeUnassignedTickets:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const cfg=db.queueConfig||{};
      if(!cfg.enabled)return{success:false,error:'Queue not enabled. Enable it in Settings → Assignment Queue first.'};
      const SPAM_PAT=/^(mailer-daemon|postmaster|noreply|no-reply|donotreply|bounce|daemon|system|notification|automated|newsletter)@/i;
      // Auto-close any spam tickets that slipped through (stops the loop)
      let spamClosed=0;
      (db.tickets||[]).forEach((t,i)=>{
        if(!['resolved','closed'].includes(t.status)&&SPAM_PAT.test(t.from||'')){
          db.tickets[i].status='closed';db.tickets[i].lastActivity=new Date().toISOString();
          db.tickets[i].autoResolved=true;spamClosed++;
        }
      });
      if(spamClosed>0)console.log(`[Queue] Auto-closed ${spamClosed} spam tickets`);
      // Only assign 'new' real tickets — skip automated senders and auto-resolved
      const unassigned=(db.tickets||[]).filter(t=>
        !t.assignedTo&&t.status==='new'&&
        !SPAM_PAT.test(t.from||'')&&!t.autoResolved
      ).sort((a,b)=>new Date(a.createdDate)-new Date(b.createdDate)); // oldest first
      let assigned=0,skipped=0;
      for(const t of unassigned){
        const agent=autoAssignAgent(db,t);
        if(agent){
          const idx=(db.tickets||[]).findIndex(x=>x.id===t.id);
          if(idx>=0){
            db.tickets[idx].assignedTo=agent;
            db.tickets[idx].lastActivity=new Date().toISOString();
            if(db.tickets[idx].status==='new')db.tickets[idx].status='open';
            db.tickets[idx].timeline=db.tickets[idx].timeline||[];
            db.tickets[idx].timeline.push({event:'distributed_from_queue',by:su.email,byName:'Queue System',at:new Date().toISOString(),detail:`Bulk distributed to ${agent}`});
            assigned++;
          }
        } else { skipped++; }
      }
      wDB(db);
      return{success:true,assigned,skipped,total:unassigned.length,message:`${assigned} tickets assigned, ${skipped} skipped (agents at capacity)`};
    },
    // ── ADMIN QUEUE MANAGEMENT ─────────────────────────────────────────────
    // Admin changes ANY user's availability status
    setAgentStatusAdmin:(agentEmail,status)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.email===agentEmail);
      if(idx===-1)return{success:false,error:'Agent not found'};
      const prev=db.users[idx].availabilityStatus||'available';
      db.users[idx].availabilityStatus=status;
      db.users[idx].statusUpdatedAt=new Date().toISOString();
      db.users[idx].statusSetByAdmin=true;
      // Auto-redistribute if setting to Away
      let redistributed=0;
      if(status==='away'&&prev!=='away'&&(db.queueConfig||{}).enabled){
        const openTickets=(db.tickets||[]).filter(t=>t.assignedTo===agentEmail&&!['resolved','closed'].includes(t.status));
        openTickets.forEach(t=>{
          const newAgent=autoAssignAgent(db,t);
          const tIdx=(db.tickets||[]).findIndex(x=>x.id===t.id);
          if(tIdx>=0){
            if(newAgent){
              db.tickets[tIdx].assignedTo=newAgent;
              db.tickets[tIdx].timeline=db.tickets[tIdx].timeline||[];
              db.tickets[tIdx].timeline.push({event:'admin_redistributed',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`${agentEmail} set Away by admin → reassigned to ${newAgent}`});
              redistributed++;
            } else {
              // No agent available — move back to unassigned
              db.tickets[tIdx].assignedTo='';
              db.tickets[tIdx].status='new';
              db.tickets[tIdx].timeline=db.tickets[tIdx].timeline||[];
              db.tickets[tIdx].timeline.push({event:'returned_to_queue',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`${agentEmail} set Away — returned to unassigned queue`});
              redistributed++;
            }
          }
        });
      }
      wDB(db);return{success:true,status,redistributed};
    },
    // Admin moves ALL tickets from an agent back to unassigned queue
    drainAgentQueue:(agentEmail)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();let drained=0;
      (db.tickets||[]).forEach((t,i)=>{
        if(t.assignedTo===agentEmail&&!['resolved','closed'].includes(t.status)){
          db.tickets[i].assignedTo='';
          db.tickets[i].status='new';
          db.tickets[i].lastActivity=new Date().toISOString();
          db.tickets[i].timeline=db.tickets[i].timeline||[];
          db.tickets[i].timeline.push({event:'returned_to_queue',by:su.email,byName:'Admin',at:new Date().toISOString(),detail:`Returned to unassigned queue by ${su.email}`});
          drained++;
        }
      });
      wDB(db);return{success:true,drained};
    },
    // Admin moves a single ticket back to unassigned
    returnTicketToQueue:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].assignedTo='';
      db.tickets[idx].status='new';
      db.tickets[idx].lastActivity=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'returned_to_queue',by:su.email,byName:'Admin',at:new Date().toISOString(),detail:'Manually returned to unassigned queue'});
      wDB(db);return{success:true};
    },
    // Feature 14: Freeze/unfreeze queue
    freezeQueue:(freeze)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.queueConfig=db.queueConfig||{};
      db.queueConfig.frozen=!!freeze;wDB(db);
      return{success:true,frozen:!!freeze};
    },
    // Feature 12: Take ticket (self-assign)
    takeTicket:(ticketId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].assignedTo=su.email;
      db.tickets[idx].lastActivity=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'taken',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:'Self-assigned via queue'});
      wDB(db);return{success:true};
    },
    // Feature 13: Transfer ticket to another agent
    transferTicket:(ticketId,toAgent,note)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      const prevAgent=db.tickets[idx].assignedTo||'unassigned';
      db.tickets[idx].assignedTo=toAgent;
      db.tickets[idx].lastActivity=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'transferred',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`From ${prevAgent} → ${toAgent}${note?': '+note:''}`});
      if(note){db.tickets[idx].thread=db.tickets[idx].thread||[];db.tickets[idx].thread.push({id:generateId('NOTE'),type:'note',from:su.email,fromName:su.name||su.email,body:`Transferred to ${toAgent}: ${note}`,timestamp:new Date().toISOString()});}
      wDB(db);return{success:true};
    },
    // Feature 15: Priority bump — move to status 'new' and flag
    bumpTicketPriority:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].priorityBumped=true;
      db.tickets[idx].priority='Critical';
      db.tickets[idx].lastActivity=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'priority_bumped',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:'Manually bumped to Critical'});
      wDB(db);return{success:true};
    },
    // Feature 9: Auto-reassign tickets when agent goes Away
    reassignAwayTickets:(fromAgent)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const openTickets=(db.tickets||[]).filter(t=>t.assignedTo===fromAgent&&!['resolved','closed'].includes(t.status));
      let reassigned=0;
      openTickets.forEach(t=>{
        const newAgent=autoAssignAgent(db,t);
        if(newAgent){
          const idx=(db.tickets||[]).findIndex(x=>x.id===t.id);
          if(idx>=0){db.tickets[idx].assignedTo=newAgent;db.tickets[idx].lastActivity=new Date().toISOString();reassigned++;}
        }
      });
      wDB(db);return{success:true,reassigned};
    },
    // Feature 6 & 16: Queue metrics & performance report
    getQueueMetrics:()=>{
      const db=rDB();const now=Date.now();
      const agents=(db.users||[]).filter(u=>u.active);
      const cfg=db.queueConfig||{};
      const depthWarnings=checkQueueDepth(db);
      const metrics=agents.map(u=>{
        const assigned=(db.tickets||[]).filter(t=>t.assignedTo===u.email);
        const open=assigned.filter(t=>!['resolved','closed'].includes(t.status));
        const resolved=assigned.filter(t=>t.status==='resolved'||t.status==='closed');
        // Avg wait time = avg time since creation for open unresponded tickets
        const unresponded=open.filter(t=>!(t.thread||[]).some(m=>m.type==='reply'&&m.from!==t.from));
        const avgWaitMin=unresponded.length?Math.round(unresponded.reduce((s,t)=>(s+(now-new Date(t.createdDate).getTime())/60000),0)/unresponded.length):0;
        const frTimes=assigned.filter(t=>t.firstResponseMinutes!=null).map(t=>t.firstResponseMinutes);
        const avgFRT=frTimes.length?Math.round(frTimes.reduce((a,b)=>a+b,0)/frTimes.length):null;
        const inQueue=!!(cfg.agents||[]).find(a=>a.email===u.email&&a.inQueue);
        return{
          email:u.email,name:u.name||u.email,role:u.role,team:u.team||'',
          status:u.availabilityStatus||'available',
          openTickets:open.length,maxTickets:u.maxTickets||10,
          capacity:Math.round((open.length/(u.maxTickets||10))*100),
          unrespondedTickets:unresponded.length,
          avgWaitMinutes:avgWaitMin,avgFirstResponseMinutes:avgFRT,
          resolvedThisWeek:resolved.filter(t=>new Date(t.resolvedDate||t.lastActivity)>new Date(now-7*86400000)).length,
          inQueue,overThreshold:open.length>=(cfg.depthWarningThreshold||5)
        };
      });
      // Feature 18: Overflow — tickets with no agent and not resolved
      const overflow=(db.tickets||[]).filter(t=>!t.assignedTo&&!['resolved','closed'].includes(t.status)).length;
      return{success:true,metrics,overflow,frozen:cfg.frozen||false,enabled:cfg.enabled||false,
        totalOpen:(db.tickets||[]).filter(t=>!['resolved','closed'].includes(t.status)).length,
        depthWarnings};
    },
    // Feature 10: Queue position for a ticket
    getQueuePosition:(ticketId)=>{
      const db=rDB();
      const open=(db.tickets||[]).filter(t=>!['resolved','closed'].includes(t.status))
        .sort((a,b)=>{
          const pp={Critical:0,High:1,Medium:2,Low:3};
          if(pp[a.priority]!==pp[b.priority])return pp[a.priority]-pp[b.priority];
          return new Date(a.createdDate)-new Date(b.createdDate);
        });
      const pos=open.findIndex(t=>t.id===ticketId);
      return{success:true,position:pos>=0?pos+1:null,total:open.length};
    },

    // ── FEATURE 4: AGENT AVAILABILITY STATUS ───────────────────────────────
    // DB CHANGE: adds user.availabilityStatus — backward safe
    setAgentStatus:(status)=>{
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.email===su.email);
      if(idx===-1)return{success:false,error:'Not found'};
      const prevStatus=db.users[idx].availabilityStatus||'available';
      db.users[idx].availabilityStatus=status;
      db.users[idx].statusUpdatedAt=new Date().toISOString();
      // Feature 9: Auto-reassign when going Away
      let reassigned=0;
      if(status==='away'&&prevStatus!=='away'&&(db.queueConfig||{}).enabled){
        const openTickets=(db.tickets||[]).filter(t=>t.assignedTo===su.email&&!['resolved','closed'].includes(t.status));
        openTickets.forEach(t=>{
          const newAgent=autoAssignAgent(db,t);
          if(newAgent){
            const tIdx=(db.tickets||[]).findIndex(x=>x.id===t.id);
            if(tIdx>=0){
              db.tickets[tIdx].assignedTo=newAgent;
              db.tickets[tIdx].lastActivity=new Date().toISOString();
              db.tickets[tIdx].timeline=db.tickets[tIdx].timeline||[];
              db.tickets[tIdx].timeline.push({event:'auto_reassigned',by:'system',byName:'Queue System',at:new Date().toISOString(),detail:`${su.email} went Away → reassigned to ${newAgent}`});
              reassigned++;
            }
          }
        });
      }
      wDB(db);return{success:true,status,reassigned};
    },
    getAgentStatuses:()=>{
      const db=rDB();
      return{success:true,agents:(db.users||[]).filter(u=>u.active).map(u=>({
        email:u.email,name:u.name||u.email,role:u.role,team:u.team||'',
        status:u.availabilityStatus||'available',
        statusUpdatedAt:u.statusUpdatedAt||null,
        openTickets:(db.tickets||[]).filter(t=>t.assignedTo===u.email&&!['resolved','closed'].includes(t.status)).length,
        maxTickets:u.maxTickets||10
      }))};
    },

    // ── FEATURE 3: CUSTOMER TICKET HISTORY ────────────────────────────────
    getCustomerHistory:(email)=>{
      const db=rDB();
      const tickets=(db.tickets||[]).filter(t=>t.from&&t.from.toLowerCase()===email.toLowerCase());
      const resolved=tickets.filter(t=>t.status==='resolved'||t.status==='closed');
      const csatScores=tickets.filter(t=>t.csatScore!=null).map(t=>t.csatScore);
      const avgCSAT=csatScores.length?Math.round(csatScores.reduce((a,b)=>a+b,0)/csatScores.length):null;
      const frTimes=tickets.filter(t=>t.firstResponseMinutes!=null).map(t=>t.firstResponseMinutes);
      const avgFRT=frTimes.length?Math.round(frTimes.reduce((a,b)=>a+b,0)/frTimes.length):null;
      const notes=(db.customerNotes||{})[email.toLowerCase()]||[];
      // Check VIP
      const vip=db.vipConfig||{};
      const fromLow=email.toLowerCase();
      const isVIP=(vip.emails||[]).some(e=>fromLow===e.toLowerCase())||(vip.domains||[]).some(d=>fromLow.endsWith('@'+d.toLowerCase()));
      return{success:true,
        email,totalTickets:tickets.length,resolvedTickets:resolved.length,
        openTickets:tickets.filter(t=>!['resolved','closed'].includes(t.status)).length,
        avgCSAT,avgFirstResponseMinutes:avgFRT,isVIP,
        lastContact:tickets.length?tickets.slice().sort((a,b)=>new Date(b.createdDate)-new Date(a.createdDate))[0].createdDate:null,
        recentTickets:tickets.slice().sort((a,b)=>new Date(b.createdDate)-new Date(a.createdDate)).slice(0,5).map(t=>({id:t.id,subject:t.subject,status:t.status,priority:t.priority,createdDate:t.createdDate,csatRating:t.csatRating})),
        notes
      };
    },

    // ── FEATURE 8: CUSTOMER INTERNAL NOTES ────────────────────────────────
    // DB CHANGE: adds db.customerNotes — backward safe
    addCustomerNote:(email,note)=>{
      const db=rDB();
      db.customerNotes=db.customerNotes||{};
      const key=email.toLowerCase();
      db.customerNotes[key]=db.customerNotes[key]||[];
      db.customerNotes[key].push({id:generateId('CN'),note,by:su.email,byName:su.name||su.email,at:new Date().toISOString()});
      wDB(db);return{success:true};
    },
    deleteCustomerNote:(email,noteId)=>{
      const db=rDB();
      db.customerNotes=db.customerNotes||{};
      const key=email.toLowerCase();
      db.customerNotes[key]=(db.customerNotes[key]||[]).filter(n=>n.id!==noteId);
      wDB(db);return{success:true};
    },

    // ── FEATURE 5: VIP CUSTOMER CONFIG ────────────────────────────────────
    // DB CHANGE: adds db.vipConfig — backward safe
    getVIPConfig:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();return{success:true,config:db.vipConfig||{emails:[],domains:[],autoNotify:true,autoTag:true}};
    },
    saveVIPConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      // DB CHANGE: adds db.vipConfig
      db.vipConfig={emails:(config.emails||[]).map(e=>e.trim().toLowerCase()).filter(Boolean),domains:(config.domains||[]).map(d=>d.trim().toLowerCase()).filter(Boolean),autoNotify:config.autoNotify!==false,autoTag:config.autoTag!==false};
      wDB(db);return{success:true};
    },
    saveTicketTemplate:(tmpl)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.ticketTemplates=db.ticketTemplates||[];
      const id=tmpl.id||generateId('TTPL');
      const idx=db.ticketTemplates.findIndex(t=>t.id===id);
      if(idx>=0)db.ticketTemplates[idx]={...tmpl,id};
      else db.ticketTemplates.push({...tmpl,id,createdBy:su.email,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteTicketTemplate:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.ticketTemplates=(db.ticketTemplates||[]).filter(t=>t.id!==id);wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 10: PARENT / CHILD TICKET LINKING
    // ══════════════════════════════════════════════════════════════════════
    linkTicketParent:(ticketId,parentId)=>{
      const db=rDB();
      const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      const pIdx=(db.tickets||[]).findIndex(t=>t.id===parentId);
      if(idx===-1||pIdx===-1)return{success:false,error:'Ticket not found'};
      db.tickets[idx].parentId=parentId;
      db.tickets[pIdx].children=db.tickets[pIdx].children||[];
      if(!db.tickets[pIdx].children.includes(ticketId))db.tickets[pIdx].children.push(ticketId);
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'linked_to_parent',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:parentId});
      wDB(db);return{success:true};
    },
    unlinkTicketParent:(ticketId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      const parentId=db.tickets[idx].parentId;
      if(parentId){const pIdx=(db.tickets||[]).findIndex(t=>t.id===parentId);if(pIdx>=0)db.tickets[pIdx].children=(db.tickets[pIdx].children||[]).filter(c=>c!==ticketId);}
      db.tickets[idx].parentId=null;wDB(db);return{success:true};
    },
    getTicketChildren:(ticketId)=>{
      const db=rDB();const parent=(db.tickets||[]).find(t=>t.id===ticketId);
      if(!parent)return{success:false,error:'Not found'};
      const children=(db.tickets||[]).filter(t=>(parent.children||[]).includes(t.id)).map(t=>({id:t.id,subject:t.subject,status:t.status,priority:t.priority,from:t.from}));
      return{success:true,children,childCount:children.length};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 11: RECURRING TICKET TEMPLATES
    // ══════════════════════════════════════════════════════════════════════
    getRecurringTicketTemplates:()=>{const db=rDB();return{success:true,templates:db.recurringTicketTemplates||[]};},
    saveRecurringTicketTemplate:(tmpl)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.recurringTicketTemplates=db.recurringTicketTemplates||[];
      const id=tmpl.id||generateId('RCT');
      const idx=db.recurringTicketTemplates.findIndex(t=>t.id===id);
      if(idx>=0)db.recurringTicketTemplates[idx]={...tmpl,id};
      else db.recurringTicketTemplates.push({...tmpl,id,createdBy:su.email,createdAt:new Date().toISOString(),lastRunAt:null});
      wDB(db);return{success:true,id};
    },
    deleteRecurringTicketTemplate:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.recurringTicketTemplates=(db.recurringTicketTemplates||[]).filter(t=>t.id!==id);wDB(db);return{success:true};
    },
    runRecurringTickets:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const now=new Date();let created=0;
      (db.recurringTicketTemplates||[]).filter(t=>t.enabled).forEach(tmpl=>{
        const last=tmpl.lastRunAt?new Date(tmpl.lastRunAt):null;
        let due=false;
        if(tmpl.frequency==='daily')due=!last||now-last>86400000;
        else if(tmpl.frequency==='weekly')due=!last||now-last>604800000;
        else if(tmpl.frequency==='monthly')due=!last||now-last>2592000000;
        if(due){
          const tId=generateId('TKT');
          db.tickets=db.tickets||[];
          db.tickets.unshift({id:tId,subject:tmpl.subject,from:'system@recurring',fromName:'Recurring System',body:tmpl.body||'',status:'new',priority:tmpl.priority||'Medium',createdDate:now.toISOString(),lastActivity:now.toISOString(),thread:[],tags:['recurring'],source:'recurring',recurringTemplateId:tmpl.id});
          const tIdx=db.recurringTicketTemplates.findIndex(t=>t.id===tmpl.id);
          if(tIdx>=0)db.recurringTicketTemplates[tIdx].lastRunAt=now.toISOString();
          created++;
        }
      });
      wDB(db);return{success:true,created};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 12: TICKET WATCHERS
    // ══════════════════════════════════════════════════════════════════════
    watchTicket:(ticketId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].watchers=db.tickets[idx].watchers||[];
      if(!db.tickets[idx].watchers.includes(su.email))db.tickets[idx].watchers.push(su.email);
      wDB(db);return{success:true,watching:true};
    },
    unwatchTicket:(ticketId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].watchers=(db.tickets[idx].watchers||[]).filter(w=>w!==su.email);
      wDB(db);return{success:true,watching:false};
    },
    getTicketWatchers:(ticketId)=>{
      const db=rDB();const t=(db.tickets||[]).find(x=>x.id===ticketId);
      if(!t)return{success:false,error:'Not found'};
      const watchers=(t.watchers||[]).map(email=>{const u=(db.users||[]).find(u=>u.email===email);return{email,name:u?.name||email};});
      return{success:true,watchers,isWatching:(t.watchers||[]).includes(su.email)};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 13: SLA PAUSE ON CUSTOMER RESPONSE
    // ══════════════════════════════════════════════════════════════════════
    pauseTicketSLA:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      if(db.tickets[idx].slaPaused)return{success:true,message:'Already paused'};
      db.tickets[idx].slaPaused=true;db.tickets[idx].slaPausedAt=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'sla_paused',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:'Waiting for customer response'});
      wDB(db);return{success:true};
    },
    resumeTicketSLA:(ticketId)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      if(!db.tickets[idx].slaPaused)return{success:true,message:'Not paused'};
      const pausedMs=db.tickets[idx].slaPausedMs||0;
      const extraMs=db.tickets[idx].slaPausedAt?Date.now()-new Date(db.tickets[idx].slaPausedAt).getTime():0;
      db.tickets[idx].slaExtraMs=(pausedMs+extraMs);
      db.tickets[idx].slaPaused=false;db.tickets[idx].slaPausedAt=null;
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'sla_resumed',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`SLA extended by ${Math.round(extraMs/60000)}m`});
      wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 14: TICKET HEATMAP CALENDAR
    // ══════════════════════════════════════════════════════════════════════
    getTicketHeatmap:(days)=>{
      const db=rDB();const n=parseInt(days)||90;
      const now=Date.now();const map={};
      for(let i=0;i<n;i++){const d=new Date(now-i*86400000).toISOString().split('T')[0];map[d]=0;}
      (db.tickets||[]).forEach(t=>{
        const d=(t.createdDate||t.lastActivity||'').split('T')[0];
        if(map[d]!==undefined)map[d]++;
      });
      const max=Math.max(...Object.values(map),1);
      return{success:true,heatmap:Object.entries(map).map(([date,count])=>({date,count,intensity:Math.round(count/max*5)})).sort((a,b)=>a.date.localeCompare(b.date)),max,total:(db.tickets||[]).length};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 15: AGENT LEADERBOARD
    // ══════════════════════════════════════════════════════════════════════
    getAgentLeaderboard:()=>{
      const db=rDB();const users=(db.users||[]).filter(u=>u.active);const tickets=db.tickets||[];
      const thisWeekStart=new Date(Date.now()-7*86400000);
      const leaderboard=users.map(u=>{
        const assigned=tickets.filter(t=>t.assignedTo===u.email);
        const resolved=assigned.filter(t=>t.status==='resolved'||t.status==='closed');
        const thisWeek=resolved.filter(t=>new Date(t.resolvedDate||t.lastActivity)>thisWeekStart);
        const withFRT=assigned.filter(t=>t.firstResponseMinutes!=null);
        const avgFRT=withFRT.length?Math.round(withFRT.reduce((s,t)=>s+(t.firstResponseMinutes||0),0)/withFRT.length):null;
        const csatScores=assigned.filter(t=>t.csatScore!=null).map(t=>t.csatScore);
        const avgCSAT=csatScores.length?Math.round(csatScores.reduce((a,b)=>a+b,0)/csatScores.length):null;
        return{email:u.email,name:u.name||u.email,team:u.team,role:u.role,totalResolved:resolved.length,thisWeekResolved:thisWeek.length,avgFirstResponseMin:avgFRT,avgCSAT,totalAssigned:assigned.length,openCount:assigned.filter(t=>!['resolved','closed'].includes(t.status)).length};
      }).sort((a,b)=>b.thisWeekResolved-a.thisWeekResolved||b.totalResolved-a.totalResolved);
      return{success:true,leaderboard,weekStart:thisWeekStart.toISOString()};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 16: FIRST RESPONSE TIME STATS
    // ══════════════════════════════════════════════════════════════════════
    getFirstResponseStats:()=>{
      const db=rDB();const tickets=(db.tickets||[]).filter(t=>t.firstResponseMinutes!=null);
      if(!tickets.length)return{success:true,avg:null,median:null,under1h:0,under4h:0,over4h:0,total:0};
      const times=tickets.map(t=>t.firstResponseMinutes).sort((a,b)=>a-b);
      const avg=Math.round(times.reduce((s,t)=>s+t,0)/times.length);
      const median=times[Math.floor(times.length/2)];
      const under1h=tickets.filter(t=>t.firstResponseMinutes<=60).length;
      const under4h=tickets.filter(t=>t.firstResponseMinutes<=240).length;
      const over4h=tickets.filter(t=>t.firstResponseMinutes>240).length;
      // Weekly trend (last 4 weeks)
      const weeks=[];for(let w=0;w<4;w++){
        const start=new Date(Date.now()-(w+1)*7*86400000);const end=new Date(Date.now()-w*7*86400000);
        const wTickets=tickets.filter(t=>new Date(t.createdDate)>=start&&new Date(t.createdDate)<end);
        const wAvg=wTickets.length?Math.round(wTickets.reduce((s,t)=>s+(t.firstResponseMinutes||0),0)/wTickets.length):null;
        weeks.unshift({label:`Week -${w}`,avg:wAvg,count:wTickets.length});
      }
      return{success:true,avg,median,under1h,under4h,over4h,total:tickets.length,weeks};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 17: TICKET VOLUME FORECAST
    // ══════════════════════════════════════════════════════════════════════
    getTicketVolumeForecast:()=>{
      const db=rDB();const tickets=db.tickets||[];
      const weeks=[];for(let w=1;w<=8;w++){
        const start=new Date(Date.now()-w*7*86400000);const end=new Date(Date.now()-(w-1)*7*86400000);
        weeks.push(tickets.filter(t=>new Date(t.createdDate||t.lastActivity)>=start&&new Date(t.createdDate||t.lastActivity)<end).length);
      }
      weeks.reverse();
      const avg=Math.round(weeks.reduce((a,b)=>a+b,0)/weeks.length);
      const trend=weeks.length>=2?weeks[weeks.length-1]-weeks[0]:0;
      const forecast=Math.max(0,Math.round(avg+(trend*0.3)));
      // Daily breakdown for forecast week
      const dayAvg=Math.round(forecast/7);
      const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const dayWeights=[1.2,1.15,1.1,1.0,0.9,0.5,0.4];
      const dailyForecast=days.map((d,i)=>({day:d,expected:Math.round(dayAvg*dayWeights[i])}));
      const fcNote=trend>2?'📈 Volume trending up':trend<-2?'📉 Volume trending down':'📊 Stable volume';
      return{success:true,history:weeks,avg,trend,forecast,dailyForecast,note:fcNote};
    },

    // ══════════════════════════════════════════════════════════════════════
    // CSAT recording
    // ══════════════════════════════════════════════════════════════════════
    recordTicketCSAT:(ticketId,rating)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].csatScore=rating==='yes'?100:0;
      db.tickets[idx].csatRating=rating;db.tickets[idx].csatAt=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'csat_received',by:'customer',byName:db.tickets[idx].fromName||'Customer',at:new Date().toISOString(),detail:`Rating: ${rating}`});
      wDB(db);return{success:true};
    },


    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 1 & 5: BOOKING CONFIG
    // DB CHANGE: adds db.bookingConfig — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getBookingConfig:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const gate=requireFeature(ff,'APPOINTMENT_BOOKING_ENABLED');if(gate)return gate;
      const db=rDB();
      return{success:true,config:db.bookingConfig||{
        enabled:false,title:'Book an Appointment',slotDuration:30,buffer:15,maxPerDay:10,
        workingHours:{monday:{enabled:true,start:'09:00',end:'18:00'},tuesday:{enabled:true,start:'09:00',end:'18:00'},wednesday:{enabled:true,start:'09:00',end:'18:00'},thursday:{enabled:true,start:'09:00',end:'18:00'},friday:{enabled:true,start:'09:00',end:'17:00'},saturday:{enabled:false,start:'10:00',end:'14:00'},sunday:{enabled:false,start:'10:00',end:'14:00'}},
        bookingLink:`${BASE_URL}/book/${slug}`
      }};
    },
    saveBookingConfig:(config)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      // DB CHANGE: adds db.bookingConfig — never overwrites existing appointments
      db.bookingConfig={...config,bookingLink:`${BASE_URL}/book/${slug}`,updatedAt:new Date().toISOString()};
      wDB(db);return{success:true,bookingLink:`${BASE_URL}/book/${slug}`};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 2: AGENT CALENDAR & APPOINTMENTS
    // DB CHANGE: adds db.appointments — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getAppointments:(filters)=>{
      const db=rDB();
      let apts=db.appointments||[];
      if(filters&&filters.agentEmail)apts=apts.filter(a=>a.assignedTo===filters.agentEmail);
      if(filters&&filters.date)apts=apts.filter(a=>a.date===filters.date);
      if(filters&&filters.status)apts=apts.filter(a=>a.status===filters.status);
      // Non-admin only sees their own
      if(su.role!=='Admin')apts=apts.filter(a=>a.assignedTo===su.email||!a.assignedTo);
      return{success:true,appointments:apts.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time))};
    },
    createAppointment:(data)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();
      const id=generateId('APT');const now=new Date().toISOString();
      db.appointments=db.appointments||[];
      db.appointments.push({id,brandSlug:slug,customerName:data.customerName||'',customerEmail:data.customerEmail||'',customerPhone:data.phone||'',topic:data.topic||'',date:data.date,time:data.time,assignedTo:data.assignedTo||'',status:'confirmed',notes:data.notes||'',createdAt:now,createdBy:su.email,reminderSent:false,ticketId:data.ticketId||null});
      wDB(db);return{success:true,id};
    },
    updateAppointment:(id,updates)=>{
      const db=rDB();const idx=(db.appointments||[]).findIndex(a=>a.id===id);
      if(idx===-1)return{success:false,error:'Not found'};
      Object.assign(db.appointments[idx],updates,{updatedAt:new Date().toISOString()});
      wDB(db);return{success:true};
    },
    cancelAppointment:(id,reason)=>{
      const db=rDB();const idx=(db.appointments||[]).findIndex(a=>a.id===id);
      if(idx===-1)return{success:false,error:'Not found'};
      db.appointments[idx].status='cancelled';db.appointments[idx].cancelReason=reason||'';db.appointments[idx].cancelledAt=new Date().toISOString();db.appointments[idx].cancelledBy=su.email;
      wDB(db);
      // Notify customer
      const apt=db.appointments[idx];
      if(apt.customerEmail){
        const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        sendBrandEmail(slug,apt.customerEmail,`Appointment Cancelled — ${brand.name||'Support'}`,`<p>Hi ${apt.customerName},</p><p>Your appointment on ${apt.date} at ${apt.time} has been cancelled.${reason?'<br>Reason: '+reason:''}</p><p>Please rebook at your convenience.</p>`,`Your appointment on ${apt.date} at ${apt.time} has been cancelled`).catch(()=>{});
      }
      return{success:true};
    },
    getAgentCalendar:(agentEmail,month)=>{
      const db=rDB();
      const email=agentEmail||su.email;
      const m=month||new Date().toISOString().substring(0,7);
      const apts=(db.appointments||[]).filter(a=>(!a.assignedTo||a.assignedTo===email)&&a.date.startsWith(m)&&a.status!=='cancelled');
      const tickets=(db.tickets||[]).filter(t=>t.assignedTo===email&&!['resolved','closed'].includes(t.status));
      return{success:true,appointments:apts,openTickets:tickets.length,month:m};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 3: AUTO-SCHEDULE FROM TICKET — generate booking link in thread
    // ══════════════════════════════════════════════════════════════════════
    generateBookingLinkForTicket:(ticketId)=>{
      // Always generate link — admin can enable booking later
      const link=`${BASE_URL}/book/${slug}`;
      const db=rDB();const cfg=db.bookingConfig||{};
      const enabled=cfg.enabled||false;
      return{success:true,link,enabled,message:`Book a call with us: ${link}`,warning:!enabled?'Tip: Enable booking in Settings → 📅 Appointment Booking for customers to actually book.':null};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 7: TICKET CHECKLISTS (tasks inside tickets)
    // DB CHANGE: adds ticket.checklist — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getTicketChecklist:(ticketId)=>{
      const db=rDB();const t=(db.tickets||[]).find(x=>x.id===ticketId);
      if(!t)return{success:false,error:'Not found'};
      return{success:true,checklist:t.checklist||[]};
    },
    addChecklistItem:(ticketId,text)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      const item={id:generateId('CI'),text,done:false,createdBy:su.email,createdAt:new Date().toISOString()};
      db.tickets[idx].checklist=db.tickets[idx].checklist||[];
      db.tickets[idx].checklist.push(item);
      db.tickets[idx].lastActivity=new Date().toISOString();
      wDB(db);return{success:true,item};
    },
    toggleChecklistItem:(ticketId,itemId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      const ci=(db.tickets[idx].checklist||[]).findIndex(c=>c.id===itemId);
      if(ci===-1)return{success:false,error:'Item not found'};
      db.tickets[idx].checklist[ci].done=!db.tickets[idx].checklist[ci].done;
      db.tickets[idx].checklist[ci].doneAt=db.tickets[idx].checklist[ci].done?new Date().toISOString():null;
      db.tickets[idx].checklist[ci].doneBy=db.tickets[idx].checklist[ci].done?su.email:null;
      wDB(db);return{success:true,done:db.tickets[idx].checklist[ci].done};
    },
    deleteChecklistItem:(ticketId,itemId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].checklist=(db.tickets[idx].checklist||[]).filter(c=>c.id!==itemId);
      wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 8: FOLLOW-UP SCHEDULER
    // DB CHANGE: adds ticket.followUpAt — backward safe
    // ══════════════════════════════════════════════════════════════════════
    scheduleFollowUp:(ticketId,followUpDate,note)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].followUpAt=followUpDate;
      db.tickets[idx].followUpNote=note||'';
      db.tickets[idx].followUpBy=su.email;
      db.tickets[idx].followUpDone=false;
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'follow_up_scheduled',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`Follow-up set for ${followUpDate}${note?': '+note:''}`});
      wDB(db);return{success:true};
    },
    getFollowUps:()=>{
      const db=rDB();const now=new Date().toISOString().split('T')[0];
      const due=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=now&&!['resolved','closed'].includes(t.status));
      const upcoming=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt>now&&!['resolved','closed'].includes(t.status));
      const myDue=su.role==='Admin'?due:due.filter(t=>t.followUpBy===su.email||t.assignedTo===su.email);
      return{success:true,due:myDue,upcoming:upcoming.slice(0,20),totalDue:due.length};
    },
    markFollowUpDone:(ticketId)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.tickets[idx].followUpDone=true;db.tickets[idx].followUpDoneAt=new Date().toISOString();
      wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 9: SLA PROMISE TO CUSTOMER
    // DB CHANGE: adds ticket.slaPromiseDate — backward safe
    // ══════════════════════════════════════════════════════════════════════
    setTicketSLAPromise:(ticketId,promiseDate,promiseTime)=>{
      const db=rDB();const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
      if(idx===-1)return{success:false,error:'Not found'};
      const promiseDT=promiseDate+(promiseTime?'T'+promiseTime+':00':'T23:59:00');
      db.tickets[idx].slaPromiseDate=promiseDT;db.tickets[idx].slaPromiseSetBy=su.email;db.tickets[idx].slaPromiseSetAt=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'sla_promise_set',by:su.email,byName:su.name||su.email,at:new Date().toISOString(),detail:`Promised resolution by ${promiseDate} ${promiseTime||'EOD'}`});
      wDB(db);
      // Notify customer
      const ticket=db.tickets[idx];
      if(ticket.from){
        const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        sendBrandEmail(slug,ticket.from,`We'll resolve your issue by ${promiseDate} — ${brand.name||'Support'}`,
          `<p>Hi ${ticket.fromName||'there'},</p><p>We've reviewed your request and promise to resolve it by <strong>${promiseDate}${promiseTime?' at '+promiseTime:''}</strong>.</p><p>Ref: ${ticketId}</p>`,
          `We'll resolve your issue by ${promiseDate}`).catch(()=>{});
      }
      return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 11: TICKET DEPENDENCIES
    // DB CHANGE: adds db.ticketDependencies — backward safe
    // ══════════════════════════════════════════════════════════════════════
    addTicketDependency:(ticketId,blockedByTicketId)=>{
      const db=rDB();
      db.ticketDependencies=db.ticketDependencies||[];
      const exists=db.ticketDependencies.find(d=>d.ticket===ticketId&&d.blockedBy===blockedByTicketId);
      if(!exists)db.ticketDependencies.push({ticket:ticketId,blockedBy:blockedByTicketId,addedBy:su.email,addedAt:new Date().toISOString()});
      wDB(db);return{success:true};
    },
    removeTicketDependency:(ticketId,blockedByTicketId)=>{
      const db=rDB();
      db.ticketDependencies=(db.ticketDependencies||[]).filter(d=>!(d.ticket===ticketId&&d.blockedBy===blockedByTicketId));
      wDB(db);return{success:true};
    },
    getTicketDependencies:(ticketId)=>{
      const db=rDB();
      const blocking=(db.ticketDependencies||[]).filter(d=>d.blockedBy===ticketId).map(d=>{const t=(db.tickets||[]).find(x=>x.id===d.ticket);return{...d,ticketSubject:t?.subject,ticketStatus:t?.status};});
      const blockedBy=(db.ticketDependencies||[]).filter(d=>d.ticket===ticketId).map(d=>{const t=(db.tickets||[]).find(x=>x.id===d.blockedBy);return{...d,blockingSubject:t?.subject,blockingStatus:t?.status};});
      return{success:true,blocking,blockedBy,isBlocked:blockedBy.some(d=>!['resolved','closed'].includes(d.blockingStatus||''))};
    },

    // ══════════════════════════════════════════════════════════════════════
    // FEATURE 12: AGENT DAILY DIGEST
    // ══════════════════════════════════════════════════════════════════════
    getAgentDailyDigest:()=>{
      const db=rDB();const today=new Date().toISOString().split('T')[0];const email=su.email;
      const myTickets=(db.tickets||[]).filter(t=>t.assignedTo===email&&!['resolved','closed'].includes(t.status));
      const myApts=(db.appointments||[]).filter(a=>(a.assignedTo===email||!a.assignedTo)&&a.date===today&&a.status!=='cancelled');
      const myFollowUps=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=today&&t.assignedTo===email);
      const now=new Date();
      const slaRisk=myTickets.filter(t=>{const sla=new Date(new Date(t.createdDate).getTime()+(24*3600000));const hr=(sla-now)/3600000;return hr>0&&hr<4;});
      return{success:true,email,date:today,openTickets:myTickets.length,appointmentsToday:myApts.length,followUpsDue:myFollowUps.length,slaRisk:slaRisk.length,appointments:myApts,topTickets:myTickets.slice(0,5).map(t=>({id:t.id,subject:t.subject.substring(0,60),status:t.status,priority:t.priority}))};
    },
    sendDailyDigest:async()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const today=new Date().toISOString().split('T')[0];
      const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
      const agents=(db.users||[]).filter(u=>u.active);
      let sent=0;
      for(const agent of agents){
        const myTickets=(db.tickets||[]).filter(t=>t.assignedTo===agent.email&&!['resolved','closed'].includes(t.status));
        const myApts=(db.appointments||[]).filter(a=>a.assignedTo===agent.email&&a.date===today&&a.status!=='cancelled');
        const myFollowUps=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=today&&t.assignedTo===agent.email);
        if(myTickets.length===0&&myApts.length===0&&myFollowUps.length===0)continue;
        const html=`<div style="font-family:Arial;max-width:520px;margin:0 auto;">
          <div style="background:${brand.accentColor||'#10B981'};padding:20px;color:#fff;border-radius:12px 12px 0 0;"><h2 style="margin:0;">📋 Daily Digest — ${today}</h2><p style="margin:4px 0 0;opacity:.85;">Hi ${agent.name||agent.email}</p></div>
          <div style="background:#fff;padding:20px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,.08);">
          ${myTickets.length?`<div style="margin-bottom:16px;"><strong>📬 Open Tickets (${myTickets.length})</strong>${myTickets.slice(0,5).map(t=>`<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;"><span style="color:#6b7280;">${t.id}</span> ${t.subject.substring(0,50)}</div>`).join('')}</div>`:''}
          ${myApts.length?`<div style="margin-bottom:16px;"><strong>📅 Appointments Today (${myApts.length})</strong>${myApts.map(a=>`<div style="padding:6px 0;font-size:13px;">${a.time} — ${a.customerName}: ${a.topic.substring(0,40)}</div>`).join('')}</div>`:''}
          ${myFollowUps.length?`<div style="margin-bottom:16px;"><strong>⏰ Follow-ups Due (${myFollowUps.length})</strong>${myFollowUps.map(t=>`<div style="padding:6px 0;font-size:13px;color:#ef4444;">${t.id}: ${t.subject.substring(0,50)}</div>`).join('')}</div>`:''}
          <a href="${BASE_URL}" style="display:inline-block;padding:10px 24px;background:${brand.accentColor||'#10B981'};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Open Resolvo →</a>
          </div></div>`;
        await sendBrandEmail(slug,agent.email,`📋 Daily Digest ${today} — ${brand.name||'Resolvo'}`,html,`You have ${myTickets.length} open tickets, ${myApts.length} appointments today.`).catch(()=>{});
        sent++;
      }
      return{success:true,sent};
    },

    // ── MISSING HANDLERS — fixes "Unknown function" errors ─────────────────
    // Clone issue
    cloneIssue:(issueId)=>{
      const db=rDB();const src=(db.issues||[]).find(i=>i.id===issueId);
      if(!src)return{success:false,error:'Not found'};
      const newId=generateIssueId(slug);
      const now=new Date().toISOString();
      const clone={...src,id:newId,title:'[Copy] '+src.title,status:'Open',createdDate:now,startedDate:'',resolvedDate:'',closedDate:'',raisedBy:su.email};
      db.issues=db.issues||[];db.issues.push(clone);
      logActivity(db,newId,`Cloned from ${issueId}`,su.email);
      wDB(db);return{success:true,newIssueId:newId};
    },
    // Batch update issues
    batchUpdateIssues:(ids,updates)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();let updated=0;
      (ids||[]).forEach(id=>{const idx=(db.issues||[]).findIndex(i=>i.id===id);if(idx>=0){Object.assign(db.issues[idx],updates);updated++;}});
      wDB(db);return{success:true,updated};
    },
    // Summary stats for dashboard
    getSummaryStats:()=>{
      const db=rDB();const now=new Date();
      const issues=db.issues||[];const tickets=db.tickets||[];
      const open=issues.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const breached=open.filter(i=>now>new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000));
      return{success:true,openIssues:open.length,criticalIssues:open.filter(i=>i.priority==='Critical').length,slaBreached:breached.length,newTickets:tickets.filter(t=>t.status==='new').length,totalTickets:tickets.length};
    },
    // Notifications (in-app)
    getNotifications:()=>{
      const db=rDB();const now=new Date();
      const notes=[];
      // SLA breaching soon
      (db.issues||[]).filter(i=>i.assignedTo===su.email&&!['Resolved','Release Required','Closed'].includes(i.status)).forEach(i=>{
        const sla=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000);
        const hr=(sla-now)/3600000;
        if(hr<0)notes.push({type:'sla_breached',issueId:i.id,title:i.title,message:`SLA breached on ${i.id}`,at:i.createdDate});
        else if(hr<2)notes.push({type:'sla_risk',issueId:i.id,title:i.title,message:`SLA at risk: ${i.id} (${Math.round(hr*60)}m left)`,at:i.createdDate});
      });
      // Follow-ups due
      const today=now.toISOString().split('T')[0];
      (db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=today&&t.assignedTo===su.email).forEach(t=>{
        notes.push({type:'follow_up',ticketId:t.id,title:t.subject,message:`Follow-up due: ${t.id}`,at:t.followUpAt});
      });
      return{success:true,notifications:notes.slice(0,20),unread:notes.length};
    },
    // AI features — return empty/stub if no Gemini key
    getAITriage:(issueId)=>{const db=rDB();const key=(db.settings||{}).GEMINI_API_KEY||'';if(!key)return{success:false,error:'Add Gemini API key in Settings → Integrations'};return{success:true,triage:{priority:'Medium',module:'API',confidence:0.8,reason:'Gemini AI not called (stub)'}};},
    getAISprintPlan:(sprintId)=>{return{success:false,error:'Requires Gemini API key in Settings → Integrations'};},
    getDevLeaderboard:()=>{const db=rDB();const issues=db.issues||[];const devs={};(issues||[]).forEach(i=>{if(!i.assignedTo)return;if(!devs[i.assignedTo])devs[i.assignedTo]={email:i.assignedTo,resolved:0,open:0,avgHours:0,total:0};if(['Resolved','Release Required'].includes(i.status)){devs[i.assignedTo].resolved++;const h=i.resolvedDate&&i.createdDate?(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000:0;devs[i.assignedTo].avgHours+=h;}else devs[i.assignedTo].open++;devs[i.assignedTo].total++;});return{success:true,leaderboard:Object.values(devs).sort((a,b)=>b.resolved-a.resolved)};},
    getCFDData:()=>{const db=rDB();const issues=db.issues||[];const statuses=['Open','Acknowledged','WIP','Testing','Resolved'];const today=new Date().toISOString().split('T')[0];const data=statuses.map(s=>({status:s,count:issues.filter(i=>i.status===s).length}));return{success:true,data,date:today};},
    forecastResolution:(issueId)=>{const db=rDB();const issue=(db.issues||[]).find(i=>i.id===issueId);if(!issue)return{success:false,error:'Not found'};const similar=(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status)&&i.priority===issue.priority&&i.resolvedDate&&i.createdDate);const avg=similar.length?similar.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/similar.length:24;return{success:true,forecastHours:Math.round(avg*10)/10,basedOn:similar.length,confidence:similar.length>5?'high':similar.length>2?'medium':'low'};},
    getRepeatOffenders:()=>{const db=rDB();const titles={};(db.issues||[]).forEach(i=>{const k=i.module||'Unknown';titles[k]=(titles[k]||0)+1;});return{success:true,modules:Object.entries(titles).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([m,c])=>({module:m,count:c}))};},
    markAsDuplicate:(issueId,ofIssueId)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].isDuplicate=true;db.issues[idx].duplicateOf=ofIssueId;logActivity(db,issueId,`Marked as duplicate of ${ofIssueId}`,su.email);wDB(db);return{success:true};},
    removeWatcher:(issueId,email)=>{const db=rDB();db.watchers=db.watchers||[];db.watchers=db.watchers.filter(w=>!(w.issueId===issueId&&w.email===email));wDB(db);return{success:true};},
    addWatcher:(issueId,email)=>{const db=rDB();db.watchers=db.watchers||[];if(!db.watchers.find(w=>w.issueId===issueId&&w.email===email))db.watchers.push({issueId,email,addedAt:new Date().toISOString()});wDB(db);return{success:true};},
    getIssueHeatmap:()=>{const db=rDB();const modules={};(db.issues||[]).forEach(i=>{if(i.module){modules[i.module]=(modules[i.module]||0)+1;}});return{success:true,heatmap:Object.entries(modules).map(([m,c])=>({module:m,count:c})).sort((a,b)=>b.count-a.count)};},
    draftEscalationEmail:(issueId)=>{const db=rDB();const i=(db.issues||[]).find(x=>x.id===issueId);if(!i)return{success:false,error:'Not found'};return{success:true,draft:{to:i.assignedTo,subject:`[Escalation] ${i.id}: ${i.title}`,body:`This issue has exceeded its SLA deadline and requires immediate attention.\n\nIssue: ${i.id}\nTitle: ${i.title}\nPriority: ${i.priority}\nStatus: ${i.status}\n\nPlease update the status immediately.`}};},
    generateSprintRetrospective:(sprintId)=>{const db=rDB();const sprint=(db.sprints||[]).find(s=>s.id===sprintId);if(!sprint)return{success:false,error:'Sprint not found'};return{success:true,retrospective:{summary:'Sprint completed',velocity:sprint.completedPoints||0,feedback:'Add retrospective notes here'}};},
    submitQASignoff:(issueId,passed,notes)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].qaSignoff={passed:!!passed,notes:notes||'',signedBy:su.email,signedAt:new Date().toISOString()};if(passed)db.issues[idx].status='Resolved';logActivity(db,issueId,`QA ${passed?'approved':'rejected'}: ${notes||''}`,su.email);wDB(db);return{success:true};},
    markAsRegression:(issueId)=>{const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);if(idx===-1)return{success:false,error:'Not found'};db.issues[idx].isRegression=true;logActivity(db,issueId,'Marked as regression',su.email);wDB(db);return{success:true};},
    deleteAnnouncement:(id)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.announcements=(db.announcements||[]).filter(a=>a.id!==id);wDB(db);return{success:true};},


    // ══════════════════════════════════════════════════════════════════════
    // GROUP A: IN-APP NOTIFICATIONS (#8)
    // DB CHANGE: adds db.notifications — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getInAppNotifications:()=>{
      const db=rDB();const now=new Date();
      const notes=db.notifications||[];
      // Add system-generated notifications
      const sysNotes=[];
      // SLA at risk (assigned to me)
      (db.issues||[]).filter(i=>i.assignedTo===su.email&&!['Resolved','Release Required','Closed'].includes(i.status)).forEach(i=>{
        const sla=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000+(i.slaExtraMs||0));
        const hr=(sla-now)/3600000;
        if(hr<0)sysNotes.push({id:'sla_'+i.id,type:'sla_breach',title:'SLA Breached',body:i.title,issueId:i.id,at:now.toISOString(),read:false,icon:'🔴'});
        else if(hr<2)sysNotes.push({id:'slar_'+i.id,type:'sla_risk',title:'SLA at Risk',body:`${i.id}: ${i.title.substring(0,50)} — ${Math.round(hr*60)}m left`,issueId:i.id,at:now.toISOString(),read:false,icon:'🟡'});
      });
      // Follow-ups due today
      const today=now.toISOString().split('T')[0];
      (db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=today&&t.assignedTo===su.email).forEach(t=>{
        sysNotes.push({id:'fu_'+t.id,type:'follow_up',title:'Follow-up Due',body:t.subject.substring(0,60),ticketId:t.id,at:t.followUpAt,read:false,icon:'⏰'});
      });
      const all=[...sysNotes,...notes.filter(n=>n.userId===su.email||n.global)].slice(0,30);
      return{success:true,notifications:all,unread:all.filter(n=>!n.read).length};
    },
    markNotificationRead:(nId)=>{
      const db=rDB();db.notifications=db.notifications||[];
      const idx=db.notifications.findIndex(n=>n.id===nId);
      if(idx>=0){db.notifications[idx].read=true;wDB(db);}
      return{success:true};
    },
    markAllNotificationsRead:()=>{
      const db=rDB();db.notifications=db.notifications||[];
      db.notifications.filter(n=>n.userId===su.email).forEach(n=>{n.read=true;});
      wDB(db);return{success:true};
    },
    pushNotification:(userId,type,title,body,meta)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.notifications=db.notifications||[];
      db.notifications.unshift({id:generateId('NOT'),userId,type,title,body,meta:meta||{},at:new Date().toISOString(),read:false,icon:'🔔'});
      // Keep last 200 per brand
      db.notifications=db.notifications.slice(0,200);
      wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP A: API KEYS (#10)
    // DB CHANGE: adds db.apiKeys — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getApiKeys:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const gate=requireFeature(ff,'API_KEYS_ENABLED');if(gate)return gate;
      const db=rDB();
      return{success:true,keys:(db.apiKeys||[]).map(k=>({...k,key:k.key.substring(0,8)+'••••••••'+k.key.slice(-4)}))};
    },
    createApiKey:(name,permissions)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.apiKeys=db.apiKeys||[];
      const key='rslv_'+slug+'_'+require('crypto').randomBytes(24).toString('hex');
      const apiKey={id:generateId('KEY'),name:name||'API Key',key,permissions:permissions||['read'],createdBy:su.email,createdAt:new Date().toISOString(),lastUsed:null,active:true};
      db.apiKeys.push(apiKey);wDB(db);
      return{success:true,key,id:apiKey.id,warning:'Save this key — it will only be shown once!'};
    },
    revokeApiKey:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const idx=(db.apiKeys||[]).findIndex(k=>k.id===id);
      if(idx>=0){db.apiKeys[idx].active=false;wDB(db);}
      return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP B: KNOWLEDGE BASE (#3)
    // DB CHANGE: adds db.knowledgeBase — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getKBArticles:(categoryId,search)=>{
      const gate=requireFeature(ff,'KNOWLEDGE_BASE_ENABLED');if(gate)return gate;
      const db=rDB();let articles=db.knowledgeBase||[];
      if(categoryId)articles=articles.filter(a=>a.categoryId===categoryId);
      if(search){const q=search.toLowerCase();articles=articles.filter(a=>a.title.toLowerCase().includes(q)||(a.content||'').toLowerCase().includes(q));}
      articles=articles.filter(a=>a.published||su.role==='Admin');
      return{success:true,articles:articles.sort((a,b)=>b.views-a.views||new Date(b.updatedAt)-new Date(a.updatedAt))};
    },
    getKBCategories:()=>{const db=rDB();return{success:true,categories:db.kbCategories||[]};},
    saveKBArticle:(article)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.knowledgeBase=db.knowledgeBase||[];
      const id=article.id||generateId('KB');const idx=db.knowledgeBase.findIndex(a=>a.id===id);
      const now=new Date().toISOString();
      const saved={...article,id,updatedAt:now,updatedBy:su.email,views:article.views||0};
      if(!saved.createdAt)saved.createdAt=now;
      if(idx>=0)db.knowledgeBase[idx]=saved;else db.knowledgeBase.push(saved);
      wDB(db);return{success:true,id};
    },
    deleteKBArticle:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.knowledgeBase=(db.knowledgeBase||[]).filter(a=>a.id!==id);wDB(db);return{success:true};
    },
    saveKBCategory:(cat)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.kbCategories=db.kbCategories||[];
      const id=cat.id||generateId('KBC');const idx=db.kbCategories.findIndex(c=>c.id===id);
      if(idx>=0)db.kbCategories[idx]={...cat,id};else db.kbCategories.push({...cat,id,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    incrementKBViews:(id)=>{
      const db=rDB();const idx=(db.knowledgeBase||[]).findIndex(a=>a.id===id);
      if(idx>=0){db.knowledgeBase[idx].views=(db.knowledgeBase[idx].views||0)+1;wDB(db);}
      return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP B: PUBLIC ROADMAP (#9)
    // DB CHANGE: adds db.roadmapItems — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getRoadmapItems:(status)=>{
      const db=rDB();let items=db.roadmapItems||[];
      if(status)items=items.filter(i=>i.status===status);
      // Only show public items to non-admins
      if(su.role!=='Admin')items=items.filter(i=>i.public!==false);
      return{success:true,items:items.sort((a,b)=>b.votes-a.votes||new Date(b.updatedAt)-new Date(a.updatedAt))};
    },
    saveRoadmapItem:(item)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.roadmapItems=db.roadmapItems||[];
      const id=item.id||generateId('RM');const idx=db.roadmapItems.findIndex(r=>r.id===id);
      const now=new Date().toISOString();
      const saved={...item,id,updatedAt:now,updatedBy:su.email,votes:item.votes||0};
      if(!saved.createdAt)saved.createdAt=now;
      if(idx>=0)db.roadmapItems[idx]=saved;else db.roadmapItems.push(saved);
      wDB(db);return{success:true,id};
    },
    voteRoadmapItem:(id)=>{
      const db=rDB();const idx=(db.roadmapItems||[]).findIndex(r=>r.id===id);
      if(idx===-1)return{success:false,error:'Not found'};
      db.roadmapItems[idx].voters=db.roadmapItems[idx].voters||[];
      if(db.roadmapItems[idx].voters.includes(su.email))return{success:false,error:'Already voted'};
      db.roadmapItems[idx].voters.push(su.email);
      db.roadmapItems[idx].votes=(db.roadmapItems[idx].votes||0)+1;
      wDB(db);return{success:true,votes:db.roadmapItems[idx].votes};
    },
    deleteRoadmapItem:(id)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.roadmapItems=(db.roadmapItems||[]).filter(r=>r.id!==id);wDB(db);return{success:true};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP C: APPROVAL WORKFLOWS (#6)
    // DB CHANGE: adds db.approvalRules, issue.approvalStatus — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getApprovalRules:()=>{const db=rDB();return{success:true,rules:db.approvalRules||[]};},
    saveApprovalRule:(rule)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.approvalRules=db.approvalRules||[];
      const id=rule.id||generateId('APR');const idx=db.approvalRules.findIndex(r=>r.id===id);
      if(idx>=0)db.approvalRules[idx]={...rule,id};else db.approvalRules.push({...rule,id,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    requestApproval:(issueId,approverEmail,note)=>{
      const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);
      if(idx===-1)return{success:false,error:'Not found'};
      db.issues[idx].approvalStatus='pending';
      db.issues[idx].approvalRequestedBy=su.email;
      db.issues[idx].approvalRequestedAt=new Date().toISOString();
      db.issues[idx].approvalRequestedTo=approverEmail;
      db.issues[idx].approvalNote=note||'';
      logActivity(db,issueId,`Approval requested from ${approverEmail}`,su.email);
      wDB(db);
      // Notify approver
      sendBrandEmail(slug,approverEmail,`Approval Required: ${issueId}`,`<p>Hi,</p><p>${su.name||su.email} is requesting your approval to resolve issue <strong>${issueId}</strong>.</p>${note?'<p>Note: '+note+'</p>':''}<a href="${BASE_URL}">Review in Resolvo →</a>`,'Approval required').catch(()=>{});
      return{success:true};
    },
    approveIssue:(issueId,approved,comment)=>{
      const db=rDB();const idx=(db.issues||[]).findIndex(i=>i.id===issueId);
      if(idx===-1)return{success:false,error:'Not found'};
      // Check if approver
      if(db.issues[idx].approvalRequestedTo!==su.email&&su.role!=='Admin')return{success:false,error:'Not authorized to approve'};
      db.issues[idx].approvalStatus=approved?'approved':'rejected';
      db.issues[idx].approvalBy=su.email;db.issues[idx].approvalAt=new Date().toISOString();
      db.issues[idx].approvalComment=comment||'';
      if(approved)db.issues[idx].status='Resolved';
      logActivity(db,issueId,`${approved?'Approved':'Rejected'} by ${su.email}${comment?': '+comment:''}`,su.email);
      wDB(db);
      // Notify requester
      const requester=db.issues[idx].approvalRequestedBy;
      if(requester)sendBrandEmail(slug,requester,`Issue ${issueId} ${approved?'Approved ✅':'Rejected ❌'}`,`<p>${su.name||su.email} has ${approved?'approved':'rejected'} issue ${issueId}.${comment?'<br>Comment: '+comment:''}</p>`,`Issue ${issueId} ${approved?'approved':'rejected'}`).catch(()=>{});
      return{success:true};
    },
    getPendingApprovals:()=>{
      const db=rDB();
      const mine=(db.issues||[]).filter(i=>i.approvalStatus==='pending'&&(i.approvalRequestedTo===su.email||su.role==='Admin'));
      return{success:true,approvals:mine.map(i=>({id:i.id,title:i.title,requestedBy:i.approvalRequestedBy,requestedAt:i.approvalRequestedAt,note:i.approvalNote}))};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP C: 2FA / TWO-FACTOR AUTH (#16)
    // DB CHANGE: adds user.twoFA — backward safe
    // ══════════════════════════════════════════════════════════════════════
    setup2FA:()=>{
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.email===su.email);
      if(idx===-1)return{success:false,error:'Not found'};
      // Generate a TOTP secret (simplified — in production use speakeasy)
      const secret=require('crypto').randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi,'').substring(0,32).toUpperCase();
      db.users[idx].twoFASecret=secret;db.users[idx].twoFAPending=true;
      wDB(db);
      const otpauthUrl=`otpauth://totp/Resolvo:${su.email}?secret=${secret}&issuer=Resolvo`;
      return{success:true,secret,otpauthUrl,qrUrl:`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`};
    },
    verify2FA:(token)=>{
      const db=rDB();const user=(db.users||[]).find(u=>u.email===su.email);
      if(!user||!user.twoFASecret)return{success:false,error:'2FA not set up'};
      // Simple TOTP verification (30-second window, base32 secret)
      try{
        const time=Math.floor(Date.now()/30000);
        const crypto=require('crypto');
        const verify=(t)=>{
          const msg=Buffer.alloc(8);msg.writeBigInt64BE(BigInt(t),0);
          const key=Buffer.from(user.twoFASecret,'base32');
          const hmac=crypto.createHmac('sha1',key).update(msg).digest();
          const offset=hmac[hmac.length-1]&0xf;
          const code=((hmac[offset]&0x7f)<<24|(hmac[offset+1]&0xff)<<16|(hmac[offset+2]&0xff)<<8|(hmac[offset+3]&0xff))%1000000;
          return code===parseInt(token);
        };
        const valid=verify(time)||verify(time-1)||verify(time+1);
        if(valid){
          const idx=(db.users||[]).findIndex(u=>u.email===su.email);
          db.users[idx].twoFAEnabled=true;db.users[idx].twoFAPending=false;wDB(db);
          return{success:true,enabled:true};
        }
        return{success:false,error:'Invalid token. Please try again.'};
      }catch(e){return{success:false,error:'Verification failed: '+e.message};}
    },
    disable2FA:(password)=>{
      const db=rDB();const idx=(db.users||[]).findIndex(u=>u.email===su.email);
      if(idx===-1)return{success:false,error:'Not found'};
      const user=db.users[idx];
      if(!checkPwd(password,user.passwordHash))return{success:false,error:'Incorrect password'};
      db.users[idx].twoFAEnabled=false;db.users[idx].twoFASecret=null;
      wDB(db);return{success:true};
    },
    get2FAStatus:()=>{
      const db=rDB();const user=(db.users||[]).find(u=>u.email===su.email);
      return{success:true,enabled:!!(user&&user.twoFAEnabled),pending:!!(user&&user.twoFAPending)};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP D: ISSUE IMPACT SCORE (#23)
    // Calculated from: customer count, revenue, age, priority
    // ══════════════════════════════════════════════════════════════════════
    getIssueImpactScore:(issueId)=>{
      const db=rDB();const issue=(db.issues||[]).find(i=>i.id===issueId);
      if(!issue)return{success:false,error:'Not found'};
      const now=new Date();
      const ageHours=(now-new Date(issue.createdDate))/3600000;
      const sla=new Date(new Date(issue.createdDate).getTime()+(issue.slaHours||24)*3600000);
      const breached=now>sla&&!['Resolved','Release Required','Closed'].includes(issue.status);
      const priorityScore={Critical:40,High:25,Medium:10,Low:5}[issue.priority]||10;
      const ageScore=Math.min(30,Math.round(ageHours/24*5));
      const revenueScore=Math.min(20,(issue.revenueImpact||0)/1000);
      const slaScore=breached?10:0;
      const score=Math.min(100,priorityScore+ageScore+revenueScore+slaScore);
      return{success:true,score,breakdown:{priority:priorityScore,age:ageScore,revenue:revenueScore,sla:slaScore},label:score>=80?'Critical Impact':score>=50?'High Impact':score>=25?'Medium Impact':'Low Impact'};
    },
    getTopImpactIssues:(limit)=>{
      const db=rDB();const now=new Date();
      const open=(db.issues||[]).filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
      const scored=open.map(issue=>{
        const ageHours=(now-new Date(issue.createdDate))/3600000;
        const sla=new Date(new Date(issue.createdDate).getTime()+(issue.slaHours||24)*3600000);
        const breached=now>sla;
        const s={Critical:40,High:25,Medium:10,Low:5}[issue.priority]||10;
        const score=Math.min(100,s+Math.min(30,Math.round(ageHours/24*5))+Math.min(20,(issue.revenueImpact||0)/1000)+(breached?10:0));
        return{...issue,impactScore:score};
      }).sort((a,b)=>b.impactScore-a.impactScore).slice(0,parseInt(limit)||10);
      return{success:true,issues:scored};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP D: COST CALCULATOR (#21)
    // ══════════════════════════════════════════════════════════════════════
    getCostReport:(hourlyRate,dateFrom,dateTo)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const gate=requireFeature(ff,'COST_REPORT_ENABLED');if(gate)return gate;
      const db=rDB();const rate=parseFloat(hourlyRate)||500;
      const from=dateFrom?new Date(dateFrom):new Date(Date.now()-30*86400000);
      const to=dateTo?new Date(dateTo+'T23:59:59'):new Date();
      const logs=(db.timeLogs||[]).filter(l=>new Date(l.date||l.createdAt)>=from&&new Date(l.date||l.createdAt)<=to);
      const totalHours=Math.round(logs.reduce((s,l)=>s+(parseFloat(l.hours)||0),0)*10)/10;
      const totalCost=Math.round(totalHours*rate);
      // By user
      const byUser={};logs.forEach(l=>{byUser[l.loggedBy]=(byUser[l.loggedBy]||0)+(parseFloat(l.hours)||0);});
      // By module
      const byModule={};logs.forEach(l=>{const issue=(db.issues||[]).find(i=>i.id===l.issueId);const m=(issue&&issue.module)||'Unknown';byModule[m]=(byModule[m]||0)+(parseFloat(l.hours)||0);});
      return{success:true,totalHours,totalCost,rate,currency:'INR',
        byUser:Object.entries(byUser).map(([email,hours])=>({email,hours:Math.round(hours*10)/10,cost:Math.round(hours*rate)})).sort((a,b)=>b.cost-a.cost),
        byModule:Object.entries(byModule).map(([module,hours])=>({module,hours:Math.round(hours*10)/10,cost:Math.round(hours*rate)})).sort((a,b)=>b.cost-a.cost),
        dateRange:{from:from.toISOString().split('T')[0],to:to.toISOString().split('T')[0]}
      };
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP D: AGENT COACHING DASHBOARD (#22)
    // ══════════════════════════════════════════════════════════════════════
    getAgentCoachingData:()=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();const tickets=db.tickets||[];const issues=db.issues||[];
      const agents=(db.users||[]).filter(u=>u.active);
      const coaching=agents.map(agent=>{
        const myTickets=tickets.filter(t=>t.assignedTo===agent.email);
        const resolved=myTickets.filter(t=>t.status==='resolved'||t.status==='closed');
        const csatScores=resolved.filter(t=>t.csatScore!=null).map(t=>t.csatScore);
        const avgCSAT=csatScores.length?Math.round(csatScores.reduce((a,b)=>a+b,0)/csatScores.length):null;
        const frTimes=myTickets.filter(t=>t.firstResponseMinutes!=null).map(t=>t.firstResponseMinutes);
        const avgFRT=frTimes.length?Math.round(frTimes.reduce((a,b)=>a+b,0)/frTimes.length):null;
        const myIssues=issues.filter(i=>i.assignedTo===agent.email);
        const resolvedIssues=myIssues.filter(i=>['Resolved','Release Required'].includes(i.status)&&i.resolvedDate&&i.createdDate);
        const avgResHours=resolvedIssues.length?Math.round(resolvedIssues.reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolvedIssues.length*10)/10:null;
        // Coaching insights
        const insights=[];
        if(avgFRT&&avgFRT>120)insights.push({type:'warning',text:`First response avg ${avgFRT}m — aim for under 60m`});
        if(avgCSAT&&avgCSAT<70)insights.push({type:'warning',text:`CSAT ${avgCSAT}% — needs improvement`});
        if(myTickets.filter(t=>!['resolved','closed'].includes(t.status)&&(Date.now()-new Date(t.createdDate).getTime())>48*3600000).length>3)insights.push({type:'warning',text:'Several tickets stale >48h — check queue'});
        if(avgCSAT&&avgCSAT>=90)insights.push({type:'good',text:`Excellent CSAT ${avgCSAT}% — great customer service!`});
        if(avgFRT&&avgFRT<30)insights.push({type:'good',text:`Lightning fast ${avgFRT}m first response!`});
        return{email:agent.email,name:agent.name||agent.email,role:agent.role,avgCSAT,avgFirstResponseMin:avgFRT,avgIssueResolutionHours:avgResHours,ticketsResolved:resolved.length,issuesResolved:resolvedIssues.length,openTickets:myTickets.filter(t=>!['resolved','closed'].includes(t.status)).length,insights};
      });
      return{success:true,coaching:coaching.sort((a,b)=>(b.ticketsResolved||0)-(a.ticketsResolved||0))};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP D: CUSTOMER SENTIMENT TREND (#12)
    // ══════════════════════════════════════════════════════════════════════
    getCustomerSentimentTrend:(email)=>{
      const db=rDB();
      const customerTickets=(db.tickets||[]).filter(t=>t.from&&t.from.toLowerCase()===(email||'').toLowerCase())
        .sort((a,b)=>new Date(a.createdDate)-new Date(b.createdDate));
      const trends=customerTickets.map(t=>({ticketId:t.id,date:t.createdDate,sentiment:t.sentimentScore,level:t.sentimentLevel,csat:t.csatRating}));
      const recent5=trends.slice(-5);
      const avgSentiment=recent5.length?Math.round(recent5.reduce((s,t)=>s+(t.sentiment||60),0)/recent5.length):null;
      const trending=recent5.length>=3?(recent5[recent5.length-1].sentiment||60)-(recent5[0].sentiment||60):0;
      const churnRisk=avgSentiment&&avgSentiment<35?'high':avgSentiment&&avgSentiment<55?'medium':'low';
      return{success:true,email,trends,avgSentiment,trending,churnRisk,totalTickets:customerTickets.length,recommendation:churnRisk==='high'?'Proactive outreach recommended — customer showing frustration pattern':churnRisk==='medium'?'Monitor closely — sentiment declining':null};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP E: GDPR / DATA COMPLIANCE (#19)
    // ══════════════════════════════════════════════════════════════════════
    gdprErasure:(customerEmail)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();let erasedCount=0;
      // Anonymize tickets from that email
      (db.tickets||[]).forEach((t,i)=>{
        if(t.from&&t.from.toLowerCase()===customerEmail.toLowerCase()){
          db.tickets[i].from='[deleted]';db.tickets[i].fromName='[deleted]';
          db.tickets[i].thread=(t.thread||[]).map(m=>({...m,from:m.from===t.from?'[deleted]':m.from,fromName:m.fromName===t.fromName?'[deleted]':m.fromName}));
          if(db.customerNotes)delete db.customerNotes[customerEmail.toLowerCase()];
          erasedCount++;
        }
      });
      wDB(db);
      return{success:true,erased:erasedCount,message:`Erased ${erasedCount} records for ${customerEmail}`};
    },
    gdprExport:(customerEmail)=>{
      const db=rDB();
      const tickets=(db.tickets||[]).filter(t=>t.from&&t.from.toLowerCase()===customerEmail.toLowerCase());
      const notes=(db.customerNotes||{})[customerEmail.toLowerCase()]||[];
      const appointments=(db.appointments||[]).filter(a=>a.customerEmail&&a.customerEmail.toLowerCase()===customerEmail.toLowerCase());
      return{success:true,email:customerEmail,exportedAt:new Date().toISOString(),data:{tickets:tickets.map(t=>({id:t.id,subject:t.subject,status:t.status,date:t.createdDate})),notes,appointments}};
    },

    // ══════════════════════════════════════════════════════════════════════
    // GROUP E: SLA POLICIES PER CUSTOMER (#18)
    // DB CHANGE: adds db.slaPolicies — backward safe
    // ══════════════════════════════════════════════════════════════════════
    getSlaPolicies:()=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();return{success:true,policies:db.slaPolicies||[]};},
    saveSlaPolicy:(policy)=>{
      if(su.role!=='Admin')return{success:false,error:'Admin only'};
      const db=rDB();db.slaPolicies=db.slaPolicies||[];
      const id=policy.id||generateId('SLP');const idx=db.slaPolicies.findIndex(p=>p.id===id);
      if(idx>=0)db.slaPolicies[idx]={...policy,id};else db.slaPolicies.push({...policy,id,createdAt:new Date().toISOString()});
      wDB(db);return{success:true,id};
    },
    deleteSlaPolicy:(id)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.slaPolicies=(db.slaPolicies||[]).filter(p=>p.id!==id);wDB(db);return{success:true};},

    // Stubs
    syncIssuesToCalendar:()=>({success:false,error:'Not available.'}),getCalendarStatus:()=>({success:true,configured:false}),getEmailTimeline:()=>({success:true,timeline:[]}),getEmailSummary:()=>({success:true,summary:null}),getEmailParticipants:()=>({success:true,participants:[]}),getInboundRules:()=>({success:true,rules:[]}),saveInboundRule:()=>({success:true}),deleteInboundRule:()=>({success:true}),exportIssueToPDF:()=>({success:false,error:'Use browser Print > Save as PDF.'}),exportDashboardReport:()=>({success:false,error:'Use browser print.'}),getAutoTagRules:()=>({success:true,rules:[]}),saveAutoTagRule:()=>({success:true}),deleteAutoTagRule:()=>({success:true}),checkDueDateReminders:()=>({success:true}),runSmartEscalation:()=>({success:true}),runEscalationCheck:()=>({success:true,escalated:0}),
  };

  const ah=aH[fn];if(ah){try{return res.json(await ah(...args));}catch(e){return res.json({success:false,error:e.message});}}
  const sh=sH[fn];if(!sh)return res.json({success:false,error:`Unknown function: ${fn}`});
  try{res.json(sh(...args));}catch(e){res.json({success:false,error:e.message});}
});

app.get('/api/backup',(req,res)=>{
  if(req.query.token&&!req.headers['x-session-token'])req.headers['x-session-token']=req.query.token;
  const su=getSessionUser(req);if(!su||su.role!=='Admin')return res.status(403).send('Admin only');const db=readBrandDB(su.brandSlug);res.setHeader('Content-Disposition',`attachment; filename=${su.brandSlug}-backup-${new Date().toISOString().split('T')[0]}.json`);res.setHeader('Content-Type','application/json');res.send(JSON.stringify(db,null,2));});

// ── FEATURE B: CSV export routes ──────────────────────────────────────────────
// Supports token via query param (?token=...) for browser direct downloads
app.get('/api/export/:type',(req,res)=>{
  // Read token from header OR query param (needed for <a href> downloads)
  const tokenFromQuery=req.query.token;
  if(tokenFromQuery&&!req.headers['x-session-token'])req.headers['x-session-token']=tokenFromQuery;
  const su=getSessionUser(req);if(!su)return res.status(401).send('Not logged in — please log in first');
  const type=req.params.type;const slug=su.brandSlug;
  const db=readBrandDB(slug);const now=new Date();
  const dateStr=now.toISOString().split('T')[0];
  // Date range from query params
  const dateFrom=req.query.from?new Date(req.query.from):null;
  const dateTo=req.query.to?new Date(req.query.to+'T23:59:59'):null;
  function inRange(d){if(!d)return true;const dt=new Date(d);if(dateFrom&&dt<dateFrom)return false;if(dateTo&&dt>dateTo)return false;return true;}
  function esc(v){return v==null?'':'"'+String(v).replace(/"/g,"'").replace(/\n/g,' ')+'"';}
  let csv='',filename='';
  try{
    if(type==='issues'){
      let issues=(db.issues||[]).filter(i=>inRange(i.createdDate));
      filename=`${slug}-issues-${dateStr}.csv`;
      const header='ID,Title,Status,Priority,Module,AssignedTo,RaisedBy,CreatedDate,StartedDate,ResolvedDate,ClosedDate,SLAHours,SLADeadline,SLABreached,ResolutionHours,Environment,Impact,RevenueImpact,SprintID,Tags,Source';
      const rows=issues.map(i=>{
        const slaDeadline=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000+(i.slaExtraMs||0));
        const breached=now>slaDeadline&&!['Resolved','Release Required','Closed'].includes(i.status);
        const resHours=i.resolvedDate&&i.createdDate?Math.round((new Date(i.resolvedDate)-new Date(i.createdDate))/360000)/10:'';
        return[i.id,esc(i.title),i.status,i.priority,i.module||'',i.assignedTo||'',i.raisedBy||'',(i.createdDate||'').substring(0,10),(i.startedDate||'').substring(0,10),(i.resolvedDate||'').substring(0,10),(i.closedDate||'').substring(0,10),i.slaHours||24,slaDeadline.toISOString().substring(0,10),breached?'Yes':'No',resHours,esc(i.environment),esc(i.impact),i.revenueImpact||'',i.sprintId||'',(i.tags||[]).join(';'),i.source||'manual'].join(',');
      });
      csv=header+'\n'+rows.join('\n');
    } else if(type==='tickets'){
      if(su.role!=='Admin')return res.status(403).send('Admin only');
      let tickets=(db.tickets||[]).filter(t=>inRange(t.createdDate));
      filename=`${slug}-tickets-${dateStr}.csv`;
      const header='ID,Subject,Status,Priority,From,FromName,AssignedTo,CreatedDate,LastActivity,ResolvedDate,TotalMessages,AgentReplies,IncomingMessages,FirstResponseMinutes,CSATRating,CSATScore,SlaPaused,Tags,Source,LinkedIssueID,ParentID';
      const rows=tickets.map(t=>{
        const thread=t.thread||[];
        const agentReplies=thread.filter(m=>m.type==='reply'&&m.from!==t.from).length;
        const incomingMsgs=thread.filter(m=>m.type==='incoming').length;
        return[t.id,esc(t.subject),t.status,t.priority||'Medium',t.from||'',esc(t.fromName),t.assignedTo||'',(t.createdDate||'').substring(0,10),(t.lastActivity||'').substring(0,10),(t.resolvedDate||'').substring(0,10),thread.length,agentReplies,incomingMsgs,t.firstResponseMinutes??'',t.csatRating||'',t.csatScore??'',t.slaPaused?'Yes':'No',(t.tags||[]).join(';'),t.source||'email',t.linkedIssueId||'',t.parentId||''].join(',');
      });
      csv=header+'\n'+rows.join('\n');
    } else if(type==='users'){
      if(su.role!=='Admin')return res.status(403).send('Admin only');
      const users=db.users||[];const issues=db.issues||[];const tickets=db.tickets||[];const timeLogs=db.timeLogs||[];
      filename=`${slug}-users-${dateStr}.csv`;
      const header='ID,Email,Name,Role,Team,Active,CreatedDate,IssuesRaised,IssuesAssigned,IssuesResolved,IssuesOpen,TicketsAssigned,TicketsResolved,TotalHoursLogged,SLABreaches,AvgResolutionHours';
      const rows=users.map(u=>{
        const raised=issues.filter(i=>i.raisedBy===u.email).length;
        const assigned=issues.filter(i=>i.assignedTo===u.email);
        const resolved=assigned.filter(i=>['Resolved','Release Required','Closed'].includes(i.status));
        const open=assigned.filter(i=>!['Resolved','Release Required','Closed'].includes(i.status));
        const breached=open.filter(i=>{const d=new Date(new Date(i.createdDate).getTime()+(i.slaHours||24)*3600000);return now>d;}).length;
        const avgRes=resolved.filter(i=>i.resolvedDate&&i.createdDate).length>0?Math.round(resolved.filter(i=>i.resolvedDate&&i.createdDate).reduce((s,i)=>s+(new Date(i.resolvedDate)-new Date(i.createdDate))/3600000,0)/resolved.filter(i=>i.resolvedDate&&i.createdDate).length*10)/10:'';
        const tAssigned=tickets.filter(t=>t.assignedTo===u.email);
        const tResolved=tAssigned.filter(t=>['resolved','closed'].includes(t.status));
        const hours=Math.round(timeLogs.filter(l=>l.loggedBy===u.email).reduce((s,l)=>s+(parseFloat(l.hours)||0),0)*10)/10;
        return[u.id,u.email,esc(u.name),u.role,u.team||'',u.active?'Yes':'No',(u.createdDate||'').substring(0,10),raised,assigned.length,resolved.length,open.length,tAssigned.length,tResolved.length,hours,breached,avgRes].join(',');
      });
      csv=header+'\n'+rows.join('\n');
    } else if(type==='audit'){
      if(su.role!=='Admin')return res.status(403).send('Admin only');
      const logs=[...(db.auditTrail||[]),...(db.activityLog||[])].filter(l=>inRange(l.timestamp||l.at)).sort((a,b)=>new Date(b.timestamp||b.at||0)-new Date(a.timestamp||a.at||0));
      filename=`${slug}-audit-${dateStr}.csv`;
      const header='IssueID,Action,User,Timestamp,Details';
      const rows=logs.map(l=>[(l.issueId||''),(l.action||l.activity||'').replace(/,/g,' '),(l.user||l.by||''),(l.timestamp||l.at||'').substring(0,19),esc(l.details?JSON.stringify(l.details):'')].join(','));
      csv=header+'\n'+rows.join('\n');
    } else {
      return res.status(400).send('Unknown export type. Use: issues, tickets, users, audit');
    }
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Cache-Control','no-cache');
    res.send('﻿'+csv); // BOM for Excel UTF-8 compatibility
  }catch(e){console.error('[Export]',e);res.status(500).send('Export error: '+e.message);}
});
app.post('/api/restore',(req,res)=>{const su=getSessionUser(req);if(!su||su.role!=='Admin')return res.status(403).json({error:'Admin only'});try{writeBrandDB(su.brandSlug,req.body);res.json({success:true});}catch(e){res.json({success:false,error:e.message});}});
app.get('/api/external/sync',async(req,res)=>res.json({success:false,error:'Configure in Admin > API Integration.'}));

// ── Base URL management (owner can update without restarting server) ───────────
app.get('/api/owner/base-url',ownerOnly,(req,res)=>{
  res.json({success:true,baseUrl:BASE_URL});
});

app.post('/api/owner/base-url',ownerOnly,(req,res)=>{
  const{baseUrl}=req.body;
  if(!baseUrl||!baseUrl.startsWith('http'))return res.json({success:false,error:'Invalid URL'});
  const cleanUrl=baseUrl.trim().replace(/\/$/,'');

  // Update in-memory immediately (no restart needed for current session)
  // Note: won't persist after server restart unless .env is updated
  global.BASE_URL_OVERRIDE=cleanUrl;

  // Update .env file so it persists after restart
  try{
    const envPath=path.join(__dirname,'.env');
    let envContent=fs.readFileSync(envPath,'utf8');
    if(envContent.match(/^BASE_URL=.*/m)){
      envContent=envContent.replace(/^BASE_URL=.*/m,`BASE_URL=${cleanUrl}`);
    } else {
      envContent+=`\nBASE_URL=${cleanUrl}\n`;
    }
    fs.writeFileSync(envPath,envContent,'utf8');
    console.log('[BASE_URL] Updated to:',cleanUrl);
  }catch(e){console.error('[BASE_URL] Could not write .env:',e.message);}

  res.json({success:true,baseUrl:cleanUrl,message:'URL updated. Will take full effect after server restart.'});
});

// CSAT survey response endpoint
app.get('/csat',(req,res)=>{
  const{token,rating}=req.query;
  if(!token)return res.send('<html><body><p>Invalid survey link.</p></body></html>');
  // Find brand from token
  const BRANDS_DIR_local=path.join(__dirname,'data','brands');
  let found=false;
  try{
    const dirs=fs.readdirSync(BRANDS_DIR_local);
    for(const slug of dirs){
      const dbPath=path.join(BRANDS_DIR_local,slug,'db.json');
      if(!fs.existsSync(dbPath))continue;
      const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
      const surveys=db.csatSurveys||[];
      const idx=surveys.findIndex(s=>s.token===token);
      if(idx>=0){
        found=true;
        if(rating&&!surveys[idx].rating){
          surveys[idx].rating=parseInt(rating);
          surveys[idx].respondedAt=new Date().toISOString();
          db.csatSurveys=surveys;
          fs.writeFileSync(dbPath,JSON.stringify(db,null,2));
        }
        const r=surveys[idx].rating;
        const emoji=r>=4?'😊':r>=3?'😐':'😕';
        const msg=r>=4?'Thank you! We\'re glad we could help.':r>=3?'Thank you for your feedback. We\'ll work to improve.':'We\'re sorry to hear that. We\'ll do better next time.';
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Thank You</title></head><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;"><div style="max-width:400px;text-align:center;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08);"><div style="font-size:52px;margin-bottom:16px;">${emoji}</div><h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#111827;">${msg}</h2>${r?'<div style="margin:16px 0;font-size:32px;">'+'⭐'.repeat(r)+'</div>':''}<p style="color:#6b7280;font-size:14px;margin:10px 0 0;">You rated your experience: <strong>${r||'?'}/5</strong></p><p style="color:#9ca3af;font-size:12px;margin:16px 0 0;">Powered by Resolvo</p></div></body></html>`);
      }
    }
  }catch(e){}
  if(!found)res.send('<html><body style="font-family:Arial;padding:40px;text-align:center;"><h2>Survey not found or already completed.</h2></body></html>');
});

// 1-click CSAT for support tickets (different from issue CSAT surveys)
app.get('/csat-ticket',(req,res)=>{
  const{token,rating}=req.query;
  if(!token)return res.send('<html><body><p>Invalid link.</p></body></html>');
  try{
    const payload=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
    const{ticketId,slug}=payload;
    const db=readBrandDB(slug);
    const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
    if(idx===-1)return res.send('<html><body><p>Ticket not found.</p></body></html>');
    if(rating&&!db.tickets[idx].csatRating){
      db.tickets[idx].csatScore=rating==='yes'?100:0;
      db.tickets[idx].csatRating=rating;
      db.tickets[idx].csatAt=new Date().toISOString();
      db.tickets[idx].timeline=db.tickets[idx].timeline||[];
      db.tickets[idx].timeline.push({event:'csat_received',by:'customer',byName:db.tickets[idx].fromName||'Customer',at:new Date().toISOString(),detail:`Rating: ${rating}`});
      writeBrandDB(slug,db);
    }
    const isYes=db.tickets[idx].csatRating==='yes';
    const alreadyDone=!!db.tickets[idx].csatRating&&!rating;
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Feedback</title></head><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;"><div style="max-width:400px;text-align:center;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08);"><div style="font-size:52px;margin-bottom:16px;">${alreadyDone?'✅':isYes?'🎉':'😔'}</div><h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#111827;">${alreadyDone?'Already recorded!':isYes?'Thanks for the thumbs up!':'Sorry to hear that!'}</h2><p style="color:#6b7280;font-size:14px;margin:10px 0 0;">${alreadyDone?'Your feedback was already recorded.':isYes?'We\'re glad we could help you.':'We\'ll work hard to do better.'}</p><p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">Ref: ${ticketId} · Powered by Resolvo</p></div></body></html>`);
  }catch(e){return res.send('<html><body><p>Invalid link.</p></body></html>');}
});

// ── PUBLIC SELF-SIGNUP (no auth — creates trial brand) ─────────────────────
app.post('/api/signup',async(req,res)=>{
  const{name,email,company,password,ref}=req.body;
  if(!name||!email||!company)return res.json({success:false,error:'Name, email and company required.'});
  if(!email.includes('@'))return res.json({success:false,error:'Invalid email.'});
  const owner=readOwner();
  // Check email not already registered
  const existing=(owner.brands||[]).find(b=>b.majorAdminEmail===email);
  if(existing)return res.json({success:false,error:'An account with this email already exists. Please log in.'});
  // Generate slug from company name
  let slug=company.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').substring(0,30);
  if(!slug)slug='brand-'+Date.now();
  // Ensure unique slug
  let finalSlug=slug;let i=2;
  while((owner.brands||[]).find(b=>b.slug===finalSlug)){finalSlug=slug+'-'+i;i++;}
  const pass=password||email.split('@')[0]+'@'+Math.floor(1000+Math.random()*9000);
  fs.mkdirSync(path.join(BRANDS_DIR,finalSlug),{recursive:true});
  writeBrandDB(finalSlug,defaultBrandDB(company,email,name,pass));
  const brand={id:generateId('BRD'),slug:finalSlug,name:company,logoUrl:'',accentColor:'#10B981',theme:'midnight',status:'active',tier:'Free',majorAdminEmail:email,createdDate:new Date().toISOString(),lastActive:null,limits:{maxUsers:10,maxIssues:100}};
  owner.brands=owner.brands||[];owner.brands.push(brand);
  ownerAuditLog(owner,'brand_created',{brandSlug:finalSlug,brandName:company,source:'self-signup',ref:ref||null},owner.email);
  // Track referral if ref code provided
  if(ref&&owner.referrals&&owner.referrals[ref]){
    owner.referrals[ref].uses=(owner.referrals[ref].uses||0)+1;
    owner.referrals[ref].lastUsed=new Date().toISOString();
    // Free month for referrer — add note (manual credit for now)
    const refIdx=(owner.brands||[]).findIndex(b=>b.slug===owner.referrals[ref].slug);
    if(refIdx>=0){owner.brands[refIdx].referralCredits=(owner.brands[refIdx].referralCredits||0)+1;}
    console.log(`[Referral] Code ${ref} used by ${email} — referrer: ${owner.referrals[ref].email}`);
  }
  writeOwner(owner);
  // Send welcome email
  const welcomeHtml=`<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:24px 16px;"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="background:linear-gradient(135deg,#10B981,#6366F1);padding:32px;text-align:center;"><div style="font-size:36px;margin-bottom:10px;">🎉</div><h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">Welcome to Resolvo!</h1><p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px;">Your account is ready</p></div><div style="padding:28px 32px;"><p style="font-size:15px;color:#374151;">Hi <strong>${name}</strong>,</p><p style="font-size:14px;color:#374151;line-height:1.7;">Your Resolvo workspace for <strong>${company}</strong> is live and ready. Here are your login details:</p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:16px 0;border:1px solid #e5e7eb;"><div style="font-size:13px;color:#6b7280;margin-bottom:6px;"><strong>Login URL:</strong> <a href="${BASE_URL}" style="color:#10B981;">${BASE_URL}</a></div><div style="font-size:13px;color:#6b7280;margin-bottom:6px;"><strong>Email:</strong> ${email}</div><div style="font-size:13px;color:#6b7280;"><strong>Password:</strong> <span style="font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;">${pass}</span></div></div><p style="font-size:13px;color:#6b7280;">Please change your password after first login.</p><div style="text-align:center;margin-top:20px;"><a href="${BASE_URL}" style="display:inline-block;padding:13px 40px;background:linear-gradient(135deg,#10B981,#6366F1);color:#fff;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;">Open Your Workspace →</a></div></div><div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;"><p style="font-size:12px;color:#9ca3af;margin:0;">Need help? <a href="mailto:contact@resolvogroup.com" style="color:#10B981;">contact@resolvogroup.com</a></p></div></div></body></html>`;
  await sendEmail(email,`🎉 Welcome to Resolvo — ${company} is live!`,welcomeHtml,`Your Resolvo workspace is ready. Login: ${BASE_URL} | Email: ${email} | Password: ${pass}`).catch(()=>{});
  // Notify owner
  sendEmail(owner.email,`New signup: ${company} (${email})`,`<p>New self-signup on Resolvo:</p><p><strong>Company:</strong> ${company}<br><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Slug:</strong> ${finalSlug}<br><strong>Tier:</strong> Free<br><strong>Time:</strong> ${new Date().toLocaleString()}</p>`,`New signup: ${company} — ${email}`).catch(()=>{});
  res.json({success:true,message:'Account created! Check your email for login details.',slug:finalSlug});
});

// ── DEMO REQUEST ─────────────────────────────────────────────────────────────
app.post('/api/demo-request',async(req,res)=>{
  const{name,email,company,message}=req.body;
  if(!name||!email)return res.json({success:false,error:'Name and email required.'});
  const owner=readOwner();
  await sendEmail(owner.email,`Demo Request: ${name} from ${company||'unknown'}`,`<p><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Company:</strong> ${company||'—'}<br><strong>Message:</strong> ${message||'—'}</p><p><a href="mailto:${email}">Reply to ${name}</a></p>`,`Demo request from ${name} (${email}) — ${company||''}`).catch(()=>{});
  // Auto-reply to prospect
  await sendEmail(email,`Thanks for your interest in Resolvo!`,`<div style="font-family:Arial;max-width:500px;margin:0 auto;padding:24px;"><h2 style="color:#10B981;">Hi ${name}! 👋</h2><p>Thank you for your interest in Resolvo. We've received your request and will be in touch within 24 hours.</p><p>In the meantime, feel free to start a free trial:</p><a href="${BASE_URL}" style="display:inline-block;padding:12px 32px;background:#10B981;color:#000;border-radius:8px;text-decoration:none;font-weight:700;">Start Free Trial →</a><p style="margin-top:20px;color:#6b7280;font-size:13px;">— Team Resolvo<br><a href="mailto:contact@resolvogroup.com">contact@resolvogroup.com</a></p></div>`,`Hi ${name}, we received your demo request and will be in touch shortly.`).catch(()=>{});
  res.json({success:true,message:'Request received! Check your email — we\'ll be in touch within 24 hours.'});
});

// ── SEO LANDING PAGES ─────────────────────────────────────────────────────────
app.get('/for/engineering-teams',(req,res)=>res.redirect('/pitch'));
app.get('/for/support-teams',(req,res)=>res.redirect('/pitch'));
app.get('/vs/jira',(req,res)=>res.sendFile(path.join(__dirname,'public','vs-jira.html')));
app.get('/vs/freshdesk',(req,res)=>res.sendFile(path.join(__dirname,'public','vs-freshdesk.html')));
app.get('/vs/zendesk',(req,res)=>res.sendFile(path.join(__dirname,'public','vs-zendesk.html')));
app.get('/vs/linear',(req,res)=>res.sendFile(path.join(__dirname,'public','vs-linear.html')));
app.get('/pricing',(req,res)=>res.redirect('/pitch#pricing'));
app.get('/demo',(req,res)=>res.sendFile(path.join(__dirname,'public','demo.html')));
app.get('/signup',(req,res)=>res.sendFile(path.join(__dirname,'public','signup.html')));

// ── BLOG ROUTES ──────────────────────────────────────────────────────────────
const BLOG_DIR=path.resolve(__dirname,'public');
app.get('/blog',      (req,res)=>res.sendFile('blog-index.html',{root:BLOG_DIR}));
app.get('/blog/',     (req,res)=>res.sendFile('blog-index.html',{root:BLOG_DIR}));
app.get('/blog/:slug',(req,res)=>{
  const f='blog-'+req.params.slug+'.html';
  const p=path.join(BLOG_DIR,f);
  if(fs.existsSync(p))return res.sendFile(f,{root:BLOG_DIR});
  res.sendFile('blog-index.html',{root:BLOG_DIR});
});

// ── SEO FILES ─────────────────────────────────────────────────────────────────
app.get('/sitemap.xml',(req,res)=>res.sendFile('sitemap.xml',{root:BLOG_DIR}));
app.get('/robots.txt',(req,res)=>{
  res.setHeader('Content-Type','text/plain');
  res.send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\nSitemap: '+BASE_URL+'/sitemap.xml\n');
});

// Architecture page — owner password protected
app.get('/architecture',(req,res)=>{
  const owner=readOwner();
  const provided=req.query.key||req.headers['x-arch-key']||'';
  // Check against owner password (plain or hash)
  const valid=provided===owner.passwordHash||provided===owner.email+':arch'||provided==='arch_'+owner.passwordHash.substring(0,8);
  if(!valid){
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Architecture — Resolvo</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#06070A;color:#F1F5F9;font-family:Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;}
.box{background:#0F131C;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:40px;width:100%;max-width:380px;text-align:center;}
.icon{font-size:40px;margin-bottom:16px;}h2{font-size:20px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px;}
p{font-size:13px;color:#475569;margin-bottom:24px;}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:12px 16px;font-size:14px;color:#F1F5F9;outline:none;font-family:inherit;margin-bottom:12px;}
input:focus{border-color:#22D3EE;}
button{width:100%;background:linear-gradient(135deg,#22D3EE,#818CF8);color:#000;border:none;border-radius:9px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;}
</style></head><body>
<div class="box">
  <div class="icon">🔐</div>
  <h2>Architecture Docs</h2>
  <p>Owner access only. Enter your password to continue.</p>
  <input type="password" id="k" placeholder="Owner password" onkeydown="if(event.key==='Enter')go()">
  <button onclick="go()">Access Architecture →</button>
</div>
<script>function go(){var k=document.getElementById('k').value;if(k)window.location.href='/architecture?key='+encodeURIComponent(k);}</script>
</body></html>`);
  }
  res.sendFile('architecture.html',{root:path.join(__dirname,'public')});
});
app.get('/pitch',(req,res)=>res.sendFile(path.join(__dirname,'public','pitch.html')));
app.get('/learn',(req,res)=>res.sendFile(path.join(__dirname,'public','learn.html')));

// ── PUBLIC ROADMAP (/roadmap/:slug) ────────────────────────────────────────
app.get('/roadmap/:slug',(req,res)=>{
  const db=readBrandDB(req.params.slug);
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug)||{};
  const accent=brand.accentColor||'#10B981';const brandName=brand.name||'Roadmap';
  const items=(db.roadmapItems||[]).filter(i=>i.public!==false);
  const planned=items.filter(i=>i.status==='planned').sort((a,b)=>b.votes-a.votes);
  const inprogress=items.filter(i=>i.status==='in-progress');
  const shipped=items.filter(i=>i.status==='shipped').slice(0,10);
  const card=(item,canVote)=>`<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:10px;display:flex;align-items:flex-start;gap:14px;">
    <div style="text-align:center;min-width:48px;"><button onclick="voteItem('${item.id}',this)" style="background:${accent}18;border:1px solid ${accent}44;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700;color:${accent};font-size:13px;">▲<br><span>${item.votes||0}</span></button></div>
    <div style="flex:1;"><div style="font-size:14px;font-weight:700;color:#111827;">${item.title||''}</div>${item.description?'<div style="font-size:13px;color:#6b7280;margin-top:4px;">'+item.description+'</div>':''}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${(item.tags||[]).map(t=>'<span style="font-size:11px;background:#f3f4f6;padding:2px 8px;border-radius:12px;color:#374151;">'+t+'</span>').join('')}</div></div></div>`;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brandName} Roadmap</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#f8fafc;font-family:-apple-system,Arial,sans-serif;color:#111827;}.container{max-width:800px;margin:0 auto;padding:24px 16px;}.header{background:linear-gradient(135deg,${accent},${accent}cc);padding:32px;border-radius:16px;color:#fff;margin-bottom:28px;}.header h1{font-size:28px;font-weight:800;margin-bottom:6px;}.tabs{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;}.tab{padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid #e5e7eb;background:#fff;transition:all .15s;}.tab.active{background:${accent};color:#fff;border-color:${accent};}section{display:none;}.section.active{display:block;}h2{font-size:16px;font-weight:700;margin-bottom:12px;color:#374151;}</style></head>
<body><div class="container">
<div class="header"><div style="font-size:28px;margin-bottom:8px;">🗺</div><h1>${brandName} Roadmap</h1><p style="opacity:.85;">What we're building. Vote for what matters most.</p></div>
<div class="tabs"><button class="tab active" onclick="showTab('planned')">📋 Planned (${planned.length})</button><button class="tab" onclick="showTab('progress')">🚀 In Progress (${inprogress.length})</button><button class="tab" onclick="showTab('shipped')">✅ Shipped (${shipped.length})</button></div>
<section id="tab-planned" class="section active"><h2>Planned Features</h2>${planned.map(i=>card(i,true)).join('')||'<p style="color:#9ca3af;padding:20px;text-align:center;">No planned items yet.</p>'}</section>
<section id="tab-progress" class="section"><h2>In Progress</h2>${inprogress.map(i=>card(i,false)).join('')||'<p style="color:#9ca3af;padding:20px;text-align:center;">Nothing in progress right now.</p>'}</section>
<section id="tab-shipped" class="section"><h2>Recently Shipped</h2>${shipped.map(i=>'<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:18px;">✅</span><div><div style="font-size:14px;font-weight:600;">'+(i.title||'')+'</div><div style="font-size:12px;color:#9ca3af;">'+(i.shippedAt||'').split('T')[0]+'</div></div></div>').join('')||'<p style="color:#9ca3af;padding:20px;text-align:center;">Nothing shipped yet.</p>'}</section>
</div>
<script>function showTab(t){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.tab').forEach(s=>s.classList.remove('active'));document.getElementById('tab-'+t).classList.add('active');event.target.classList.add('active');}
function voteItem(id,btn){fetch('/api/roadmap-vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'${req.params.slug}',id})}).then(r=>r.json()).then(d=>{if(d.success){const n=btn.querySelector('span');if(n)n.textContent=d.votes;btn.disabled=true;btn.style.opacity='.5';}else alert(d.error||'Already voted');});}</script>
</body></html>`);
});

// Roadmap vote (public endpoint)
app.post('/api/roadmap-vote',(req,res)=>{
  const{slug,id}=req.body;
  if(!slug||!id)return res.json({success:false,error:'Missing params'});
  const db=readBrandDB(slug);
  const idx=(db.roadmapItems||[]).findIndex(r=>r.id===id);
  if(idx===-1)return res.json({success:false,error:'Not found'});
  const ip=req.ip||'anon';
  db.roadmapItems[idx].ipVoters=db.roadmapItems[idx].ipVoters||[];
  if(db.roadmapItems[idx].ipVoters.includes(ip))return res.json({success:false,error:'Already voted from this device'});
  db.roadmapItems[idx].ipVoters.push(ip);
  db.roadmapItems[idx].votes=(db.roadmapItems[idx].votes||0)+1;
  writeBrandDB(slug,db);
  res.json({success:true,votes:db.roadmapItems[idx].votes});
});

// ── CUSTOMER PORTAL (/portal/:slug) ────────────────────────────────────────
app.get('/portal/:slug',(req,res)=>res.sendFile(path.join(__dirname,'public','portal.html')));
app.get('/portal/:slug/auth',(req,res)=>{
  const db=readBrandDB(req.params.slug);
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===req.params.slug)||{};
  res.json({success:true,brand:{name:brand.name,accentColor:brand.accentColor,logoUrl:brand.logoUrl}});
});
app.post('/portal/:slug/login',(req,res)=>{
  const{email,otp}=req.body;const slug=req.params.slug;
  if(!email)return res.json({success:false,error:'Email required'});
  const db=readBrandDB(slug);
  // Check if this email has tickets
  const hasTickets=(db.tickets||[]).some(t=>t.from&&t.from.toLowerCase()===email.toLowerCase());
  if(!otp){
    // Send OTP
    const otpCode=Math.floor(100000+Math.random()*900000).toString();
    const portalOtps=global._portalOtps=global._portalOtps||{};
    portalOtps[slug+'_'+email]=otpCode;setTimeout(()=>delete portalOtps[slug+'_'+email],600000);
    sendBrandEmail(slug,email,'Your Resolvo Portal Login Code',`<p>Your one-time login code is: <strong style="font-size:24px;letter-spacing:4px;">${otpCode}</strong></p><p>Valid for 10 minutes.</p>`,'Login code: '+otpCode).catch(()=>{});
    return res.json({success:true,otpSent:true});
  }
  // Verify OTP
  const portalOtps=global._portalOtps||{};
  const key=slug+'_'+email;
  if(portalOtps[key]!==otp)return res.json({success:false,error:'Invalid or expired code'});
  delete portalOtps[key];
  const token=generateId('PTK');
  global._portalTokens=global._portalTokens||{};
  global._portalTokens[token]={email,slug,createdAt:Date.now()};
  res.json({success:true,token,email});
});
app.get('/portal/:slug/tickets',(req,res)=>{
  const token=req.headers['x-portal-token'];
  const session=(global._portalTokens||{})[token];
  if(!session||session.slug!==req.params.slug)return res.status(401).json({error:'Unauthorized'});
  const db=readBrandDB(req.params.slug);
  const tickets=(db.tickets||[]).filter(t=>t.from&&t.from.toLowerCase()===session.email.toLowerCase())
    .sort((a,b)=>new Date(b.createdDate)-new Date(a.createdDate))
    .map(t=>({id:t.id,subject:t.subject,status:t.status,priority:t.priority,createdDate:t.createdDate,resolvedDate:t.resolvedDate,threadCount:(t.thread||[]).length,csatRating:t.csatRating}));
  res.json({success:true,tickets,email:session.email});
});

// ── EMBEDDABLE WIDGET (script tag) ─────────────────────────────────────────
app.get('/widget/:slug/embed.js',(req,res)=>{
  const slug=req.params.slug;
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
  const accent=brand.accentColor||'#10B981';const brandName=brand.name||'Support';
  res.setHeader('Content-Type','application/javascript');
  res.send(`
(function(){
  if(document.getElementById('resolvo-widget-btn'))return;
  var btn=document.createElement('div');
  btn.id='resolvo-widget-btn';
  btn.innerHTML='💬';
  btn.style.cssText='position:fixed;bottom:24px;right:24px;width:52px;height:52px;background:${accent};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:99999;transition:all .2s;';
  btn.onmouseover=function(){btn.style.transform='scale(1.1)';};
  btn.onmouseout=function(){btn.style.transform='';};
  var panel=document.createElement('div');
  panel.id='resolvo-widget-panel';
  panel.style.cssText='position:fixed;bottom:88px;right:24px;width:340px;height:480px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,Arial,sans-serif;';
  panel.innerHTML='<div style="background:${accent};padding:16px 18px;color:#fff;"><div style="font-size:16px;font-weight:700;">${brandName} Support</div><div style="font-size:12px;opacity:.85;">We reply within 1h</div></div><div style="flex:1;padding:16px;overflow-y:auto;"><textarea id="rslv-msg" style="width:100%;height:80px;border:1.5px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;resize:none;margin-bottom:10px;" placeholder="Describe your issue..."></textarea><input id="rslv-email" style="width:100%;border:1.5px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:10px;" placeholder="Your email address"><button onclick="resolvoSubmit()" style="width:100%;background:${accent};color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">Send Message →</button><div id="rslv-success" style="display:none;text-align:center;padding:20px;color:#16a34a;font-weight:600;">✅ Message sent! We\'ll reply to your email.</div></div>';
  document.body.appendChild(btn);document.body.appendChild(panel);
  btn.onclick=function(){panel.style.display=panel.style.display==='none'?'flex':'none';};
  window.resolvoSubmit=function(){
    var msg=document.getElementById('rslv-msg').value.trim();
    var email=document.getElementById('rslv-email').value.trim();
    if(!msg||!email){alert('Please fill in both fields.');return;}
    fetch('${BASE_URL}/api/widget/${slug}/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,email:email,url:window.location.href,userAgent:navigator.userAgent})})
    .then(r=>r.json()).then(function(){document.getElementById('rslv-success').style.display='block';document.getElementById('rslv-msg').style.display='none';document.getElementById('rslv-email').style.display='none';document.querySelector('#resolvo-widget-panel button').style.display='none';});
  };
})();
`);
});

// Widget ticket submission
app.post('/api/widget/:slug/submit',(req,res)=>{
  const{message,email,url,userAgent}=req.body;const slug=req.params.slug;
  if(!message||!email)return res.json({success:false,error:'Missing fields'});
  const db=readBrandDB(slug);
  const ticketId=generateTicketId(slug);const now=new Date().toISOString();
  db.tickets=db.tickets||[];
  db.tickets.unshift({id:ticketId,subject:'Website Feedback: '+message.substring(0,60),from:email,fromName:email,status:'new',priority:'Medium',createdDate:now,lastActivity:now,source:'widget',tags:['widget'],thread:[{id:generateId('MSG'),type:'incoming',from:email,fromName:email,body:`${message}\n\n---\nPage: ${url||'unknown'}\nBrowser: ${(userAgent||'').substring(0,80)}`,timestamp:now}]});
  writeBrandDB(slug,db);
  res.json({success:true,ticketId});
});
// Reset password page — serve index.html so SPA handles the token
app.get('/reset-password',(req,res)=>res.sendFile('index.html',{root:path.join(__dirname,'public')}));
app.get('/join',(req,res)=>res.sendFile('index.html',{root:path.join(__dirname,'public')}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 1 & 5: CUSTOMER BOOKING PAGE — Public, no auth required
// GET /book/:slug → booking form
// GET /book/:slug/slots → available time slots JSON
// POST /book/:slug → submit booking
// ══════════════════════════════════════════════════════════════════════════════
app.get('/book/:slug',(req,res)=>{
  const{slug}=req.params;
  const db=readBrandDB(slug);
  const cfg=db.bookingConfig||{};
  if(!cfg.enabled)return res.send('<html><body style="font-family:Arial;padding:40px;text-align:center;"><h2>Booking unavailable</h2><p>Appointment booking is currently disabled.</p></body></html>');
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
  const accent=brand.accentColor||'#10B981';
  const brandName=brand.name||'Support';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Book Appointment — ${brandName}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#f0f2f5;font-family:-apple-system,Arial,sans-serif;padding:20px;}
.card{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);overflow:hidden;}
.hdr{background:${accent};padding:28px;text-align:center;color:#fff;}
.hdr h1{font-size:22px;font-weight:800;margin-bottom:6px;}
.body{padding:28px;}
.fg{margin-bottom:16px;}label{font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em;}
input,select,textarea{width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;font-family:inherit;}
input:focus,select:focus,textarea:focus{border-color:${accent};}
.btn{width:100%;padding:14px;background:${accent};color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;}
.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px;}
.slot{padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;text-align:center;font-size:13px;cursor:pointer;transition:all .15s;}
.slot:hover,.slot.selected{border-color:${accent};background:${accent}18;color:${accent};font-weight:700;}
.slot.taken{opacity:.4;cursor:not-allowed;text-decoration:line-through;}
#success{display:none;text-align:center;padding:40px 28px;}
</style></head><body>
<div class="card">
  <div class="hdr"><div style="font-size:32px;margin-bottom:8px;">📅</div><h1>${brandName}</h1><p style="opacity:.85;font-size:14px;">${cfg.title||'Book an Appointment'}</p></div>
  <div class="body" id="bookForm">
    <div class="fg"><label>Your Name *</label><input id="bk_name" placeholder="Full name"></div>
    <div class="fg"><label>Email *</label><input id="bk_email" type="email" placeholder="your@email.com"></div>
    <div class="fg"><label>Phone</label><input id="bk_phone" placeholder="+91 ..."></div>
    <div class="fg"><label>Topic / Reason *</label><textarea id="bk_topic" rows="2" placeholder="What would you like to discuss?"></textarea></div>
    <div class="fg"><label>Select Date</label><input id="bk_date" type="date" oninput="loadSlots(this.value)" onchange="loadSlots(this.value)" min="${new Date().toISOString().split('T')[0]}"></div>
    <div class="fg"><label>Select Time Slot</label><div class="slots" id="slotsGrid"><p style="color:#9ca3af;font-size:13px;grid-column:span 3;">Pick a date first</p></div></div>
    <div id="bk_err" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none;"></div>
    <button class="btn" onclick="submitBooking()">📅 Confirm Appointment</button>
  </div>
  <div id="success"><div style="font-size:52px;margin-bottom:16px;">✅</div><h2 style="color:#111827;margin-bottom:8px;">Appointment Booked!</h2><p style="color:#6b7280;" id="successMsg">We'll send a confirmation to your email.</p></div>
</div>
<script>
var selectedSlot=null;
function loadSlots(date){
  fetch('/book/${slug}/slots?date='+date).then(r=>r.json()).then(data=>{
    var g=document.getElementById('slotsGrid');
    if(!data.slots||!data.slots.length){g.innerHTML='<p style="color:#9ca3af;font-size:13px;grid-column:span 3;">No slots available on this day</p>';return;}
    g.innerHTML=data.slots.map(s=>'<div class="slot'+(s.taken?' taken':'')+(selectedSlot===s.time?' selected':'')+'" onclick="'+(s.taken?'':'selectSlot(this,\''+s.time+'\')')+'">'+s.label+'</div>').join('');
  });
}
function selectSlot(el,time){selectedSlot=time;document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');}
function submitBooking(){
  var name=document.getElementById('bk_name').value.trim();
  var email=document.getElementById('bk_email').value.trim();
  var topic=document.getElementById('bk_topic').value.trim();
  var date=document.getElementById('bk_date').value;
  var err=document.getElementById('bk_err');
  if(!name||!email||!topic||!date||!selectedSlot){err.textContent='Please fill all required fields and select a time slot.';err.style.display='block';return;}
  err.style.display='none';
  fetch('/book/${slug}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone:document.getElementById('bk_phone').value,topic,date,time:selectedSlot})})
  .then(r=>r.json()).then(d=>{
    if(d.success){document.getElementById('bookForm').style.display='none';document.getElementById('success').style.display='block';document.getElementById('successMsg').textContent='Confirmation sent to '+email+'. Ref: '+d.appointmentId;}
    else{err.textContent=d.error||'Booking failed';err.style.display='block';}
  });
}
</script></body></html>`);
});

app.get('/book/:slug/slots',(req,res)=>{
  const{slug}=req.params;const{date}=req.query;
  const db=readBrandDB(slug);const cfg=db.bookingConfig||{};
  if(!cfg.enabled)return res.json({slots:[]});
  if(!date)return res.json({slots:[],message:'No date provided'});
  const d=new Date(date+'T12:00:00');const dayName=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
  // Default: Mon–Sat 9am–6pm enabled; Sunday off
  const defaultByDay={sunday:{enabled:false},monday:{enabled:true,start:'09:00',end:'18:00'},tuesday:{enabled:true,start:'09:00',end:'18:00'},wednesday:{enabled:true,start:'09:00',end:'18:00'},thursday:{enabled:true,start:'09:00',end:'18:00'},friday:{enabled:true,start:'09:00',end:'18:00'},saturday:{enabled:true,start:'09:00',end:'13:00'}};
  const workingHours=(cfg.workingHours||{})[dayName]||cfg.defaultHours||defaultByDay[dayName]||{start:'09:00',end:'18:00',enabled:true};
  if(!workingHours.enabled)return res.json({slots:[],message:'Not available on this day'});
  const slots=[];const duration=parseInt(cfg.slotDuration||30);const buffer=parseInt(cfg.buffer||15);
  const[sh,sm]=workingHours.start.split(':').map(Number);
  const[eh,em]=workingHours.end.split(':').map(Number);
  let cur=sh*60+sm;const end=eh*60+em;
  while(cur+duration<=end){
    const h=Math.floor(cur/60);const m=cur%60;
    const timeStr=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    const label=(h>12?h-12:h||12)+':'+(String(m).padStart(2,'0'))+' '+(h>=12?'PM':'AM');
    const taken=(db.appointments||[]).some(a=>a.date===date&&a.time===timeStr&&a.status!=='cancelled');
    slots.push({time:timeStr,label,taken});
    cur+=duration+buffer;
  }
  res.json({slots,date,dayName});
});

app.post('/book/:slug',async(req,res)=>{
  const{slug}=req.params;
  const{name,email,phone,topic,date,time}=req.body;
  if(!name||!email||!date||!time)return res.json({success:false,error:'Missing required fields'});
  const db=readBrandDB(slug);
  const cfg=db.bookingConfig||{};
  if(!cfg.enabled)return res.json({success:false,error:'Booking disabled'});
  // Check slot not taken
  const taken=(db.appointments||[]).some(a=>a.date===date&&a.time===time&&a.status!=='cancelled');
  if(taken)return res.json({success:false,error:'This slot is no longer available. Please choose another.'});
  const aId=generateId('APT');
  const appointment={
    id:aId,brandSlug:slug,
    customerName:name,customerEmail:email,customerPhone:phone||'',
    topic,date,time,status:'confirmed',
    createdAt:new Date().toISOString(),
    reminderSent:false,ticketId:null
  };
  db.appointments=db.appointments||[];db.appointments.push(appointment);
  // Auto-create a ticket for this appointment
  const ticketId=generateTicketId(slug);
  const now=new Date().toISOString();
  const ticket={
    id:ticketId,subject:`📅 Appointment: ${topic} — ${date} ${time}`,
    from:email,fromName:name,status:'new',priority:'Medium',
    createdDate:now,lastActivity:now,
    thread:[{id:generateId('MSG'),type:'incoming',from:email,fromName:name,
      body:`Appointment booked:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone||'N/A'}\nDate: ${date}\nTime: ${time}\nTopic: ${topic}`,
      timestamp:now}],
    tags:['appointment'],source:'booking',appointmentId:aId
  };
  db.tickets=db.tickets||[];db.tickets.unshift(ticket);
  appointment.ticketId=ticketId;
  writeBrandDB(slug,db);
  // Send confirmation email to customer
  const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
  const accent=brand.accentColor||'#10B981';const brandName=brand.name||'Support';
  sendBrandEmail(slug,email,`📅 Appointment Confirmed — ${brandName}`,
    `<div style="font-family:Arial;max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
    <div style="background:${accent};padding:24px;text-align:center;color:#fff;"><div style="font-size:32px;margin-bottom:8px;">📅</div><h2 style="margin:0;font-size:20px;">Appointment Confirmed!</h2></div>
    <div style="padding:24px;"><p>Hi <strong>${name}</strong>,</p><p style="margin:12px 0;">Your appointment has been confirmed:</p>
    <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Date</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:700;">${date}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Time</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:700;">${time}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Topic</td><td style="padding:8px 0;font-weight:700;">${topic}</td></tr>
    </table><p style="margin-top:16px;font-size:12px;color:#9ca3af;">Ref: ${aId}</p></div></div>`,
    `Appointment confirmed: ${date} ${time} — ${topic}`).catch(()=>{});
  res.json({success:true,appointmentId:aId,ticketId});
});

// Booking confirmation page
app.get('/confirm/:token',(req,res)=>{
  res.send('<html><body style="font-family:Arial;padding:40px;text-align:center;"><h2>✅ Appointment Confirmed</h2><p>Thank you! Check your email for details.</p></body></html>');
});

// ============================================================
// EMAIL TICKETING ENGINE
// ============================================================

const activePollers = {}; // { brandSlug: cronJob }
const typingStates = {}; // { brandSlug: { ticketId: { email, name, at } } }

function getEmailTicketConfig(slug) {
  const db = readBrandDB(slug);
  return db.emailTicketing || null;
}

// Parse an email and create a ticket in the brand's DB
// ── Ticket ID generator ────────────────────────────────────────────────────────
function generateTicketId(slug) {
  const db = readBrandDB(slug);
  const count = (db.tickets || []).length + 1;
  return 'TKT-' + String(count).padStart(4, '0');
}

// ── Create ticket from incoming email ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// QUEUE ENGINE — Smart auto-assignment with routing rules
// ══════════════════════════════════════════════════════════════════════════════
function autoAssignAgent(db, ticket) {
  const cfg = db.queueConfig || {};
  if (!cfg.enabled) return null;
  if (cfg.frozen) return null; // Feature 14: Queue freeze

  const subject = ((ticket&&ticket.subject)||'').toLowerCase();
  const fromEmail = ((ticket&&ticket.from)||'').toLowerCase();
  const priority = (ticket&&ticket.priority)||'Medium';

  // Feature 1 & 4: Keyword/skill routing rules — check first
  const routingRules = (cfg.routingRules || []).filter(r => r.enabled);
  for (const rule of routingRules) {
    let matched = false;
    if (rule.type === 'keyword' && rule.keyword && subject.includes(rule.keyword.toLowerCase())) matched = true;
    if (rule.type === 'domain' && rule.domain && fromEmail.endsWith('@' + rule.domain.toLowerCase())) matched = true;
    if (rule.type === 'priority' && rule.priority && priority === rule.priority) matched = true;
    if (rule.type === 'email' && rule.email && fromEmail === rule.email.toLowerCase()) matched = true;
    if (matched && rule.assignTo) {
      const user = (db.users || []).find(u => u.email === rule.assignTo && u.active);
      if (user && (user.availabilityStatus || 'available') !== 'away') {
        const openCount = (db.tickets || []).filter(t => t.assignedTo === rule.assignTo && !['resolved','closed'].includes(t.status)).length;
        if (openCount < (user.maxTickets || 10)) return rule.assignTo;
      }
    }
  }

  // Feature 2: Priority routing — Critical → agent with most capacity
  if (priority === 'Critical' && cfg.priorityRouting) {
    const agents = (cfg.agents || []).filter(a => a.inQueue);
    const ranked = agents.map(a => {
      const user = (db.users || []).find(u => u.email === a.email);
      if (!user || !user.active || (user.availabilityStatus || 'available') === 'away') return null;
      const openCount = (db.tickets || []).filter(t => t.assignedTo === a.email && !['resolved','closed'].includes(t.status)).length;
      const cap = (user.maxTickets || 10) - openCount;
      return { email: a.email, cap };
    }).filter(Boolean).sort((a, b) => b.cap - a.cap);
    if (ranked.length && ranked[0].cap > 0) return ranked[0].email;
  }

  // Feature 5: Time-based routing
  const hour = new Date().getHours();
  const timeRules = (cfg.timeRules || []).filter(r => r.enabled);
  for (const rule of timeRules) {
    const start = parseInt(rule.startHour || 0);
    const end = parseInt(rule.endHour || 23);
    if (hour >= start && hour <= end && rule.assignTo) {
      const user = (db.users || []).find(u => u.email === rule.assignTo && u.active);
      if (user && (user.availabilityStatus || 'available') !== 'away') {
        const openCount = (db.tickets || []).filter(t => t.assignedTo === rule.assignTo && !['resolved','closed'].includes(t.status)).length;
        if (openCount < (user.maxTickets || 10)) return rule.assignTo;
      }
    }
  }

  // Default: Round robin with capacity check
  const agents = (cfg.agents || []).filter(a => a.inQueue);
  if (!agents.length) return null;
  const available = agents.filter(a => {
    const user = (db.users || []).find(u => u.email === a.email);
    if (!user || !user.active) return false;
    if ((user.availabilityStatus || 'available') === 'away') return false;
    const openCount = (db.tickets || []).filter(t => t.assignedTo === a.email && !['resolved','closed'].includes(t.status)).length;
    if (openCount >= (user.maxTickets || 10)) return false;
    return true;
  });
  if (!available.length) return null;
  const mode = cfg.mode || 'roundrobin';
  if (mode === 'leastbusy') {
    // Feature 8: SLA-aware — assign to agent with most capacity
    const ranked = available.map(a => {
      const openCount = (db.tickets || []).filter(t => t.assignedTo === a.email && !['resolved','closed'].includes(t.status)).length;
      return { email: a.email, openCount };
    }).sort((a, b) => a.openCount - b.openCount);
    return ranked[0]?.email || null;
  }
  // Round robin
  const lastIdx = cfg.lastIndex || 0;
  const nextIdx = lastIdx % available.length;
  const chosen = available[nextIdx];
  db.queueConfig.lastIndex = (nextIdx + 1) % available.length;
  return chosen.email;
}

// Feature 7: Queue depth check — returns agents over threshold
function checkQueueDepth(db) {
  const cfg = db.queueConfig || {};
  const threshold = cfg.depthWarningThreshold || 5;
  return (db.users || []).filter(u => u.active).map(u => {
    const open = (db.tickets || []).filter(t => t.assignedTo === u.email && !['resolved','closed'].includes(t.status)).length;
    return { email: u.email, name: u.name, openTickets: open, overThreshold: open >= threshold };
  }).filter(a => a.overThreshold);
}

async function createTicketFromEmail(slug, emailData) {
  const db = readBrandDB(slug);
  const config = db.emailTicketing || {};

  // Avoid duplicates by Message-ID
  if (emailData.messageId && (db.processedEmailIds || []).includes(emailData.messageId)) return null;

  // ── SPAM / AUTOMATION FILTER ──────────────────────────────────────────────
  const fromAddr   = (emailData.from || '').toLowerCase();
  const fromName   = (emailData.fromName || '').toLowerCase();
  const subjectRaw = (emailData.subject || '');
  const subjectLow = subjectRaw.toLowerCase();

  // 1. Known automated sender usernames / domains
  const SPAM_SENDER_PATTERNS = [
    /^mailer-daemon/i, /^postmaster/i, /^noreply/i, /^no-reply/i,
    /^donotreply/i, /^do-not-reply/i, /^bounce/i, /^bounce\+/i,
    /^notifications?@/i, /^alerts?@/i, /^auto-confirm/i,
    /^daemon@/i, /^system@/i, /MAILER-DAEMON/i,
    /^newsletter/i, /^unsubscribe/i,
    /mail.delivery.subsystem/i, /^mail-delivery/i,
    /^delivery-status/i, /^delivery@/i
  ];
  // 2. Known automated subject patterns
  const SPAM_SUBJECT_PATTERNS = [
    /^delivery status notification/i, /^undeliverable:/i, /^auto-?reply:/i,
    /^out of office/i, /^automatic reply/i, /^\[?automated\]?/i,
    /^mail delivery (subsystem|failed|failure|error)/i,
    /^failure notice/i, /^returned mail/i, /^non-?delivery/i,
    /^\*\* address not found \*\*/i, /^bounced mail/i,
    /^message delivery status/i, /^read receipt/i,
    /^vacation auto-?reply/i,
    /\*\* message blocked \*\*/i, /\*\* address not found \*\*/i,
    /your message (to|wasn't|was not)/i, /delivery (failed|failure|notification)/i,
    /message not delivered/i, /could not be delivered/i
  ];
  // 3. Custom blocklist from brand config
  const customBlock = (config.senderBlocklist || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const isSenderSpam  = SPAM_SENDER_PATTERNS.some(p => p.test(fromAddr));
  const isSubjectSpam = SPAM_SUBJECT_PATTERNS.some(p => p.test(subjectLow));
  const isCustomBlock = customBlock.some(b => b && (fromAddr.includes(b) || subjectLow.includes(b)));

  if (isSenderSpam || isSubjectSpam || isCustomBlock) {
    // Mark as processed so we don't retry, but don't create a ticket
    db.processedEmailIds = db.processedEmailIds || [];
    if (emailData.messageId) db.processedEmailIds.push(emailData.messageId);
    writeBrandDB(slug, db);
    console.log(`[EmailTicket] SKIPPED spam/automated email from ${emailData.from}: "${subjectRaw.substring(0,60)}"`);
    return null;
  }

  // Auto-detect priority from subject keywords
  const subjectLower = (emailData.subject || '').toLowerCase();
  let priority = config.defaultPriority || 'Medium';
  if (/urgent|critical|p0|blocker|asap|down|outage/i.test(subjectLower)) priority = 'Critical';
  else if (/high|p1|important|broken/i.test(subjectLower)) priority = 'High';
  else if (/low|minor|p3|suggestion/i.test(subjectLower)) priority = 'Low';

  // Check if this is a reply to an existing ticket thread
  const threadId = emailData.inReplyTo || emailData.messageId || '';
  const existingTicket = threadId ? (db.tickets || []).find(t =>
    t.messageIds && t.messageIds.includes(emailData.inReplyTo)
  ) : null;

  if (existingTicket) {
    // Add as a new message to existing ticket thread
    existingTicket.thread = existingTicket.thread || [];
    existingTicket.thread.push({
      id: generateId('MSG'), type: 'incoming',
      from: emailData.from, fromName: emailData.fromName || emailData.from,
      body: emailData.text || emailData.html || '',
      timestamp: emailData.date || new Date().toISOString(),
      messageId: emailData.messageId
    });
    existingTicket.status = existingTicket.status === 'resolved' ? 'open' : existingTicket.status;
    existingTicket.lastActivity = new Date().toISOString();
    existingTicket.messageIds = [...(existingTicket.messageIds || []), emailData.messageId];
    db.processedEmailIds = db.processedEmailIds || [];
    db.processedEmailIds.push(emailData.messageId);
    writeBrandDB(slug, db);
    console.log(`[EmailTicket] Added reply to ${existingTicket.id} from ${emailData.from}`);
    return existingTicket.id;
  }

  // Create new ticket
  const ticketId = generateTicketId(slug);
  const now = emailData.date || new Date().toISOString();

  // VIP detection
  const vipCfg = db.vipConfig || {};
  const fromLow = (emailData.from || '').toLowerCase();
  const isVIP = (vipCfg.emails || []).some(e => fromLow === e.toLowerCase()) ||
                (vipCfg.domains || []).some(d => fromLow.endsWith('@' + d.toLowerCase()));
  const ticketTags = [];
  if (isVIP) { ticketTags.push('VIP'); if (isVIP) priority = priority === 'Low' ? 'Medium' : priority; }

  // Round robin auto-assign — pass email data for routing rules
  const assignedTo = config.defaultAssignee || autoAssignAgent(db, {subject:emailData.subject,from:emailData.from,priority}) || '';

  const ticket = {
    id: ticketId,
    subject: emailData.subject || '(No Subject)',
    status: 'new',
    priority,
    from: emailData.from || '',
    fromName: emailData.fromName || emailData.from || '',
    assignedTo,
    module: config.defaultModule || 'Support',
    tags: ticketTags,
    isVIP,
    createdDate: now,
    lastActivity: now,
    linkedIssueId: null,
    messageIds: [emailData.messageId].filter(Boolean),
    thread: [{
      id: generateId('MSG'),
      type: 'incoming',
      from: emailData.from || '',
      fromName: emailData.fromName || emailData.from || '',
      body: emailData.text || emailData.html || '',
      timestamp: now,
      messageId: emailData.messageId || ''
    }]
  };

  // Sentiment analysis on incoming email
  const body = emailData.text || emailData.html || '';
  const t = body.toLowerCase();
  const angryWords = ['extremely frustrated','very disappointed','unacceptable','cancel','lawsuit','terrible','worst','useless','disgusting','ridiculous','pathetic','waste of money','refund','escalate'];
  const worriedWords = ['frustrated','disappointed','unhappy','concerned','urgent','asap','deadline','critical','losing customers'];
  let sentimentScore = 60;
  angryWords.forEach(w => { if(t.includes(w)) sentimentScore -= 8; });
  worriedWords.forEach(w => { if(t.includes(w)) sentimentScore -= 3; });
  const caps = (body.match(/[A-Z]{3,}/g)||[]).length;
  const excl = (body.match(/!/g)||[]).length;
  sentimentScore -= (caps * 2 + excl * 1.5);
  sentimentScore = Math.max(0, Math.min(100, Math.round(sentimentScore)));
  ticket.sentimentScore = sentimentScore;
  ticket.sentimentLevel = sentimentScore < 25 ? 'critical' : sentimentScore < 45 ? 'angry' : sentimentScore < 65 ? 'worried' : 'neutral';
  // Auto-escalate if very angry
  if (sentimentScore < 30) {
    ticket.priority = 'Critical';
    ticket.autoEscalated = true;
    console.log(`[Sentiment] Auto-escalated ${ticketId} — sentiment score: ${sentimentScore}`);
  }

  db.tickets = db.tickets || [];
  db.tickets.push(ticket);

  // Track processed IDs
  db.processedEmailIds = db.processedEmailIds || [];
  if (emailData.messageId) db.processedEmailIds.push(emailData.messageId);
  if (db.processedEmailIds.length > 5000) db.processedEmailIds = db.processedEmailIds.slice(-5000);

  writeBrandDB(slug, db);

  // Slack alert for new critical tickets
  if(ticket.priority==='Critical'){sendSlackAlert(slug,'newCritical',ticket).catch(()=>{});}

  // Check auto-resolve rules
  try {
    const rules = (db.autoResolveRules || []).filter(r => r.enabled);
    for (const rule of rules) {
      const subjectMatch = !rule.subjectPattern || new RegExp(rule.subjectPattern, 'i').test(ticket.subject || '');
      const senderMatch = !rule.senderPattern || new RegExp(rule.senderPattern, 'i').test(ticket.from || '');
      if (subjectMatch && senderMatch) {
        const idx = (db.tickets || []).findIndex(t => t.id === ticketId);
        if (idx >= 0) {
          db.tickets[idx].status = 'resolved';
          db.tickets[idx].lastActivity = new Date().toISOString();
          db.tickets[idx].autoResolved = true;
          db.tickets[idx].autoResolvedByRule = rule.id;
          if (rule.replyMessage) {
            db.tickets[idx].thread = db.tickets[idx].thread || [];
            db.tickets[idx].thread.push({ id: generateId('MSG'), type: 'reply', from: 'system', fromName: 'Auto-Resolve', body: rule.replyMessage, timestamp: new Date().toISOString(), sentAsEmail: true });
            // Send the auto-reply
            const brand = (readOwner().brands || []).find(b => b.slug === slug) || {};
            sendBrandEmail(slug,ticket.from, `Re: [${brand.name||'Support'}] ${ticket.subject}`, `<p>${rule.replyMessage}</p>`, rule.replyMessage).catch(() => {});
          }
          writeBrandDB(slug, db);
          console.log(`[AutoResolve] Ticket ${ticketId} auto-resolved by rule: ${rule.name}`);
          return ticketId; // Skip ACK since auto-resolved
        }
      }
    }
  } catch(e) { console.error('[AutoResolve]', e.message); }

  // Send acknowledgement — respect both sendAckEmail and sendAutoReply toggle
  if (emailData.from && config.sendAckEmail !== false && config.sendAutoReply !== false) {
    const brand = (readOwner().brands || []).find(b => b.slug === slug) || {};
    const brandName = brand.name || 'Support';
    const brandColor = brand.accentColor || '#F5A623';
    await sendBrandEmail(
      slug,
      emailData.from,
      `[${brandName}] We received your request — ${ticketId}`,
      `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:32px 16px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <div style="background:${brandColor};padding:32px;text-align:center;">
          <div style="font-size:36px;margin-bottom:10px;">✓</div>
          <h2 style="margin:0;color:#fff;font-size:22px;font-weight:800;">We've got your message!</h2>
          <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px;">${brandName} Support Team</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${emailData.fromName || 'there'}</strong>, we've created a support ticket for your request.</p>
          <div style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid ${brandColor};">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;">Your Ticket</div>
            <div style="font-size:13px;color:#374151;margin-bottom:6px;">🎫 <strong>Ticket ID:</strong> <span style="font-family:monospace;background:#e5e7eb;padding:2px 8px;border-radius:4px;">${ticketId}</span></div>
            <div style="font-size:13px;color:#374151;margin-bottom:6px;">📋 <strong>Subject:</strong> ${emailData.subject || '(No Subject)'}</div>
            <div style="font-size:13px;color:#374151;">⚡ <strong>Priority:</strong> ${priority}</div>
          </div>
          <p style="color:#6b7280;font-size:13px;margin-top:20px;line-height:1.6;">Our team will review your request and get back to you soon. <strong>Simply reply to this email</strong> if you have additional details to add.</p>
        </div>
        <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f0f2f5;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Powered by Resolvo Support · ${brandName}</p>
        </div>
      </div></body></html>`,
      `Ticket ${ticketId} created. We'll get back to you soon. Reply to this email to add more details.`
    );
  }

  console.log(`[EmailTicket] Created ${ticketId} for ${slug} from ${emailData.from}`);
  return ticketId;
}

// Poll a brand's IMAP inbox for new emails
async function pollBrandInbox(slug) {
  const db = readBrandDB(slug);
  const config = db.emailTicketing;
  if (!config || !config.enabled || !config.host || !config.user || !config.pass) return;

  const Imap = require('imap');
  const { simpleParser } = require('mailparser');

  return new Promise((resolve) => {
    const imap = new Imap({
      user: config.user,
      password: config.pass.replace(/\s/g, ''),
      host: config.host || 'imap.gmail.com',
      port: config.port || 993,
      tls: config.tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000
    });

    imap.once('ready', () => {
      imap.openBox(config.mailbox || 'INBOX', false, (err, box) => {
        if (err) { imap.end(); return resolve(); }
        // Only fetch emails received ON OR AFTER the day email ticketing was enabled.
        // This prevents importing the entire old inbox when first connecting.
        const enabledAt = config.enabledAt ? new Date(config.enabledAt) : new Date();
        // Use date-only (no time) for IMAP SINCE — IMAP SINCE is day-granular
        const sinceDate = new Date(enabledAt);
        sinceDate.setHours(0, 0, 0, 0); // start of that day
        const searchCriteria = ['UNSEEN', ['SINCE', sinceDate]];
        console.log(`[EmailTicket] Searching ${slug} UNSEEN SINCE ${sinceDate.toDateString()}`);

        imap.search(searchCriteria, (err, results) => {
          if (err || !results || results.length === 0) { imap.end(); return resolve(); }
          const fetch = imap.fetch(results, { bodies: '', markSeen: true });
          const promises = [];
          fetch.on('message', (msg) => {
            promises.push(new Promise((res2) => {
              let buffer = '';
              msg.on('body', (stream) => { stream.on('data', d => buffer += d.toString()); });
              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  const emailData = {
                    messageId: parsed.messageId,
                    inReplyTo: parsed.inReplyTo,
                    subject: parsed.subject || '(No Subject)',
                    from: parsed.from?.value?.[0]?.address || '',
                    fromName: parsed.from?.value?.[0]?.name || '',
                    text: parsed.text || '',
                    html: parsed.textAsHtml || '',
                    date: parsed.date?.toISOString() || new Date().toISOString()
                  };
                  await createTicketFromEmail(slug, emailData);
                } catch(e) { console.error('[EmailTicket] Parse error:', e.message); }
                res2();
              });
            }));
          });
          fetch.once('end', async () => { await Promise.all(promises); imap.end(); resolve(); });
        });
      });
    });

    imap.once('error', (e) => { console.error(`[EmailTicket] IMAP error ${slug}:`, e.message); resolve(); });
    imap.once('end', () => resolve());
    imap.connect();
  });
}

// Start polling for a brand
function startEmailPoller(slug) {
  try {
    // Stop any existing poller first
    if (activePollers[slug]) {
      try { activePollers[slug].stop(); } catch(e) {}
      delete activePollers[slug];
    }
    const db = readBrandDB(slug);
    const config = db.emailTicketing;
    if (!config || !config.enabled || !config.host || !config.user || !config.pass) {
      console.log(`[EmailTicket] Poller not started for ${slug} — missing config`);
      return;
    }
    const interval = Math.max(1, parseInt(config.intervalMinutes) || 5);
    // Run immediate first poll, then schedule
    pollBrandInbox(slug).catch(e => console.error('[EmailTicket] Poll error:', e.message));
    // Use setInterval as fallback if node-cron unavailable
    try {
      const cron = require('node-cron');
      const cronExpr = interval === 1 ? '* * * * *' : `*/${interval} * * * *`;
      activePollers[slug] = cron.schedule(cronExpr, () => pollBrandInbox(slug).catch(console.error));
      console.log(`[EmailTicket] Cron poller started for ${slug} every ${interval}min`);
    } catch(cronErr) {
      // Fallback to setInterval
      console.warn('[EmailTicket] node-cron unavailable, using setInterval:', cronErr.message);
      const timer = setInterval(() => pollBrandInbox(slug).catch(console.error), interval * 60000);
      activePollers[slug] = { stop: () => clearInterval(timer) };
      console.log(`[EmailTicket] setInterval poller started for ${slug} every ${interval}min`);
    }
  } catch(e) {
    console.error(`[EmailTicket] startEmailPoller error for ${slug}:`, e.message);
  }
}

// API: save email ticketing config
app.post('/api/email-ticketing/config', async (req, res) => {
  const su = getSessionUser(req);
  if (!su || su.role !== 'Admin') return res.json({ success: false, error: 'Admin only' });
  const { config } = req.body;
  const db = readBrandDB(su.brandSlug);
  db.emailTicketing = { ...config, pass: config.pass ? config.pass.replace(/\s/g, '') : (db.emailTicketing?.pass || '') };
  writeBrandDB(su.brandSlug, db);
  if (config.enabled) startEmailPoller(su.brandSlug);
  else if (activePollers[su.brandSlug]) { activePollers[su.brandSlug].stop(); delete activePollers[su.brandSlug]; }
  res.json({ success: true });
});

// API: get email ticketing config
app.get('/api/email-ticketing/config', (req, res) => {
  const su = getSessionUser(req);
  if (!su || su.role !== 'Admin') return res.json({ success: false, error: 'Admin only' });
  const db = readBrandDB(su.brandSlug);
  const config = db.emailTicketing || {};
  res.json({ success: true, config: { ...config, pass: config.pass ? '••••••••' : '' } });
});

// API: test IMAP connection
app.post('/api/email-ticketing/test', async (req, res) => {
  const su = getSessionUser(req);
  if (!su || su.role !== 'Admin') return res.json({ success: false, error: 'Admin only' });
  const { host, port, user, pass, tls } = req.body;
  const Imap = require('imap');
  const imap = new Imap({ user, password: pass.replace(/\s/g,''), host: host||'imap.gmail.com', port: port||993, tls: tls!==false, tlsOptions:{rejectUnauthorized:false}, authTimeout:10000, connTimeout:15000 });
  const timeout = setTimeout(() => { try{imap.end();}catch(e){} res.json({success:false,error:'Connection timed out (15s)'}); }, 16000);
  imap.once('ready', () => { clearTimeout(timeout); imap.end(); res.json({success:true,message:'Connection successful! IMAP credentials are valid.'}); });
  imap.once('error', (e) => { clearTimeout(timeout); res.json({success:false,error:e.message}); });
  imap.connect();
});

// API: manually trigger inbox poll
app.post('/api/email-ticketing/poll', async (req, res) => {
  const su = getSessionUser(req);
  if (!su || su.role !== 'Admin') return res.json({ success: false, error: 'Admin only' });
  try {
    await pollBrandInbox(su.brandSlug);
    res.json({ success: true, message: 'Inbox polled. New emails converted to tickets.' });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// API: reply to email ticket
app.post('/api/email-ticketing/reply', async (req, res) => {
  const su = getSessionUser(req);
  if (!su) return res.json({ success: false, error: 'Not logged in' });
  if (!['Admin','CS','Developer'].includes(su.role)) return res.json({ success: false, error: 'Not authorised to send email replies' });
  const { issueId, replyText } = req.body;
  const db = readBrandDB(su.brandSlug);
  const issue = (db.tickets || []).find(i => i.id === issueId) || (db.issues || []).find(i => i.id === issueId);
  if (!issue) return res.json({ success: false, error: 'Ticket not found' });
  if (!issue.emailFrom && !issue.from) return res.json({ success: false, error: 'Not an email ticket' });
  const emailFrom = issue.emailFrom || issue.from;
  const brand = (readOwner().brands || []).find(b => b.slug === su.brandSlug) || {};
  const config = db.emailTicketing || {};

  // Add reply to ticket thread
  const commentId = generateId('CMT');
  const ticketIdx = (db.tickets || []).findIndex(t => t.id === issueId);
  if (ticketIdx >= 0) {
    db.tickets[ticketIdx].thread = db.tickets[ticketIdx].thread || [];
    db.tickets[ticketIdx].thread.push({ id: commentId, type: 'reply', from: su.email, fromName: su.name || su.email, body: replyText, timestamp: new Date().toISOString(), sentAsEmail: true });
    db.tickets[ticketIdx].lastActivity = new Date().toISOString();
  } else {
    db.comments = db.comments || [];
    db.comments.push({ id: commentId, issueId, userEmail: su.email, comment: replyText, timestamp: new Date().toISOString(), sentAsEmail: true });
  }
  logActivity(db, issueId, `Email reply sent to ${emailFrom}`, su.email);
  writeBrandDB(su.brandSlug, db);

  // Send email reply
  await sendBrandEmail(
    su.brandSlug,
    emailFrom,
    `Re: [${brand.name || 'Resolvo'}] ${issue.emailSubject || issue.subject || issue.title}`,
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f0f2f5;padding:24px 16px;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="background:#F5A623;padding:20px 28px;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(0,0,0,.5);">${brand.name || 'Support'} · Ticket ${issueId}</p></div><div style="padding:24px 28px;"><p style="color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${replyText}</p><hr style="border:none;border-top:1px solid #f0f2f5;margin:20px 0;"><p style="color:#9ca3af;font-size:12px;">Ticket ID: ${issueId} · Reply to this email to continue the conversation</p></div></div></body></html>`,
    replyText
  );

  res.json({ success: true, commentId });
});

// Start pollers for all brands on boot
function initEmailPollers() {
  const owner = readOwner();
  for (const brand of (owner.brands || [])) {
    if (brand.status !== 'active') continue;
    try {
      const db = readBrandDB(brand.slug);
      if (db.emailTicketing?.enabled) startEmailPoller(brand.slug);
    } catch(e) {}
  }
}

// ── FEATURE 4 & 12: Background jobs — appointment reminders + daily digest ──
// ── EMAIL NURTURE SEQUENCES ────────────────────────────────────────────────────
function nurtureShell(bodyHtml,unsubUrl){return`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:32px 16px;"><div style="max-width:540px;margin:0 auto;"><div style="background:linear-gradient(135deg,#10B981,#6366F1);border-radius:14px 14px 0 0;padding:22px 32px;display:flex;align-items:center;"><span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Resolvo</span></div><div style="background:#fff;border-radius:0 0 14px 14px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:32px 36px;font-size:14px;color:#374151;line-height:1.8;">${bodyHtml}</div><div style="padding:16px 0;text-align:center;font-size:12px;color:#9ca3af;">Resolvo · <a href="mailto:contact@resolvogroup.com" style="color:#10B981;text-decoration:none;">contact@resolvogroup.com</a>${unsubUrl?` · <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a>`:''}</div></div></body></html>`;}
function nurtureBtn(label,url,color){color=color||'#10B981';return`<a href="${url}" style="display:inline-block;margin-top:14px;padding:11px 28px;background:${color};color:${color==='#10B981'?'#000':'#fff'};border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">${label}</a>`;}
function nurtureFeatureRow(icon,title,desc){return`<div style="display:flex;gap:14px;margin-bottom:14px;"><div style="font-size:22px;flex-shrink:0;">${icon}</div><div><strong style="color:#111827;">${title}</strong><br><span style="color:#6b7280;font-size:13px;">${desc}</span></div></div>`;}

// TIME-BASED nurture emails (sent to brand major admin based on days since signup)
const NURTURE_EMAILS=[
  // ── WEEK 1: ACTIVATION ──────────────────────────────────────────────────────
  {day:1,subject:'Quick tip: Create your first issue in Resolvo',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, welcome to Resolvo! 🎉</p><p>The fastest way to see value is to create your first issue and assign it to a teammate.</p><p><strong>Takes 2 minutes:</strong></p><ol style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Click <strong>+ New Issue</strong> in the top right</li><li>Set a priority — try <span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">Critical</span> or <span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">High</span></li><li>Assign it to yourself or a teammate</li></ol><p style="background:#f0fdf4;border-left:3px solid #10B981;padding:10px 14px;border-radius:0 8px 8px 0;font-size:13px;">The SLA countdown timer starts immediately — that's the magic of Resolvo.</p>${nurtureBtn('Create your first issue →',url)}<p style="margin-top:20px;color:#6b7280;font-size:13px;">Reply to this email if you need any help.</p>`,unsub)},

  {day:2,subject:'Your team is waiting — invite them now',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Resolvo works best as a team. Invite your colleagues so tickets and issues can be assigned, escalated, and tracked together.</p><p><strong>Roles you can invite:</strong></p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${[['👑','Admin','Full access — settings, reports, all data'],['💻','Developer','Issues, bugs, code-level tickets'],['🎧','CS (Support)','Customer tickets, email replies, appointments'],['📊','Sales','Leads, follow-ups, client communication'],['🔬','QA','Testing tickets, bug verification']].map(([ic,r,d])=>`<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start;"><span>${ic}</span><div><strong style="font-size:13px;">${r}</strong> <span style="font-size:12px;color:#6b7280;">— ${d}</span></div></div>`).join('')}</div>${nurtureBtn('Invite your team →',url+'/settings')}<p style="margin-top:16px;color:#6b7280;font-size:13px;">Settings → Team Members → Invite User</p>`,unsub)},

  {day:3,subject:'Did you know Resolvo has a full email helpdesk?',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Most teams start with issue tracking and don't realise Resolvo also has a complete email support inbox — no Freshdesk, no Zendesk needed.</p><p><strong>How it works:</strong></p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${['Customer sends email to your support address','Resolvo auto-creates a ticket','Your agent replies from inside Resolvo','Customer gets a professional branded reply'].map((s,i)=>`<div style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start;"><div style="background:#10B981;color:#000;border-radius:50%;width:22px;height:22px;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div><span style="font-size:13px;color:#374151;">${s}</span></div>`).join('')}</div><p><strong>To set it up:</strong> Settings → Email & Ticketing → Connect Gmail</p>${nurtureBtn('Connect your inbox →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Also configure your brand SMTP so all emails send from your own domain.</p>`,unsub)},

  {day:4,subject:'Set up your brand in 5 minutes — look professional from day one',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Your customers will see your brand in every email, portal page, and notification. Take 5 minutes to set it up properly.</p><div style="margin:16px 0;">${nurtureFeatureRow('🎨','Brand Colour & Logo','Makes every email and portal page feel like yours')}<br>${nurtureFeatureRow('📧','Support Email Address','Replies come from your domain, not a generic address')}<br>${nurtureFeatureRow('💬','Welcome Message','The first thing new customers see when they open a ticket')}<br>${nurtureFeatureRow('⏱️','SLA Targets','Set your response time goals — Resolvo tracks them automatically')}</div>${nurtureBtn('Set up your brand →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Brand Settings</p>`,unsub)},

  {day:5,subject:'Your customers can now book appointments directly',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Resolvo has a built-in appointment booking system. Your customers can pick a slot from your availability — no back-and-forth emails needed.</p><p><strong>What you get:</strong></p><div style="margin:12px 0;">${nurtureFeatureRow('📅','Customer-facing booking page','Share a link, customers pick their own slot')}<br>${nurtureFeatureRow('🔔','Auto confirmation emails','Customer and agent both get notified instantly')}<br>${nurtureFeatureRow('⏰','1-hour reminders','Automatic reminder sent before every appointment')}<br>${nurtureFeatureRow('🌐','Self-service portal','Customers can view, track, and manage their own appointments')}</div><p><strong>Share your booking link:</strong></p><div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:13px;color:#065f46;">${url}/book/your-brand</div>${nurtureBtn('Enable appointment booking →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Appointment Booking → Enable</p>`,unsub)},

  {day:6,subject:'Setup checklist — how are you doing?',
   body:(n,url,unsub,stats)=>{const items=[['Create your first issue',stats&&stats.issues>0],['Invite a team member',stats&&stats.users>1],['Connect your email inbox',stats&&stats.emailConnected],['Configure brand settings',stats&&stats.brandConfigured],['Enable appointment booking',stats&&stats.appointmentsEnabled],['Set up your SLA targets',stats&&stats.slaConfigured]];return nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, you're 6 days in — let's see where you are:</p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${items.map(([label,done])=>`<div style="display:flex;gap:12px;margin-bottom:10px;align-items:center;"><span style="font-size:16px;">${done?'✅':'⬜'}</span><span style="font-size:14px;color:${done?'#374151':'#9ca3af'};${done?'':'text-decoration:line-through;'}">${label}</span></div>`).join('')}</div><p style="font-size:13px;color:#6b7280;">Tick off everything above to unlock the full power of Resolvo.</p>${nurtureBtn('Continue setup →',url+'/settings')}`,unsub);}},

  {day:7,subject:"Your first week with Resolvo — how's it going?",
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>It's been a week! Here are 3 power features most teams discover in week 2:</p><div style="margin:16px 0;">${nurtureFeatureRow('🤖','Smart Queue','Auto-assigns tickets to agents by skill, availability, or round-robin. Settings → Assignment Queue')}<br>${nurtureFeatureRow('🌐','Customer Portal','Give customers a self-service page. They can track tickets, book appointments, and raise new issues — without emailing you.')}<br>${nurtureFeatureRow('📊','Reports','SLA compliance %, agent leaderboard, ticket volume forecast, busiest hours. All live.')}</div><p>Any questions? Just reply to this email — I personally respond within 24 hours.</p><p style="color:#6b7280;">— Team Resolvo</p>${nurtureBtn('Explore Resolvo →',url)}`,unsub)},

  // ── WEEK 2: HABIT BUILDING ───────────────────────────────────────────────────
  {day:8,subject:'Never miss an SLA again — here\'s how',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>SLA breaches are the #1 reason customers churn. Resolvo tracks every ticket against your targets automatically.</p><p><strong>How SLA tracking works:</strong></p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${['Every ticket gets a countdown timer the moment it arrives','Colour-coded urgency: green → orange → red as deadline approaches','Auto-escalation rules notify the right person before a breach','Reports show your SLA compliance % over time'].map(s=>`<div style="display:flex;gap:10px;margin-bottom:8px;"><span style="color:#10B981;font-weight:700;">✓</span><span style="font-size:13px;color:#374151;">${s}</span></div>`).join('')}</div>${nurtureBtn('Set up SLA targets →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → SLA & Escalation</p>`,unsub)},

  {day:10,subject:'3 things your team should set up this week',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>These three setup steps will save your team hours every week:</p><div style="margin:16px 0;">${nurtureFeatureRow('🔁','Auto-assign rules','Route tickets to the right agent automatically based on priority, keywords, or category. No more manual assignment.')}<br>${nurtureFeatureRow('👀','Watchers & @mentions','Tag a teammate on any ticket or issue with @name. They get notified instantly and added as a watcher.')}<br>${nurtureFeatureRow('📌','Canned responses','Save your most common replies as templates. One click to insert — cut reply time by 70%.')}</div>${nurtureBtn('Set these up →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">All in Settings → Workflow</p>`,unsub)},

  {day:12,subject:'How to reply to customers without leaving Resolvo',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Your agents can reply to customer emails directly from inside a ticket — the customer receives it in their inbox as a normal email reply.</p><p><strong>The full email thread lives inside the ticket:</strong></p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${['Customer email arrives → ticket is created automatically','Agent opens the ticket, reads the full thread','Agent types a reply and clicks Send','Customer receives the reply from your brand email address','All replies, notes, and history stay on the ticket forever'].map((s,i)=>`<div style="display:flex;gap:12px;margin-bottom:8px;"><div style="background:#6366F1;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div><span style="font-size:13px;color:#374151;">${s}</span></div>`).join('')}</div><p style="font-size:13px;color:#f59e0b;background:#fffbeb;padding:10px 14px;border-radius:8px;">⚠️ Make sure your brand SMTP is configured so replies come from your own email address.</p>${nurtureBtn('Open tickets →',url)}`,unsub)},

  {day:14,subject:'Upgrade to Pro? Here\'s what you unlock',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, two weeks in!</p><p>Teams on Pro close issues <strong>3× faster</strong>. Here's the full comparison:</p><table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;border-radius:10px;overflow:hidden;"><tr style="background:#f9fafb;"><td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:#6b7280;font-size:11px;text-transform:uppercase;">Feature</td><td style="padding:10px 14px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#6b7280;font-size:11px;text-transform:uppercase;">Free</td><td style="padding:10px 14px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#10B981;font-size:11px;text-transform:uppercase;">Pro</td></tr>${[['Email Ticketing + Auto Queue','❌','✅'],['AI Triage & Auto-categorise','❌','✅'],['Knowledge Base + Roadmap','❌','✅'],['9 Live Reports + SLA %','❌','✅'],['Customer Satisfaction (CSAT)','❌','✅'],['Custom SLA per priority','❌','✅'],['Unlimited team members','❌','✅'],['Priority support','❌','✅']].map(([f,fr,pr])=>`<tr><td style="padding:9px 14px;border:1px solid #e5e7eb;color:#374151;">${f}</td><td style="padding:9px 14px;border:1px solid #e5e7eb;text-align:center;">${fr}</td><td style="padding:9px 14px;border:1px solid #e5e7eb;text-align:center;">${pr}</td></tr>`).join('')}</table>${nurtureBtn('Upgrade to Pro →','mailto:contact@resolvogroup.com?subject=Upgrade to Pro — '+n,'#6366F1')}<p style="margin-top:14px;font-size:13px;color:#6b7280;">Reply to this email or write to contact@resolvogroup.com — we'll get you set up within 24 hours.</p>`,unsub)},

  // ── WEEK 3: POWER FEATURES ───────────────────────────────────────────────────
  {day:16,subject:'Auto-assign tickets to the right agent instantly',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Stop manually assigning every ticket. Set up Smart Queue once and Resolvo routes every incoming ticket automatically.</p><p><strong>Assignment rules you can create:</strong></p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;">${[['🔴','Critical tickets','Always assign to senior agent'],['🏷️','Keyword match','Ticket contains "billing" → assign to finance team'],['🔄','Round-robin','Distribute evenly across all active agents'],['⏰','Availability','Only assign to agents currently online']].map(([ic,r,d])=>`<div style="display:flex;gap:10px;margin-bottom:10px;"><span>${ic}</span><div><strong style="font-size:13px;">${r}</strong> — <span style="font-size:12px;color:#6b7280;">${d}</span></div></div>`).join('')}</div>${nurtureBtn('Set up Smart Queue →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Assignment Queue → New Rule</p>`,unsub)},

  {day:18,subject:'Your customers deserve a self-service portal',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Give your customers their own portal page — they can raise tickets, track status, and book appointments without emailing you directly.</p><div style="margin:16px 0;">${nurtureFeatureRow('🔐','Secure OTP login','Customers log in with just their email — no password to remember')}<br>${nurtureFeatureRow('🎫','Ticket tracking','Full history of every issue they have raised, with status updates')}<br>${nurtureFeatureRow('📅','Self-service booking','Book, reschedule, or cancel appointments without calling you')}<br>${nurtureFeatureRow('📱','Mobile friendly','Works perfectly on phone — no app needed')}</div><p><strong>Your portal URL:</strong></p><div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:13px;color:#065f46;">${url}/portal/your-brand-slug</div>${nurtureBtn('View your portal →',url)}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Share this link with your customers — they'll love it.</p>`,unsub)},

  {day:21,subject:"See how your team is really performing",
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, 3 weeks in!</p><p>Your Reports tab is now full of real data. Here's what you can see:</p><div style="margin:16px 0;">${nurtureFeatureRow('📊','SLA Compliance %','What % of tickets were resolved within target time')}<br>${nurtureFeatureRow('🏆','Agent Leaderboard','Who is closing the most tickets, fastest average resolution time')}<br>${nurtureFeatureRow('📈','Ticket Volume Forecast','How many tickets to expect next week based on your history')}<br>${nurtureFeatureRow('⏰','Busiest Hours','When your customers need help most — plan staffing around this')}<br>${nurtureFeatureRow('😊','CSAT Score','Customer satisfaction rating after ticket resolution')}</div>${nurtureBtn('Open Reports →',url+'/reports')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">All reports update in real time — no manual export needed.</p>`,unsub)},

  // ── MONTH 2: LOYALTY + EXPANSION ────────────────────────────────────────────
  {day:25,subject:'Save hours every week with these automations',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Resolvo has several automations running in the background that most teams don't know about. Here's what's saving time for active teams:</p><div style="margin:16px 0;">${nurtureFeatureRow('🔒','Auto-close resolved tickets','Tickets marked resolved auto-close after X days if customer doesn\'t respond')}<br>${nurtureFeatureRow('📋','Daily digest email','Your agents get a personalised summary of their open tickets every morning')}<br>${nurtureFeatureRow('⏰','Follow-up reminders','Tickets with no activity get a nudge to the assigned agent')}<br>${nurtureFeatureRow('📣','Auto-acknowledgement','Customer gets an instant confirmation when their email arrives — even at 2am')}</div>${nurtureBtn('Configure automations →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Workflow → Automations</p>`,unsub)},

  {day:30,subject:'30 days with Resolvo — here\'s what you\'ve handled',
   body:(n,url,unsub,stats)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, one month done! 🎉</p><p>Here's a snapshot of everything your team has handled with Resolvo:</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;">${[['🎫','Tickets Resolved',stats&&stats.resolvedTickets||'—'],['📅','Appointments',stats&&stats.appointments||'—'],['👥','Team Members',stats&&stats.users||'—'],['⚡','Avg Response',stats&&stats.avgResponse||'—']].map(([ic,label,val])=>`<div style="background:#f9fafb;border-radius:10px;padding:14px 16px;text-align:center;"><div style="font-size:24px;">${ic}</div><div style="font-size:22px;font-weight:800;color:#10B981;margin:4px 0;">${val}</div><div style="font-size:12px;color:#6b7280;">${label}</div></div>`).join('')}</div><p>If you haven't already, this is a great time to explore <strong>Reports</strong> and see your SLA compliance score.</p>${nurtureBtn('View your 30-day report →',url+'/reports')}`,unsub)},

  {day:35,subject:'Are your customers happy? Find out with CSAT',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Do you know how satisfied your customers are after each support interaction?</p><p>Resolvo's <strong>CSAT (Customer Satisfaction)</strong> feature sends a simple rating request after every ticket is resolved.</p><div style="background:#f9fafb;border-radius:10px;padding:16px 20px;margin:12px 0;text-align:center;"><p style="font-size:14px;color:#374151;margin:0 0 12px;">The email your customer receives:</p><div style="font-size:28px;letter-spacing:8px;">😞 😐 😊 😄</div><p style="font-size:13px;color:#6b7280;margin:8px 0 0;">One click — no form, no friction</p></div><p>Your CSAT score appears in Reports → Customer Satisfaction.</p>${nurtureBtn('Enable CSAT →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Workflow → Customer Satisfaction Survey</p>`,unsub)},

  {day:40,subject:'Integrate Resolvo with your existing tools',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Resolvo connects with the tools your team already uses:</p><div style="margin:16px 0;">${nurtureFeatureRow('🔗','Jira','Sync issues between Resolvo and Jira — changes reflect both ways')}<br>${nurtureFeatureRow('💬','Slack','Get notified in Slack when a critical ticket comes in or an SLA is about to breach')}<br>${nurtureFeatureRow('🐙','GitHub Issues','Link support tickets to GitHub issues — developers see customer-reported bugs directly')}<br>${nurtureFeatureRow('🔧','ServiceNow','Enterprise teams can push tickets to ServiceNow for ITSM workflows')}</div>${nurtureBtn('Set up integrations →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Integrations</p>`,unsub)},

  {day:45,subject:"Your team's busiest hours — and what to do about it",
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>After 45 days, your Reports tab now shows your team's busiest support hours based on real ticket data.</p><p>Use this to:</p><ul style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Schedule agents during your peak hours</li><li>Set <strong>out-of-hours auto-replies</strong> when no one is available</li><li>Identify if a particular day of the week consistently spikes</li></ul><p>The busiest-hours chart is in <strong>Reports → Volume Analysis</strong>.</p>${nurtureBtn('View your busiest hours →',url+'/reports')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Also consider enabling <strong>Business Hours</strong> in Settings so SLA timers only count during your working hours.</p>`,unsub)},

  // ── MONTH 2–3: RETENTION ─────────────────────────────────────────────────────
  {day:50,subject:'One thing top support teams do differently',
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>The #1 difference between average and excellent support teams? <strong>They never type the same answer twice.</strong></p><p>Resolvo's <strong>Canned Responses</strong> let you save any reply as a reusable template. One click to insert it into any ticket reply.</p><p><strong>Start with these 5:</strong></p><ol style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Ticket acknowledgement ("We've received your request...")</li><li>Asking for more information</li><li>Escalating to a developer</li><li>Resolved + CSAT follow-up</li><li>Out-of-hours auto-reply</li></ol>${nurtureBtn('Create canned responses →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Settings → Canned Responses → New Template</p>`,unsub)},

  {day:60,subject:"Still there? We'd love your feedback",
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Two months in — you've been using Resolvo for a while now, and your feedback matters to us.</p><p>We have one question: <strong>What's one thing we could do better?</strong></p><p>Just reply to this email. No form, no survey — a real reply that I personally read.</p><p>Also, if there's a feature you wish Resolvo had, tell us. Several features on our roadmap came directly from customers like you.</p><p style="color:#6b7280;">— Team Resolvo</p>${nurtureBtn('Reply with feedback →','mailto:contact@resolvogroup.com?subject=Feedback from '+n)}`,unsub)},

  {day:75,subject:"You've been with Resolvo for 2.5 months",
   body:(n,url,unsub,stats)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, 75 days! 🏆</p><p>Here's a milestone summary of your team's work:</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0;">${[['Total Tickets',stats&&stats.totalTickets||'—'],['Resolved',stats&&stats.resolvedTickets||'—'],['Team Size',stats&&stats.users||'—']].map(([label,val])=>`<div style="background:linear-gradient(135deg,#10B981,#6366F1);border-radius:10px;padding:14px 12px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#fff;">${val}</div><div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:4px;">${label}</div></div>`).join('')}</div><p>Thank you for being a Resolvo customer. If you ever need anything — setup help, a feature walkthrough, or just a question — reply here.</p>${nurtureBtn('Open Resolvo →',url)}`,unsub)},

  {day:90,subject:"What's new in Resolvo this month",
   body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Three months with Resolvo — here's what's been updated recently:</p><div style="margin:16px 0;">${nurtureFeatureRow('✨','Improved Live Monitor','Real-time dashboard showing email failures, workflow errors, and system health')}<br>${nurtureFeatureRow('📊','Owner Query Console','Owners can now query all customer data in a table view — no code needed')}<br>${nurtureFeatureRow('📧','Brand Email Enforcement','Emails now strictly use brand SMTP — no silent fallback to owner email')}<br>${nurtureFeatureRow('🔔','Smarter Notifications','Agents get @mention alerts, watcher updates, and approval requests in real time')}</div><p>More updates coming. If you want early access to new features, reply to this email.</p>${nurtureBtn('Log in and explore →',url)}`,unsub)},
];

// BEHAVIOUR-TRIGGERED emails — checked daily, sent on condition not on day count
const TRIGGER_EMAILS={
  noLoginIn7Days:{
    subject:'We miss you — everything okay?',
    key:'trig_nologin7',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>We noticed you haven't logged into Resolvo in a while. Everything okay?</p><p>If you got stuck somewhere or something isn't working as expected, we're here to help — just reply to this email.</p><p>If you'd like a quick walkthrough of any feature, we can arrange a 15-minute call at no charge.</p>${nurtureBtn('Log back in →',url)}<p style="margin-top:16px;font-size:13px;color:#6b7280;">Or reply here and we'll sort it out together.</p>`,unsub)
  },
  firstTicketResolved:{
    subject:'First ticket closed! Here\'s what\'s next',
    key:'trig_firstresolved',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, your first ticket is resolved! 🎉</p><p>That's a real milestone — your team just used Resolvo end-to-end for the first time.</p><p><strong>3 things to do next:</strong></p><ol style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Enable <strong>CSAT</strong> so customers can rate their experience after every close</li><li>Set up <strong>SLA targets</strong> so you can track response time against your goals</li><li>Check <strong>Reports</strong> — your first real data is in there</li></ol>${nurtureBtn('Go to Resolvo →',url)}`,unsub)
  },
  tenTicketsClosed:{
    subject:'Your team just hit 10 resolved tickets',
    key:'trig_10resolved',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n}, 10 tickets resolved! 🏆</p><p>Your team is building real momentum. At this stage, the teams that grow fastest are the ones that start measuring performance.</p><p><strong>Turn on these now:</strong></p><div style="margin:12px 0;">${nurtureFeatureRow('📊','SLA Report','Are you hitting your response time targets?')}<br>${nurtureFeatureRow('😊','CSAT','What are customers saying after you close their tickets?')}<br>${nurtureFeatureRow('🏆','Agent Leaderboard','Who on your team is closing the most tickets?')}</div>${nurtureBtn('Open Reports →',url+'/reports')}`,unsub)
  },
  emailNotConnected:{
    subject:"You're missing tickets — here's why",
    key:'trig_emailnotconn',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>You've been using Resolvo for 5+ days but your email inbox isn't connected yet.</p><p>This means: <strong>customer emails are not becoming tickets automatically.</strong> You could be missing support requests right now.</p><p><strong>To connect your inbox:</strong></p><ol style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Settings → Email & Ticketing</li><li>Click <strong>Connect Gmail</strong> (or enter custom IMAP)</li><li>Authorize Resolvo to read your inbox</li><li>Done — new emails become tickets automatically</li></ol>${nurtureBtn('Connect email now →',url+'/settings')}<p style="margin-top:16px;font-size:13px;color:#f59e0b;">⚠️ Also configure your Brand SMTP so replies go out from your own address.</p>`,unsub)
  },
  noTeamMembers:{
    subject:'Flying solo? Let\'s change that',
    key:'trig_noteam',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Resolvo is most powerful with a team. You're currently the only person in your workspace — but handling support alone is exhausting.</p><p><strong>Invite your first teammate in 30 seconds:</strong></p><ol style="margin:12px 0;padding-left:20px;line-height:2.2;"><li>Settings → Team Members</li><li>Click <strong>Invite User</strong></li><li>Enter their email and choose a role</li><li>They get an email with login details</li></ol><p style="font-size:13px;color:#6b7280;">Roles available: Admin, CS, Developer, Sales, QA, Product</p>${nurtureBtn('Invite a teammate →',url+'/settings')}`,unsub)
  },
  trialExpiring3Days:{
    subject:'Your trial ends in 3 days — don\'t lose your data',
    key:'trig_expiring3',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Your Resolvo trial ends in <strong>3 days</strong>. After that, your workspace will be paused and your team won't be able to log in.</p><p><strong>What happens to your data?</strong> Nothing — your tickets, users, and settings are safe. You just won't be able to access them until you upgrade.</p><p><strong>Upgrade takes 2 minutes:</strong></p><p>Reply to this email or write to <a href="mailto:contact@resolvogroup.com" style="color:#10B981;">contact@resolvogroup.com</a> and we'll activate your Pro account the same day.</p>${nurtureBtn('Upgrade now →','mailto:contact@resolvogroup.com?subject=Upgrade — '+n,'#ef4444')}<p style="margin-top:14px;font-size:13px;color:#6b7280;">Questions about pricing? Just reply here.</p>`,unsub)
  },
  trialExpired:{
    subject:'Your Resolvo workspace is paused',
    key:'trig_expired',
    body:(n,url,unsub)=>nurtureShell(`<p style="font-size:16px;font-weight:700;color:#111827;">Hi ${n},</p><p>Your Resolvo trial has ended and your workspace is currently paused.</p><p>Your data is completely safe — tickets, users, settings, and history are all still there. You just need to upgrade to reactivate.</p><p>To reactivate, reply to this email or write to <a href="mailto:contact@resolvogroup.com" style="color:#10B981;">contact@resolvogroup.com</a>. We'll turn it back on within the hour.</p>${nurtureBtn('Reactivate now →','mailto:contact@resolvogroup.com?subject=Reactivate — '+n,'#6366F1')}<p style="margin-top:14px;font-size:13px;color:#6b7280;">If you've decided Resolvo isn't the right fit, we'd genuinely love to know why — reply here.</p>`,unsub)
  }
};

function nurtureUnsubUrl(slug,email){return`${BASE_URL}/api/nurture/unsubscribe?slug=${slug}&email=${encodeURIComponent(email)}`;}

async function sendNurtureEmails(){
  const owner=readOwner();
  owner.nurtureSent=owner.nurtureSent||{};
  owner.nurtureUnsub=owner.nurtureUnsub||{};
  const now=Date.now();
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
    try{
      const email=brand.majorAdminEmail;
      if(!email)continue;
      if(owner.nurtureUnsub[brand.slug])continue;
      const db=readBrandDB(brand.slug);
      const admin=(db.users||[]).find(u=>u.email===email);
      const adminName=admin?.name||email.split('@')[0];
      const created=new Date(brand.createdDate||brand.lastActive||Date.now());
      const daysSince=Math.floor((now-created.getTime())/86400000);
      const unsub=nurtureUnsubUrl(brand.slug,email);

      // Time-based nurture
      for(const n of NURTURE_EMAILS){
        if(daysSince!==n.day)continue;
        const sentKey=`nurture_${brand.slug}_day${n.day}`;
        if(owner.nurtureSent[sentKey])continue;
        // Build stats for emails that use them
        const resolvedCount=(db.tickets||[]).filter(t=>['resolved','closed'].includes(t.status)).length;
        const stats={
          issues:(db.issues||[]).length,users:(db.users||[]).length,
          emailConnected:!!(brand.emailUser||brand.smtpUser),
          brandConfigured:!!(brand.accentColor&&brand.logoUrl),
          appointmentsEnabled:!!(db.config?.appointmentsEnabled),
          slaConfigured:!!(db.config?.slaTargets),
          resolvedTickets:resolvedCount,
          appointments:(db.appointments||[]).length,
          totalTickets:(db.tickets||[]).length+(db.issues||[]).length,
          avgResponse:'—'
        };
        const html=nurtureShell(n.body(adminName,BASE_URL,unsub,stats).replace(/^<!DOCTYPE.*?<\/div>\s*<\/body>\s*<\/html>$/s,''),unsub);
        const finalHtml=nurtureShell(n.body(adminName,BASE_URL,unsub,stats),unsub);
        await sendEmail(email,n.subject,finalHtml,n.subject).catch(()=>{});
        owner.nurtureSent[sentKey]=new Date().toISOString();
        console.log(`[Nurture] Day ${n.day} → ${email} (${brand.slug})`);
        monitorEvent&&monitorEvent('info','nurture',`Day ${n.day} email sent`,{brand:brand.slug,email,subject:n.subject});
      }

      // Behaviour-triggered nurture
      const triggers=TRIGGER_EMAILS;
      const resolvedTickets=(db.tickets||[]).filter(t=>['resolved','closed'].includes(t.status));
      const lastLogin=admin?.lastLogin?new Date(admin.lastLogin):null;
      const daysSinceLogin=lastLogin?Math.floor((now-lastLogin.getTime())/86400000):daysSince;

      const triggerChecks=[
        {id:'noLoginIn7Days',cond:daysSince>=7&&daysSinceLogin>=7},
        {id:'firstTicketResolved',cond:resolvedTickets.length===1},
        {id:'tenTicketsClosed',cond:resolvedTickets.length>=10},
        {id:'emailNotConnected',cond:daysSince>=5&&!(brand.emailUser||brand.smtpUser)},
        {id:'noTeamMembers',cond:daysSince>=3&&(db.users||[]).filter(u=>u.active).length<=1},
        {id:'trialExpiring3Days',cond:brand.trialEnds&&Math.floor((new Date(brand.trialEnds)-now)/86400000)===3},
        {id:'trialExpired',cond:brand.trialEnds&&new Date(brand.trialEnds)<new Date()&&brand.status!=='pro'}
      ];
      for(const tc of triggerChecks){
        const t=triggers[tc.id];if(!t||!tc.cond)continue;
        const sentKey=`${t.key}_${brand.slug}`;
        if(owner.nurtureSent[sentKey])continue;
        const html=t.body(adminName,BASE_URL,nurtureUnsubUrl(brand.slug,email));
        await sendEmail(email,t.subject,html,t.subject).catch(()=>{});
        owner.nurtureSent[sentKey]=new Date().toISOString();
        console.log(`[Nurture] Trigger ${tc.id} → ${email} (${brand.slug})`);
        monitorEvent&&monitorEvent('info','nurture',`Trigger email: ${tc.id}`,{brand:brand.slug,email});
      }
    }catch(e){console.error('[Nurture] Error for',brand.slug,e.message);}
  }
  writeOwner(owner);
}

// Unsubscribe endpoint
app.get('/api/nurture/unsubscribe',(req,res)=>{
  const{slug,email}=req.query;
  if(!slug||!email)return res.send('<p>Invalid unsubscribe link.</p>');
  const owner=readOwner();
  owner.nurtureUnsub=owner.nurtureUnsub||{};
  owner.nurtureUnsub[slug]=true;
  writeOwner(owner);
  console.log(`[Nurture] Unsubscribed ${email} (${slug})`);
  res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:60px 20px;background:#f0f2f5;"><div style="max-width:400px;margin:0 auto;background:#fff;border-radius:14px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="font-size:40px;margin-bottom:16px;">✅</div><h2 style="color:#111827;margin:0 0 12px;">Unsubscribed</h2><p style="color:#6b7280;font-size:14px;">You've been removed from all onboarding emails for this workspace.</p><p style="color:#9ca3af;font-size:12px;margin-top:24px;">You will still receive transactional emails such as ticket replies and appointment confirmations.</p></div></body></html>`);
});

function runBackgroundJobs(){
  const cron=require('node-cron');
  // Daily digest at 9am
  cron.schedule('0 9 * * *',async()=>{
    console.log('[Jobs] Running daily digest...');
    const owner=readOwner();
    for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
      try{
        const db=readBrandDB(brand.slug);
        if(!(db.digestConfig?.enabled))continue;
        const today=new Date().toISOString().split('T')[0];
        const agents=(db.users||[]).filter(u=>u.active);
        for(const agent of agents){
          const myTickets=(db.tickets||[]).filter(t=>t.assignedTo===agent.email&&!['resolved','closed'].includes(t.status));
          const myApts=(db.appointments||[]).filter(a=>a.assignedTo===agent.email&&a.date===today&&a.status!=='cancelled');
          const myFollowUps=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt<=today&&t.assignedTo===agent.email);
          if(myTickets.length===0&&myApts.length===0&&myFollowUps.length===0)continue;
          await sendBrandEmail(brand.slug,agent.email,`📋 Daily Digest ${today} — ${brand.name}`,
            `<p>Hi ${agent.name||agent.email},</p><p>You have <strong>${myTickets.length}</strong> open tickets, <strong>${myApts.length}</strong> appointments today, <strong>${myFollowUps.length}</strong> follow-ups due.</p><a href="${BASE_URL}">Open Resolvo →</a>`,
            `Open tickets: ${myTickets.length} | Today's appointments: ${myApts.length} | Follow-ups due: ${myFollowUps.length}`).catch(()=>{});
        }
      }catch(e){console.error('[Jobs] Digest error:',brand.slug,e.message);}
    }
  });
  // Appointment reminders — check every 15 min
  cron.schedule('*/15 * * * *',async()=>{
    const owner=readOwner();
    for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
      try{
        const db=readBrandDB(brand.slug);
        const now=new Date();const in1h=new Date(now.getTime()+3600000);
        const toRemind=(db.appointments||[]).filter(a=>{
          if(a.status==='cancelled'||a.reminderSent)return false;
          const aptDt=new Date(a.date+'T'+a.time+':00');
          return aptDt>now&&aptDt<=in1h;
        });
        for(const apt of toRemind){
          const idx=(db.appointments||[]).findIndex(x=>x.id===apt.id);
          if(idx>=0&&apt.customerEmail){
            await sendBrandEmail(brand.slug,apt.customerEmail,`⏰ Reminder: Appointment in 1 hour — ${brand.name}`,
              `<p>Hi ${apt.customerName},</p><p>Reminder: You have an appointment in <strong>1 hour</strong> at ${apt.time}.</p><p>Topic: ${apt.topic}</p>`,
              `Reminder: Your appointment is in 1 hour at ${apt.time}`).catch(()=>{});
            db.appointments[idx].reminderSent=true;
          }
        }
        if(toRemind.length>0)writeBrandDB(brand.slug,db);
      }catch(e){}
    }
  });
  // Nurture email sequence — runs daily at 10am, sends day 1/3/7/14 emails to new signups
  cron.schedule('0 10 * * *',async()=>{
    console.log('[Nurture] Checking nurture emails...');
    await sendNurtureEmails().catch(e=>console.error('[Nurture] Error:',e.message));
  });

  // Follow-up nudges — check daily at 8am
  cron.schedule('0 8 * * *',async()=>{
    const owner=readOwner();
    for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
      try{
        const db=readBrandDB(brand.slug);const today=new Date().toISOString().split('T')[0];
        const due=(db.tickets||[]).filter(t=>t.followUpAt&&!t.followUpDone&&t.followUpAt===today&&t.assignedTo);
        for(const t of due){
          await sendBrandEmail(brand.slug,t.assignedTo,`⏰ Follow-up Due Today: ${t.subject.substring(0,60)} — ${brand.name}`,
            `<p>Your follow-up for ticket <strong>${t.id}</strong> is due today.</p><p>Note: ${t.followUpNote||'No note'}</p><a href="${BASE_URL}">View ticket →</a>`,
            `Follow-up due today: ${t.id}`).catch(()=>{});
        }
      }catch(e){}
    }
  });
  console.log('[Jobs] Background jobs started (reminders, digest, follow-ups)');
}

// ── Auto-deploy webhook (GitHub Actions → VPS curl) ──────────────────────────
// Called by GitHub Actions on every push to main. VPS downloads its own update.
app.post('/deploy-webhook',express.json(),(req,res)=>{
  const secret=process.env.DEPLOY_SECRET||'';
  const token=req.headers['x-deploy-token']||'';
  if(secret&&token!==secret)return res.status(401).json({error:'Invalid token'});
  if(req.body?.ref!=='refs/heads/main')return res.json({message:'Not main branch, skipped'});
  res.json({message:'Deploy triggered'});
  const{exec}=require('child_process');
  // Use curl to download server.js directly — avoids git pull conflicts with data files
  const deployCmd=`curl -sf -o ${__dirname}/server.js.new https://raw.githubusercontent.com/Mrsk82/Resolvo/main/server.js && mv ${__dirname}/server.js.new ${__dirname}/server.js && cd ${__dirname} && npm install --production 2>&1`;
  exec(deployCmd,(err,stdout,stderr)=>{
    if(err){console.error('[Deploy] Error:',err.message);return;}
    console.log('[Deploy] Success:\n'+stdout);
    exec('pm2 restart resolvo --update-env 2>/dev/null || true');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// OWNER QUERY CONSOLE — SQL-like interface over JSON data
// ══════════════════════════════════════════════════════════════════════════════
const MONITOR_LOG=[];const MAX_LOG=2000;
function monitorEvent(level,category,message,detail){
  const entry={id:generateId('EVT'),ts:new Date().toISOString(),level,category,message,detail:detail||null};
  MONITOR_LOG.unshift(entry);if(MONITOR_LOG.length>MAX_LOG)MONITOR_LOG.length=MAX_LOG;
  if(level==='error')console.error(`[Monitor][${category}] ${message}`);
}
// Patch sendBrandEmail to track failures
const _origSendBrandEmail=sendBrandEmail;
async function sendBrandEmailMonitored(slug,...args){
  try{const r=await _origSendBrandEmail(slug,...args);monitorEvent('info','email',`Email sent for brand ${slug}`,{to:args[0],subject:args[1]});return r;}
  catch(e){monitorEvent('error','email',`Email FAILED for brand ${slug}`,{to:args[0],error:e.message});throw e;}
}

function getAllData(table){
  const owner=readOwner();
  if(table==='brands')return(owner.brands||[]).map(b=>({...b}));
  if(table==='support_tickets')return(owner.supportTickets||[]);
  if(table==='audit_log')return(owner.auditLog||[]);
  const rows=[];
  for(const b of(owner.brands||[])){
    try{
      const db=readBrandDB(b.slug);
      if(table==='users')(db.users||[]).forEach(u=>rows.push({...u,_brand:b.slug,_brandName:b.name}));
      else if(table==='issues')(db.issues||[]).forEach(i=>rows.push({...i,_brand:b.slug,_brandName:b.name}));
      else if(table==='tickets')(db.tickets||[]).forEach(t=>rows.push({...t,_brand:b.slug,_brandName:b.name}));
      else if(table==='appointments')(db.appointments||[]).forEach(a=>rows.push({...a,_brand:b.slug,_brandName:b.name}));
      else if(table==='comments')(db.comments||[]).forEach(c=>rows.push({...c,_brand:b.slug}));
    }catch(e){}
  }
  return rows;
}

function applyWhere(rows,clause){
  // Support: field = 'val', field != 'val', field LIKE '%val%', field > val, field < val, field IS NULL, field IS NOT NULL
  return rows.filter(row=>{
    try{
      const normalized=clause.replace(/IS NOT NULL/gi,'!==null').replace(/IS NULL/gi,'===null');
      const parts=normalized.split(/\s+AND\s+/i);
      return parts.every(part=>{
        const likeM=part.match(/(\w+)\s+LIKE\s+'([^']+)'/i);
        if(likeM){const val=String(row[likeM[1]]||'').toLowerCase();const pat=likeM[2].replace(/%/g,'').toLowerCase();return val.includes(pat);}
        const eqM=part.match(/(\w+)\s*(===|!==|>=|<=|!=|=|>|<)\s*'?([^']+)'?/);
        if(eqM){
          const[,field,op,val]=eqM;const rv=row[field];const sv=String(rv||'');const nv=parseFloat(val);
          if(op==='='||op==='===')return sv===val||rv===val;
          if(op==='!='||op==='!==')return sv!==val&&rv!==val;
          if(op==='>') return parseFloat(sv)>nv;
          if(op==='<') return parseFloat(sv)<nv;
          if(op==='>=')return parseFloat(sv)>=nv;
          if(op==='<=')return parseFloat(sv)<=nv;
        }
        return true;
      });
    }catch(e){return true;}
  });
}

function executeQuery(sql){
  sql=sql.trim().replace(/\s+/g,' ');
  // COUNT query
  const countM=sql.match(/^SELECT\s+COUNT\(\*\)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+\d+)?$/i);
  if(countM){
    let rows=getAllData(countM[1].toLowerCase());
    if(countM[2])rows=applyWhere(rows,countM[2]);
    return{columns:['COUNT(*)'],rows:[[rows.length]],total:1};
  }
  // SELECT query
  const selM=sql.match(/^SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+([\w.]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if(!selM)throw new Error('Unsupported query. Try: SELECT * FROM brands WHERE status = \'active\'');
  const[,fields,table,whereClause,orderField,orderDir,limitN]=selM;
  let rows=getAllData(table.toLowerCase());
  if(!rows)throw new Error(`Unknown table: ${table}. Available: brands, users, issues, tickets, appointments, support_tickets, audit_log, comments`);
  if(whereClause)rows=applyWhere(rows,whereClause);
  if(orderField)rows=[...rows].sort((a,b)=>{const av=a[orderField]||'',bv=b[orderField]||'';return orderDir==='DESC'?String(bv).localeCompare(String(av)):String(av).localeCompare(String(bv));});
  if(limitN)rows=rows.slice(0,parseInt(limitN));
  if(fields.trim()==='*'){
    const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];
    return{columns:cols,rows:rows.map(r=>cols.map(c=>r[c]??null)),total:rows.length};
  }
  const cols=fields.split(',').map(f=>f.trim());
  return{columns:cols,rows:rows.map(r=>cols.map(c=>r[c]??null)),total:rows.length};
}

app.post('/api/owner/query',ownerOnly,(req,res)=>{
  const{sql}=req.body;
  if(!sql)return res.json({success:false,error:'No query provided'});
  try{
    const start=Date.now();
    const result=executeQuery(sql);
    const ms=Date.now()-start;
    monitorEvent('info','query',`Query executed in ${ms}ms`,{sql,rows:result.total});
    res.json({success:true,...result,ms});
  }catch(e){
    monitorEvent('error','query',`Query failed: ${e.message}`,{sql});
    res.json({success:false,error:e.message});
  }
});

app.get('/api/owner/monitor',ownerOnly,(req,res)=>{
  const{level,category,limit=200}=req.query;
  let logs=MONITOR_LOG;
  if(level)logs=logs.filter(e=>e.level===level);
  if(category)logs=logs.filter(e=>e.category===category);
  const errors=MONITOR_LOG.filter(e=>e.level==='error').length;
  const warnings=MONITOR_LOG.filter(e=>e.level==='warn').length;
  const emailFails=MONITOR_LOG.filter(e=>e.category==='email'&&e.level==='error').length;
  res.json({success:true,summary:{total:MONITOR_LOG.length,errors,warnings,emailFails},logs:logs.slice(0,parseInt(limit))});
});

app.get('/api/owner/tables',ownerOnly,(req,res)=>{
  res.json({success:true,tables:[
    {name:'brands',description:'All brands/companies on the platform'},
    {name:'users',description:'All users across all brands'},
    {name:'issues',description:'All issues/bugs across all brands'},
    {name:'tickets',description:'All support tickets across all brands'},
    {name:'appointments',description:'All appointments across all brands'},
    {name:'support_tickets',description:'Support tickets sent to platform owner'},
    {name:'audit_log',description:'Owner activity audit trail'},
    {name:'comments',description:'All comments across all brands'},
  ],examples:[
    "SELECT * FROM brands",
    "SELECT * FROM brands WHERE status = 'active'",
    "SELECT * FROM brands WHERE tier = 'Pro' ORDER BY createdDate DESC",
    "SELECT name, email, role, _brand FROM users WHERE role = 'Admin'",
    "SELECT * FROM users WHERE _brand = 'konnect'",
    "SELECT * FROM issues WHERE priority = 'Critical'",
    "SELECT * FROM tickets WHERE status = 'open' LIMIT 50",
    "SELECT COUNT(*) FROM tickets",
    "SELECT * FROM appointments WHERE status = 'confirmed'",
    "SELECT * FROM issues WHERE status LIKE '%Open%' ORDER BY createdDate DESC LIMIT 20",
  ]});
});

// Send ALL nurture emails (time-based + trigger) as a test preview to owner email
app.post('/api/owner/nurture/test-all',ownerOnly,async(req,res)=>{
  const toEmail=req.body.to||OWNER_FROM_EMAIL;
  const owner=readOwner();
  const demoName='Asif';
  const demoUrl=BASE_URL;
  const demoUnsub='#';
  const demoStats={issues:12,users:4,emailConnected:true,brandConfigured:true,appointmentsEnabled:true,slaConfigured:true,resolvedTickets:8,appointments:5,totalTickets:20,avgResponse:'2.4h'};
  let sent=0,failed=0;
  // Time-based
  for(const n of NURTURE_EMAILS){
    try{
      const html=n.body(demoName,demoUrl,demoUnsub,demoStats);
      const finalHtml=nurtureShell(html,demoUnsub);
      const subject=`[TEST - Day ${n.day}] ${n.subject}`;
      await sendEmail(toEmail,subject,finalHtml,subject);
      sent++;
      await new Promise(r=>setTimeout(r,400)); // small delay to avoid rate limit
    }catch(e){failed++;console.error('[NurtureTest]',n.subject,e.message);}
  }
  // Trigger-based
  for(const[id,t]of Object.entries(TRIGGER_EMAILS)){
    try{
      const html=t.body(demoName,demoUrl,demoUnsub);
      const subject=`[TEST - Trigger: ${id}] ${t.subject}`;
      await sendEmail(toEmail,subject,html,subject);
      sent++;
      await new Promise(r=>setTimeout(r,400));
    }catch(e){failed++;console.error('[NurtureTest]',id,e.message);}
  }
  res.json({success:true,sent,failed,to:toEmail,message:`${sent} test emails sent to ${toEmail}`});
});

// Run nurture emails right now (same as daily cron, runs for all active brands)
app.post('/api/owner/nurture/run-now',ownerOnly,async(req,res)=>{
  try{
    await sendNurtureEmails();
    res.json({success:true,message:'Nurture run complete — check console log and Live Monitor for details.'});
  }catch(e){res.json({success:false,error:e.message});}
});

// Serve the owner console (search + SQL + monitor)
app.get('/owner-console',(req,res)=>{
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner Console — Resolvo</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
.topbar{background:#1a1d27;border-bottom:1px solid #2d3748;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.topbar h1{font-size:16px;font-weight:700;color:#f5a623}
.badge{font-size:11px;background:#2d3748;color:#94a3b8;padding:4px 10px;border-radius:20px}
.tabs{display:flex;gap:4px;padding:16px 24px 0;border-bottom:1px solid #2d3748;overflow-x:auto}
.tab{padding:10px 20px;font-size:13px;font-weight:600;border-radius:8px 8px 0 0;cursor:pointer;border:none;background:transparent;color:#64748b;white-space:nowrap}
.tab.active{background:#1e2330;color:#f5a623;border:1px solid #2d3748;border-bottom:1px solid #1e2330}
.panel{display:none;padding:20px}.panel.active{display:block}
.btn{padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-primary{background:#f5a623;color:#000}
.btn-ghost{background:#1e2330;color:#94a3b8;border:1px solid #2d3748}
.card{background:#1a1d27;border:1px solid #2d3748;border-radius:12px;padding:20px;margin-bottom:16px}
.card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:14px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
select,input[type=text]{background:#0f1117;border:1px solid #2d3748;border-radius:8px;padding:9px 12px;color:#e2e8f0;font-size:13px;outline:none;min-width:140px}
select:focus,input[type=text]:focus{border-color:#f5a623}
label{font-size:12px;color:#64748b;display:block;margin-bottom:5px}
.presets{display:flex;gap:8px;flex-wrap:wrap}
.preset{padding:7px 14px;border-radius:20px;border:1px solid #2d3748;background:transparent;color:#94a3b8;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}
.preset:hover{background:#f5a623;color:#000;border-color:#f5a623}
.meta{font-size:12px;color:#64748b;padding:8px 12px;background:#161920;border-radius:6px;margin-bottom:10px;display:flex;gap:16px}
.meta b{color:#f5a623}
.table-wrap{overflow:auto;border-radius:10px;border:1px solid #2d3748;max-height:58vh}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#1a1d27;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;position:sticky;top:0;white-space:nowrap;border-bottom:1px solid #2d3748;cursor:pointer}
th:hover{color:#f5a623}
td{padding:9px 14px;border-bottom:1px solid #1e2330;color:#e2e8f0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:hover td{background:#1e2330}
.nv{color:#4a5568;font-style:italic}
.err{background:#2d1515;border:1px solid #dc2626;color:#fca5a5;padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:12px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.stat{background:#1a1d27;border:1px solid #2d3748;border-radius:10px;padding:16px}
.stat-l{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.stat-v{font-size:26px;font-weight:800;color:#f5a623}
.stat-v.red{color:#ef4444}.stat-v.green{color:#22c55e}
.log-list{background:#1a1d27;border:1px solid #2d3748;border-radius:10px;max-height:60vh;overflow-y:auto}
.log-entry{display:flex;gap:10px;padding:9px 14px;border-bottom:1px solid #161920;font-size:12px;align-items:flex-start}
.lv{padding:2px 7px;border-radius:4px;font-weight:700;font-size:10px;text-transform:uppercase;flex-shrink:0}
.lv-error{background:#2d1515;color:#ef4444}.lv-warn{background:#2d2010;color:#f59e0b}.lv-info{background:#0d2340;color:#3b82f6}
.lc{color:#64748b;width:55px;flex-shrink:0}.lm{color:#e2e8f0;flex:1}.lt{color:#4a5568;flex-shrink:0;white-space:nowrap}
.no-data{padding:40px;text-align:center;color:#4a5568;font-size:14px}
.search{width:100%;background:#1a1d27;border:1px solid #2d3748;border-radius:8px;padding:9px 14px;color:#e2e8f0;font-size:13px;outline:none;margin-bottom:12px}
.search:focus{border-color:#f5a623}
.fbtns{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.fb{padding:6px 14px;font-size:12px;border-radius:20px;border:1px solid #2d3748;background:transparent;color:#94a3b8;cursor:pointer}
.fb.active{background:#f5a623;color:#000;border-color:#f5a623}
</style></head><body>
<div class="topbar">
  <h1>⚡ Owner Console</h1>
  <div style="display:flex;gap:10px;align-items:center">
    <span class="badge" id="connStatus">Checking...</span>
    <button class="btn btn-ghost" onclick="location.href='/'">← Back</button>
  </div>
</div>
<div class="tabs">
  <button class="tab active" onclick="switchTab('browse',this)">📋 Browse Data</button>
  <button class="tab" onclick="switchTab('monitor',this)">📊 Live Monitor</button>
  <button class="tab" onclick="switchTab('nurture',this)">📧 Nurture Emails</button>
</div>

<!-- BROWSE PANEL -->
<div id="panel-browse" class="panel active">
  <div class="card">
    <div class="card-title">Quick Reports — click any button to load instantly</div>
    <div class="presets">
      <button class="preset" onclick="runPreset('SELECT * FROM brands')">🏢 All Brands</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM brands WHERE status = 'active'&quot;)">✅ Active Brands</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM brands WHERE tier = 'Pro'&quot;)">⭐ Pro Brands</button>
      <button class="preset" onclick="runPreset('SELECT * FROM users')">👥 All Users</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM users WHERE role = 'Admin'&quot;)">🔑 All Admins</button>
      <button class="preset" onclick="runPreset('SELECT * FROM tickets')">🎫 All Tickets</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM tickets WHERE status = 'open'&quot;)">🔴 Open Tickets</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM issues WHERE priority = 'Critical'&quot;)">🚨 Critical Issues</button>
      <button class="preset" onclick="runPreset('SELECT * FROM appointments')">📅 Appointments</button>
      <button class="preset" onclick="runPreset(&quot;SELECT * FROM appointments WHERE status = 'confirmed'&quot;)">✅ Confirmed Appts</button>
      <button class="preset" onclick="runPreset('SELECT COUNT(*) FROM tickets')">📊 Count Tickets</button>
      <button class="preset" onclick="runPreset('SELECT COUNT(*) FROM users')">📊 Count Users</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Custom Filter — choose what you want to see</div>
    <div class="row">
      <div>
        <label>Show me</label>
        <select id="selTable" onchange="updateFields()">
          <option value="brands">🏢 Brands</option>
          <option value="users">👥 Users</option>
          <option value="tickets">🎫 Tickets</option>
          <option value="issues">🐛 Issues</option>
          <option value="appointments">📅 Appointments</option>
          <option value="support_tickets">📩 Support Tickets</option>
        </select>
      </div>
      <div>
        <label>Where field</label>
        <select id="selField"><option value="">— no filter —</option></select>
      </div>
      <div>
        <label>Is / contains</label>
        <select id="selOp">
          <option value="=">equals</option>
          <option value="LIKE">contains</option>
          <option value="!=">not equal to</option>
          <option value=">">greater than</option>
          <option value="<">less than</option>
        </select>
      </div>
      <div>
        <label>Value</label>
        <input type="text" id="filterVal" placeholder="e.g. active" style="width:160px">
      </div>
      <div>
        <label>Sort by</label>
        <select id="selSort"><option value="">— none —</option></select>
      </div>
      <div>
        <label>Order</label>
        <select id="selOrder"><option value="DESC">Newest first</option><option value="ASC">Oldest first</option></select>
      </div>
      <div>
        <label>Max rows</label>
        <select id="selLimit">
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
          <option value="9999">All</option>
        </select>
      </div>
      <div style="padding-bottom:1px">
        <button class="btn btn-primary" onclick="runBuilder()">▶ Show Results</button>
      </div>
    </div>
  </div>

  <div id="qErr" style="display:none" class="err"></div>
  <div id="qMeta" style="display:none" class="meta"></div>
  <div style="display:flex;gap:10px;margin-bottom:10px">
    <button class="btn btn-ghost" id="exportBtn" style="display:none" onclick="exportCSV()">⬇ Export CSV</button>
  </div>
  <div id="tableWrap" class="table-wrap" style="display:none"></div>
</div>

<!-- MONITOR PANEL -->
<div id="panel-monitor" class="panel">
  <div class="stats-grid" id="monStats"></div>
  <input class="search" id="logSearch" placeholder="Search events..." oninput="filterLogs()">
  <div class="fbtns">
    <button class="fb active" onclick="setFilter('',this)">All</button>
    <button class="fb" onclick="setFilter('error',this)">🔴 Errors only</button>
    <button class="fb" onclick="setFilter('warn',this)">🟡 Warnings</button>
    <button class="fb" onclick="setFilter('info',this)">🔵 Info</button>
    <button class="fb" style="margin-left:auto" onclick="loadMonitor()">🔄 Refresh</button>
  </div>
  <div class="log-list" id="logList"><div class="no-data">Loading...</div></div>
</div>

<!-- NURTURE PANEL -->
<div id="panel-nurture" class="panel">
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px;">
    <div style="flex:1;min-width:220px;">
      <label style="font-size:12px;color:#6b7280;font-weight:700;display:block;margin-bottom:4px;">SEND TEST EMAILS TO</label>
      <input id="nurtureTestTo" class="search" placeholder="contact@resolvogroup.com" style="margin:0;width:100%;box-sizing:border-box;">
    </div>
    <button onclick="sendNurtureTests()" style="padding:10px 22px;background:#10B981;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;height:40px;">📧 Send All 27 Test Emails</button>
    <button onclick="runNurtureNow()" style="padding:10px 22px;background:#6366F1;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;height:40px;">▶ Run Today's Emails Now</button>
  </div>
  <div id="nurtureResult" style="margin-bottom:16px;"></div>
  <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;">
    <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:14px;">📋 Full Email Schedule</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
      ${[
        ['Day 1','Quick tip: Create your first issue','Activation'],
        ['Day 2','Your team is waiting — invite them now','Activation'],
        ['Day 3','Did you know Resolvo has a full email helpdesk?','Activation'],
        ['Day 4','Set up your brand in 5 minutes','Activation'],
        ['Day 5','Your customers can now book appointments','Activation'],
        ['Day 6','Setup checklist — how are you doing?','Activation'],
        ['Day 7','Your first week with Resolvo','Check-in'],
        ['Day 8','Never miss an SLA again','Habit'],
        ['Day 10','3 things your team should set up','Habit'],
        ['Day 12','How to reply to customers from Resolvo','Habit'],
        ['Day 14','Upgrade to Pro? Here\'s what you unlock','Upsell'],
        ['Day 16','Auto-assign tickets instantly','Power'],
        ['Day 18','Your customers deserve a self-service portal','Power'],
        ['Day 21','See how your team is really performing','Power'],
        ['Day 25','Save hours every week with automations','Loyalty'],
        ['Day 30','30 days with Resolvo — milestone stats','Loyalty'],
        ['Day 35','Are your customers happy? CSAT','Loyalty'],
        ['Day 40','Integrate with your existing tools','Loyalty'],
        ['Day 45','Your team\'s busiest hours','Loyalty'],
        ['Day 50','One thing top support teams do differently','Retention'],
        ['Day 60','Still there? We\'d love your feedback','Re-engage'],
        ['Day 75','75 days milestone summary','Retention'],
        ['Day 90','What\'s new in Resolvo this month','Changelog'],
        ['Trigger','No login in 7 days','Behaviour'],
        ['Trigger','First ticket resolved','Behaviour'],
        ['Trigger','10 tickets closed','Behaviour'],
        ['Trigger','Email inbox not connected (day 5+)','Behaviour'],
        ['Trigger','No team members (day 3+)','Behaviour'],
        ['Trigger','Trial expiring in 3 days','Behaviour'],
        ['Trigger','Trial expired','Behaviour'],
      ].map(([day,subj,cat])=>{
        const cc={'Activation':'#10B981','Check-in':'#6366F1','Habit':'#3b82f6','Upsell':'#f59e0b','Power':'#8b5cf6','Loyalty':'#0891b2','Re-engage':'#ef4444','Retention':'#10B981','Changelog':'#6b7280','Behaviour':'#f97316'}[cat]||'#6b7280';
        return '<div style="background:#fff;border-radius:8px;padding:12px 14px;border:1px solid #e5e7eb;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><span style="font-size:11px;font-weight:700;color:#6b7280;">'+day+'</span><span style="font-size:10px;font-weight:700;color:'+cc+';background:'+cc+'18;padding:2px 8px;border-radius:10px;">'+cat+'</span></div><div style="font-size:13px;color:#374151;">'+subj+'</div></div>';
      }).join('')}
    </div>
  </div>
</div>

<!-- LOGIN OVERLAY -->
<div id="loginOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:center;justify-content:center">
  <div style="background:#1a1d27;border:1px solid #2d3748;border-radius:14px;padding:32px;width:340px">
    <div style="font-size:20px;font-weight:800;color:#f5a623;margin-bottom:6px">⚡ Owner Login</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:20px">Sign in with your owner account to continue</div>
    <label style="margin-bottom:5px">Email</label>
    <input id="loginEmail" type="email" value="contact@resolvogroup.com" style="width:100%;background:#0f1117;border:1px solid #2d3748;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:14px;outline:none;margin-bottom:10px">
    <label style="margin-bottom:5px">Password</label>
    <input id="loginPass" type="password" placeholder="Password" style="width:100%;background:#0f1117;border:1px solid #2d3748;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:14px;outline:none;margin-bottom:8px" onkeydown="if(event.key==='Enter')doLogin()">
    <div id="loginErr" style="color:#ef4444;font-size:12px;min-height:18px;margin-bottom:12px"></div>
    <button onclick="doLogin()" style="width:100%;background:#f5a623;color:#000;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer">Sign In →</button>
  </div>
</div>

<script>
const FIELDS={
  brands:['name','slug','status','tier','majorAdminEmail','createdDate','lastActive'],
  users:['name','email','role','active','_brand','createdDate'],
  tickets:['id','subject','status','priority','from','_brand','createdDate','lastActivity'],
  issues:['id','title','status','priority','assignedTo','_brand','createdDate'],
  appointments:['id','customerName','customerEmail','date','time','status','topic','_brand'],
  support_tickets:['id','subject','status','from','brandName','createdAt']
};

let lastResult=null,currentFilter='',allLogs=[],_token='';

function getToken(){
  if(_token)return _token;
  for(const k of Object.keys(localStorage)){if(k.startsWith('portal_token_')){const v=localStorage.getItem(k);if(v){_token=v;return v;}}}
  return localStorage.getItem('tt_token')||'';
}
function setToken(t){_token=t;localStorage.setItem('tt_token',t);}

function switchTab(name,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-'+name).classList.add('active');
  if(name==='monitor')loadMonitor();
}

async function sendNurtureTests(){
  const to=document.getElementById('nurtureTestTo').value.trim()||'contact@resolvogroup.com';
  const el=document.getElementById('nurtureResult');
  el.innerHTML='<p style="color:#6366F1;font-weight:600;">Sending 27 emails... this takes about 30 seconds ⏳</p>';
  try{
    const r=await fetch('/api/owner/nurture/test-all',{method:'POST',headers:{'Content-Type':'application/json','x-session-token':getToken()},body:JSON.stringify({to})});
    const d=await r.json();
    if(d.success)el.innerHTML=\`<p style="color:#10B981;font-weight:700;">✅ \${d.sent} emails sent to \${d.to}\${d.failed?' ('+d.failed+' failed)':''}</p>\`;
    else el.innerHTML=\`<p style="color:#ef4444;">❌ \${d.error||'Send failed'}</p>\`;
  }catch(e){el.innerHTML=\`<p style="color:#ef4444;">❌ \${e.message}</p>\`;}
}

async function runNurtureNow(){
  const el=document.getElementById('nurtureResult');
  el.innerHTML='<p style="color:#6366F1;font-weight:600;">Running nurture jobs...</p>';
  try{
    const r=await fetch('/api/owner/nurture/run-now',{method:'POST',headers:{'x-session-token':getToken()}});
    const d=await r.json();
    if(d.success)el.innerHTML='<p style="color:#10B981;font-weight:700;">✅ '+d.message+'</p>';
    else el.innerHTML='<p style="color:#ef4444;">❌ '+(d.error||'Failed')+'</p>';
  }catch(e){el.innerHTML='<p style="color:#ef4444;">❌ '+e.message+'</p>';}
}

function updateFields(){
  const t=document.getElementById('selTable').value;
  const f=FIELDS[t]||[];
  const fOpts='<option value="">— no filter —</option>'+f.map(x=>\`<option value="\${x}">\${x}</option>\`).join('');
  document.getElementById('selField').innerHTML=fOpts;
  document.getElementById('selSort').innerHTML='<option value="">— none —</option>'+f.map(x=>\`<option value="\${x}">\${x}</option>\`).join('');
}

function buildSQL(){
  const table=document.getElementById('selTable').value;
  const field=document.getElementById('selField').value;
  const op=document.getElementById('selOp').value;
  const val=document.getElementById('filterVal').value.trim();
  const sort=document.getElementById('selSort').value;
  const order=document.getElementById('selOrder').value;
  const limit=document.getElementById('selLimit').value;
  let sql='SELECT * FROM '+table;
  if(field&&val){
    const v=op==='LIKE'?'%'+val+'%':val;
    sql+=" WHERE "+field+" "+op+" '"+v+"'";
  }
  if(sort)sql+=' ORDER BY '+sort+' '+order;
  if(limit&&limit!=='9999')sql+=' LIMIT '+limit;
  return sql;
}

async function runSQL(sql){
  document.getElementById('qErr').style.display='none';
  document.getElementById('tableWrap').style.display='none';
  document.getElementById('qMeta').style.display='none';
  document.getElementById('exportBtn').style.display='none';
  document.getElementById('qMeta').innerHTML='Loading...';
  document.getElementById('qMeta').style.display='flex';
  const res=await fetch('/api/owner/query',{method:'POST',headers:{'Content-Type':'application/json','x-session-token':getToken()},body:JSON.stringify({sql})});
  const data=await res.json();
  if(!data.success){
    document.getElementById('qErr').textContent='Error: '+data.error;
    document.getElementById('qErr').style.display='block';
    document.getElementById('qMeta').style.display='none';
    return;
  }
  lastResult=data;
  document.getElementById('qMeta').innerHTML=\`<b>\${data.total}</b> rows found &nbsp;|&nbsp; <b>\${data.ms}ms</b>\`;
  renderTable(data);
  document.getElementById('exportBtn').style.display='inline-flex';
}

function runBuilder(){runSQL(buildSQL());}
function runPreset(sql){runSQL(sql);}

function renderTable(data){
  if(!data.columns||!data.rows.length){
    document.getElementById('tableWrap').innerHTML='<div class="no-data">No results found</div>';
    document.getElementById('tableWrap').style.display='block';return;
  }
  let html='<table><thead><tr>'+data.columns.map(c=>\`<th>\${c}</th>\`).join('')+'</tr></thead><tbody>';
  data.rows.forEach(row=>{
    html+='<tr>'+row.map(v=>{
      if(v===null||v===undefined)return '<td class="nv">—</td>';
      const s=typeof v==='object'?JSON.stringify(v):String(v);
      const display=s.length>100?s.substring(0,100)+'…':s;
      return \`<td title="\${s.replace(/"/g,'&quot;')}">\${display}</td>\`;
    }).join('')+'</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('tableWrap').innerHTML=html;
  document.getElementById('tableWrap').style.display='block';
}

function exportCSV(){
  if(!lastResult?.columns)return;
  const csv=[lastResult.columns,...lastResult.rows].map(r=>r.map(v=>'"'+(v==null?'':String(v)).replace(/"/g,'""')+'"').join(',')).join('\\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='resolvo-'+(new Date().toISOString().substring(0,10))+'.csv';a.click();
}

async function loadMonitor(){
  const res=await fetch('/api/owner/monitor?limit=500',{headers:{'x-session-token':getToken()}});
  const data=await res.json();allLogs=data.logs||[];
  const s=data.summary||{};
  document.getElementById('monStats').innerHTML=\`
    <div class="stat"><div class="stat-l">Total Events</div><div class="stat-v">\${s.total||0}</div></div>
    <div class="stat"><div class="stat-l">Errors</div><div class="stat-v \${(s.errors||0)>0?'red':'green'}">\${s.errors||0}</div></div>
    <div class="stat"><div class="stat-l">Email Failures</div><div class="stat-v \${(s.emailFails||0)>0?'red':'green'}">\${s.emailFails||0}</div></div>
    <div class="stat"><div class="stat-l">Server</div><div class="stat-v green">Live ✓</div></div>
  \`;filterLogs();
}

function setFilter(f,el){currentFilter=f;document.querySelectorAll('.fb').forEach(b=>b.classList.remove('active'));el.classList.add('active');filterLogs();}
function filterLogs(){
  const q=document.getElementById('logSearch').value.toLowerCase();
  let logs=allLogs;
  if(currentFilter)logs=logs.filter(e=>e.level===currentFilter);
  if(q)logs=logs.filter(e=>(e.message+e.category+(e.detail?JSON.stringify(e.detail):'')).toLowerCase().includes(q));
  const el=document.getElementById('logList');
  if(!logs.length){el.innerHTML='<div class="no-data">No events found</div>';return;}
  el.innerHTML=logs.map(e=>\`<div class="log-entry">
    <span class="lv lv-\${e.level}">\${e.level}</span>
    <span class="lc">\${e.category}</span>
    <span class="lm">\${e.message}\${e.detail?'<br><small style="color:#4a5568">'+JSON.stringify(e.detail).substring(0,180)+'</small>':''}</span>
    <span class="lt">\${e.ts.replace('T',' ').substring(0,19)}</span>
  </div>\`).join('');
}

async function doLogin(){
  const email=document.getElementById('loginEmail').value;
  const pass=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  err.textContent='Signing in...';
  const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
  const d=await res.json();
  if(!d.success){err.textContent=d.error||'Login failed';return;}
  if(!d.isOwner){err.textContent='Owner account required';return;}
  setToken(d.token);
  document.getElementById('loginOverlay').style.display='none';
  document.getElementById('connStatus').textContent='Connected ✓';
  updateFields();
}

// Init
updateFields();
(async()=>{
  const r=await fetch('/api/owner/stats',{headers:{'x-session-token':getToken()}}).catch(()=>null);
  const d=r?await r.json():{success:false};
  if(d.success){document.getElementById('connStatus').textContent='Connected ✓';}
  else{document.getElementById('connStatus').textContent='Login required';document.getElementById('loginOverlay').style.display='flex';}
})();
setInterval(()=>{if(document.getElementById('panel-monitor').classList.contains('active'))loadMonitor();},30000);
</script></body></html>`);
});

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED FEATURES — all optional, toggled per brand in Settings
// ═══════════════════════════════════════════════════════════════════════════

// Helper: get feature flags for a brand
function getFeatures(db){return db.features||{};}
function featEnabled(db,key){return getFeatures(db)[key]===true;}

// ══════════════════════════════════════════════════════════════════════════
// SLACK ALERTS
// ══════════════════════════════════════════════════════════════════════════
async function sendSlackAlert(slug, type, ticket){
  try{
    const db=readBrandDB(slug);
    const s=db.settings||{};
    const webhookUrl=s.SLACK_WEBHOOK_URL;
    if(!webhookUrl)return;
    const slackCfg=db.slackAlerts||{};
    const alertMap={newCritical:'new_critical',slaBreach:'sla_breach',assigned:'assigned',resolved:'resolved'};
    if(!slackCfg[alertMap[type]]&&!slackCfg[type])return;
    const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug)||{};
    const brandName=brand.name||s.APP_NAME||'Support';
    const pColors={Critical:'#DC2626',High:'#D97706',Medium:'#CA8A04',Low:'#16A34A'};
    const typeLabels={newCritical:'🚨 New Critical Ticket',slaBreach:'⏰ SLA Breach Warning',assigned:'👤 Ticket Assigned',resolved:'✅ Ticket Resolved'};
    const color=pColors[ticket.priority]||'#6B7280';
    const payload={
      attachments:[{
        color:color,
        blocks:[
          {type:'header',text:{type:'plain_text',text:typeLabels[type]||type,emoji:true}},
          {type:'section',fields:[
            {type:'mrkdwn',text:'*Ticket:*\n'+ticket.id},
            {type:'mrkdwn',text:'*Priority:*\n'+ticket.priority},
            {type:'mrkdwn',text:'*Subject:*\n'+(ticket.subject||'').substring(0,60)},
            {type:'mrkdwn',text:'*From:*\n'+(ticket.fromName||ticket.from||'Unknown')},
            ...(ticket.assignedTo?[{type:'mrkdwn',text:'*Assigned to:*\n'+ticket.assignedTo}]:[]),
            {type:'mrkdwn',text:'*Status:*\n'+(ticket.status||'new').toUpperCase()},
          ]},
          {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open Ticket →'},url:BASE_URL,action_id:'open_ticket'}]},
        ]
      }]
    };
    const https=require('https');const url=require('url');
    const parsed=url.parse(webhookUrl);
    const body=JSON.stringify(payload);
    await new Promise((res,rej)=>{
      const r=https.request({hostname:parsed.hostname,path:parsed.path,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},resp=>{resp.on('data',()=>{});resp.on('end',res);});
      r.on('error',rej);r.write(body);r.end();
    });
  }catch(e){console.error('[Slack]',e.message);}
}

// Slack config endpoints
app.get('/api/slack/config',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  if(su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const db=readBrandDB(su.brandSlug);
  res.json({success:true,config:{webhookUrl:db.settings?.SLACK_WEBHOOK_URL||'',alerts:db.slackAlerts||{}}});
});
app.post('/api/slack/config',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  if(su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const db=readBrandDB(su.brandSlug);
  if(req.body.webhookUrl!==undefined){db.settings=db.settings||{};db.settings.SLACK_WEBHOOK_URL=req.body.webhookUrl;}
  if(req.body.alerts)db.slackAlerts=req.body.alerts;
  writeBrandDB(su.brandSlug,db);
  res.json({success:true});
});
app.post('/api/slack/test',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  if(su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  sendSlackAlert(su.brandSlug,'newCritical',{id:'TEST-001',subject:'Test alert from Resolvo',priority:'High',fromName:'Test User',from:'test@example.com',status:'new',assignedTo:su.email})
    .then(()=>res.json({success:true})).catch(e=>res.json({success:false,error:e.message}));
});

// ══════════════════════════════════════════════════════════════════════════
// PER-USER API TOKENS
// ══════════════════════════════════════════════════════════════════════════
const crypto=require('crypto');
function hashToken(t){return crypto.createHash('sha256').update(t).digest('hex');}

// Extend getSessionUser to also accept x-api-token
const _origGetSessionUser=getSessionUser;
// Override with token support — we'll patch after the original is defined
function getSessionUserWithToken(req){
  const existing=_origGetSessionUser(req);
  if(existing)return existing;
  const apiToken=req.headers['x-api-token'];
  if(!apiToken)return null;
  const hash=hashToken(apiToken);
  const owner=readOwner();
  for(const brand of (owner.brands||[])){
    try{
      const db=readBrandDB(brand.slug);
      const user=(db.users||[]).find(u=>u.apiTokenHash===hash&&u.active);
      if(user){
        return{id:user.id,email:user.email,name:user.name||user.email,role:user.role,brandSlug:brand.slug,brandName:brand.name||'',brandTier:brand.tier||'Free',brandAccentColor:brand.accentColor||'#F5A623',isOwner:false,tokenAuth:true};
      }
    }catch(e){}
  }
  return null;
}

app.get('/api/user/token',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  const user=(db.users||[]).find(u=>u.id===su.id);
  res.json({success:true,hasToken:!!(user&&user.apiTokenHash),maskedToken:user&&user.apiTokenMask||null});
});
app.post('/api/user/token/generate',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  const idx=(db.users||[]).findIndex(u=>u.id===su.id);
  if(idx===-1)return res.json({success:false,error:'User not found'});
  const token='rslv_'+crypto.randomBytes(24).toString('hex');
  db.users[idx].apiTokenHash=hashToken(token);
  db.users[idx].apiTokenMask=token.substring(0,8)+'...'+token.slice(-4);
  db.users[idx].apiTokenCreated=new Date().toISOString();
  writeBrandDB(su.brandSlug,db);
  res.json({success:true,token,mask:db.users[idx].apiTokenMask,warning:'Copy this token now — it will never be shown again.'});
});
app.post('/api/user/token/revoke',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const targetId=req.body.userId||su.id;
  if(targetId!==su.id&&su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const db=readBrandDB(su.brandSlug);
  const idx=(db.users||[]).findIndex(u=>u.id===targetId);
  if(idx===-1)return res.json({success:false,error:'User not found'});
  delete db.users[idx].apiTokenHash;delete db.users[idx].apiTokenMask;delete db.users[idx].apiTokenCreated;
  writeBrandDB(su.brandSlug,db);
  res.json({success:true});
});
app.get('/api/admin/tokens',(req,res)=>{
  const su=getSessionUser(req);if(!su||su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const db=readBrandDB(su.brandSlug);
  const tokens=(db.users||[]).filter(u=>u.apiTokenHash).map(u=>({userId:u.id,email:u.email,name:u.name||u.email,role:u.role,mask:u.apiTokenMask,created:u.apiTokenCreated}));
  res.json({success:true,tokens});
});

// ══════════════════════════════════════════════════════════════════════════
// TICKET SOURCES — public create + web widget
// ══════════════════════════════════════════════════════════════════════════
// Public ticket creation via API token (Zapier, web form, external apps)
app.post('/api/tickets/public/create',(req,res)=>{
  const{subject,body,name,email,priority,source,slug:bodySlug}=req.body;
  if(!subject||!email)return res.json({success:false,error:'subject and email are required'});
  // Widget source — identify brand from slug in body or query
  const widgetSlug=req.query.slug||bodySlug;
  let brandSlug=null;
  if(source==='widget'&&widgetSlug){
    const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===widgetSlug);
    if(brand)brandSlug=widgetSlug;
  }
  // API token auth (non-widget)
  if(!brandSlug){
    const su=getSessionUserWithToken(req);
    if(!su)return res.json({success:false,error:'Invalid or missing API token. Use x-api-token header.'});
    brandSlug=su.brandSlug;
  }
  const db=readBrandDB(brandSlug);
  const ticketId=generateId('TKT');
  const now=new Date().toISOString();
  const ticket={id:ticketId,subject:subject.substring(0,200),from:email,fromName:name||email.split('@')[0],
    status:'new',priority:(['Critical','High','Medium','Low'].includes(priority)?priority:'Medium'),
    source:source||'api',createdDate:now,lastActivity:now,
    thread:[{id:generateId('MSG'),type:'incoming',from:email,fromName:name||email.split('@')[0],body:body||subject,timestamp:now}],
    assignedTo:'',tags:[],watchers:[],cc:[],timeline:[{event:'ticket_created',by:email,at:now,detail:'Created via '+(source||'api')}]
  };
  db.tickets=db.tickets||[];db.tickets.push(ticket);writeBrandDB(brandSlug,db);
  sendSlackAlert(brandSlug,ticket.priority==='Critical'?'newCritical':'assigned',ticket).catch(()=>{});
  res.json({success:true,ticketId});
});

// Embeddable widget JS — served at /widget/:slug/widget.js
app.get('/widget/:slug/widget.js',(req,res)=>{
  const slug=req.params.slug;
  const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===slug);
  if(!brand)return res.status(404).send('// Brand not found');
  const color=brand.accentColor||'#10B981';
  const name=brand.name||'Support';
  const apiBase=BASE_URL;
  res.setHeader('Content-Type','application/javascript');
  res.send(`(function(){
  if(document.getElementById('_resolvo_widget'))return;
  var s=document.createElement('style');
  s.innerHTML='#_resolvo_btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:${color};color:#fff;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:99999;display:flex;align-items:center;justify-content:center;transition:transform .15s;}#_resolvo_btn:hover{transform:scale(1.08);}#_resolvo_frame{position:fixed;bottom:90px;right:20px;width:360px;max-width:calc(100vw - 40px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);z-index:99998;overflow:hidden;display:none;font-family:system-ui,sans-serif;}#_resolvo_hdr{background:${color};color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;}#_resolvo_hdr span{font-weight:700;font-size:15px;}#_resolvo_close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;}#_resolvo_body{padding:20px;}#_resolvo_body input,#_resolvo_body textarea,#_resolvo_body select{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px;outline:none;font-family:inherit;}#_resolvo_body textarea{min-height:80px;resize:vertical;}#_resolvo_submit{width:100%;padding:11px;background:${color};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;}#_resolvo_success{text-align:center;padding:24px;font-size:14px;color:#374151;}';
  document.head.appendChild(s);
  var div=document.createElement('div');div.id='_resolvo_widget';
  div.innerHTML='<button id="_resolvo_btn" aria-label="Support">💬</button><div id="_resolvo_frame"><div id="_resolvo_hdr"><span>${name} Support</span><button id="_resolvo_close" aria-label="Close">×</button></div><div id="_resolvo_body"><input id="_rn" placeholder="Your name" required><input id="_re" type="email" placeholder="Email address" required><select id="_rp"><option value="Low">Low priority</option><option value="Medium" selected>Medium priority</option><option value="High">High priority</option><option value="Critical">Critical</option></select><input id="_rs" placeholder="Subject" required><textarea id="_rm" placeholder="Describe your issue..."></textarea><button id="_resolvo_submit">Send Message →</button></div></div>';
  document.body.appendChild(div);
  document.getElementById('_resolvo_btn').onclick=function(){var f=document.getElementById('_resolvo_frame');f.style.display=f.style.display==='block'?'none':'block';};
  document.getElementById('_resolvo_close').onclick=function(){document.getElementById('_resolvo_frame').style.display='none';};
  document.getElementById('_resolvo_submit').onclick=function(){
    var n=document.getElementById('_rn').value.trim(),e=document.getElementById('_re').value.trim(),s=document.getElementById('_rs').value.trim(),m=document.getElementById('_rm').value.trim(),p=document.getElementById('_rp').value;
    if(!e||!s){alert('Email and subject are required');return;}
    fetch('${apiBase}/api/tickets/public/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,subject:s,body:m||s,priority:p,source:'widget',slug:'${slug}'})})
      .then(function(r){return r.json();}).then(function(d){
        var b=document.getElementById('_resolvo_body');
        b.innerHTML=d.success?'<div id="_resolvo_success">✅ Ticket submitted!<br><small style=\\"color:#6b7280;margin-top:6px;display:block;\\">Ref: '+d.ticketId+'<br>We will reply to '+e+'</small></div>':'<div style=\\"color:#dc2626;padding:10px;\\">Failed: '+( d.error||'Unknown error')+'</div>';
      }).catch(function(){document.getElementById('_resolvo_body').innerHTML='<div style=\\"color:#dc2626;padding:10px;\\">Network error. Try again.</div>';});
  };
})();`);
});


// ── Feature flags API ─────────────────────────────────────────────────────
app.get('/api/features',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  res.json({success:true,features:db.features||{}});
});
app.post('/api/features',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  if(su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const db=readBrandDB(su.brandSlug);
  db.features=Object.assign(db.features||{},req.body);
  writeBrandDB(su.brandSlug,db);
  res.json({success:true,features:db.features});
});

// ── In-memory: collision detection presence tracking ─────────────────────
const TICKET_PRESENCE={};// {ticketId:[{userId,name,ts}]}
function prunePresence(){const now=Date.now();Object.keys(TICKET_PRESENCE).forEach(tid=>{TICKET_PRESENCE[tid]=(TICKET_PRESENCE[tid]||[]).filter(p=>now-p.ts<30000);if(!TICKET_PRESENCE[tid].length)delete TICKET_PRESENCE[tid];});}
setInterval(prunePresence,15000);

app.post('/api/tickets/:id/presence',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'collisionDetection'))return res.json({success:false,disabled:true});
  const tid=req.params.id;
  prunePresence();
  TICKET_PRESENCE[tid]=TICKET_PRESENCE[tid]||[];
  const idx=TICKET_PRESENCE[tid].findIndex(p=>p.userId===su.id);
  if(idx>=0)TICKET_PRESENCE[tid][idx].ts=Date.now();
  else TICKET_PRESENCE[tid].push({userId:su.id,name:su.name||su.email,email:su.email,ts:Date.now()});
  const others=TICKET_PRESENCE[tid].filter(p=>p.userId!==su.id);
  res.json({success:true,others});
});

// ── Ticket events (for Replay feature) ───────────────────────────────────
function logTicketEvent(slug,ticketId,type,actor,detail){
  try{
    const db=readBrandDB(slug);
    if(!featEnabled(db,'ticketReplay'))return;
    const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
    if(idx<0)return;
    db.tickets[idx].events=db.tickets[idx].events||[];
    db.tickets[idx].events.push({type,actor,detail,ts:new Date().toISOString()});
    writeBrandDB(slug,db);
  }catch(e){}
}

app.get('/api/tickets/:id/replay',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'ticketReplay'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Ticket not found'});
  res.json({success:true,events:ticket.events||[],ticket:{id:ticket.id,subject:ticket.subject,createdAt:ticket.createdAt}});
});

// ── Mood / sentiment analysis ─────────────────────────────────────────────
function scoreSentiment(text){
  const t=(text||'').toLowerCase();
  const neg=['angry','furious','terrible','awful','horrible','worst','useless','broken','failed','pathetic','waste','scam','fraud','disgusting','unacceptable','disappointed','disaster','ridiculous','hate','never again'];
  const pos=['thanks','thank you','great','excellent','wonderful','amazing','fantastic','perfect','helpful','awesome','love','appreciate','brilliant','outstanding','best'];
  let score=50;
  neg.forEach(w=>{if(t.includes(w))score-=12;});
  pos.forEach(w=>{if(t.includes(w))score+=10;});
  return Math.max(0,Math.min(100,score));
}

app.get('/api/tickets/:id/mood',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'moodTimeline'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  const thread=ticket.thread||[];
  const points=thread.map(m=>({ts:m.timestamp,score:scoreSentiment(m.body),from:m.fromName||m.from,type:m.type}));
  // Add original message
  const initial={ts:ticket.createdAt,score:scoreSentiment(ticket.body||ticket.description||''),from:ticket.fromName||ticket.from||'Customer',type:'initial'};
  res.json({success:true,points:[initial,...points]});
});

// ── Ticket Health Score ───────────────────────────────────────────────────
function calcHealthScore(ticket,db){
  let score=100;
  const now=Date.now();
  const created=new Date(ticket.createdAt||ticket.createdDate||now).getTime();
  const last=new Date(ticket.lastActivity||ticket.createdAt||now).getTime();
  const ageSince=Math.floor((now-last)/3600000);// hours since last activity
  const ageTotal=Math.floor((now-created)/86400000);// days old
  const reopens=ticket.reopenCount||0;
  const sentiment=scoreSentiment(ticket.body||ticket.description||'');
  // SLA proximity
  const slaHours=(db.slaConfig||{})[(ticket.priority||'medium').toLowerCase()]||48;
  const slaPct=Math.min(1,(now-created)/(slaHours*3600000));
  score-=slaPct*35;// up to -35 for SLA
  score-=Math.min(25,ageSince*2);// up to -25 for silence
  score-=reopens*10;// -10 per reopen
  if(sentiment<40)score-=15;
  if(ageTotal>7)score-=10;
  return Math.max(0,Math.round(score));
}

app.get('/api/tickets/:id/health',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'ticketHealthScore'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  res.json({success:true,score:calcHealthScore(ticket,db),ticketId:ticket.id});
});

app.get('/api/tickets/health-all',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'ticketHealthScore'))return res.json({success:false,error:'Feature not enabled'});
  const open=(db.tickets||[]).filter(t=>!['resolved','closed'].includes(t.status));
  const scored=open.map(t=>({id:t.id,subject:t.subject,health:calcHealthScore(t,db),priority:t.priority,assignedTo:t.assignedTo,status:t.status})).sort((a,b)=>a.health-b.health);
  res.json({success:true,tickets:scored});
});

// ── Promised Callback Tracker ─────────────────────────────────────────────
app.post('/api/tickets/:id/promise-callback',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'promisedCallback'))return res.json({success:false,error:'Feature not enabled'});
  const{callbackAt,note}=req.body;
  if(!callbackAt)return res.json({success:false,error:'callbackAt required'});
  const idx=(db.tickets||[]).findIndex(t=>t.id===req.params.id);
  if(idx<0)return res.json({success:false,error:'Ticket not found'});
  db.tickets[idx].promisedCallback={agentEmail:su.email,agentName:su.name||su.email,callbackAt,note:note||'',createdAt:new Date().toISOString(),status:'pending'};
  db.tickets[idx].lastActivity=new Date().toISOString();
  writeBrandDB(su.brandSlug,db);
  // Notify customer
  const ticket=db.tickets[idx];
  if(ticket.from){
    const owner=readOwner();const brand=(owner.brands||[]).find(b=>b.slug===su.brandSlug)||{};
    const cbDate=new Date(callbackAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
    sendBrandEmail(su.brandSlug,ticket.from,`Callback Confirmed — ${brand.name||su.brandName}`,`<div style="font-family:Arial;max-width:520px;padding:24px;"><h3>Callback Scheduled</h3><p>Your agent <strong>${su.name||su.email}</strong> has promised to call you back by <strong>${cbDate}</strong>.</p>${note?'<p>Note: '+note+'</p>':''}<p style="color:#6b7280;font-size:13px;">Ticket: ${req.params.id}</p></div>`,`Callback by ${su.name||su.email} at ${cbDate}`).catch(()=>{});
  }
  res.json({success:true});
});

app.get('/api/tickets/:id/promise-callback',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  res.json({success:true,promise:ticket.promisedCallback||null});
});

// Background: check overdue callbacks every 15 min
setInterval(async()=>{
  const owner=readOwner();
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
    try{
      const db=readBrandDB(brand.slug);
      if(!featEnabled(db,'promisedCallback'))continue;
      const now=new Date();
      let changed=false;
      for(const ticket of(db.tickets||[])){
        const cb=ticket.promisedCallback;
        if(!cb||cb.status!=='pending')continue;
        if(new Date(cb.callbackAt)<now){
          ticket.promisedCallback.status='overdue';
          // Notify agent
          const agent=(db.users||[]).find(u=>u.email===cb.agentEmail);
          if(agent)sendEmail(agent.email,`⏰ Overdue Callback: ${ticket.subject}`,`<p>Your promised callback for ticket <strong>${ticket.id}</strong> is overdue. Callback was due at ${new Date(cb.callbackAt).toLocaleString()}.</p>`,`Overdue callback: ${ticket.id}`).catch(()=>{});
          changed=true;
        }
      }
      if(changed)writeBrandDB(brand.slug,db);
    }catch(e){}
  }
},15*60*1000);

// ── Post-ticket Mood Stamp ────────────────────────────────────────────────
app.post('/api/tickets/:id/mood-stamp',(req,res)=>{
  const{emoji,token}=req.body;
  const validEmojis=['😞','😐','😊','😄','😡'];
  if(!validEmojis.includes(emoji))return res.json({success:false,error:'Invalid emoji'});
  // Find ticket across all brands
  const owner=readOwner();
  for(const brand of(owner.brands||[])){
    try{
      const db=readBrandDB(brand.slug);
      if(!featEnabled(db,'moodStamp'))continue;
      const idx=(db.tickets||[]).findIndex(t=>t.id===req.params.id);
      if(idx<0)continue;
      db.tickets[idx].moodStamp={emoji,stampedAt:new Date().toISOString()};
      writeBrandDB(brand.slug,db);
      return res.json({success:true});
    }catch(e){}
  }
  res.json({success:false,error:'Ticket not found'});
});

app.get('/api/mood-stamp-stats',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'moodStamp'))return res.json({success:false,error:'Feature not enabled'});
  const counts={'😞':0,'😐':0,'😊':0,'😄':0,'😡':0};
  (db.tickets||[]).filter(t=>t.moodStamp).forEach(t=>{ if(counts[t.moodStamp.emoji]!==undefined)counts[t.moodStamp.emoji]++; });
  res.json({success:true,counts});
});

// ── Silence Detection (background job) ───────────────────────────────────
setInterval(async()=>{
  const owner=readOwner();
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
    try{
      const db=readBrandDB(brand.slug);
      if(!featEnabled(db,'silenceDetection'))continue;
      const silenceHours=(db.features?.silenceHours)||48;
      const cutoff=new Date(Date.now()-silenceHours*3600000);
      let changed=false;
      for(const ticket of(db.tickets||[]).filter(t=>t.status==='open'&&t.from)){
        const lastReply=(ticket.thread||[]).filter(m=>m.type==='reply').pop();
        if(!lastReply)continue;// no agent reply yet
        const lastCustomer=(ticket.thread||[]).filter(m=>m.type!=='reply'&&m.type!=='note').pop();
        const lastCustomerTime=lastCustomer?new Date(lastCustomer.timestamp):new Date(ticket.createdAt);
        if(lastCustomerTime<cutoff&&!ticket.silenceFollowUpSent){
          const owner2=readOwner();const b=(owner2.brands||[]).find(x=>x.slug===brand.slug)||{};
          await sendBrandEmail(brand.slug,ticket.from,`Following up on your request — ${b.name||brand.slug}`,`<div style="font-family:Arial;max-width:520px;padding:24px;"><p>Hi there,</p><p>We wanted to check in on your support request <strong>${ticket.id}</strong> — ${ticket.subject}.</p><p>Did our last reply help? Let us know and we can close this out, or continue if you still need assistance.</p><p style="color:#6b7280;font-size:13px;">— ${b.name||'Support Team'}</p></div>`,`Following up on ${ticket.id}`).catch(()=>{});
          ticket.silenceFollowUpSent=new Date().toISOString();
          changed=true;
          console.log(`[Silence] Follow-up sent for ${ticket.id} (${brand.slug})`);
        }
      }
      if(changed)writeBrandDB(brand.slug,db);
    }catch(e){console.error('[Silence]',e.message);}
  }
},3*60*60*1000);// every 3 hours

// ── Smart Auto-close Suggest ──────────────────────────────────────────────
app.post('/api/tickets/:id/auto-close-suggest',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'smartAutoClose'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  const lastThread=(ticket.thread||[]).slice(-3).map(m=>m.body).join(' ');
  const draft=`Hi ${ticket.fromName||'there'},\n\nWe noticed we haven't heard back from you regarding ticket ${ticket.id} — ${ticket.subject}.\n\nWe're going to go ahead and mark this as resolved. If you still need assistance, simply reply to this email and we'll reopen it immediately.\n\nThank you for contacting us!\n\n— ${su.name||'Support Team'}`;
  res.json({success:true,draft,ticketId:ticket.id});
});

app.post('/api/tickets/:id/auto-close-confirm',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'smartAutoClose'))return res.json({success:false,error:'Feature not enabled'});
  const{message}=req.body;
  const idx=(db.tickets||[]).findIndex(t=>t.id===req.params.id);
  if(idx<0)return res.json({success:false,error:'Not found'});
  const ticket=db.tickets[idx];
  if(ticket.from&&message){
    sendBrandEmail(su.brandSlug,ticket.from,`Re: [${su.brandName}] ${ticket.subject}`,`<div style="font-family:Arial;max-width:520px;padding:24px;white-space:pre-wrap;">${message.replace(/\n/g,'<br>')}</div>`,message).catch(()=>{});
  }
  db.tickets[idx].status='resolved';
  db.tickets[idx].resolvedAt=new Date().toISOString();
  db.tickets[idx].resolvedBy=su.email;
  db.tickets[idx].lastActivity=new Date().toISOString();
  writeBrandDB(su.brandSlug,db);
  res.json({success:true});
});

// Background: identify auto-close candidates daily
setInterval(async()=>{
  const owner=readOwner();
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
    try{
      const db=readBrandDB(brand.slug);
      if(!featEnabled(db,'smartAutoClose'))continue;
      const days=(db.features?.autoCloseDays)||5;
      const cutoff=new Date(Date.now()-days*86400000);
      db.autoCloseSuggestions=(db.tickets||[])
        .filter(t=>t.status==='open'&&new Date(t.lastActivity||t.createdAt)<cutoff)
        .map(t=>t.id);
      if(db.autoCloseSuggestions.length)writeBrandDB(brand.slug,db);
    }catch(e){}
  }
},24*60*60*1000);

// ── Agent Burnout Score ───────────────────────────────────────────────────
app.get('/api/burnout-scores',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'agentBurnoutScore'))return res.json({success:false,error:'Feature not enabled'});
  if(su.role!=='Admin')return res.json({success:false,error:'Admin only'});
  const now=Date.now();const weekAgo=now-7*86400000;
  const agents=(db.users||[]).filter(u=>u.active&&u.role!=='Admin');
  const scores=agents.map(agent=>{
    const myTickets=(db.tickets||[]).filter(t=>t.assignedTo===agent.email);
    const weekTickets=myTickets.filter(t=>new Date(t.lastActivity||t.createdAt).getTime()>weekAgo);
    const afterHours=weekTickets.filter(t=>{const h=new Date(t.lastActivity||t.createdAt).getHours();return h<8||h>19;}).length;
    const escalated=myTickets.filter(t=>t.priority==='Critical'||t.escalated).length;
    const openCount=myTickets.filter(t=>t.status==='open').length;
    // Score: higher = more at risk
    const raw=Math.min(100,openCount*3+weekTickets.length*2+afterHours*5+escalated*4);
    let risk='Low';
    if(raw>=60)risk='High';
    else if(raw>=35)risk='Medium';
    return{name:agent.name||agent.email,email:agent.email,score:raw,risk,openTickets:openCount,weeklyLoad:weekTickets.length,afterHours,escalated};
  }).sort((a,b)=>b.score-a.score);
  res.json({success:true,scores});
});

// ── One-click Root Cause Report ───────────────────────────────────────────
app.post('/api/root-cause-report',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'rootCauseReport'))return res.json({success:false,error:'Feature not enabled'});
  if(!['Admin','Developer'].includes(su.role))return res.json({success:false,error:'Admin/Developer only'});
  const{keyword,days}=req.body;
  if(!keyword)return res.json({success:false,error:'keyword required'});
  const since=new Date(Date.now()-(days||30)*86400000);
  const matched=(db.tickets||[]).filter(t=>{
    const text=((t.subject||'')+(t.body||t.description||'')).toLowerCase();
    return text.includes(keyword.toLowerCase())&&new Date(t.createdAt||t.createdDate)>since;
  });
  if(matched.length<1)return res.json({success:false,error:'No tickets found matching that keyword'});
  const statuses={};matched.forEach(t=>{statuses[t.status||'unknown']=(statuses[t.status||'unknown']||0)+1;});
  const firstSeen=matched.reduce((min,t)=>{const d=new Date(t.createdAt||t.createdDate);return d<min?d:min;},new Date());
  const report={keyword,ticketCount:matched.length,firstSeen:firstSeen.toISOString(),dateRange:`Last ${days||30} days`,statusBreakdown:statuses,affectedCustomers:[...new Set(matched.map(t=>t.from||t.fromName).filter(Boolean))].length,tickets:matched.map(t=>({id:t.id,subject:t.subject,status:t.status,priority:t.priority,from:t.from,createdAt:t.createdAt})),generatedAt:new Date().toISOString(),generatedBy:su.email};
  // Store it
  db.rootCauseReports=db.rootCauseReports||[];
  db.rootCauseReports.unshift({...report,id:generateId('RCR')});
  if(db.rootCauseReports.length>50)db.rootCauseReports=db.rootCauseReports.slice(0,50);
  writeBrandDB(su.brandSlug,db);
  res.json({success:true,report});
});

app.get('/api/root-cause-reports',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'rootCauseReport'))return res.json({success:false,error:'Feature not enabled'});
  res.json({success:true,reports:(db.rootCauseReports||[]).slice(0,20)});
});

// ── Ticket Clipboard ──────────────────────────────────────────────────────
// Client-side only (localStorage) — server provides clip metadata endpoint
app.post('/api/tickets/:id/clip',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'ticketClipboard'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  res.json({success:true,clip:{id:ticket.id,subject:ticket.subject,status:ticket.status,priority:ticket.priority,from:ticket.from,createdAt:ticket.createdAt,snippet:(ticket.body||ticket.description||'').substring(0,200)}});
});

// ── AI Ticket Triage ──────────────────────────────────────────────────────
async function aiTriageTicket(slug,ticketId){
  try{
    const db=readBrandDB(slug);
    if(!featEnabled(db,'aiTriage'))return;
    if(!process.env.GEMINI_API_KEY)return;
    const idx=(db.tickets||[]).findIndex(t=>t.id===ticketId);
    if(idx<0)return;
    const ticket=db.tickets[idx];
    const prompt=`You are a support ticket triage assistant. Analyse this support ticket and respond with ONLY valid JSON.

Ticket subject: ${ticket.subject}
Ticket body: ${(ticket.body||ticket.description||'').substring(0,500)}

Respond with exactly this JSON structure (no markdown, no explanation):
{"priority":"Critical|High|Medium|Low","category":"billing|technical|general|complaint|refund|feature_request","sentiment":"positive|neutral|negative","suggestedReply":"A short one-sentence canned reply suggestion","tags":["tag1","tag2"]}`;
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
    const json=await r.json();
    const raw=(json.candidates?.[0]?.content?.parts?.[0]?.text||'').trim();
    const parsed=JSON.parse(raw.replace(/```json\n?|\n?```/g,''));
    db.tickets[idx].aiTriage={...parsed,triagedAt:new Date().toISOString()};
    if(!db.tickets[idx].priority||db.tickets[idx].priority==='Medium')db.tickets[idx].priority=parsed.priority;
    if(parsed.tags)db.tickets[idx].tags=[...new Set([...(db.tickets[idx].tags||[]),...parsed.tags])];
    writeBrandDB(slug,db);
    console.log(`[AiTriage] ${ticketId} → ${parsed.priority} / ${parsed.category}`);
  }catch(e){console.error('[AiTriage]',ticketId,e.message);}
}

app.post('/api/tickets/:id/triage',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'aiTriage'))return res.json({success:false,error:'Feature not enabled'});
  aiTriageTicket(su.brandSlug,req.params.id).catch(()=>{});
  res.json({success:true,message:'Triage running in background'});
});

app.get('/api/tickets/:id/triage',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'aiTriage'))return res.json({success:false,error:'Feature not enabled'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket)return res.json({success:false,error:'Not found'});
  res.json({success:true,triage:ticket.aiTriage||null});
});

// ── AI-suggested Canned Responses ─────────────────────────────────────────
app.get('/api/canned-suggest',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'aiCannedResponses'))return res.json({success:false,error:'Feature not enabled'});
  const q=(req.query.q||'').toLowerCase();
  if(q.length<3)return res.json({success:true,suggestions:[]});
  const canned=db.cannedResponses||[];
  const scored=canned.map(c=>{
    const text=(c.title+' '+c.body).toLowerCase();
    const words=q.split(/\s+/).filter(w=>w.length>2);
    const hits=words.filter(w=>text.includes(w)).length;
    return{...c,score:hits};
  }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
  res.json({success:true,suggestions:scored});
});

// ── Internal Changelog Publisher (Owner feature) ──────────────────────────
app.get('/api/owner/changelogs',ownerOnly,(req,res)=>{
  const owner=readOwner();
  res.json({success:true,changelogs:(owner.changelogs||[]).slice(0,50)});
});

app.post('/api/owner/changelogs',ownerOnly,async(req,res)=>{
  const{title,body,type}=req.body;
  if(!title||!body)return res.json({success:false,error:'title and body required'});
  const owner=readOwner();
  owner.changelogs=owner.changelogs||[];
  const entry={id:generateId('CHL'),title,body,type:type||'update',publishedAt:new Date().toISOString()};
  owner.changelogs.unshift(entry);
  writeOwner(owner);
  // Email all active brand admins
  let sent=0;
  const typeEmoji={'update':'✨','fix':'🐛','new':'🚀','maintenance':'🔧'}[type||'update']||'✨';
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active'&&b.majorAdminEmail)){
    try{
      const html=`<div style="font-family:Arial;max-width:540px;margin:0 auto;padding:24px;background:#fff;border-radius:14px;"><div style="background:linear-gradient(135deg,#10B981,#6366F1);border-radius:10px;padding:16px 24px;margin-bottom:20px;"><span style="font-size:16px;font-weight:800;color:#fff;">Resolvo ${typeEmoji} ${type==='new'?'New Feature':'Update'}</span></div><h2 style="font-size:18px;color:#111827;margin:0 0 12px;">${title}</h2><div style="font-size:14px;color:#374151;line-height:1.8;white-space:pre-wrap;">${body}</div><div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">Published ${new Date().toLocaleDateString()}</div></div>`;
      await sendEmail(brand.majorAdminEmail,`${typeEmoji} ${title} — Resolvo Update`,html,`${title}\n\n${body}`);
      sent++;
    }catch(e){}
  }
  res.json({success:true,entry,emailsSent:sent});
});

// ── WhatsApp Ticket Inbox (Twilio webhook) ────────────────────────────────
app.post('/api/whatsapp/webhook',async(req,res)=>{
  // Standard Twilio WhatsApp webhook
  const{From,Body,ProfileName,WaId}=req.body;
  if(!From||!Body)return res.status(200).send('<Response></Response>');
  // Find brand configured for this WhatsApp number
  const owner=readOwner();
  let handled=false;
  for(const brand of(owner.brands||[]).filter(b=>b.status==='active')){
    try{
      const db=readBrandDB(brand.slug);
      if(!featEnabled(db,'whatsapp'))continue;
      if(!db.features?.whatsappNumber)continue;
      // Create or append to existing ticket from this WhatsApp number
      const existingIdx=(db.tickets||[]).findIndex(t=>t.whatsappFrom===WaId&&t.status==='open');
      const ticketId=existingIdx>=0?db.tickets[existingIdx].id:generateId('TKT');
      if(existingIdx>=0){
        db.tickets[existingIdx].thread=db.tickets[existingIdx].thread||[];
        db.tickets[existingIdx].thread.push({id:generateId('MSG'),type:'customer',from:From,fromName:ProfileName||From,body:Body,timestamp:new Date().toISOString(),channel:'whatsapp'});
        db.tickets[existingIdx].lastActivity=new Date().toISOString();
      }else{
        db.tickets=db.tickets||[];
        db.tickets.unshift({id:ticketId,subject:`WhatsApp: ${Body.substring(0,60)}`,body:Body,from:From,fromName:ProfileName||From,whatsappFrom:WaId,channel:'whatsapp',status:'open',priority:'Medium',createdAt:new Date().toISOString(),lastActivity:new Date().toISOString(),thread:[]});
      }
      writeBrandDB(brand.slug,db);
      handled=true;
      console.log(`[WhatsApp] Ticket ${ticketId} from ${From} (${brand.slug})`);
      break;
    }catch(e){console.error('[WhatsApp]',e.message);}
  }
  res.status(200).send('<Response></Response>');
});

// WhatsApp reply from agent
app.post('/api/tickets/:id/whatsapp-reply',(req,res)=>{
  const su=getSessionUser(req);if(!su)return res.json({success:false,error:'Not logged in'});
  const db=readBrandDB(su.brandSlug);
  if(!featEnabled(db,'whatsapp'))return res.json({success:false,error:'Feature not enabled'});
  if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN)return res.json({success:false,error:'Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM to .env'});
  const ticket=(db.tickets||[]).find(t=>t.id===req.params.id);
  if(!ticket||ticket.channel!=='whatsapp')return res.json({success:false,error:'Not a WhatsApp ticket'});
  const{message}=req.body;if(!message)return res.json({success:false,error:'message required'});
  // Send via Twilio
  const twilio=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);
  twilio.messages.create({from:`whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,to:ticket.from,body:message})
    .then(()=>{
      const idx=(db.tickets||[]).findIndex(t=>t.id===ticket.id);
      if(idx>=0){db.tickets[idx].thread=db.tickets[idx].thread||[];db.tickets[idx].thread.push({id:generateId('MSG'),type:'reply',from:su.email,fromName:su.name||su.email,body:message,timestamp:new Date().toISOString(),channel:'whatsapp'});writeBrandDB(su.brandSlug,db);}
      res.json({success:true});
    })
    .catch(e=>res.json({success:false,error:e.message}));
});

// Voice Note Tickets (portal: upload audio blob, transcribe, create ticket)
app.post('/api/voice-ticket',async(req,res)=>{
  // Expects multipart with audio blob + brandSlug + customerEmail
  const{brandSlug,customerEmail,customerName,transcript}=req.body;
  if(!brandSlug||!transcript)return res.json({success:false,error:'brandSlug and transcript required'});
  const db=readBrandDB(brandSlug);
  if(!featEnabled(db,'voiceNoteTickets'))return res.json({success:false,error:'Feature not enabled'});
  const ticketId=generateId('TKT');
  db.tickets=db.tickets||[];
  db.tickets.unshift({id:ticketId,subject:`Voice note: ${transcript.substring(0,60)}`,body:transcript,from:customerEmail||'voice-unknown',fromName:customerName||'Voice Customer',channel:'voice',status:'open',priority:'Medium',createdAt:new Date().toISOString(),lastActivity:new Date().toISOString(),thread:[]});
  writeBrandDB(brandSlug,db);
  // Auto-triage if enabled
  if(featEnabled(db,'aiTriage'))aiTriageTicket(brandSlug,ticketId).catch(()=>{});
  res.json({success:true,ticketId});
});

// ═══════════════════════════════════════════════════════════════════════════
// END ADVANCED FEATURES
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT,()=>{
  const eon=['true','1','yes'].includes(String(process.env.EMAIL_ENABLED||'').toLowerCase());
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   Resolvo SaaS  —  ${BASE_URL.padEnd(34)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  const ownerInfo=readOwner();console.log(`Owner:  ${ownerInfo.email}`);
  console.log(`Email:  ${eon?'✓ ON ('+process.env.EMAIL_USER+')':'✗ Off'}\n`);
  if(eon)getMailer();
  initEmailPollers();
  runBackgroundJobs();
});
