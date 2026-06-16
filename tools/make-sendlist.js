// Builds tools/send-ready.csv — only rows with a usable email, with a clean
// Company name column for mail-merge ({{Company}} / {{Email}}).
const fs = require('fs'), path = require('path');
const IN = path.join(__dirname, 'leads-clean.csv');
const OUT = path.join(__dirname, 'send-ready.csv');

function companyFromDomain(d) {
  let core = d.replace(/^www\./, '').split('.').slice(0, -1).join('.'); // drop TLD
  core = core.split('.').pop();          // drop subdomain (in.sugarcosmetics -> sugarcosmetics)
  core = core.replace(/[-_]/g, ' ');
  return core.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const lines = fs.readFileSync(IN, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1);
const out = [['Email', 'Company', 'Website', 'On-Domain']];
for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.match(/"([^"]*)"/g)?.map(c => c.slice(1, -1)) || [];
  const [website, primary, , onDom] = cols;
  if (!primary) continue;               // skip rows with no usable email
  out.push([primary, companyFromDomain(website), website, onDom]);
}
const csv = out.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
fs.writeFileSync(OUT, '﻿' + csv);
console.log(`Send-ready list: ${out.length - 1} contacts → ${OUT}`);
