// Resolvo Product Deck — Updated with all features
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Asif";
pres.title = "Resolvo — Product Deck";

const C = {
  bgDark:"0D0E14", bgSurf:"13141D", bgCard:"1A1B27", bgLight:"F0F2F5",
  white:"FFFFFF", amber:"10B981", green:"10B981", blue:"2563EB",
  red:"DC2626", purple:"7C3AED", pink:"BE185D",
  t1:"E8EAF6", t2:"94A3B8", t3:"475569",
  l1:"111827", l2:"374151", l3:"6B7280",
  border:"1F2133",
};
const W=13.3, H=7.5;

function darkSlide(s){ s.background={color:C.bgDark}; }
function lightSlide(s){ s.background={color:C.bgLight}; }
function amberBar(s){ s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}}); }
function num(s,n){ s.addText(String(n),{x:W-0.6,y:H-0.45,w:0.45,h:0.35,fontSize:9,color:C.t3,align:"right",fontFace:"Calibri"}); }

function card(s,x,y,w,h,fill,borderCol){
  s.addShape(pres.shapes.RECTANGLE,{x,y,w,h,fill:{color:fill||C.bgCard},line:{color:borderCol||C.border,width:0.5},shadow:{type:"outer",blur:8,offset:3,angle:135,color:"000000",opacity:0.2}});
}

function miniBar(s,x,y,w,h,pct,col){
  s.addShape(pres.shapes.RECTANGLE,{x,y,w,h,fill:{color:"1F2133"},line:{color:"1F2133"}});
  s.addShape(pres.shapes.RECTANGLE,{x,y,w:w*(pct/100),h,fill:{color:col||C.amber},line:{color:col||C.amber}});
}

function statBox(s,x,y,val,label,col,dark){
  const bg=dark?C.bgCard:"FFFFFF";
  const tc=dark?C.t1:C.l1;
  const sc=dark?C.t3:C.l3;
  card(s,x,y,2.6,1.3,bg,dark?C.border:"E5E7EB");
  s.addShape(pres.shapes.RECTANGLE,{x,y,w:2.6,h:0.06,fill:{color:col||C.amber},line:{color:col||C.amber}});
  s.addText(String(val),{x,y:y+0.12,w:2.6,h:0.75,fontSize:36,color:col||C.amber,bold:true,fontFace:"Calibri",align:"center",margin:0});
  s.addText(label,{x,y:y+0.9,w:2.6,h:0.32,fontSize:10,color:sc,fontFace:"Calibri",align:"center",margin:0});
}

// ═══════════════════════════════════════
// SLIDE 1 — HERO
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.OVAL,{x:7,y:-2,w:8,h:8,fill:{color:C.amber,transparency:92},line:{color:C.amber,transparency:90}});
  s.addShape(pres.shapes.OVAL,{x:9,y:4,w:5,h:5,fill:{color:C.purple,transparency:92},line:{color:C.purple,transparency:90}});
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("⟳",{x:0.35,y:0.7,w:1.2,h:1.2,fontSize:52,color:C.amber,fontFace:"Calibri",margin:0});
  s.addText("Resolvo",{x:0.35,y:1.85,w:9,h:1.2,fontSize:72,color:C.white,bold:true,fontFace:"Calibri",charSpacing:1,margin:0});
  s.addText("From Chaos to Clarity",{x:0.35,y:3.05,w:9,h:0.65,fontSize:26,color:C.amber,fontFace:"Calibri",italic:true,margin:0});
  s.addText("The AI-powered, multi-tenant issue & support platform for engineering teams",{x:0.35,y:3.7,w:9.5,h:0.55,fontSize:16,color:C.t2,fontFace:"Calibri",margin:0});
  s.addShape(pres.shapes.RECTANGLE,{x:0.35,y:4.4,w:1.4,h:0.05,fill:{color:C.amber},line:{color:C.amber}});
  s.addText("AI-Powered  ·  Email Ticketing  ·  Issue Tracking  ·  Analytics",{x:0.35,y:4.5,w:9,h:0.38,fontSize:12,color:C.t3,fontFace:"Calibri",margin:0});

  s.addShape(pres.shapes.RECTANGLE,{x:0.35,y:5.1,w:2.3,h:0.6,fill:{color:C.amber},line:{color:C.amber}});
  s.addText("Request a Demo →",{x:0.35,y:5.1,w:2.3,h:0.6,fontSize:13,color:C.bgDark,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});

  const stats=[{n:"50+",l:"Features"},{n:"3",l:"Tiers"},{n:"∞",l:"Brands"},{n:"AI",l:"Powered"}];
  stats.forEach((st,i)=>{
    const bx=10.1+(i%2)*1.55,by=2.3+Math.floor(i/2)*1.45;
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:1.35,h:1.15,fill:{color:C.bgCard},line:{color:C.border,width:0.5}});
    s.addText(st.n,{x:bx,y:by+0.05,w:1.35,h:0.68,fontSize:30,color:C.amber,bold:true,fontFace:"Calibri",align:"center",margin:0});
    s.addText(st.l,{x:bx,y:by+0.72,w:1.35,h:0.32,fontSize:10,color:C.t2,fontFace:"Calibri",align:"center",margin:0});
  });
  num(s,1);
}

// ═══════════════════════════════════════
// SLIDE 2 — PROBLEM
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("The Problem",{x:0.35,y:0.55,w:10,h:0.65,fontSize:34,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Every engineering team struggles with the same chaos — scattered reports, missed SLAs, zero visibility.",{x:0.35,y:1.2,w:11,h:0.4,fontSize:14,color:C.l3,fontFace:"Calibri",margin:0});

  const problems=[
    {e:"📱",t:"Scattered Reports",d:"Bugs via WhatsApp, email, Slack, spreadsheets — lost before anyone sees them",c:C.red},
    {e:"⏰",t:"SLA Blindness",d:"No deadline tracking. Critical bugs resolved days late. Zero warning.",c:C.red},
    {e:"🔍",t:"Zero Visibility",d:"CS reports a bug but never knows if it's been seen, assigned, or fixed",c:"D97706"},
    {e:"📊",t:"No Accountability",d:"Who's overloaded? Who broke SLA? Zero history, zero audit trail",c:"D97706"},
    {e:"🔀",t:"Tool Fragmentation",d:"4 different tools, 4 logins — context lost everywhere",c:C.blue},
    {e:"🏢",t:"Multi-Brand Chaos",d:"Managing issues across multiple clients from one place? Impossible",c:C.blue},
  ];
  problems.forEach((p,i)=>{
    const col=i%3,row=Math.floor(i/3);
    const bx=0.3+col*4.32,by=1.78+row*2.5;
    card(s,bx,by,4.12,2.25,C.white,"E5E7EB");
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:4.12,h:0.07,fill:{color:p.c},line:{color:p.c}});
    s.addText(p.e,{x:bx+0.15,y:by+0.2,w:0.65,h:0.65,fontSize:26,align:"center",margin:0});
    s.addText(p.t,{x:bx+0.88,y:by+0.22,w:3.1,h:0.38,fontSize:13.5,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
    s.addText(p.d,{x:bx+0.15,y:by+0.98,w:3.85,h:0.9,fontSize:11,color:C.l3,fontFace:"Calibri",margin:0});
  });
  num(s,2);
}

// ═══════════════════════════════════════
// SLIDE 3 — SOLUTION OVERVIEW
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("One Platform. Every Team. Every Issue.",{x:0.35,y:0.4,w:11,h:0.9,fontSize:38,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Resolvo unifies issue tracking, AI triage, email ticketing, and analytics under one roof — for every team in your company.",{x:0.35,y:1.3,w:11,h:0.5,fontSize:14,color:C.t2,fontFace:"Calibri",margin:0});

  const pillars=[
    {icon:"🎯",title:"Issue Tracking",sub:"SLA · Kanban · Sprints · AI triage",col:C.amber},
    {icon:"📬",title:"Email Ticketing",sub:"Freshdesk-style inbox · Auto-resolve · CSAT",col:C.blue},
    {icon:"🧠",title:"AI Intelligence",sub:"Root cause clusters · Churn risk · Revenue impact",col:C.purple},
    {icon:"📊",title:"Analytics & Reports",sub:"MTTR · SLA compliance · User performance · CSV export",col:C.green},
  ];
  pillars.forEach((p,i)=>{
    const bx=0.3+i*3.25,by=2.05;
    card(s,bx,by,3.05,4.85,C.bgCard,C.border);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:3.05,h:0.07,fill:{color:p.col},line:{color:p.col}});
    s.addText(p.icon,{x:bx,y:by+0.2,w:3.05,h:0.75,fontSize:36,align:"center",margin:0});
    s.addText(p.title,{x:bx+0.15,y:by+1.02,w:2.75,h:0.48,fontSize:17,color:p.col,bold:true,fontFace:"Calibri",margin:0});
    s.addText(p.sub,{x:bx+0.15,y:by+1.55,w:2.75,h:0.9,fontSize:11.5,color:C.t2,fontFace:"Calibri",margin:0});

    // Mini feature list
    const feats={
      "🎯":["Kanban + Sprints","SLA timers","Bulk actions","Custom fields","Post-mortems"],
      "📬":["Email → ticket auto","Smart spam filter","CSAT surveys","Auto-resolve rules","Reply from platform"],
      "🧠":["Root cause AI","Regression detector","Revenue dashboard","Customer health","Predictive SLA"],
      "👑":["MRR dashboard","Churn risk","Brand health","CRM notes","Maintenance mode"],
    }[p.icon]||[];
    feats.forEach((f,j)=>{
      s.addText([{text:"✓ ",options:{color:p.col,bold:true}},{text:f,options:{color:C.t1}}],{x:bx+0.15,y:by+2.65+j*0.4,w:2.75,h:0.36,fontSize:10.5,fontFace:"Calibri",margin:0});
    });
  });
  num(s,3);
}

// ═══════════════════════════════════════
// SLIDE 4 — MULTI-TENANT ARCHITECTURE
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("Multi-Tenant Architecture",{x:0.35,y:0.5,w:10,h:0.65,fontSize:32,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("One platform. Every company runs their own isolated workspace.",{x:0.35,y:1.15,w:10,h:0.38,fontSize:14,color:C.l3,fontFace:"Calibri",margin:0});

  // Owner box
  s.addShape(pres.shapes.RECTANGLE,{x:4.6,y:1.75,w:4.1,h:0.85,fill:{color:C.amber},line:{color:C.amber}});
  s.addText("👑 Product Owner (You)",{x:4.6,y:1.75,w:4.1,h:0.85,fontSize:15,color:C.bgDark,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});

  // Connector
  s.addShape(pres.shapes.LINE,{x:6.65,y:2.6,w:0,h:0.5,line:{color:C.l3,width:1.5,dashType:"dash"}});
  s.addShape(pres.shapes.LINE,{x:1.5,y:3.1,w:10.3,h:0,line:{color:C.l3,width:1.5,dashType:"dash"}});

  const brands=[
    {name:"Konnect Insights",tier:"Enterprise",col:C.amber,users:8,issues:142,health:85},
    {name:"Atomberg Tech",tier:"Pro",col:C.blue,users:5,issues:67,health:92},
    {name:"Ajay Chandran",tier:"Trial",col:C.green,users:3,issues:28,health:65},
    {name:"Your Next Client",tier:"Free",col:C.l3,users:0,issues:0,health:0},
  ];
  brands.forEach((b,i)=>{
    const bx=0.3+i*3.25,by=3.2;
    s.addShape(pres.shapes.LINE,{x:bx+1.525,y:3.1,w:0,h:0.12,line:{color:C.l3,width:1.5,dashType:"dash"}});
    card(s,bx,by,3.05,3.75,C.white,b.col);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:3.05,h:0.52,fill:{color:b.col},line:{color:b.col}});
    s.addText(b.name,{x:bx+0.1,y:by+0.06,w:2.85,h:0.38,fontSize:12,color:C.white,bold:true,fontFace:"Calibri",margin:0});

    const healthColor=b.health>=80?C.green:b.health>=60?C.amber:b.health>0?C.red:C.l3;
    s.addText("Health",{x:bx+0.1,y:by+0.65,w:1,h:0.28,fontSize:9,color:C.l3,fontFace:"Calibri",margin:0});
    s.addText(b.health>0?b.health+"% "+( b.health>=80?'A':b.health>=60?'B':'C'):"—",{x:bx+1.1,y:by+0.65,w:1.85,h:0.28,fontSize:10,color:healthColor,bold:true,fontFace:"Calibri",margin:0});

    s.addText("Tier",{x:bx+0.1,y:by+1.02,w:1,h:0.28,fontSize:9,color:C.l3,fontFace:"Calibri",margin:0});
    s.addShape(pres.shapes.RECTANGLE,{x:bx+1.1,y:by+1.04,w:0.8,h:0.22,fill:{color:b.col,transparency:87},line:{color:b.col,transparency:67}});
    s.addText(b.tier,{x:bx+1.1,y:by+1.04,w:0.8,h:0.22,fontSize:8,color:b.col,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});

    s.addText("👥 "+b.users+" users",{x:bx+0.1,y:by+1.42,w:2.85,h:0.28,fontSize:10,color:C.l2,fontFace:"Calibri",margin:0});
    s.addText("🎫 "+b.issues+" issues",{x:bx+0.1,y:by+1.72,w:2.85,h:0.28,fontSize:10,color:C.l2,fontFace:"Calibri",margin:0});
    s.addText("🔒 Isolated DB",{x:bx+0.1,y:by+2.05,w:2.85,h:0.28,fontSize:10,color:b.col,fontFace:"Calibri",margin:0});

    if(b.health>0){
      s.addShape(pres.shapes.RECTANGLE,{x:bx+0.1,y:by+3.25,w:2.85,h:0.1,fill:{color:"E5E7EB"},line:{color:"E5E7EB"}});
      s.addShape(pres.shapes.RECTANGLE,{x:bx+0.1,y:by+3.25,w:2.85*(b.health/100),h:0.1,fill:{color:healthColor},line:{color:healthColor}});
    }
  });
  num(s,4);
}

// ═══════════════════════════════════════
// SLIDE 5 — AI INTELLIGENCE HUB
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.purple},line:{color:C.purple}});

  s.addText("🧠 AI Intelligence Hub",{x:0.35,y:0.3,w:10,h:0.75,fontSize:34,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Resolvo doesn't just track issues — it thinks about them for you.",{x:0.35,y:1.05,w:10,h:0.4,fontSize:14,color:C.t2,fontFace:"Calibri",margin:0});

  const aiFeatures=[
    {icon:"🔬",title:"Root Cause Clustering",desc:"Groups similar issues by root cause automatically. 'Login fails on Safari', 'Auth token expired', '2FA broken' → ONE cluster. Fix all at once.",color:C.purple},
    {icon:"⚠️",title:"Regression Detector",desc:"When a resolved issue comes back, Resolvo auto-flags it and links to the original: 'This looks like ISS-0089 from March — it's back.'",color:C.red},
    {icon:"📊",title:"Predictive SLA Breach",desc:"Warns before breach happens: 'Dev A averages 18h on Medium issues. SLA is 24h. At current pace — breach probability: 78%.'",color:C.amber},
    {icon:"💰",title:"Revenue Impact Tracking",desc:"Tag issues with ₹ at risk. Dashboard shows total revenue exposed: '₹12.8L at risk across 5 open issues.'",color:C.green},
    {icon:"😤",title:"Sentiment-Triggered Escalation",desc:"Detects angry customers from email language. Score <30 → auto-escalate to Critical. 'EXTREMELY FRUSTRATED' → immediate alert.",color:"F59E0B"},
    {icon:"❤️",title:"Customer Health Scores",desc:"Per-customer 0–100 health score from ticket patterns. Shows at-risk customers before they churn.",color:C.red},
    {icon:"⭐",title:"CSAT Surveys",desc:"Auto-send 1-5 star satisfaction survey after ticket resolves. Customer clicks an emoji. Track CSAT per agent, per module.",color:C.amber},
    {icon:"⚡",title:"Zero-Touch Auto-Resolve",desc:"Configure rules: 'If subject matches Delivery Status Notification → auto-close, send reply.' No agent needed.",color:C.green},
  ];

  aiFeatures.forEach((f,i)=>{
    const col=i%4,row=Math.floor(i/4);
    const bx=0.3+col*3.25,by=1.65+row*2.85;
    card(s,bx,by,3.05,2.6,C.bgCard,C.border);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:3.05,h:0.06,fill:{color:f.color},line:{color:f.color}});
    s.addText(f.icon,{x:bx+0.12,y:by+0.18,w:0.62,h:0.62,fontSize:24,align:"center",margin:0});
    s.addText(f.title,{x:bx+0.82,y:by+0.2,w:2.1,h:0.42,fontSize:12.5,color:f.color,bold:true,fontFace:"Calibri",margin:0});
    s.addText(f.desc,{x:bx+0.12,y:by+0.9,w:2.82,h:1.52,fontSize:9.5,color:C.t2,fontFace:"Calibri",margin:0});
  });
  num(s,5);
}

// ═══════════════════════════════════════
// SLIDE 6 — EMAIL TICKETING (FRESHDESK-STYLE)
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("📬 Email Ticketing — Built-In",{x:0.35,y:0.5,w:10,h:0.65,fontSize:32,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("A complete Freshdesk-style support inbox. No extra tool needed.",{x:0.35,y:1.15,w:10,h:0.38,fontSize:14,color:C.l3,fontFace:"Calibri",margin:0});

  // Left: inbox mockup
  card(s,0.3,1.72,6.0,5.4,C.white,"E5E7EB");
  s.addShape(pres.shapes.RECTANGLE,{x:0.3,y:1.72,w:6.0,h:0.52,fill:{color:C.l1},line:{color:C.l1}});
  s.addText("Support Inbox",{x:0.45,y:1.75,w:3,h:0.46,fontSize:13,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("648 tickets",{x:5.1,y:1.75,w:1.1,h:0.46,fontSize:11,color:"9CA3AF",fontFace:"Calibri",align:"right",margin:0});

  const tickets=[
    {name:"John D",from:"john@acme.com",sub:"Payment gateway timeout",time:"2m",priority:"Critical",status:"NEW",unread:true,color:C.red},
    {name:"Sarah M",from:"sarah@beta.io",sub:"Login fails on Safari iOS",time:"15m",priority:"High",status:"OPEN",unread:false,color:"D97706"},
    {name:"Mike T",from:"mike@gamma.co",sub:"Dashboard not loading",time:"1h",priority:"Medium",status:"PENDING",unread:false,color:C.blue},
  ];
  tickets.forEach((t,i)=>{
    const ty=2.36+i*1.55;
    s.addShape(pres.shapes.RECTANGLE,{x:0.3,y:ty,w:6.0,h:1.45,fill:{color:t.unread?"FFF7E6":"FFFFFF"},line:{color:"F3F4F6",width:0.3}});
    s.addShape(pres.shapes.OVAL,{x:0.45,y:ty+0.38,w:0.52,h:0.52,fill:{color:t.color,transparency:87},line:{color:t.color}});
    s.addText(t.name.charAt(0),{x:0.45,y:ty+0.38,w:0.52,h:0.52,fontSize:14,color:t.color,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    s.addText(t.sub,{x:1.06,y:ty+0.16,w:3.9,h:0.38,fontSize:12,color:"111827",bold:t.unread,fontFace:"Calibri",margin:0});
    s.addText(t.from+" — click to open full thread",{x:1.06,y:ty+0.54,w:3.9,h:0.28,fontSize:9.5,color:"6B7280",fontFace:"Calibri",margin:0});
    s.addShape(pres.shapes.RECTANGLE,{x:1.06,y:ty+0.88,w:0.65,h:0.2,fill:{color:t.color,transparency:90},line:{color:t.color,transparency:73}});
    s.addText(t.status,{x:1.06,y:ty+0.88,w:0.65,h:0.2,fontSize:7.5,color:t.color,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    s.addShape(pres.shapes.RECTANGLE,{x:1.78,y:ty+0.88,w:0.65,h:0.2,fill:{color:t.color,transparency:90},line:{color:t.color,transparency:73}});
    s.addText(t.priority,{x:1.78,y:ty+0.88,w:0.65,h:0.2,fontSize:7.5,color:t.color,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    s.addText(t.time+" ago",{x:5.5,y:ty+0.16,w:0.72,h:0.28,fontSize:10,color:"9CA3AF",fontFace:"Calibri",align:"right",margin:0});
  });

  // Right: features
  const features=[
    {icon:"📥",text:"Email → ticket automatically (any IMAP/Gmail)"},
    {icon:"🤖",text:"AI sentiment detection auto-escalates angry customers"},
    {icon:"🚫",text:"Smart spam filter blocks bounces & auto-notifications"},
    {icon:"💬",text:"Reply from platform → email sent back to customer"},
    {icon:"🎫",text:"'Raise as Issue' links ticket to tech team issue"},
    {icon:"⭐",text:"CSAT survey auto-sent after ticket resolved"},
    {icon:"⚡",text:"Zero-touch auto-resolve for repetitive patterns"},
  ];
  features.forEach((f,i)=>{
    s.addText(f.icon+" "+f.text,{x:6.55,y:1.82+i*0.76,w:6.4,h:0.62,fontSize:12,color:C.l2,fontFace:"Calibri",margin:0,bullet:false});
    if(i<features.length-1)s.addShape(pres.shapes.LINE,{x:6.55,y:2.4+i*0.76,w:6.4,h:0,line:{color:"E5E7EB",width:0.3}});
  });
  num(s,6);
}

// ═══════════════════════════════════════
// SLIDE 7 — OWNER PORTAL POWER
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("📊 Analytics & Reporting — Full Visibility",{x:0.35,y:0.3,w:11,h:0.75,fontSize:32,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Every team lead and admin gets real-time data to make faster decisions and prevent SLA breaches.",{x:0.35,y:1.05,w:11,h:0.4,fontSize:13,color:C.t2,fontFace:"Calibri",margin:0});

  const ownerFeatures=[
    {cat:"Issue Reports",icon:"📋",features:["All issues by status & priority","Module health scores","Developer performance","Aging & WIP analysis","Export full CSV"]},
    {cat:"SLA & Compliance",icon:"⏱",features:["SLA compliance rate (%)","Breached issues history","Resolution time trend","Working hours config","SLA predictor (AI)"]},
    {cat:"User & Team",icon:"👥",features:["Issues raised per user","Issues resolved per user","Avg resolution time","SLA compliance per user","Time logged per task"]},
    {cat:"Email Tickets",icon:"📬",features:["Tickets by status chart","Avg first response time","Resolution rate %","Top senders heatmap","30-day volume trend"]},
  ];
  ownerFeatures.forEach((cat,i)=>{
    const bx=0.3+i*3.25,by=1.65;
    card(s,bx,by,3.05,5.45,C.bgCard,C.border);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:3.05,h:0.52,fill:{color:C.bgSurf},line:{color:C.border}});
    s.addText(cat.icon+" "+cat.cat,{x:bx+0.12,y:by+0.08,w:2.82,h:0.36,fontSize:14,color:C.amber,bold:true,fontFace:"Calibri",margin:0});
    cat.features.forEach((f,j)=>{
      s.addText([{text:"✓ ",options:{color:C.amber,bold:true}},{text:f,options:{color:C.t1}}],{x:bx+0.12,y:by+0.68+j*0.91,w:2.82,h:0.82,fontSize:10.5,fontFace:"Calibri",margin:0});
    });
  });
  num(s,7);
}

// ═══════════════════════════════════════
// SLIDE 8 — 50+ FEATURES GRID
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("50+ Features. Day One. No Setup.",{x:0.35,y:0.45,w:11,h:0.65,fontSize:32,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Everything ships out of the box. No plugins. No configuration marathon.",{x:0.35,y:1.1,w:10,h:0.38,fontSize:13,color:C.l3,fontFace:"Calibri",margin:0});

  const features=[
    {e:"🎯",t:"Issue Tracking + SLA",d:"Full lifecycle with configurable SLA timers per priority"},
    {e:"📋",t:"Kanban Board",d:"Drag-and-drop with SLA badges and age indicators"},
    {e:"🚀",t:"Sprint Planning",d:"Burndown charts, velocity tracking, story points"},
    {e:"🤖",t:"AI Triage (Gemini)",d:"Smart priority, module, impact suggestions"},
    {e:"📊",t:"Analytics Suite",d:"MTTR, SLA compliance, module health, workload"},
    {e:"📬",t:"Email Ticketing",d:"Full Freshdesk-style inbox with conversation threads"},
    {e:"🔬",t:"Root Cause AI",d:"Group similar issues by root cause automatically"},
    {e:"💰",t:"Revenue Impact",d:"Tag issues with ₹ at risk — dashboard shows exposure"},
    {e:"❤️",t:"Customer Health",d:"Per-email health score from ticket patterns"},
    {e:"📈",t:"Reports (4 types)",d:"My issues, All issues, User performance, Email stats"},
    {e:"⚡",t:"Feature Flags",d:"Enable/disable any feature per brand per tier"},
    {e:"🔗",t:"API Integrations",d:"Jira, ServiceNow, GitHub, custom REST API"},
    {e:"🌐",t:"Public Status Page",d:"/status shows live health to customers"},
    {e:"🔐",t:"Enterprise Security",d:"bcrypt, rate limiting, session expiry, audit trail"},
    {e:"📜",t:"Post-Mortem Reports",d:"AI-generated incident reports one click"},
    {e:"👥",t:"Teams + On-Call",d:"Organise users into teams, define on-call rotations"},
  ];

  features.forEach((f,i)=>{
    const col=i%4,row=Math.floor(i/4);
    const bx=0.3+col*3.25,by=1.72+row*1.38;
    card(s,bx,by,3.05,1.22,C.white,"E5E7EB");
    s.addText(f.e,{x:bx+0.12,y:by+0.18,w:0.52,h:0.52,fontSize:20,align:"center",margin:0});
    s.addText(f.t,{x:bx+0.72,y:by+0.16,w:2.22,h:0.36,fontSize:11.5,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
    s.addText(f.d,{x:bx+0.12,y:by+0.65,w:2.82,h:0.45,fontSize:9.5,color:C.l3,fontFace:"Calibri",margin:0});
  });
  num(s,8);
}

// ═══════════════════════════════════════
// SLIDE 9 — FOR EVERY TEAM
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("Built for Every Team",{x:0.35,y:0.3,w:10,h:0.7,fontSize:32,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Not just developers. Every person who touches a customer problem.",{x:0.35,y:1.0,w:10,h:0.4,fontSize:13,color:C.t2,fontFace:"Calibri",margin:0});

  const teams=[
    {e:"⚙️",name:"Engineering",col:C.purple,pts:["Create & own issues","Kanban + Sprint workflow","AI smart triage","SLA timers + breach alerts","Git commit linking"]},
    {e:"💬",name:"CS / Support",col:C.blue,pts:["Report bugs from clients","Email ticket inbox","Track resolution status","CSAT surveys","Full conversation history"]},
    {e:"🔍",name:"QA / Testing",col:C.green,pts:["Create test-fail issues","Peer review workflow","Custom fields for test data","Linked dependencies","Module health scores"]},
    {e:"📈",name:"Sales",col:C.amber,pts:["Report deal-blocking bugs","Priority escalation","Revenue impact tagging","Status page to share","Customer health visibility"]},
    {e:"🎯",name:"Product",col:"F472B6",pts:["Feature request tracking","Sprint planning + velocity","Release notes (AI-gen)","Post-mortem reports","Analytics dashboards"]},
  ];
  teams.forEach((t,i)=>{
    const bx=0.3+i*2.58,by=1.6;
    card(s,bx,by,2.45,5.5,C.bgCard,t.col);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:2.45,h:0.65,fill:{color:t.col},line:{color:t.col}});
    s.addText(t.e,{x:bx+0.1,y:by+0.07,w:0.52,h:0.52,fontSize:22,align:"center",margin:0});
    s.addText(t.name,{x:bx+0.62,y:by+0.14,w:1.72,h:0.38,fontSize:13,color:C.white,bold:true,fontFace:"Calibri",margin:0});
    t.pts.forEach((p,j)=>{
      s.addText([{text:"✦ ",options:{color:t.col,bold:true}},{text:p,options:{color:C.t1}}],{x:bx+0.12,y:by+0.85+j*0.9,w:2.22,h:0.82,fontSize:10.5,fontFace:"Calibri",margin:0});
    });
  });
  num(s,9);
}

// ═══════════════════════════════════════
// SLIDE 10 — INTEGRATIONS
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("Connects to Your Entire Stack",{x:0.35,y:0.5,w:10,h:0.65,fontSize:32,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Push issues to Jira, sync with GitHub, trigger Slack alerts, let AI triage — all automatic.",{x:0.35,y:1.15,w:10,h:0.38,fontSize:14,color:C.l3,fontFace:"Calibri",margin:0});

  const integrations=[
    {e:"🔷",n:"Jira",d:"Auto-create Jira issues on new ticket. 2-way sync via Atlassian API.",tag:"2-way sync"},
    {e:"🐙",n:"GitHub Issues",d:"Push tickets as GitHub issues. Link commits to issues.",tag:"commit linking"},
    {e:"🔔",n:"ServiceNow",d:"Auto-create incidents in ServiceNow with urgency mapping.",tag:"ITSM"},
    {e:"💬",n:"Slack",d:"Instant webhook alerts for critical issues and SLA breaches.",tag:"real-time"},
    {e:"📧",n:"Gmail / SMTP",d:"Beautiful HTML email notifications via Nodemailer.",tag:"notifications"},
    {e:"🤖",n:"Google Gemini",d:"AI triage, comment summaries, daily standup digests.",tag:"AI"},
    {e:"🔗",n:"Custom REST",d:"Push to any internal API with configurable endpoint + auth.",tag:"enterprise"},
    {e:"🌐",n:"Webhooks/Zapier",d:"Trigger n8n, Zapier, or any automation on issue events.",tag:"automation"},
  ];

  integrations.forEach((int,i)=>{
    const col=i%4,row=Math.floor(i/4);
    const bx=0.3+col*3.25,by=1.75+row*2.65;
    card(s,bx,by,3.05,2.42,C.white,"E5E7EB");
    s.addText(int.e,{x:bx+0.12,y:by+0.22,w:0.65,h:0.65,fontSize:26,align:"center",margin:0});
    s.addText(int.n,{x:bx+0.85,y:by+0.24,w:1.8,h:0.38,fontSize:14,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
    s.addShape(pres.shapes.RECTANGLE,{x:bx+0.85,y:by+0.65,w:int.tag.length*0.074+0.2,h:0.22,fill:{color:"EFF6FF"},line:{color:"BFDBFE"}});
    s.addText(int.tag,{x:bx+0.85,y:by+0.65,w:int.tag.length*0.074+0.2,h:0.22,fontSize:8,color:C.blue,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    s.addText(int.d,{x:bx+0.12,y:by+1.04,w:2.82,h:1.18,fontSize:10.5,color:C.l3,fontFace:"Calibri",margin:0});
  });
  num(s,10);
}

// ═══════════════════════════════════════
// SLIDE 11 — SECURITY
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.green},line:{color:C.green}});

  s.addText("Enterprise-Grade Security",{x:0.35,y:0.35,w:10,h:0.7,fontSize:32,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Your data is isolated, encrypted, and protected at every layer.",{x:0.35,y:1.05,w:10,h:0.38,fontSize:14,color:C.t2,fontFace:"Calibri",margin:0});

  const secFeatures=[
    {icon:"🔐",t:"bcrypt Passwords",d:"All passwords hashed with bcrypt (cost 10). Zero plain-text credentials ever stored.",tag:"Encryption"},
    {icon:"🛡",t:"Rate Limiting",d:"5 login attempts per IP per 15 minutes. Brute-force attacks blocked at the API.",tag:"Auth"},
    {icon:"⏱",t:"Session Expiry",d:"Sessions expire in 8h (30d with Remember Me). Force-logout any session from Owner Portal.",tag:"Sessions"},
    {icon:"🔒",t:"Data Isolation",d:"Each brand's data in a separate JSON file. Cross-brand access is architecturally impossible.",tag:"Multi-tenant"},
    {icon:"📜",t:"Audit Trail",d:"Every action logged with user, timestamp, issue ID. Full activity history for compliance.",tag:"Compliance"},
    {icon:"🛠",t:"Maintenance Mode",d:"Owner can put the platform in maintenance mode instantly. Custom message shown to all users.",tag:"Operations"},
  ];

  secFeatures.forEach((f,i)=>{
    const col=i%3,row=Math.floor(i/3);
    const bx=0.3+col*4.32,by=1.65+row*2.55;
    card(s,bx,by,4.12,2.3,C.bgCard,C.border);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:4.12,h:0.06,fill:{color:C.green},line:{color:C.green}});
    s.addText(f.icon,{x:bx+0.12,y:by+0.2,w:0.62,h:0.62,fontSize:24,align:"center",margin:0});
    s.addText(f.t,{x:bx+0.82,y:by+0.2,w:3.18,h:0.38,fontSize:13.5,color:C.t1,bold:true,fontFace:"Calibri",margin:0});
    s.addShape(pres.shapes.RECTANGLE,{x:bx+0.82,y:by+0.62,w:f.tag.length*0.074+0.2,h:0.22,fill:{color:C.green,transparency:90},line:{color:C.green,transparency:73}});
    s.addText(f.tag,{x:bx+0.82,y:by+0.62,w:f.tag.length*0.074+0.2,h:0.22,fontSize:8,color:C.green,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    s.addText(f.d,{x:bx+0.12,y:by+1.0,w:3.88,h:1.08,fontSize:10.5,color:C.t2,fontFace:"Calibri",margin:0});
  });
  num(s,11);
}

// ═══════════════════════════════════════
// SLIDE 12 — PRICING
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("Simple, Transparent Pricing",{x:0.35,y:0.3,w:11,h:0.7,fontSize:32,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("Start free. Scale when you need to. Each brand billed separately.",{x:0.35,y:1.0,w:11,h:0.38,fontSize:13,color:C.t2,fontFace:"Calibri",margin:0});

  const tiers=[
    {name:"Free",price:"₹0",sub:"/month forever",col:C.t3,features:["Issue tracking + SLA","Audit trail","Full-text search","Pinned issues + watchers","Email notifications","Public status page","Up to 20 users"],cta:"Get Started Free",ctaCol:C.t3},
    {name:"Pro",price:"₹999",sub:"/month per brand",col:C.amber,features:["Everything in Free","Kanban + Sprints","AI-powered triage","Analytics + Workload","Bulk actions + Tags","Custom fields","On-Call schedules","CSAT surveys","Zero-touch auto-resolve","Up to 50 users"],cta:"Start Pro Trial →",ctaCol:C.amber,popular:true},
    {name:"Enterprise",price:"₹2,499",sub:"/month per brand",col:C.purple,features:["Everything in Pro","Jira / ServiceNow / GitHub","Email triage automation","Revenue Impact dashboard","Customer health scores","Root cause clustering","API Integration","Unlimited users"],cta:"Contact Sales →",ctaCol:C.purple},
  ];

  tiers.forEach((tier,i)=>{
    const bx=0.5+i*4.18,by=1.58;
    const hl=tier.popular;
    card(s,bx,by,3.95,5.7,C.bgCard,hl?tier.col:C.border);
    if(hl){
      s.addShape(pres.shapes.RECTANGLE,{x:bx+1.2,y:by-0.02,w:1.5,h:0.3,fill:{color:tier.col},line:{color:tier.col}});
      s.addText("MOST POPULAR",{x:bx+1.2,y:by-0.02,w:1.5,h:0.3,fontSize:7.5,color:C.bgDark,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
    }
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:3.95,h:0.55,fill:{color:tier.col,transparency:87},line:{color:tier.col,transparency:73}});
    s.addText(tier.name,{x:bx+0.15,y:by+0.08,w:3.65,h:0.4,fontSize:16,color:tier.col,bold:true,fontFace:"Calibri",margin:0});
    s.addText(tier.price,{x:bx+0.15,y:by+0.72,w:1.8,h:0.72,fontSize:36,color:tier.col,bold:true,fontFace:"Calibri",margin:0});
    s.addText(tier.sub,{x:bx+0.15,y:by+1.45,w:3.65,h:0.3,fontSize:10,color:C.t3,fontFace:"Calibri",margin:0});
    s.addShape(pres.shapes.LINE,{x:bx+0.15,y:by+1.82,w:3.65,h:0,line:{color:C.border,width:0.5}});
    tier.features.forEach((f,j)=>{
      s.addText([{text:"✓ ",options:{color:tier.col,bold:true}},{text:f,options:{color:C.t1}}],{x:bx+0.15,y:by+1.95+j*0.3,w:3.65,h:0.28,fontSize:9.5,fontFace:"Calibri",margin:0});
    });
    s.addShape(pres.shapes.RECTANGLE,{x:bx+0.15,y:by+5.22,w:3.65,h:0.4,fill:{color:tier.ctaCol},line:{color:tier.ctaCol}});
    s.addText(tier.cta,{x:bx+0.15,y:by+5.22,w:3.65,h:0.4,fontSize:12,color:hl?C.bgDark:C.white,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
  });
  num(s,12);
}

// ═══════════════════════════════════════
// SLIDE 13 — WHY RESOLVO vs OTHERS
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); lightSlide(s); amberBar(s);
  s.addText("Why Resolvo?",{x:0.35,y:0.5,w:10,h:0.65,fontSize:34,color:C.l1,bold:true,fontFace:"Calibri",margin:0});
  s.addText("The only platform that combines engineering issue tracking + AI intelligence + email ticketing + owner control.",{x:0.35,y:1.15,w:12,h:0.38,fontSize:13,color:C.l3,fontFace:"Calibri",margin:0});

  const headers=["Feature","Resolvo","Jira","Freshdesk","Linear","Spreadsheets"];
  const rows=[
    ["Multi-tenant white-label",    "✓","✗","✗","✗","✗"],
    ["Email ticketing built-in",    "✓","✗","✓","✗","✗"],
    ["AI root cause clustering",    "✓","✗","✗","✗","✗"],
    ["Revenue impact tracking",     "✓","✗","✗","✗","Manual"],
    ["Customer health scores",      "✓","✗","✗","✗","✗"],
    ["Analytics + workload reports",  "✓","Add-on","Partial","✓","✗"],
    ["CSAT surveys built-in",       "✓","✗","✓","✗","✗"],
    ["Predictive SLA breach",       "✓","✗","✗","✗","✗"],
    ["Regression detector (AI)",    "✓","✗","✗","✗","✗"],
    ["Starting price",              "FREE","$7.75/user","$15/user","$8/user","Free"],
  ];

  const colW=[3.5,1.55,1.45,1.55,1.35,1.65];
  const colX=[0.3,3.85,5.45,6.95,8.55,9.95];

  headers.forEach((h,i)=>{
    const hl=i===1;
    s.addShape(pres.shapes.RECTANGLE,{x:colX[i],y:1.72,w:colW[i],h:0.46,fill:{color:hl?C.amber:C.l1},line:{color:hl?C.amber:C.l1}});
    s.addText(h,{x:colX[i],y:1.72,w:colW[i],h:0.46,fontSize:10,color:hl?C.bgDark:C.white,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
  });

  rows.forEach((row,ri)=>{
    const by=2.22+ri*0.48;
    const bg=ri%2===0?C.white:"F9FAFB";
    row.forEach((cell,ci)=>{
      const hl=ci===1;
      s.addShape(pres.shapes.RECTANGLE,{x:colX[ci],y:by,w:colW[ci],h:0.45,fill:{color:hl?"FFF7E6":bg},line:{color:"E5E7EB",width:0.3}});
      const isYes=cell==="✓";const isNo=cell==="✗";
      const col=hl&&isYes?C.green:isYes?C.green:isNo?C.red:C.l2;
      s.addText(cell,{x:colX[ci]+0.04,y:by,w:colW[ci]-0.08,h:0.45,fontSize:ci===0?10:10.5,color:col,bold:(isYes||isNo)&&hl,fontFace:"Calibri",align:ci===0?"left":"center",valign:"middle",margin:0});
    });
  });
  num(s,13);
}

// ═══════════════════════════════════════
// SLIDE 14 — REAL RESULTS
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("Real Results",{x:0.35,y:0.3,w:10,h:0.7,fontSize:32,color:C.white,bold:true,fontFace:"Calibri",margin:0});
  s.addText("What teams achieve after switching to Resolvo:",{x:0.35,y:1.0,w:10,h:0.38,fontSize:13,color:C.t2,fontFace:"Calibri",margin:0});

  const results=[
    {v:"87%",l:"SLA Compliance",s:"vs 42% before",c:C.green},
    {v:"3×",l:"Faster Resolution",s:"Avg dropped 18h → 5.8h",c:C.amber},
    {v:"100%",l:"Audit Coverage",s:"Every action logged",c:C.blue},
    {v:"0",l:"Missed escalations",s:"AI detects angry customers",c:C.purple},
    {v:"₹0",l:"Extra tools needed",s:"Issue tracker + helpdesk in one",c:C.green},
    {v:"5 min",l:"Setup time",s:"Zero DB config needed",c:C.amber},
  ];
  results.forEach((r,i)=>{
    const bx=0.3+(i%3)*4.35,by=1.55+Math.floor(i/2)*2.5;
    card(s,bx,by,4.15,2.25,C.bgCard,C.border);
    s.addShape(pres.shapes.RECTANGLE,{x:bx,y:by,w:4.15,h:0.07,fill:{color:r.c},line:{color:r.c}});
    s.addText(r.v,{x:bx,y:by+0.12,w:4.15,h:0.88,fontSize:44,color:r.c,bold:true,fontFace:"Calibri",align:"center",margin:0});
    s.addText(r.l,{x:bx+0.12,y:by+1.06,w:3.92,h:0.4,fontSize:13,color:C.t1,bold:true,fontFace:"Calibri",align:"center",margin:0});
    s.addText(r.s,{x:bx+0.12,y:by+1.5,w:3.92,h:0.62,fontSize:10.5,color:C.t3,fontFace:"Calibri",align:"center",italic:true,margin:0});
  });
  num(s,14);
}

// ═══════════════════════════════════════
// SLIDE 15 — CTA / CLOSE
// ═══════════════════════════════════════
{
  const s=pres.addSlide(); darkSlide(s);
  s.addShape(pres.shapes.OVAL,{x:-1.5,y:-1,w:7,h:7,fill:{color:C.amber,transparency:93},line:{color:C.amber,transparency:92}});
  s.addShape(pres.shapes.OVAL,{x:9.5,y:3,w:6,h:6,fill:{color:C.purple,transparency:92},line:{color:C.purple,transparency:91}});
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.07,h:H,fill:{color:C.amber},line:{color:C.amber}});

  s.addText("⟳",{x:W/2-0.8,y:0.55,w:1.6,h:1.6,fontSize:62,color:C.amber,fontFace:"Calibri",align:"center",margin:0});
  s.addText("Ready to Transform\nHow Your Team Tracks Issues?",{x:1.2,y:2.2,w:W-2.4,h:1.9,fontSize:38,color:C.white,bold:true,fontFace:"Calibri",align:"center",margin:0});
  s.addText("Join engineering teams who've moved from chaos to clarity with Resolvo.",{x:2,y:4.1,w:W-4,h:0.55,fontSize:15,color:C.t2,fontFace:"Calibri",align:"center",margin:0});

  s.addShape(pres.shapes.RECTANGLE,{x:3.4,y:4.85,w:2.9,h:0.72,fill:{color:C.amber},line:{color:C.amber}});
  s.addText("Get Started Free →",{x:3.4,y:4.85,w:2.9,h:0.72,fontSize:14,color:C.bgDark,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
  s.addShape(pres.shapes.RECTANGLE,{x:6.5,y:4.85,w:2.9,h:0.72,fill:{color:C.bgCard},line:{color:C.t3,width:1}});
  s.addText("Book a Demo",{x:6.5,y:4.85,w:2.9,h:0.72,fontSize:14,color:C.white,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});

  s.addText("📧 asifshaikh19978@gmail.com   ·   📱 +91 82860 63819",{x:1,y:5.9,w:W-2,h:0.45,fontSize:12,color:C.t3,fontFace:"Calibri",align:"center",margin:0});

  s.addShape(pres.shapes.RECTANGLE,{x:0,y:6.85,w:W,h:0.65,fill:{color:C.amber},line:{color:C.amber}});
  s.addText("⟳ Resolvo  |  Issue Tracking · AI Intelligence · Email Ticketing · Owner Portal  |  Free · Pro · Enterprise",{x:0,y:6.85,w:W,h:0.65,fontSize:12,color:C.bgDark,bold:true,fontFace:"Calibri",align:"center",valign:"middle",margin:0});
}

pres.writeFile({fileName:"C:\\Users\\Asif\\Desktop\\New\\TechTrack\\Resolvo-Pitch-Deck-Final.pptx"})
  .then(()=>console.log("✓ Resolvo-Pitch-Deck-Final.pptx saved!"))
  .catch(e=>console.error("Error:",e));
