// Rolls the new Resolvo logo across all public HTML pages:
//  1. swaps inline "R" marks (.logo-r / .nav-logo-mark) for the shared logo-mark.svg
//  2. adds an SVG favicon <link> to any page missing one
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'public');

const IMG = '<img src="/logo-mark.svg" alt="Resolvo" width="28" height="28" style="border-radius:7px;vertical-align:middle;">';
const MARK_PATTERNS = [
  '<div class="nav-logo-mark">R</div>',
  '<div class="logo-r">R</div>'
];
const FAVICON = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';

let changed = [];
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.html'))) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;

  for (const pat of MARK_PATTERNS) s = s.split(pat).join(IMG);

  if (!/rel=["']icon["']/.test(s) && s.includes('</head>')) {
    s = s.replace('</head>', '  ' + FAVICON + '\n</head>');
  }

  if (s !== before) { fs.writeFileSync(p, s); changed.push(f); }
}
console.log('Updated ' + changed.length + ' files:\n  ' + changed.join('\n  '));
