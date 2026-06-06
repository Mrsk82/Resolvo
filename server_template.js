// TechTrack — Multi-Tenant SaaS Server (restored)
require('dotenv').config();
const express=require('express'),cors=require('cors'),path=require('path'),fs=require('fs'),{v4:uuidv4}=require('uuid');
const app=express(),PORT=process.env.PORT||3000,BASE_URL=process.env.BASE_URL||`http://localhost:${PORT}`;
const OWNER_PATH=path.join(__dirname,'data','owner.json'),BRANDS_DIR=path.join(__dirname,'data','brands');
app.use(cors());app.use(express.json({limit:'20mb'}));app.use(express.static(path.join(__dirname,'public')));

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
async function sendEmail(to,subject,html,text){
  const t=getMailer();if(!t){console.log('[Email] SKIPPED:',to);return;}
  try{await t.sendMail({from:`"TechTrack" <${process.env.EMAIL_USER}>`,to,subject,text:text||subject,html});console.log('[Email] ✓:',to);}
  catch(e){console.error('[Email] ✗',e.message);_mailer=null;}
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
  const{email,password}=req.body;
  if(!email||!password)return res.json({success:false,error:'Email and password required.'});
  const owner=readOwner();
  if(email===owner.email){if(password!==owner.passwordHash)return res.json({success:false,error:'Invalid password.'});const token=uuidv4();sessions[token]={isOwner:true,email:owner.email,name:owner.name};return res.json({success:true,token,isOwner:true,user:{email:owner.email,name:owner.name}});}
  for(const brand of(owner.brands||[])){
    if(brand.status!=='active')continue;
    let db;try{db=readBrandDB(brand.slug);}catch(e){continue;}
    const user=(db.users||[]).find(u=>u.email===email&&(u.active===true||u.active==='true'));
    if(!user)continue;
    if(user.passwordHash!==password)return res.json({success:false,error:'Invalid password.'});
    const token=uuidv4(),bdf=db.featureFlags||{};
    sessions[token]={isOwner:false,brandSlug:brand.slug,brandName:brand.name,brandAccentColor:brand.accentColor||'#f5a623',brandTheme:brand.theme||'midnight',brandLogoUrl:brand.logoUrl||'',brandTier:brand.tier||'Free',resolvedFeatureFlags:resolveFeatureFlags(brand,bdf),isMajorAdmin:user.role==='Admin',firstLogin:user.firstLogin===true,id:user.id,email:user.email,name:user.name,team:user.team,role:user.role,skill:user.skill,slackId:user.slackId,maxTickets:user.maxTickets,active:user.active};
    const od=readOwner();const bi=od.brands.findIndex(b=>b.slug===brand.slug);if(bi>=0){od.brands[bi].lastActive=new Date().toISOString();writeOwner(od);}
    return res.json({success:true,token,isOwner:false,user:sessions[token]});
  }
  return res.json({success:false,error:'Account not found.'});
});
app.post('/api/logout',(req,res)=>{const t=req.headers['x-session-token'];if(t)delete sessions[t];res.json({success:true});});

// OWNER ONLY MIDDLEWARE
function ownerOnly(req,res,next){const u=getSessionUser(req);if(!u||!u.isOwner)return res.json({success:false,error:'Owner access required.'});req.owner=u;next();}

app.get('/api/owner/me',ownerOnly,(req,res)=>res.json({success:true,owner:{email:req.owner.email,name:req.owner.name}}));
app.get('/api/owner/audit-log',ownerOnly,(req,res)=>{const o=readOwner();res.json({success:true,log:(o.auditLog||[]).slice(0,100)});});
app.get('/api/owner/stats',ownerOnly,(req,res)=>{
  const owner=readOwner();let tu=0,ti=0,to=0;const bs=[];
  for(const b of(owner.brands||[])){try{const db=readBrandDB(b.slug);const u=(db.users||[]).filter(u=>u.active).length,i=(db.issues||[]).length,o=(db.issues||[]).filter(x=>!['Resolved','Release Required','Closed'].includes(x.status)).length;tu+=u;ti+=i;to+=o;bs.push({slug:b.slug,name:b.name,tier:b.tier,status:b.status,users:u,issues:i,open:o,lastActive:b.lastActive});}catch(e){bs.push({slug:b.slug,name:b.name,tier:b.tier,status:b.status,users:0,issues:0,open:0,lastActive:null});}}
  res.json({success:true,stats:{brands:(owner.brands||[]).length,users:tu,issues:ti,openIssues:to},brandStats:bs,owner:{email:owner.email,name:owner.name}});
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
      await sendEmail(ud.email,`Welcome to ${su.brandName}`,brandWelcomeHTML(nu,su.brandName,brand.accentColor||'#f5a623',ip,BASE_URL),`Login: ${BASE_URL} | Email: ${ud.email} | Pass: ${ip}`);
      return{success:true,userId:uid};
    },
    createIssue:async id=>{
      const db=rDB();
      if((db.settings||{}).DUPLICATE_DETECTION_ENABLED==='true'){const ws=(id.title||'').toLowerCase().split(' ').filter(w=>w.length>3);const dupes=(db.issues||[]).filter(issue=>{if(['Resolved','Release Required'].includes(issue.status))return false;const iw=issue.title.toLowerCase().split(' ').filter(w=>w.length>3);return ws.filter(w=>iw.includes(w)).length>=Math.min(3,ws.length*0.5);}).slice(0,5);if(dupes.length>0)return{success:false,duplicates:dupes,message:'Possible duplicate issues found'};}
      const issueId=generateIssueId(slug),slaHours=(db.slaConfig||{Critical:4,High:8,Medium:24,Low:72})[id.priority]||24;
      const issue={id:issueId,title:id.title,description:id.description,module:id.module||'',priority:id.priority,status:'Open',environment:id.environment||'',raisedBy:su.email,assignedTo:id.assignedTo||'',createdDate:new Date().toISOString(),startedDate:'',resolvedDate:'',closedDate:'',impact:id.impact||'',slaHours,attachmentUrl:id.attachmentUrl||'',sprintId:id.sprintId||''};
      db.issues=db.issues||[];db.issues.push(issue);logActivity(db,issueId,'Issue Created',su.email);wDB(db);
      if(issue.assignedTo){const a=(db.users||[]).find(u=>u.email===issue.assignedTo);if(a){const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};sendEmail(a.email,`[${su.brandName}] Issue Assigned: ${issueId}`,issueAssignedHTML(issue,su.brandName,b.accentColor||'#f5a623',a.name||a.email,BASE_URL),`Issue ${issueId} assigned`).catch(console.error);}}
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
      for(const email of recipients)sendEmail(email,`[${su.brandName}] ${issueId} → ${newStatus}`,statusUpdateHTML(issue,newStatus,su.name||su.email,su.brandName,b.accentColor||'#f5a623',BASE_URL),`Issue ${issueId}: ${newStatus}`).catch(()=>{});
      return{success:true};
    },
    changePassword:async(uid,np)=>{if(su.role!=='Admin'&&su.id!==uid)return{success:false,error:'Not authorized'};const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);if(idx===-1)return{success:false,error:'Not found'};db.users[idx].passwordHash=np;wDB(db);return{success:true};},
    resendWelcomeEmail:async uid=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();const user=(db.users||[]).find(u=>u.id===uid);if(!user)return{success:false,error:'Not found'};const o=readOwner(),b=(o.brands||[]).find(b=>b.slug===slug)||{};await sendEmail(user.email,`Your ${su.brandName} Account`,brandWelcomeHTML(user,su.brandName,b.accentColor||'#f5a623',user.passwordHash,BASE_URL),`Login: ${BASE_URL}`);return{success:true};},
    sendTestEmail:async to=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};await sendEmail(to||su.email,`✅ TechTrack Email Test`,testEmailHTML(),'Email test OK');return{success:true};},
    completeBrandSetup:async sd=>{if(!su.isMajorAdmin)return{success:false,error:'Major Admin only'};const db=rDB();if(sd.appName){db.settings=db.settings||{};db.settings.APP_NAME=sd.appName;}const ui=(db.users||[]).findIndex(u=>u.email===su.email);if(ui>=0){db.users[ui].firstLogin=false;if(sd.adminName)db.users[ui].name=sd.adminName;}wDB(db);const o=readOwner(),bi=(o.brands||[]).findIndex(b=>b.slug===slug);if(bi>=0){if(sd.accentColor)o.brands[bi].accentColor=sd.accentColor;if(sd.theme)o.brands[bi].theme=sd.theme;if(sd.logoUrl!==undefined)o.brands[bi].logoUrl=sd.logoUrl;if(sd.appName)o.brands[bi].name=sd.appName;writeOwner(o);}const t=req.headers['x-session-token'];if(t&&sessions[t])Object.assign(sessions[t],{brandName:sd.appName||su.brandName,brandAccentColor:sd.accentColor||su.brandAccentColor,brandTheme:sd.theme||su.brandTheme,firstLogin:false});return{success:true};},
    updateBrandProfile:async updates=>{if(!su.isMajorAdmin)return{success:false,error:'Major Admin only'};const o=readOwner(),bi=(o.brands||[]).findIndex(b=>b.slug===slug);if(bi<0)return{success:false,error:'Not found'};['name','logoUrl','accentColor','theme'].forEach(k=>{if(updates[k]!==undefined)o.brands[bi][k]=updates[k];});writeOwner(o);return{success:true};},
  };

  const sH={
    getCurrentUser:()=>({success:true,user:su}),
    getUsers:ao=>{const db=rDB();let u=db.users||[];if(ao)u=u.filter(u=>u.active);return{success:true,users:u.map(u=>({...u,passwordHash:undefined}))};},
    getDevelopers:()=>{const db=rDB();return{success:true,developers:(db.users||[]).filter(u=>u.role==='Developer'&&u.active).map(u=>({...u,passwordHash:undefined}))};},
    updateUser:(uid,ud)=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();const idx=(db.users||[]).findIndex(u=>u.id===uid);if(idx===-1)return{success:false,error:'Not found'};['name','team','role','skill','slackId','maxTickets','active'].forEach(f=>{if(ud[f]!==undefined)db.users[idx][f]=ud[f];});wDB(db);return{success:true};},
    getUserActivity:uid=>{const db=rDB();const user=(db.users||[]).find(u=>u.id===uid);if(!user)return{success:false,error:'Not found'};const logs=(db.activityLog||[]).filter(l=>l.user===user.email);return{success:true,logs:logs.slice(-50).reverse(),totalActions:logs.length,issuesRaised:(db.issues||[]).filter(i=>i.raisedBy===user.email).length,issuesResolved:(db.issues||[]).filter(i=>['Resolved','Release Required'].includes(i.status)&&i.assignedTo===user.email).length};},
    checkDuplicates:title=>{const db=rDB(),ws=(title||'').toLowerCase().split(' ').filter(w=>w.length>3);return{success:true,duplicates:(db.issues||[]).filter(issue=>{if(['Resolved','Release Required'].includes(issue.status))return false;const iw=issue.title.toLowerCase().split(' ').filter(w=>w.length>3);return ws.filter(w=>iw.includes(w)).length>=Math.min(3,ws.length*0.5);}).slice(0,5)};},
    addComment:(issueId,ct)=>{const db=rDB(),cid=generateId('CMT');db.comments=db.comments||[];db.comments.push({id:cid,issueId,userEmail:su.email,comment:ct,timestamp:new Date().toISOString()});logActivity(db,issueId,'Comment added',su.email);wDB(db);return{success:true,commentId:cid};},
    addCommentWithMentions:(issueId,ct)=>{const db=rDB();db.comments=db.comments||[];db.comments.push({id:generateId('CMT'),issueId,userEmail:su.email,comment:ct,timestamp:new Date().toISOString()});logActivity(db,issueId,'Comment added',su.email);wDB(db);return{success:true};},
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
    getDigestConfig:()=>{const db=rDB();return{success:true,digest:db.digestConfig||{enabled:false,frequency:'daily',time:'09:00',recipients:[]}};},
    saveDigestConfig:c=>{if(su.role!=='Admin')return{success:false,error:'Admin only'};const db=rDB();db.digestConfig=c;wDB(db);return{success:true};},
    getServerIssueTemplates:()=>{const db=rDB();return{success:true,templates:db.issueTemplates||[]};},
    // Stubs
    syncIssuesToCalendar:()=>({success:false,error:'Not available.'}),getCalendarStatus:()=>({success:true,configured:false}),getEmailTimeline:()=>({success:true,timeline:[]}),getEmailSummary:()=>({success:true,summary:null}),getEmailParticipants:()=>({success:true,participants:[]}),getInboundRules:()=>({success:true,rules:[]}),saveInboundRule:()=>({success:true}),deleteInboundRule:()=>({success:true}),exportIssueToPDF:()=>({success:false,error:'Use browser Print > Save as PDF.'}),exportDashboardReport:()=>({success:false,error:'Use browser print.'}),getAutoTagRules:()=>({success:true,rules:[]}),saveAutoTagRule:()=>({success:true}),deleteAutoTagRule:()=>({success:true}),checkDueDateReminders:()=>({success:true}),runSmartEscalation:()=>({success:true}),runEscalationCheck:()=>({success:true,escalated:0}),
  };

  const ah=aH[fn];if(ah){try{return res.json(await ah(...args));}catch(e){return res.json({success:false,error:e.message});}}
  const sh=sH[fn];if(!sh)return res.json({success:false,error:`Unknown function: ${fn}`});
  try{res.json(sh(...args));}catch(e){res.json({success:false,error:e.message});}
});

app.get('/api/backup',(req,res)=>{const su=getSessionUser(req);if(!su||su.role!=='Admin')return res.status(403).json({error:'Admin only'});const db=readBrandDB(su.brandSlug);res.setHeader('Content-Disposition',`attachment; filename=${su.brandSlug}-backup-${new Date().toISOString().split('T')[0]}.json`);res.setHeader('Content-Type','application/json');res.send(JSON.stringify(db,null,2));});
app.post('/api/restore',(req,res)=>{const su=getSessionUser(req);if(!su||su.role!=='Admin')return res.status(403).json({error:'Admin only'});try{writeBrandDB(su.brandSlug,req.body);res.json({success:true});}catch(e){res.json({success:false,error:e.message});}});
app.get('/api/external/sync',async(req,res)=>res.json({success:false,error:'Configure in Admin > API Integration.'}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,()=>{
  const eon=['true','1','yes'].includes(String(process.env.EMAIL_ENABLED||'').toLowerCase());
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   TechTrack SaaS  —  ${BASE_URL.padEnd(32)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  console.log(`Owner:  asif@konnectinsights.com (check .env for credentials)`);
  console.log(`Email:  ${eon?'✓ ON ('+process.env.EMAIL_USER+')':'✗ Off'}\n`);
  if(eon)getMailer();
});
