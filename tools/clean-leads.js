// Cleans tools/raw.txt (format: domain|emails) into tools/leads-clean.csv
// Removes placeholder/demo emails, flags on-domain, picks a primary contact.
const fs = require('fs'), path = require('path');
const IN = path.join(__dirname, 'raw.txt');
const OUT = path.join(__dirname, 'leads-clean.csv');

const JUNK_LOCAL = ['name', 'example', 'you', 'test', 'api-test', 'abc', 'ex-abc', 'sarah', 'jennyforrest'];
const JUNK_DOMAIN = ['gmail.com', 'hotmail.com', 'yahoo.com', 'website.com', 'company.com', 'yourcompany.com', 'acme.co', 'mystore.com'];
const PREF = ['hello@', 'contact@', 'care@', 'support@', 'help@', 'connect@', 'sales@', 'info@', 'team@'];

const rows = [['Website', 'Primary Email', 'All Emails', 'On-Domain']];
let withEmail = 0, total = 0;

for (const line of fs.readFileSync(IN, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  total++;
  const [domain, rest] = line.split('|');
  const dom = domain.trim().replace(/^www\./, '');
  let emails = [];
  if (rest && !rest.includes('none')) {
    emails = rest.split(',').map(e => e.trim().toLowerCase())
      .filter(e => /^[^@]+@[^@]+\.[a-z]{2,}$/.test(e))
      .filter(e => {
        const [local, edom] = e.split('@');
        if (JUNK_LOCAL.includes(local)) return false;
        if (JUNK_DOMAIN.includes(edom)) return false;
        return true;
      });
    emails = [...new Set(emails)];
  }
  // strip the leading subdomain when matching on-domain (e.g. in.sugarcosmetics.com -> sugarcosmetics.com)
  const baseDom = dom.split('.').slice(-2).join('.');
  const onDomEmails = emails.filter(e => e.endsWith('@' + dom) || e.endsWith('.' + baseDom) || e.endsWith('@' + baseDom));
  const onDom = onDomEmails.length > 0;
  // primary: prefer a friendly on-domain mailbox, else first on-domain, else first email
  let primary = '';
  const pool = onDom ? onDomEmails : emails;
  if (pool.length) {
    primary = PREF.map(p => pool.find(e => e.startsWith(p))).find(Boolean) || pool[0];
  }
  if (emails.length) withEmail++;
  rows.push([dom, primary, emails.join('; '), onDom ? 'yes' : (emails.length ? 'no' : '')]);
}

const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
fs.writeFileSync(OUT, '﻿' + csv); // BOM so Excel reads UTF-8 correctly
console.log(`Cleaned ${total} sites · ${withEmail} have a usable email.`);
console.log(`Saved → ${OUT}`);
