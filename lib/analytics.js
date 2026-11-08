// First-party, cookie-free website numbers for the owner. Nothing here identifies a person:
//  - a visit is counted per page, per day, per source and per device type, and nothing else is kept
//  - "unique visitors" use a salted hash of address + browser that is kept only in memory and thrown away every day
//  - the address itself is never stored
// Also: working out where a visit or a sign-up came from (a tagged link, a search engine, a social site, another website, or typed in).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const OWN_HOSTS = ['resolvogroup.com', 'www.resolvogroup.com', 'app.resolvogroup.com', 'localhost'];
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|curl|wget|python|node-fetch|axios|postman|monitor|uptime|preview|facebookexternalhit|whatsapp/i;
const SEARCH = { 'google.': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'yahoo.com': 'Yahoo', 'ecosia.org': 'Ecosia', 'brave.com': 'Brave' };
const SOCIAL = { 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn', 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'instagram.com': 'Instagram', 't.co': 'X', 'twitter.com': 'X', 'x.com': 'X', 'youtube.com': 'YouTube', 'wa.me': 'WhatsApp', 'whatsapp.com': 'WhatsApp', 'reddit.com': 'Reddit', 'quora.com': 'Quora', 'producthunt.com': 'Product Hunt', 'news.ycombinator.com': 'Hacker News', 'uneed.best': 'Uneed' };
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, n || 80);
const day = (d) => (d || new Date()).toISOString().slice(0, 10);

function hostOf(ref) { try { return new URL(ref.indexOf('//') < 0 ? 'https://' + ref : ref).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }
// Accepts what a page sends and keeps only short plain text.
function cleanAttr(a) {
  if (!a || typeof a !== 'object') return null;
  const o = { s: clip(a.s || a.utm_source, 60), m: clip(a.m || a.utm_medium, 60), c: clip(a.c || a.utm_campaign, 80), t: clip(a.t || a.utm_term, 80), n: clip(a.n || a.utm_content, 80), r: hostOf(clip(a.r || a.referrer, 200)), l: clip(a.l || a.landing, 120) };
  return Object.values(o).some(Boolean) ? o : null;
}
// { source: 'LinkedIn', medium: 'social' } from a cleaned attribution. A tagged link always wins over the referring site.
function classify(a) {
  a = a || {};
  if (a.s) return { source: a.s.toLowerCase(), medium: (a.m || 'link').toLowerCase(), campaign: a.c || '' };
  const h = a.r || '';
  if (!h || OWN_HOSTS.indexOf(h) >= 0 || OWN_HOSTS.some((o) => h.endsWith('.' + o))) return { source: 'direct', medium: 'none', campaign: '' };
  for (const k of Object.keys(SEARCH)) if (h.indexOf(k) >= 0) return { source: SEARCH[k], medium: 'organic search', campaign: '' };
  for (const k of Object.keys(SOCIAL)) if (h === k || h.endsWith('.' + k)) return { source: SOCIAL[k], medium: 'social', campaign: '' };
  return { source: h, medium: 'referral', campaign: '' };
}
const label = (c) => c.source === 'direct' ? 'Direct or unknown' : c.source + (c.medium && c.medium !== 'none' ? ' · ' + c.medium : '');
const isBot = (ua) => !ua || BOT_RE.test(ua);
const okPath = (p) => typeof p === 'string' && p.length <= 120 && /^\/[A-Za-z0-9/_\-.]*$/.test(p) && !/^\/(api|owner|owner-console|architecture|dashboard|crm|portal|offline|data|download|downloads|uploads|widget)(\/|$)/.test(p) && !/\.(js|css|png|jpg|svg|ico|json|xml|txt|map|woff2?)$/i.test(p);

function createStore(file, opts) {
  opts = opts || {};
  const keep = opts.keepDays || 400;
  let data = { days: {} }, dirty = false, salt = crypto.randomBytes(16).toString('hex'), saltDay = day(), seen = new Set();
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && j.days) data = j; } catch (e) {}
  const bucket = (d) => data.days[d] || (data.days[d] = { views: 0, uniques: 0, pages: {}, sources: {}, devices: {} });
  const bump = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
  function hit(o) {   // o: { path, attr, device, ip, ua, now }
    if (isBot(o.ua) || !okPath(o.path)) return false;
    const now = o.now || new Date(), d = day(now);
    if (d !== saltDay) { saltDay = d; salt = crypto.randomBytes(16).toString('hex'); seen = new Set(); }   // yesterday's hashes are gone for good
    const b = bucket(d), src = label(classify(cleanAttr(o.attr))), page = o.path.length > 1 ? o.path.replace(/\/$/, '') : o.path;
    b.views++; bump(b.pages, page); bump(b.sources, src); bump(b.devices, o.device === 'phone' ? 'phone' : 'desktop');
    const h = crypto.createHash('sha256').update(salt + '|' + (o.ip || '') + '|' + (o.ua || '')).digest('hex').slice(0, 24);
    if (!seen.has(h)) { seen.add(h); b.uniques++; }
    dirty = true; return true;
  }
  function flush() {
    if (!dirty) return;
    const cut = day(new Date(Date.now() - keep * 86400000));
    for (const k of Object.keys(data.days)) if (k < cut) delete data.days[k];
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file); dirty = false; } catch (e) {}
  }
  function report(days, now) {
    now = now || new Date(); days = Math.max(1, Math.min(days || 30, 365));
    const out = { days: [], views: 0, uniques: 0, pages: {}, sources: {}, devices: { phone: 0, desktop: 0 } };
    for (let i = days - 1; i >= 0; i--) {
      const d = day(new Date(now.getTime() - i * 86400000)), b = data.days[d] || { views: 0, uniques: 0, pages: {}, sources: {}, devices: {} };
      out.days.push({ date: d, views: b.views, uniques: b.uniques }); out.views += b.views; out.uniques += b.uniques;
      for (const k of Object.keys(b.pages)) bump(out.pages, k, b.pages[k]);
      for (const k of Object.keys(b.sources)) bump(out.sources, k, b.sources[k]);
      out.devices.phone += b.devices.phone || 0; out.devices.desktop += b.devices.desktop || 0;
    }
    const top = (o, n) => Object.keys(o).map((k) => ({ name: k, views: o[k] })).sort((a, b) => b.views - a.views).slice(0, n);
    out.pages = top(out.pages, 15); out.sources = top(out.sources, 12);
    return out;
  }
  return { hit, flush, report, _data: () => data };
}

module.exports = { classify, cleanAttr, label, isBot, okPath, hostOf, createStore };
