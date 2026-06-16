// Throttled, resumable cold-outreach sender.
// RUN ON THE VPS (needs .env with EMAIL_USER / EMAIL_PASS + nodemailer installed).
//
//   cd /root/Resolvo && node tools/send-outreach.js          # sends one safe batch
//   BATCH=20 node tools/send-outreach.js                     # custom batch size
//
// ⚠️ Sends from your Gmail/Workspace account. Keep BATCH small (<=25/day) and run
//    once daily. Stop immediately if Google flags the account. Resumable: it logs
//    every sent address to tools/sent-log.txt and never re-sends.

const fs = require('fs'), path = require('path');

// --- config ---
const BATCH = parseInt(process.env.BATCH || '20', 10);   // emails per run (keep small!)
const DELAY_MS = parseInt(process.env.DELAY_MS || '90000', 10); // 90s between sends (human-like)
const BASE = process.env.BASE_URL || 'https://app.resolvogroup.com';
const CSV = path.join(__dirname, 'send-ready.csv');
const LOG = path.join(__dirname, 'sent-log.txt');

// --- load EMAIL_USER / EMAIL_PASS (from env or .env file) ---
let USER = process.env.EMAIL_USER, PASS = process.env.EMAIL_PASS;
if (!USER || !PASS) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(EMAIL_USER|EMAIL_PASS)\s*=\s*(.*)\s*$/);
      if (m) { if (m[1] === 'EMAIL_USER') USER = m[2].trim(); else PASS = m[2].trim(); }
    }
  }
}
PASS = (PASS || '').replace(/\s/g, '');
if (!USER || !PASS) { console.error('❌ EMAIL_USER / EMAIL_PASS not found (env or .env).'); process.exit(1); }

// --- email template ({{Company}} merge) ---
function buildEmail(company, email) {
  const unsub = `${BASE}/api/lead/unsubscribe?email=${encodeURIComponent(email)}`;
  const subject = `A free tool for ${company}'s support team`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:520px;">
<p>Hi there,</p>
<p>I'm Asif, founder of Resolvo. Keeping this short.</p>
<p>I built an all-in-one platform for support + issue tracking — customer email inbox, ticketing, AI replies, knowledge base, and SLA tracking — that replaces tools like Freshdesk, Jira, and Intercom. One login, no per-agent fees.</p>
<p>I'm giving a few teams <strong>free lifetime access</strong> in exchange for honest feedback. No card, no catch. If ${company} handles customer emails or tracks issues, it'll save your team hours each week.</p>
<p>Worth a 10-minute look? I'll set it up for you personally.</p>
<p>— Asif, Resolvo<br><a href="${BASE}">resolvogroup.com</a></p>
<p style="font-size:11px;color:#999;margin-top:18px;">Not interested? <a href="${unsub}" style="color:#999;">Unsubscribe</a></p>
</div>`;
  const text = `Hi there,\n\nI'm Asif, founder of Resolvo. I built an all-in-one support + issue tracking platform that replaces Freshdesk, Jira, and Intercom — one login, no per-agent fees.\n\nI'm giving a few teams free lifetime access for honest feedback. If ${company} handles customer emails or tracks issues, it'll save hours each week.\n\nWorth a 10-min look? I'll set it up for you.\n\n— Asif, Resolvo\nresolvogroup.com\n\nUnsubscribe: ${unsub}`;
  return { subject, html, text };
}

(async () => {
  if (!fs.existsSync(CSV)) { console.error(`❌ Missing ${CSV} (upload send-ready.csv to the VPS).`); process.exit(1); }
  const sent = new Set(fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean) : []);
  const rows = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1)
    .map(l => (l.match(/"([^"]*)"/g) || []).map(c => c.slice(1, -1)))
    .filter(c => c[0] && !sent.has(c[0]));

  if (!rows.length) { console.log('✅ Nothing left to send — all done.'); return; }

  const nm = require('nodemailer');
  const t = nm.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } });
  const todo = rows.slice(0, BATCH);
  console.log(`Sending ${todo.length} (of ${rows.length} remaining). ${DELAY_MS / 1000}s between each.\n`);

  for (let i = 0; i < todo.length; i++) {
    const [email, company] = todo[i];
    const { subject, html, text } = buildEmail(company || 'your', email);
    try {
      await t.sendMail({ from: `Asif from Resolvo <${USER}>`, to: email, subject, html, text });
      fs.appendFileSync(LOG, email + '\n');
      console.log(`[${i + 1}/${todo.length}] ✓ ${email}`);
    } catch (e) {
      console.error(`[${i + 1}/${todo.length}] ✗ ${email} — ${e.message}`);
      if (/rate|limit|quota|blocked|suspend/i.test(e.message)) { console.error('\n🛑 Google is throttling/blocking. STOPPING. Wait 24h or switch to a dedicated tool.'); break; }
    }
    if (i < todo.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  console.log(`\nDone. Run again tomorrow for the next ${BATCH}. (${sent.size + todo.length} sent total)`);
})();
