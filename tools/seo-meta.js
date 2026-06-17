// Adds Open Graph + Twitter + canonical (and Article schema for blogs) to marketing pages.
// Idempotent: skips any page that already has og:title.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'public');
const SITE = 'https://resolvogroup.com';
const OG_IMG = SITE + '/og-image.svg';

// filename -> public route
const ROUTES = {
  'demo.html': '/demo', 'signup.html': '/signup', 'learn.html': '/learn',
  'architecture.html': '/architecture', 'blog-index.html': '/blog',
  'vs-jira.html': '/vs/jira', 'vs-freshdesk.html': '/vs/freshdesk',
  'vs-zendesk.html': '/vs/zendesk', 'vs-linear.html': '/vs/linear',
  'blog-best-jira-alternative-small-teams.html': '/blog/best-jira-alternative-small-teams',
  'blog-engineering-issue-tracking-sla.html': '/blog/engineering-issue-tracking-sla',
  'blog-how-to-set-up-email-ticketing.html': '/blog/how-to-set-up-email-ticketing',
  'blog-reduce-support-ticket-volume.html': '/blog/reduce-support-ticket-volume'
};

let done = [];
for (const [file, route] of Object.entries(ROUTES)) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  if (/og:title/.test(s) || !s.includes('</head>')) continue;

  const title = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Resolvo';
  const desc = (s.match(/<meta name="description" content="([^"]*)"/) || [])[1]
    || 'All-in-one support & issue tracking for startups. Replaces Freshdesk, Jira & Intercom.';
  const url = SITE + route;
  const isBlog = file.startsWith('blog-') && file !== 'blog-index.html';

  let tags =
    '<link rel="canonical" href="' + url + '">\n' +
    '<meta property="og:type" content="' + (isBlog ? 'article' : 'website') + '">\n' +
    '<meta property="og:site_name" content="Resolvo">\n' +
    '<meta property="og:title" content="' + title.replace(/"/g, '&quot;') + '">\n' +
    '<meta property="og:description" content="' + desc.replace(/"/g, '&quot;') + '">\n' +
    '<meta property="og:url" content="' + url + '">\n' +
    '<meta property="og:image" content="' + OG_IMG + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + title.replace(/"/g, '&quot;') + '">\n' +
    '<meta name="twitter:description" content="' + desc.replace(/"/g, '&quot;') + '">\n' +
    '<meta name="twitter:image" content="' + OG_IMG + '">\n';

  if (isBlog) {
    tags += '<script type="application/ld+json">' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article',
      headline: title, description: desc, mainEntityOfPage: url,
      image: OG_IMG,
      publisher: { '@type': 'Organization', name: 'Resolvo', logo: { '@type': 'ImageObject', url: SITE + '/logo-mark.svg' } },
      author: { '@type': 'Organization', name: 'Resolvo' }
    }) + '</script>\n';
  }

  s = s.replace('</head>', tags + '</head>');
  fs.writeFileSync(p, s);
  done.push(file);
}
console.log('SEO meta added to ' + done.length + ' pages:\n  ' + done.join('\n  '));
