// Bulk contact-email finder for startup outreach.
// Reads tools/urls.txt (one website per line) and writes tools/leads.csv.
//
// Usage:  node tools/scrape-emails.js
//
// Politeness: rate-limited, short timeouts, only fetches public pages
// (home, /contact, /about). Pulls publicly-published business emails only.
// Always include an unsubscribe link + your identity in any outreach (CAN-SPAM/GDPR/DPDP).

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const IN = path.join(DIR, 'urls.txt');
const OUT = path.join(DIR, 'leads.csv');

const PAGES = ['', '/contact', '/contact-us', '/about', '/about-us', '/company'];
const REQ_TIMEOUT = 12000;       // ms per request
const DELAY_BETWEEN = 400;       // ms between sites (be polite)
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Junk to discard (asset filenames, tracking, placeholders, vendors)
const BAD_SUFFIX = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.css', '.js', '.mp4', '.woff', '.woff2'];
const BAD_DOMAINS = ['sentry.io', 'sentry-next', 'wixpress.com', 'example.com', 'example.org',
  'yourdomain.com', 'domain.com', 'email.com', 'sentry.wixpress.com', 'godaddy.com',
  'squarespace.com', 'cloudflare.com', 'schema.org', 'w3.org', 'googleapis.com'];
const BAD_LOCAL = ['no-reply', 'noreply', 'donotreply'];

function clean(raw) {
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
}
function normUrl(line) {
  let u = line.trim();
  if (!u) return null;
  if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  return u;
}
function rootDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function isJunk(email) {
  const e = email.toLowerCase();
  if (BAD_SUFFIX.some(s => e.endsWith(s))) return true;
  if (BAD_DOMAINS.some(d => e.includes(d))) return true;
  if (BAD_LOCAL.some(l => e.startsWith(l + '@'))) return true;
  if (e.includes('@2x') || e.includes('.svg') || e.length > 60) return true;
  return false;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQ_TIMEOUT),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResolvoOutreach/1.0)' }
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return '';
    return await res.text();
  } catch { return ''; }
}

async function scrapeSite(site) {
  const domain = rootDomain(site);
  const found = new Set();
  for (const p of PAGES) {
    const html = await fetchText(site.replace(/\/+$/, '') + p);
    if (!html) continue;
    const matches = html.match(EMAIL_RE) || [];
    for (const m of matches) {
      const e = m.toLowerCase();
      if (!isJunk(e)) found.add(e);
    }
  }
  // Prefer emails whose domain matches the site (most relevant)
  const all = [...found];
  const onDomain = all.filter(e => domain && e.endsWith('@' + domain));
  return { domain, emails: onDomain.length ? onDomain : all };
}

const csvCell = (c) => `"${String(c).replace(/"/g, '""')}"`;

(async () => {
  if (!fs.existsSync(IN)) {
    console.error(`\n❌ Missing ${IN}\n   Create it with one website per line, then re-run.\n`);
    process.exit(1);
  }
  const lines = fs.readFileSync(IN, 'utf8').split(/\r?\n/).map(normUrl).filter(Boolean);
  const seen = new Set();
  const urls = lines.filter(u => { const d = rootDomain(u); if (seen.has(d)) return false; seen.add(d); return true; });

  // RESUME: read domains already saved in leads.csv so a re-run continues where it stopped.
  const done = new Set();
  if (fs.existsSync(OUT)) {
    const existing = fs.readFileSync(OUT, 'utf8').split(/\r?\n/).slice(1);
    for (const line of existing) {
      const m = line.match(/^"([^"]*)"/);
      if (m && m[1]) done.add(m[1]);
    }
  } else {
    fs.writeFileSync(OUT, ['website', 'emails', 'on_domain'].map(csvCell).join(',') + '\n');
  }

  const todo = urls.filter(u => !done.has(rootDomain(u)));
  console.log(`${urls.length} total · ${done.size} already done · scanning ${todo.length} remaining...\n`);
  let withEmail = 0;

  for (let i = 0; i < todo.length; i++) {
    const site = todo[i];
    const { domain, emails } = await scrapeSite(site);
    const onDom = domain && emails.some(e => e.endsWith('@' + domain));
    const row = [domain || clean(site), emails.join('; '), emails.length ? (onDom ? 'yes' : 'maybe') : ''];
    fs.appendFileSync(OUT, row.map(csvCell).join(',') + '\n');   // save every row immediately
    if (emails.length) withEmail++;
    console.log(`[${i + 1}/${todo.length}] ${(domain || '').padEnd(30)} ${emails.length ? emails.join(', ') : '— none'}`);
    await new Promise(r => setTimeout(r, DELAY_BETWEEN));
  }

  console.log(`\n✅ Done. ${withEmail} of ${todo.length} new sites had an email.\n   Saved → ${OUT}\n   (Re-run anytime — it skips domains already in the CSV.)\n`);
})();
