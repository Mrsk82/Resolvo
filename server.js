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
app.use(cors());app.use(express.json({limit:'20mb'}));app.use(express.static(path.join(__dirname,'public')));
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
const pwdResetTokens={}; // { token: { email, brandSlug, expiresAt } }

// ── Webhook helper ─────────────────────────────────────────────────────────────
async function fireWebhook(url,payload){
  if(!url||url==='false'||!url.startsWith('http'))return;
  try{const axios=require('axios');await axios.post(url,payload,{timeout:5000});}
  catch(e){console.error('[Webhook] Failed:',e.message);}
}

// ── Invite tokens ──────────────────────────────────────────────────────────────
const inviteTokens={}; // { token: { brandSlug, brandName, expiresAt, role } }

const TIER_FEATURES={
  Free:{KANBAN_ENABLED:false,SPRINTS_ENABLED:false,AI_ENABLED:false,EMAIL_TRIAGE_ENABLED:false,PEER_REVIEW_ENABLED:false,ON_CALL_ENABLED:false,TIME_LOGGING_ENABLED:false,CUSTOM_FIELDS_ENABLED:false,RELEASE_NOTES_ENABLED:false,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:false,DEPENDENCY_GRAPH_ENABLED:false,WATCHERS_ENABLED:true,REACTIONS_ENABLED:false,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:false,BULK_ACTIONS_ENABLED:false,ANNOUNCEMENT_BAR_ENABLED:false,ISSUE_TEMPLATES_ENABLED:false,API_INTEGRATION_ENABLED:false,ANALYTICS_ENABLED:false,WORKLOAD_ENABLED:false,SLA_REPORT_ENABLED:false},
  Pro:{KANBAN_ENABLED:true,SPRINTS_ENABLED:true,AI_ENABLED:true,EMAIL_TRIAGE_ENABLED:false,PEER_REVIEW_ENABLED:true,ON_CALL_ENABLED:true,TIME_LOGGING_ENABLED:true,CUSTOM_FIELDS_ENABLED:true,RELEASE_NOTES_ENABLED:true,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:true,DEPENDENCY_GRAPH_ENABLED:true,WATCHERS_ENABLED:true,REACTIONS_ENABLED:true,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:true,BULK_ACTIONS_ENABLED:true,ANNOUNCEMENT_BAR_ENABLED:true,ISSUE_TEMPLATES_ENABLED:true,API_INTEGRATION_ENABLED:false,ANALYTICS_ENABLED:true,WORKLOAD_ENABLED:true,SLA_REPORT_ENABLED:true},
  Enterprise:{KANBAN_ENABLED:true,SPRINTS_ENABLED:true,AI_ENABLED:true,EMAIL_TRIAGE_ENABLED:true,PEER_REVIEW_ENABLED:true,ON_CALL_ENABLED:true,TIME_LOGGING_ENABLED:true,CUSTOM_FIELDS_ENABLED:true,RELEASE_NOTES_ENABLED:true,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:true,DEPENDENCY_GRAPH_ENABLED:true,WATCHERS_ENABLED:true,REACTIONS_ENABLED:true,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:true,BULK_ACTIONS_ENABLED:true,ANNOUNCEMENT_BAR_ENABLED:true,ISSUE_TEMPLATES_ENABLED:true,API_INTEGRATION_ENABLED:true,ANALYTICS_ENABLED:true,WORKLOAD_ENABLED:true,SLA_REPORT_ENABLED:true},
  Trial:{KANBAN_ENABLED:true,SPRINTS_ENABLED:true,AI_ENABLED:true,EMAIL_TRIAGE_ENABLED:false,PEER_REVIEW_ENABLED:true,ON_CALL_ENABLED:false,TIME_LOGGING_ENABLED:true,CUSTOM_FIELDS_ENABLED:true,RELEASE_NOTES_ENABLED:true,AUDIT_TRAIL_ENABLED:true,POSTMORTEM_ENABLED:true,DEPENDENCY_GRAPH_ENABLED:true,WATCHERS_ENABLED:true,REACTIONS_ENABLED:true,PINNED_ISSUES_ENABLED:true,FULL_TEXT_SEARCH_ENABLED:true,TAGS_ENABLED:true,BULK_ACTIONS_ENABLED:true,ANNOUNCEMENT_BAR_ENABLED:true,ISSUE_TEMPLATES_ENABLED:true,API_INTEGRATION_ENABLED:false,ANALYTICS_ENABLED:true,WORKLOAD_ENABLED:true,SLA_REPORT_ENABLED:true}
};
const FEATURE_META=[
  {key:'KANBAN_ENABLED',label:'Kanban Board',group:'Workflow',tier:'Pro'},{key:'SPRINTS_ENABLED',label:'Sprints & Burndown',group:'Workflow',tier:'Pro'},{key:'BULK_ACTIONS_ENABLED',label:'Bulk Actions',group:'Workflow',tier:'Pro'},{key:'DEPENDENCY_GRAPH_ENABLED',label:'Dependencies',group:'Workflow',tier:'Pro'},{key:'ISSUE_TEMPLATES_ENABLED',label:'Issue Templates',group:'Workflow',tier:'Pro'},
  {key:'AI_ENABLED',label:'AI / Gemini',group:'Intelligence',tier:'Pro'},{key:'EMAIL_TRIAGE_ENABLED',label:'Email Triage',group:'Intelligence',tier:'Enterprise'},{key:'FULL_TEXT_SEARCH_ENABLED',label:'Full Text Search',group:'Intelligence',tier:'Free'},
  {key:'ANALYTICS_ENABLED',label:'Analytics',group:'Reporting',tier:'Pro'},{key:'WORKLOAD_ENABLED',label:'Workload View',group:'Reporting',tier:'Pro'},{key:'SLA_REPORT_ENABLED',label:'SLA Report',group:'Reporting',tier:'Pro'},{key:'RELEASE_NOTES_ENABLED',label:'Release Notes',group:'Reporting',tier:'Pro'},{key:'POSTMORTEM_ENABLED',label:'Post-Mortem',group:'Reporting',tier:'Pro'},
  {key:'AUDIT_TRAIL_ENABLED',label:'Audit Trail',group:'Compliance',tier:'Free'},{key:'API_INTEGRATION_ENABLED',label:'API Integration',group:'Integrations',tier:'Enterprise'},
  {key:'PEER_REVIEW_ENABLED',label:'Peer Review',group:'Collaboration',tier:'Pro'},{key:'ON_CALL_ENABLED',label:'On-Call Schedule',group:'Collaboration',tier:'Pro'},{key:'TIME_LOGGING_ENABLED',label:'Time Logging',group:'Collaboration',tier:'Pro'},{key:'WATCHERS_ENABLED',label:'Watchers',group:'Collaboration',tier:'Free'},
  {key:'CUSTOM_FIELDS_ENABLED',label:'Custom Fields',group:'Customisation',tier:'Pro'},{key:'TAGS_ENABLED',label:'Issue Tags',group:'Customisation',tier:'Pro'},{key:'REACTIONS_ENABLED',label:'Comment Reactions',group:'Customisation',tier:'Pro'},{key:'PINNED_ISSUES_ENABLED',label:'Pinned Issues',group:'Customisation',tier:'Free'},{key:'ANNOUNCEMENT_BAR_ENABLED',label:'Announcement Bar',group:'Customisation',tier:'Pro'}
];
function resolveFeatureFlags(brand,adf){return{...(TIER_FEATURES[brand.tier]||TIER_FEATURES.Free),...(adf||{}),...(brand.featureOverrides||{})};}
function ownerAuditLog(owner,action,details,by){owner.auditLog=owner.auditLog||[];owner.auditLog.unshift({id:uuidv4().substring(0,8),action,details,by,timestamp:new Date().toISOString()});if(owner.auditLog.length>500)owner.auditLog=owner.auditLog.slice(0,500);}
function readOwner(){return JSON.parse(fs.readFileSync(OWNER_PATH,'utf8'));}
function writeOwner(d){fs.writeFileSync(OWNER_PATH,JSON.stringify(d,null,2),'utf8');}
function brandDbPath(slug){return path.join(BRANDS_DIR,slug,'db.json');}
function readBrandDB(slug){try{return JSON.parse(fs.readFileSync(brandDbPath(slug),'utf8'));}catch(e){return{};}}
function writeBrandDB(slug,d){fs.writeFileSync(brandDbPath(slug),JSON.stringify(d,null,2),'utf8');}
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
async function sendEmail(to,subject,html,text,fromOverride){
  const t=getMailer();if(!t){console.log('[Email] SKIPPED:',to);return;}
  const fromAddr=fromOverride||`"Resolvo" <${process.env.EMAIL_USER}>`;
  try{await t.sendMail({from:fromAddr,to,subject,text:text||subject,html});console.log('[Email] ✓:',to);}
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
    if(_brandMailers[bEmail])return{mailer:_brandMailers[bEmail],from:`"${s.APP_NAME||'Support'}" <${bEmail}>`};
    const nm=require('nodemailer');
    const t=nm.createTransport({service:'gmail',auth:{user:bEmail,pass:bPass}});
    _brandMailers[bEmail]=t;
    console.log('[BrandEmail] Ready:',bEmail,'for slug:',slug);
    return{mailer:t,from:`"${s.APP_NAME||'Support'}" <${bEmail}>`};
  }catch(e){return null;}
}
async function sendBrandEmail(slug,to,subject,html,text){
  const bm=getBrandMailer(slug);
  if(bm){
    try{await bm.mailer.sendMail({from:bm.from,to,subject,text:text||subject,html});console.log('[BrandEmail] ✓:',to);return;}
    catch(e){console.error('[BrandEmail] ✗',e.message);}
  }
  // Fallback to owner mailer
  await sendEmail(to,subject,html,text);
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
    pwdResetTokens[resetToken]={email,brandSlug:brand.slug,expiresAt:Date.now()+3600000};
    const resetUrl=`${BASE_URL}/reset-password?token=${resetToken}`;
    await sendEmail(email,'Reset Your TechTrack Password',
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
  const entry=pwdResetTokens[token];
  if(!entry||Date.now()>entry.expiresAt){delete pwdResetTokens[token];return res.json({success:false,error:'Reset link expired or invalid.'});}
  const db=readBrandDB(entry.brandSlug);
  const idx=(db.users||[]).findIndex(u=>u.email===entry.email);
  if(idx<0)return res.json({success:false,error:'User not found.'});
  db.users[idx].passwordHash=hashPwd(newPassword);
  db.users[idx].mustChangePassword=false;
  writeBrandDB(entry.brandSlug,db);
  delete pwdResetTokens[token];
  res.json({success:true,message:'Password updated. You can now log in.'});
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
    sendTestEmail:async to=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};await sendEmail(to||su.email,`✅ TechTrack Email Test`,testEmailHTML(),'Email test OK');return{success:true};},
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
          sendEmail(wEmail,`[Watching] New reply on ${ticketId}: ${updatedTicket.subject}`,
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
            sendEmail(mentionEmail,`[${su.brandName}] You were mentioned in ${issueId}`,
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
          if(mu)sendEmail(mentionEmail,`[${su.brandName}] You were mentioned in ${issueId}`,`<p>Hi ${mu.name||mentionEmail}, ${su.name||su.email} mentioned you in a comment on issue ${issueId}. <a href="${BASE_URL}">View issue</a></p>`,`${su.name} mentioned you on issue ${issueId}`).catch(()=>{});
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
    updateFeatureFlags:fo=>{const db=rDB();db.featureFlags={...(db.featureFlags||{}),...fo};wDB(db);return{success:true};},
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
      const ticket=db.tickets[idx];
      // Send 1-click CSAT on resolve
      if(status==='resolved'&&ticket.from&&!ticket.csatSent){
        const brand=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
        const brandName=brand.name||'Support';const brandColor=brand.accentColor||'#10B981';
        const csatToken=Buffer.from(JSON.stringify({ticketId,slug,email:ticket.from,ts:Date.now()})).toString('base64url');
        const csatUrl=`${BASE_URL}/csat-ticket?token=${csatToken}`;
        db.tickets[idx].csatToken=csatToken;db.tickets[idx].csatSent=true;
        writeBrandDB(slug,rDB());
        sendEmail(ticket.from,`✅ Your issue has been resolved — [${brandName}] ${ticket.subject}`,
          `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,sans-serif;padding:24px 16px;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);"><div style="background:${brandColor};padding:20px 24px;text-align:center;"><div style="font-size:32px;margin-bottom:6px;">✅</div><h2 style="margin:0;color:#fff;font-size:18px;">Issue Resolved</h2></div><div style="padding:28px;text-align:center;"><p style="color:#374151;font-size:14px;margin:0 0 20px;">Hi there! Your support request has been resolved. Was this helpful?</p><div style="display:flex;gap:12px;justify-content:center;margin:0 0 20px;"><a href="${csatUrl}&rating=yes" style="background:#10B981;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">👍 Yes</a><a href="${csatUrl}&rating=no" style="background:#EF4444;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">👎 No</a></div><p style="color:#9ca3af;font-size:12px;margin:0;">Ref: ${ticketId}</p></div></div></body></html>`,
          `Your ticket ${ticketId} has been resolved. Was this helpful? Reply YES or NO.`
        ).catch(()=>{});
      }
      // Notify watchers of status change
      const brand2=(readOwner().brands||[]).find(b=>b.slug===slug)||{};
      (ticket.watchers||[]).filter(w=>w!==su.email).forEach(wEmail=>{
        sendEmail(wEmail,`[Watching] Ticket ${ticketId} status: ${status}`,
          `<p>Ticket <strong>${ticket.subject}</strong> was updated to <strong>${status}</strong> by ${su.name||su.email}.</p><a href="${BASE_URL}">View ticket →</a>`,
          `Ticket ${ticketId} is now ${status}`).catch(()=>{});
      });

      // ── QUEUE PULL: When ticket resolved/closed, auto-assign next unassigned ticket ──
      // This ensures agents always have work — resolving one pulls the next from queue
      if((status==='resolved'||status==='closed')){
        const freshDb=rDB();
        const qcfg=freshDb.queueConfig||{};
        if(qcfg.enabled&&!qcfg.frozen){
          // Find oldest unassigned open ticket (sorted by creation date asc = oldest first)
          const unassigned=(freshDb.tickets||[]).filter(t=>
            !t.assignedTo&&
            !['resolved','closed'].includes(t.status)&&
            t.id!==ticketId
          ).sort((a,b)=>new Date(a.createdDate)-new Date(b.createdDate));

          if(unassigned.length>0){
            // Check if the agent who just resolved still has capacity
            const resolver=su.email;
            const resolverUser=(freshDb.users||[]).find(u=>u.email===resolver);
            const resolverOpen=(freshDb.tickets||[]).filter(t=>
              t.assignedTo===resolver&&!['resolved','closed'].includes(t.status)
            ).length;
            const resolverMax=resolverUser?.maxTickets||10;
            const resolverStatus=resolverUser?.availabilityStatus||'available';

            let nextAgent=null;

            // Prefer to give the next ticket to the agent who just freed up (if they have capacity)
            if(resolverStatus!=='away'&&resolverOpen<resolverMax){
              const inQueue=(qcfg.agents||[]).find(a=>a.email===resolver&&a.inQueue);
              if(inQueue)nextAgent=resolver;
            }

            // Otherwise use normal auto-assign routing
            if(!nextAgent){
              nextAgent=autoAssignAgent(freshDb,unassigned[0]);
            }

            if(nextAgent){
              const nextIdx=(freshDb.tickets||[]).findIndex(t=>t.id===unassigned[0].id);
              if(nextIdx>=0){
                freshDb.tickets[nextIdx].assignedTo=nextAgent;
                freshDb.tickets[nextIdx].lastActivity=new Date().toISOString();
                freshDb.tickets[nextIdx].status='open'; // Move from new → open
                freshDb.tickets[nextIdx].timeline=freshDb.tickets[nextIdx].timeline||[];
                freshDb.tickets[nextIdx].timeline.push({
                  event:'auto_assigned_from_queue',
                  by:'system',byName:'Queue System',
                  at:new Date().toISOString(),
                  detail:`Auto-assigned to ${nextAgent} after ${ticketId} was resolved`
                });
                writeBrandDB(slug,freshDb);
                console.log(`[Queue] Auto-assigned ${unassigned[0].id} → ${nextAgent} after ${ticketId} resolved`);
              }
            }
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
      db.tickets[idx].assignedTo=agentEmail;db.tickets[idx].lastActivity=new Date().toISOString();wDB(db);return{success:true};
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
      await sendEmail(ticket.from,`How did we do? — ${brand.name||'Support'}`,
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

app.get('/pitch',(req,res)=>res.sendFile(path.join(__dirname,'public','pitch.html')));
app.get('/learn',(req,res)=>res.sendFile(path.join(__dirname,'public','learn.html')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

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
    /^newsletter/i, /^unsubscribe/i
  ];
  // 2. Known automated subject patterns
  const SPAM_SUBJECT_PATTERNS = [
    /^delivery status notification/i, /^undeliverable:/i, /^auto-?reply:/i,
    /^out of office/i, /^automatic reply/i, /^\[?automated\]?/i,
    /^mail delivery (subsystem|failed|failure|error)/i,
    /^failure notice/i, /^returned mail/i, /^non-?delivery/i,
    /^\*\* address not found \*\*/i, /^bounced mail/i,
    /^message delivery status/i, /^read receipt/i,
    /^vacation auto-?reply/i
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
            sendEmail(ticket.from, `Re: [${brand.name||'Support'}] ${ticket.subject}`, `<p>${rule.replyMessage}</p>`, rule.replyMessage).catch(() => {});
          }
          writeBrandDB(slug, db);
          console.log(`[AutoResolve] Ticket ${ticketId} auto-resolved by rule: ${rule.name}`);
          return ticketId; // Skip ACK since auto-resolved
        }
      }
    }
  } catch(e) { console.error('[AutoResolve]', e.message); }

  // Send acknowledgement
  if (emailData.from && config.sendAckEmail !== false) {
    const brand = (readOwner().brands || []).find(b => b.slug === slug) || {};
    const brandName = brand.name || 'Support';
    const brandColor = brand.accentColor || '#F5A623';
    await sendEmail(
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
  const { issueId, replyText } = req.body;
  const db = readBrandDB(su.brandSlug);
  const issue = (db.issues || []).find(i => i.id === issueId);
  if (!issue) return res.json({ success: false, error: 'Issue not found' });
  if (!issue.emailFrom) return res.json({ success: false, error: 'Not an email ticket' });
  const brand = (readOwner().brands || []).find(b => b.slug === su.brandSlug) || {};
  const config = db.emailTicketing || {};

  // Add as comment
  const commentId = generateId('CMT');
  db.comments = db.comments || [];
  db.comments.push({ id: commentId, issueId, userEmail: su.email, comment: replyText, timestamp: new Date().toISOString(), sentAsEmail: true });
  logActivity(db, issueId, `Email reply sent to ${issue.emailFrom}`, su.email);
  writeBrandDB(su.brandSlug, db);

  // Send email reply
  await sendEmail(
    issue.emailFrom,
    `Re: [${brand.name || 'Resolvo'}] ${issue.emailSubject || issue.title}`,
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

app.listen(PORT,()=>{
  const eon=['true','1','yes'].includes(String(process.env.EMAIL_ENABLED||'').toLowerCase());
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   Resolvo SaaS  —  ${BASE_URL.padEnd(34)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  console.log(`Owner:  asif@konnectinsights.com / asif`);
  console.log(`Email:  ${eon?'✓ ON ('+process.env.EMAIL_USER+')':'✗ Off'}\n`);
  if(eon)getMailer();
  initEmailPollers();
});
