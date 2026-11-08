// Topics ("listening"): watch public places for a brand's keywords and turn each mention into a ticket on the "listening" channel.
// This file holds the parts that do not need the app: reading keywords, matching text, building each source's search, and the sources
// themselves. server.js decides when to run, which workspace owns the topic and how a mention becomes a ticket.
//
// Sources and what they need (set as environment variables on the server; the platform pays for them, not each brand):
//   news     GDELT, free, no key           (one search every 5 seconds is the rule, so searches are queued)
//   hn       Hacker News (Algolia), free, no key
//   bluesky  free account: BSKY_HANDLE and BSKY_APP_PASSWORD (Bluesky no longer allows search without signing in)
//   youtube  YOUTUBE_API_KEY               (Google gives about 100 searches a day for the whole project)
//   web      BRAVE_API_KEY                 (paid, about $5 per 1,000 searches)
//   x        X_BEARER_TOKEN                (paid, per post read; recent 7 days only)
// Tests set LISTENING_MOCK=<json file> to answer every source from a file instead of the network.
'use strict';
const fs = require('fs');

const SOURCES = {
  news:    { label: 'News (GDELT)',        paid: false, env: [],                                      note: 'News articles from around the world.' },
  hn:      { label: 'Hacker News',         paid: false, env: [],                                      note: 'Tech discussions and launches.' },
  bluesky: { label: 'Bluesky',             paid: false, env: ['BSKY_HANDLE', 'BSKY_APP_PASSWORD'],    note: 'Public posts on Bluesky.' },
  youtube: { label: 'YouTube',             paid: false, env: ['YOUTUBE_API_KEY'],                     note: 'Public videos. Limited to about 100 searches a day for everyone together.' },
  web:     { label: 'Web (Brave search)',  paid: true,  env: ['BRAVE_API_KEY'],                       note: 'Blogs, forums and review pages across the web. Costs about $5 per 1,000 searches.' },
  feeds:   { label: 'Your own feeds (RSS)', paid: false, env: [],                                     note: 'Paste feed links, such as a free Google Alerts RSS feed. Works for blogs, forums and news sites too.' },
  x:       { label: 'X (Twitter)',         paid: true,  env: ['X_BEARER_TOKEN'],                      note: 'Public posts from the last 7 days. Costs per post read.' }
};
const configured = (id) => (SOURCES[id] ? SOURCES[id].env.every((k) => !!process.env[k]) : false) || !!process.env.LISTENING_MOCK && !!SOURCES[id];

// ---------- keywords ----------
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
// A list of keywords from tags typed in the form (or a comma / new-line separated string). "quoted phrases" stay together.
function terms(v) {
  const raw = Array.isArray(v) ? v : String(v || '').split(/[\n,]+/);
  const out = [];
  raw.forEach((x) => { const t = clean(x).replace(/^["']|["']$/g, '').trim(); if (t && out.map((o) => o.toLowerCase()).indexOf(t.toLowerCase()) < 0) out.push(t); });
  return out.slice(0, 20);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function termRegex(t) {
  const wild = /\*$/.test(t), core = esc(t.replace(/\*$/, '').toLowerCase()).replace(/\s+/g, '\\s+');
  return new RegExp('(^|[^\\p{L}\\p{N}])' + core + (wild ? '' : '($|[^\\p{L}\\p{N}])'), 'u');
}
const any = (text, list) => list.find((t) => termRegex(t).test(text));
// Contains: any of these. And contains: also any of these. Does not contain: none of these.
function matches(text, topic) {
  const tx = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const c = terms(topic.contains), a = terms(topic.andContains), n = terms(topic.notContains);
  if (!c.length) return { ok: false, reason: 'no keywords' };
  const hit = any(tx, c); if (!hit) return { ok: false, reason: 'keyword not found' };
  let hit2 = null; if (a.length) { hit2 = any(tx, a); if (!hit2) return { ok: false, reason: 'missing a required word' }; }
  const bad = n.length ? any(tx, n) : null; if (bad) return { ok: false, reason: 'has excluded word "' + bad + '"' };
  return { ok: true, matched: [hit, hit2].filter(Boolean) };
}
// The search as people read it, shown live in the form: ("a" OR "b") AND ("c") NOT ("d")
function boolean(topic) {
  const q = (l) => l.map((t) => '"' + t + '"').join(' OR ');
  const c = terms(topic.contains), a = terms(topic.andContains), n = terms(topic.notContains);
  if (!c.length) return '';
  return '(' + q(c) + ')' + (a.length ? ' AND (' + q(a) + ')' : '') + (n.length ? ' NOT (' + q(n) + ')' : '');
}
const phrase = (t) => (/\s/.test(t) ? '"' + t + '"' : t);
// Search text for engines that understand OR, quotes and a minus sign: ("a" OR "b") (c OR d) -e
function engineQuery(topic, o) {
  o = o || {};
  const c = terms(topic.contains), a = terms(topic.andContains), n = terms(topic.notContains);
  const grp = (l) => (l.length > 1 ? '(' + l.map(phrase).join(' OR ') + ')' : phrase(l[0]));
  let q = grp(c) + (a.length ? ' ' + grp(a) : '') + n.map((t) => ' -' + phrase(t)).join('');
  if (o.xHandle) q = '(' + q + ' OR @' + String(o.xHandle).replace(/^@/, '') + ')';
  return q.trim();
}

// ---------- fetching ----------
async function getJson(url, opts) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 15000);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ctl.signal, headers: { 'User-Agent': 'ResolvoTopics/1.0 (+https://app.resolvogroup.com)', Accept: 'application/json', ...((opts && opts.headers) || {}) } });
    const text = await r.text();
    if (!r.ok) { const e = new Error(r.status + ' ' + text.slice(0, 120).replace(/\s+/g, ' ')); e.status = r.status; throw e; }
    try { return JSON.parse(text); } catch (e) { throw new Error('The source did not answer with data (' + text.slice(0, 80).replace(/\s+/g, ' ') + ')'); }
  } finally { clearTimeout(timer); }
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const iso = (v) => { const t = Date.parse(v); return isNaN(t) ? new Date().toISOString() : new Date(t).toISOString(); };
// ---------- feeds (RSS / Atom) the brand adds itself, for example a Google Alerts feed ----------
// A brand pastes a feed link; the server reads it. Because the link comes from a person, it is checked first so it can never be used to
// reach anything inside the server's own network: only http and https, normal ports, no sign-in details in the address, and every address
// the name points to (and every redirect) must be a public one.
const dns = require('dns').promises, net = require('net');
function privateIp(ip) {
  ip = String(ip).toLowerCase();
  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip); if (m) return privateIp(m[1]);
    return /^(fc|fd|fe[89ab])/.test(ip) || ip.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 192 && p[1] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19)) || p[0] >= 224;
}
async function safeUrl(u) {
  let url; try { url = new URL(String(u)); } catch (e) { return false; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false;
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) return !privateIp(host);
  if (host === 'localhost' || /\.(local|internal|localdomain|lan|home|corp)$/.test(host) || host.indexOf('.') < 0) return false;
  try { const a = await dns.lookup(host, { all: true }); return a.length > 0 && a.every((x) => !privateIp(x.address)); } catch (e) { return false; }
}
async function readCapped(r, cap) {
  const rd = r.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > cap) { try { await rd.cancel(); } catch (e) {} throw new Error('The feed is too large (over 1.5 MB)'); } parts.push(Buffer.from(value)); }
  return Buffer.concat(parts).toString('utf8');
}
async function fetchFeedText(url) {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await safeUrl(cur))) throw new Error('This link cannot be used. Use a public https link to a feed.');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(cur, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'ResolvoTopics/1.0 (+https://app.resolvogroup.com)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), cur).toString(); continue; }
      if (!r.ok) throw new Error('The feed answered ' + r.status);
      return await readCapped(r, 1500000);
    } finally { clearTimeout(timer); }
  }
  throw new Error('Too many redirects');
}
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const tagText = (b, name) => { const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(b); return m ? strip(decode(m[1])) : ''; };
// Google Alerts wraps each link: https://www.google.com/url?...&url=THE-REAL-LINK&...
function unwrap(u) { try { const x = new URL(u); if (/(^|\.)google\.[a-z.]+$/.test(x.hostname) && x.pathname === '/url') { const t = x.searchParams.get('url') || x.searchParams.get('q'); if (t) return t; } } catch (e) {} return u; }
function parseFeed(xml) {
  const blocks = String(xml).match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => {
    let link = ''; const alt = /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i.exec(b) || /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i.exec(b) || /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(b);
    link = alt ? decode(alt[1]) : tagText(b, 'link'); link = unwrap(link);
    const title = tagText(b, 'title'), text = tagText(b, 'content:encoded') || tagText(b, 'content') || tagText(b, 'description') || tagText(b, 'summary');
    const author = (/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i.exec(b) || [])[1] || tagText(b, 'dc:creator') || tagText(b, 'author');
    return { id: tagText(b, 'guid') || tagText(b, 'id') || link, url: link, title, text: strip((title ? title + '. ' : '') + text), author: strip(decode(author || '')) || hostOf(link), handle: hostOf(link), publishedAt: iso(tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated') || tagText(b, 'dc:date')), lang: '', domain: hostOf(link), platform: 'feeds' };
  }).filter((x) => /^https?:\/\//i.test(x.url));
}

let _gdeltAt = 0, _gdeltChain = Promise.resolve();
// GDELT names countries with its own two-letter codes (FIPS), which differ from the usual ones for some countries
const FIPS = { GB: 'UK', SG: 'SN', AU: 'AS', DE: 'GM', AE: 'AE', IN: 'IN', US: 'US', CA: 'CA', FR: 'FR', ES: 'SP', PK: 'PK', BD: 'BG', LK: 'CE', NP: 'NP' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _bsky = { jwt: '', at: 0 };

const PROVIDERS = {
  news(topic) { const run = () => PROVIDERS._news(topic); const p = _gdeltChain.then(run, run); _gdeltChain = p.catch(() => {}); return p; },
  async _news(topic) {
    const lang = (topic.languages && topic.languages[0]) ? { en: 'english', hi: 'hindi', es: 'spanish', fr: 'french', de: 'german', pt: 'portuguese', ar: 'arabic' }[topic.languages[0]] : '';
    const q = engineQuery(topic) + (lang ? ' sourcelang:' + lang : '') + (topic.country ? ' sourcecountry:' + (FIPS[String(topic.country).toUpperCase()] || String(topic.country).toUpperCase().slice(0, 2)) : '');
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=50&timespan=1d&sort=datedesc&query=' + encodeURIComponent(q);
    let j;
    for (let tries = 0; ; tries++) {
      const wait = _gdeltAt + 6000 - Date.now(); if (wait > 0) await sleep(wait); _gdeltAt = Date.now();
      try { j = await getJson(url, { timeout: 45000 }); break; } catch (e) { if ((e.status === 429 || /fetch failed|aborted/i.test(e.message)) && tries < 2) continue; throw e; }
    }
    return (j.articles || []).map((a) => ({ id: a.url, url: a.url, title: strip(a.title), text: strip(a.title), author: a.domain || hostOf(a.url), handle: a.domain || hostOf(a.url), publishedAt: iso(String(a.seendate || '').replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')), lang: ({ English: 'en', Hindi: 'hi' })[a.language] || '', domain: a.domain || hostOf(a.url), platform: 'news' }));
  },
  async hn(topic) {
    const out = [], c = terms(topic.contains).slice(0, 3);
    for (const t of c) {
      const j = await getJson('https://hn.algolia.com/api/v1/search_by_date?hitsPerPage=30&tags=(story,comment)&numericFilters=created_at_i>' + Math.floor(Date.now() / 1000 - 86400) + '&query=' + encodeURIComponent('"' + t.replace(/\*$/, '') + '"'));
      (j.hits || []).forEach((h) => { const url = h.url || ('https://news.ycombinator.com/item?id=' + h.objectID); out.push({ id: 'hn:' + h.objectID, url: h.story_id && !h.url ? 'https://news.ycombinator.com/item?id=' + h.objectID : url, title: strip(h.title || h.story_title || ''), text: strip((h.title || '') + ' ' + (h.comment_text || h.story_text || '')), author: h.author, handle: h.author, publishedAt: iso(h.created_at), lang: 'en', domain: hostOf(url) || 'news.ycombinator.com', platform: 'hn' }); });
    }
    return out;
  },
  async bluesky(topic) {
    if (!_bsky.jwt || Date.now() - _bsky.at > 90 * 60000) {
      const s = await getJson('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD }) });
      _bsky = { jwt: s.accessJwt, at: Date.now() };
    }
    const out = [], c = terms(topic.contains).slice(0, 3), lang = topic.languages && topic.languages[0] ? '&lang=' + encodeURIComponent(topic.languages[0]) : '';
    for (const t of c) {
      const j = await getJson('https://bsky.social/xrpc/app.bsky.feed.searchPosts?limit=40&sort=latest&since=' + encodeURIComponent(new Date(Date.now() - 86400000).toISOString()) + lang + '&q=' + encodeURIComponent(phrase(t.replace(/\*$/, ''))), { headers: { Authorization: 'Bearer ' + _bsky.jwt } });
      (j.posts || []).forEach((p) => { const id = String(p.uri).split('/').pop(); out.push({ id: p.uri, url: 'https://bsky.app/profile/' + p.author.handle + '/post/' + id, title: '', text: strip((p.record && p.record.text) || ''), author: p.author.displayName || p.author.handle, handle: '@' + p.author.handle, publishedAt: iso((p.record && p.record.createdAt) || p.indexedAt), lang: ((p.record && p.record.langs) || [])[0] || '', domain: 'bsky.app', platform: 'bluesky' }); });
    }
    return out;
  },
  async youtube(topic) {
    const c = terms(topic.contains)[0], after = new Date(Date.now() - 86400000).toISOString();
    const j = await getJson('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&publishedAfter=' + encodeURIComponent(after) + (topic.languages && topic.languages[0] ? '&relevanceLanguage=' + topic.languages[0] : '') + (topic.country ? '&regionCode=' + String(topic.country).toUpperCase().slice(0, 2) : '') + '&q=' + encodeURIComponent(engineQuery(topic) || c) + '&key=' + encodeURIComponent(process.env.YOUTUBE_API_KEY));
    return (j.items || []).map((v) => ({ id: 'yt:' + v.id.videoId, url: 'https://www.youtube.com/watch?v=' + v.id.videoId, title: strip(v.snippet.title), text: strip(v.snippet.title + ' ' + v.snippet.description), author: v.snippet.channelTitle, handle: v.snippet.channelId, publishedAt: iso(v.snippet.publishedAt), lang: '', domain: 'youtube.com', platform: 'youtube' }));
  },
  async web(topic) {
    const j = await getJson('https://api.search.brave.com/res/v1/web/search?count=20&freshness=pd&safesearch=moderate' + (topic.country ? '&country=' + String(topic.country).toUpperCase().slice(0, 2) : '') + (topic.languages && topic.languages[0] ? '&search_lang=' + topic.languages[0] : '') + '&q=' + encodeURIComponent(engineQuery(topic)), { headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY } });
    return ((j.web && j.web.results) || []).map((r) => ({ id: r.url, url: r.url, title: strip(r.title), text: strip(r.title + ' ' + r.description), author: hostOf(r.url), handle: hostOf(r.url), publishedAt: iso(r.page_age || r.age), lang: r.language || '', domain: hostOf(r.url), platform: 'web' }));
  },
  async feeds(topic) {
    const out = [], urls = (topic.feeds || []).slice(0, 5); let lastErr = null, ok = 0;
    for (const u of urls) {
      try { const items = parseFeed(await fetchFeedText(u)); items.forEach((i) => out.push({ ...i, trusted: topic.feedsTrust !== false })); ok++; } catch (e) { lastErr = e; }
    }
    if (urls.length && !ok && lastErr) throw lastErr;   // none of the links worked: say why
    if (!urls.length) throw new Error('Add at least one feed link');
    return out;
  },
  async x(topic) {
    let q = engineQuery(topic, { xHandle: topic.xHandle });
    if (!topic.includeRetweets) q += ' -is:retweet';
    if (!topic.includeReplies) q += ' -is:reply';
    if (topic.languages && topic.languages[0]) q += ' lang:' + topic.languages[0];
    const j = await getJson('https://api.x.com/2/tweets/search/recent?max_results=50&tweet.fields=created_at,lang,author_id&expansions=author_id&user.fields=username,name&query=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN } });
    const users = {}; ((j.includes && j.includes.users) || []).forEach((u) => { users[u.id] = u; });
    return (j.data || []).map((t) => { const u = users[t.author_id] || {}; return { id: 'x:' + t.id, url: 'https://x.com/' + (u.username || 'i') + '/status/' + t.id, title: '', text: strip(t.text), author: u.name || u.username || '', handle: u.username ? '@' + u.username : '', publishedAt: iso(t.created_at), lang: t.lang || '', domain: 'x.com', platform: 'x' }; });
  }
};

// Answers from a file in tests: { "news": [ {id,url,title,text,author,handle,publishedAt,lang,domain} ], ... }
function mockFor(source) { try { const j = JSON.parse(fs.readFileSync(process.env.LISTENING_MOCK, 'utf8')); return (j[source] || []).map((x) => ({ platform: source, ...x })); } catch (e) { return []; } }

// Runs one source for a topic and returns only mentions that really match the keywords and pass the exclusions and the language filter.
async function fetchSource(source, topic) {
  if (!PROVIDERS[source]) throw new Error('Unknown source');
  if (!configured(source)) throw new Error(SOURCES[source].label + ' is not set up on this server');
  const raw = process.env.LISTENING_MOCK ? mockFor(source).map((x) => (source === 'feeds' ? { ...x, trusted: topic.feedsTrust !== false } : x)) : await PROVIDERS[source](topic);
  return filter(raw, topic);
}
function filter(items, topic) {
  const exDom = terms(topic.excludeDomains).map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
  const exHandle = terms(topic.excludeHandles).map((h) => h.toLowerCase().replace(/^@/, ''));
  const langs = (topic.languages || []).map((l) => String(l).toLowerCase());
  const seen = new Set(), out = [];
  items.forEach((it) => {
    const key = it.id || it.url; if (!key || seen.has(key)) return; seen.add(key);
    if (exDom.some((d) => it.domain === d || (it.domain || '').endsWith('.' + d))) return;
    if (exHandle.indexOf(String(it.handle || '').toLowerCase().replace(/^@/, '')) >= 0) return;
    if (langs.length && it.lang && langs.indexOf(String(it.lang).toLowerCase().slice(0, 2)) < 0) return;
    const tx = (it.title || '') + ' ' + (it.text || '');
    const m = it.trusted ? ((terms(topic.notContains).length && any(tx.toLowerCase(), terms(topic.notContains))) ? { ok: false } : { ok: true, matched: [] }) : matches(tx, topic);
    if (!m.ok) return;
    out.push({ ...it, matched: m.matched });
  });
  return out;
}

// Most-used words in a set of texts, for the topic's own word cloud.
const STOP = new Set('the and for you your with this that have from they will been were what when which there their about would could should into than then them also just only very more some many much here after before still again http https www com amp'.split(' '));
function topWords(texts, skip, n) {
  const sk = new Set((skip || []).map((s) => String(s).toLowerCase())), c = {};
  texts.forEach((t) => { new Set(String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w) && !sk.has(w))).forEach((w) => { c[w] = (c[w] || 0) + 1; }); });
  return Object.keys(c).filter((w) => c[w] >= 2).map((w) => ({ word: w, n: c[w] })).sort((a, b) => b.n - a.n).slice(0, n || 30);
}

module.exports = { SOURCES, configured, terms, matches, boolean, engineQuery, fetchSource, filter, topWords, safeUrl, privateIp, parseFeed };
