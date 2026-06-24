// One-time test script — run with: node monitor-test.js
// Sends a sample alert email for every monitoring layer
require('dotenv').config();

const ALERT_TO='asifshaikh19978@gmail.com';
function nowIST(){const d=new Date();const off=d.getTimezoneOffset();const ist=new Date(d.getTime()-off*60000);return ist.toISOString().replace('Z','+05:30');}

async function sendAlert(type,title,details,extras={}){
  const mem=process.memoryUsage();
  const memMB=Math.round(mem.heapUsed/1024/1024);
  const uptime=Math.round(process.uptime()/60);
  const extrasHtml=Object.entries(extras).map(([k,v])=>`<tr><td style="padding:6px 10px;font-size:12px;color:#6b7280;font-weight:600;white-space:nowrap;">${k}</td><td style="padding:6px 10px;font-size:12px;font-family:monospace;word-break:break-all;">${String(v).substring(0,500)}</td></tr>`).join('');
  const badge={'CRASH':'#DC2626','ERROR':'#D97706','SLOW':'#7C3AED','MEMORY':'#DC2626','IMAP':'#2563EB','CRON':'#059669','DB':'#DC2626','HEALTH':'#DC2626'}[type]||'#374151';
  const icon={'CRASH':'💥','ERROR':'⚠️','SLOW':'🐢','MEMORY':'🔴','IMAP':'📬','CRON':'⏰','DB':'🗄️','HEALTH':'❤️'}[type]||'🔔';
  const html=`<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;padding:24px 16px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
<div style="background:${badge};padding:20px 28px;display:flex;align-items:center;gap:12px;">
  <div style="font-size:28px;">${icon}</div>
  <div><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;">${type} ALERT — Resolvo Platform [TEST]</div>
  <div style="font-size:18px;font-weight:800;color:#fff;margin-top:2px;">${title}</div></div>
</div>
<div style="padding:24px 28px;">
  <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e;margin-bottom:16px;">
    🧪 <strong>TEST EMAIL</strong> — This is a sample alert to verify monitoring is working correctly.
  </div>
  <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin-bottom:20px;">
    <tr><td style="padding:6px 10px;font-size:12px;color:#6b7280;font-weight:600;">Time (IST)</td><td style="padding:6px 10px;font-size:12px;">${nowIST()}</td></tr>
    <tr><td style="padding:6px 10px;font-size:12px;color:#6b7280;font-weight:600;">Occurrences</td><td style="padding:6px 10px;font-size:12px;">1× (test run)</td></tr>
    <tr><td style="padding:6px 10px;font-size:12px;color:#6b7280;font-weight:600;">Memory</td><td style="padding:6px 10px;font-size:12px;">${memMB} MB heap used</td></tr>
    <tr><td style="padding:6px 10px;font-size:12px;color:#6b7280;font-weight:600;">Uptime</td><td style="padding:6px 10px;font-size:12px;">${uptime} minutes</td></tr>
    ${extrasHtml}
  </table>
  <div style="background:#1e293b;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Details / Stack Trace</div>
    <pre style="margin:0;font-size:12px;color:#e2e8f0;white-space:pre-wrap;word-break:break-all;line-height:1.6;">${String(details).substring(0,2000)}</pre>
  </div>
</div>
<div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
  Resolvo Platform Monitor · <a href="https://app.resolvogroup.com" style="color:#F59E0B;text-decoration:none;">Open Dashboard</a>
</div>
</div></body></html>`;

  const nm=require('nodemailer');
  const user=process.env.EMAIL_USER||'',pass=(process.env.EMAIL_PASS||'').replace(/\s/g,'');
  if(!user||!pass){console.error('❌ EMAIL_USER/EMAIL_PASS not set in .env');process.exit(1);}
  const t=nm.createTransport({service:'gmail',auth:{user,pass}});
  await t.sendMail({from:`"Resolvo Monitor" <${user}>`,to:ALERT_TO,subject:`[TEST][${type}] ${title} — Resolvo`,text:`${type}: ${title}\n\n${details}`,html});
  console.log(`✅ [${type}] ${title}`);
}

async function runTests(){
  console.log('\n🧪 Resolvo Monitor — Sending test alerts to',ALERT_TO,'\n');

  // 1. CRASH — simulated uncaught exception
  const crashErr=new Error('ReferenceError: db is not defined');
  crashErr.stack=`ReferenceError: db is not defined\n    at readBrandDB (server.js:412:18)\n    at processTickets (server.js:1847:22)\n    at async cronJob (server.js:5920:5)`;
  await sendAlert('CRASH','Uncaught Exception — Server may crash',crashErr.stack,{
    'Error Name':'ReferenceError','Error Code':'N/A'
  });

  // 2. ERROR — Express API 500
  await sendAlert('ERROR','API Error: POST /api/tickets',
    `Error: Cannot read properties of undefined (reading 'slug')\n    at createTicket (server.js:2341:28)\n    at Layer.handle [as handle_request] (express/lib/router/layer.js:95:5)\n    at next (express/lib/router/route.js:137:13)`,
    {'Route':'POST /api/tickets','Status':500,'Body':'{"subject":"Login not working","priority":"High"}','User-Agent':'Mozilla/5.0 Chrome/124','IP':'103.21.58.14'});

  // 3. SLOW — slow request
  await sendAlert('SLOW','Slow request: GET /api/crm/contacts took 5821ms',
    `Route: GET /api/crm/contacts\nDuration: 5821ms\nStatus: 200`,
    {'Route':'GET /api/crm/contacts','Duration':'5821ms','Status':200,'User-Agent':'Mozilla/5.0 Safari/537','IP':'49.36.102.77'});

  // 4. MEMORY — heap spike
  await sendAlert('MEMORY','High memory usage: 487MB heap',
    `Heap Used: 487MB\nRSS: 612MB\nHeap Total: 512MB`,
    {'Heap Used':'487MB','RSS':'612MB','Uptime':'43 min'});

  // 5. HEALTH — restart detected
  await sendAlert('HEALTH','Server restarted — uptime only 8s',
    `PM2 or Node process restarted unexpectedly.\nUptime: 8 seconds\nTime: ${nowIST()}`,
    {'Uptime':'8s','Memory':'47MB'});

  console.log('\n✅ All 5 test alerts sent! Check your inbox.\n');
}

runTests().catch(e=>{console.error('Failed:',e.message);process.exit(1);});
