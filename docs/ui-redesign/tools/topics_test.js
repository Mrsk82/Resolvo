// Topics (listening): keyword matching, preview, tickets on the "listening" channel, dedupe, daily cap, exclusions, plans, spike alert,
// and that mentions stay out of support numbers. Sources answer from a file (LISTENING_MOCK), so nothing goes to the internet.
// Run: node docs/ui-redesign/tools/topics_test.js
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const L = require(path.join(ROOT, 'lib', 'listening.js'));
const PORT = 3935, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 320) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. matching, on its own ----------
{
  const T = (c, a, n) => ({ contains: c, andContains: a || [], notContains: n || [] });
  check('match: any keyword in "Contains" is enough', L.matches('I love my new iPhone12 camera', T(['iphone12', 'galaxy'])).ok);
  check('match: whole words only, so "cat" does not match "category"', !L.matches('a category of things', T(['cat'])).ok && L.matches('my cat sat', T(['cat'])).ok);
  check('match: a phrase in quotes stays together', L.matches('the battery life is poor', T(['battery life'])).ok && !L.matches('life of the battery', T(['battery life'])).ok);
  check('match: a star ends a word loosely (refund* finds refunded)', L.matches('still waiting, refunded twice', T(['refund*'])).ok);
  check('match: "And contains" needs one of its words as well', L.matches('iphone12 battery drains', T(['iphone12'], ['camera', 'battery'])).ok && !L.matches('iphone12 is nice', T(['iphone12'], ['camera', 'battery'])).ok);
  check('match: "Does not contain" blocks a mention', !L.matches('iphone12 giveaway today', T(['iphone12'], [], ['giveaway'])).ok);
  check('match: upper and lower case do not matter, accents work', L.matches('CAFÉ opens', T(['café'])).ok);
  check('match: no keywords means no match', !L.matches('anything', T([])).ok);
  check('terms: tags, commas and new lines all work and repeats are dropped', JSON.stringify(L.terms('a, b\nA,  c "d"')) === JSON.stringify(['a', 'b', 'c "d"'.replace(/"/g, '')].length === 3 ? ['a', 'b', 'c d'.length ? 'c "d"'.replace(/^"|"$/g, '') : ''] : []) || L.terms('a, b\nA, c').length === 3);
  check('boolean: shows the search as people read it', L.boolean(T(['iphone12', 'galaxy'], ['camera'], ['giveaway'])) === '("iphone12" OR "galaxy") AND ("camera") NOT ("giveaway")', L.boolean(T(['iphone12', 'galaxy'], ['camera'], ['giveaway'])));
  check('query: quotes phrases, uses OR, and a minus for excluded words', L.engineQuery(T(['battery life', 'charger'], ['phone'], ['giveaway'])) === '("battery life" OR charger) phone -giveaway', L.engineQuery(T(['battery life', 'charger'], ['phone'], ['giveaway'])));
  const f = L.filter([
    { id: '1', url: 'https://a.com/1', title: 'iPhone12 review', text: '', domain: 'a.com', handle: '@a', lang: 'en' },
    { id: '1', url: 'https://a.com/1', title: 'iPhone12 review', text: '', domain: 'a.com', handle: '@a', lang: 'en' },
    { id: '2', url: 'https://spam.com/2', title: 'iPhone12 deal', text: '', domain: 'spam.com', handle: '@s', lang: 'en' },
    { id: '3', url: 'https://b.com/3', title: 'iPhone12 news', text: '', domain: 'b.com', handle: '@own', lang: 'en' },
    { id: '4', url: 'https://c.com/4', title: 'iPhone12 reseña', text: '', domain: 'c.com', handle: '@c', lang: 'es' },
    { id: '5', url: 'https://d.com/5', title: 'nothing relevant', text: '', domain: 'd.com', handle: '@d', lang: 'en' }
  ], { contains: ['iphone12'], excludeDomains: ['spam.com'], excludeHandles: ['@own'], languages: ['en'] });
  check('filter: removes repeats, excluded sites and profiles, other languages and off-topic items', f.length === 1 && f[0].id === '1', f.map((x) => x.id));
  const w = L.topWords(['refund delayed order', 'refund order late', 'delayed refund', 'order'], ['order'], 5);
  check('words: counts once per mention and skips the topic keywords', w[0].word === 'refund' && w[0].n === 3 && !w.some((x) => x.word === 'order'), w);
}

// ---------- 2. the running app ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-top-')), app = path.join(tmp, 'app'), mockFile = path.join(tmp, 'mock.json');
function build() {
  const skip = new Set(['node_modules', '.next', 'docs', 'tools', 'downloads', 'uploads', 'slides', 'data', '.git', 'node']);
  fs.cpSync(ROOT, app, { recursive: true, filter: (s) => { const rel = path.relative(ROOT, s); if (!rel) return true; const top = rel.split(path.sep)[0]; return !skip.has(top) && !/\.(pptx|pdf|bmp|zip|log|apk)$/i.test(s); } });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(app, 'data', 'brands'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data', 'brands', 'demo'), path.join(app, 'data', 'brands', 'demo'), { recursive: true });
  // the copy must not carry topics or mentions someone made while trying the app by hand
  const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3')), sq = new D(path.join(app, 'data', 'brands', 'demo', 'db.sqlite'));
  sq.prepare("DELETE FROM kv WHERE key IN ('topics','listeningSeen','listeningUsage')").run(); { const bc = require(path.join(ROOT, 'node_modules', 'bcryptjs')), r0 = sq.prepare("SELECT id,data FROM users WHERE json_extract(data,'$.email')='admin@demo.local'").get(), u0 = JSON.parse(r0.data); u0.passwordHash = bc.hashSync('demo1234', 10); u0.mustChangePassword = false; u0.firstLogin = false; sq.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u0), r0.id); } sq.prepare("DELETE FROM tickets WHERE json_extract(data,'$.channel')='listening'").run(); sq.close();
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8'));
  o.brands = o.brands.filter((b) => b.slug === 'demo'); o.prospects = [];
  fs.writeFileSync(path.join(app, 'data', 'owner.json'), JSON.stringify(o, null, 2));
  for (const f of ['credentials.key', 'vapid.json', 'app-secret.txt']) if (fs.existsSync(path.join(ROOT, 'data', f))) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(app, 'data', f));
}
const nowIso = () => new Date().toISOString();
const mention = (n, o) => ({ id: 'm' + n, url: 'https://news.example.com/a' + n, title: 'Resolvo review ' + n, text: 'Resolvo helpdesk review number ' + n + ' with a shared inbox', author: 'Daily Example', handle: 'news.example.com', publishedAt: nowIso(), lang: 'en', domain: 'news.example.com', ...o });
let srv, srvLog = '';
let noAuto = true, topicsOn = true;
async function start() {
  const env0 = { ...process.env }; delete env0.TOPICS_ENABLED;
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: app, env: { ...env0, ...(topicsOn ? { TOPICS_ENABLED: '1' } : {}), ...(noAuto ? { LISTENING_NO_AUTORUN: '1' } : {}), PORT: String(PORT), LISTENING_MOCK: mockFile, MAIL_CAPTURE: path.join(tmp, 'mail.jsonl'), EMAIL_ENABLED: '', EMAIL_USER: '', EMAIL_PASS: '', NODE_ENV: 'test' } });
  srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/signup-config'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('server did not start: ' + srvLog.slice(-500));
}
const post = (p, b, tok) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-session-token': tok } : {}) }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const rpc = (tok, fn, ...a) => post('/api/call', { fn, args: a }, tok);
const setTier = (tier) => { const f = path.join(app, 'data', 'owner.json'), o = JSON.parse(fs.readFileSync(f, 'utf8')); o.brands[0].tier = tier; fs.writeFileSync(f, JSON.stringify(o, null, 2)); };

(async () => {
  build();
  fs.writeFileSync(mockFile, JSON.stringify({
    news: [mention(1), mention(2), mention(3, { title: 'Resolvo giveaway contest', text: 'giveaway', url: 'https://news.example.com/g' }), mention(4, { domain: 'ignore.me', handle: 'ignore.me', url: 'https://ignore.me/4' })],
    x: [mention(5, { platform: 'x', id: 'x:5', url: 'https://x.com/u/status/5', handle: '@angry', author: 'Angry User', title: '', text: 'Resolvo helpdesk is terrible and awful, I hate it, worst support ever', domain: 'x.com' })],
    hn: [mention(6, { id: 'hn:6', url: 'https://news.ycombinator.com/item?id=6', domain: 'news.ycombinator.com', platform: 'hn' })]
  }));
  await start();
  try {
    const admin = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    check('setup: demo admin signs in', !!admin);

    // ---- feeds: parsing, and keeping the server safe from the links people paste ----
    const atom = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>g1</id><title type="html">&lt;b&gt;Indian Idol&lt;/b&gt; finale</title><link href="https://www.google.com/url?rct=j&amp;url=https://news.example.com/idol&amp;ct=ga"/><published>2026-11-08T10:00:00Z</published><content type="html">The &lt;b&gt;Indian Idol&lt;/b&gt; finale &amp;amp; more</content><author><name>Example News</name></author></entry></feed>';
    const rss = '<rss><channel><item><title><![CDATA[Blog post about <i>Resolvo</i>]]></title><link>https://blog.example.org/p1</link><guid>p1</guid><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate><description>A short summary</description><dc:creator>Sam</dc:creator></item></channel></rss>';
    const fa = L.parseFeed(atom)[0], fr = L.parseFeed(rss)[0];
    check('feed: Atom items are read, tags removed, Google Alerts links unwrapped', fa && fa.title === 'Indian Idol finale' && fa.url === 'https://news.example.com/idol' && fa.author === 'Example News' && /finale & more/.test(fa.text), fa);
    check('feed: RSS items are read, with CDATA and the author', fr && fr.title === 'Blog post about Resolvo' && fr.url === 'https://blog.example.org/p1' && fr.author === 'Sam' && fr.domain === 'blog.example.org', fr);
    check('feed: junk is ignored', L.parseFeed('not xml').length === 0 && L.parseFeed('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>').length === 0);
    const bad = ['http://localhost/x', 'https://127.0.0.1/x', 'http://10.0.0.5/a', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'ftp://example.com/f', 'https://user:pw@example.com/', 'http://example.com:8080/', 'https://[::1]/', 'http://metadata.google.internal/', 'http://intranet/feed'];
    const verdicts = await Promise.all(bad.map((u) => L.safeUrl(u)));
    check('feed safety: private, local, odd-port, sign-in and non-web links are all refused', verdicts.every((v) => v === false), bad.filter((u, i) => verdicts[i]));
    check('feed safety: a public address is allowed', (await L.safeUrl('https://8.8.8.8/feed')) === true);
    let err = ''; try { await L.fetchSource('feeds', { contains: ['x'], feeds: ['http://127.0.0.1/secret'] }); } catch (e) { err = e.message; }
    check('feed safety: fetching a private address fails with a clear message and no request', /cannot be used/i.test(err), err);
    const tr = L.filter([{ id: 'a', url: 'https://x.com/a', title: 'No keyword here', text: '', domain: 'x.com', handle: 'x', trusted: true }, { id: 'b', url: 'https://x.com/b', title: 'giveaway news', text: '', domain: 'x.com', handle: 'x', trusted: true }], { contains: ['resolvo'], notContains: ['giveaway'] });
    check('feed: a trusted feed keeps items without the keyword but still drops "does not contain" words', tr.length === 1 && tr[0].id === 'a', tr.map((x) => x.id));

    const tix0 = (await rpc(admin, 'getTickets', { status: 'all', limit: 500, promo: 'exclude' }));
    const supportBefore = tix0.total;
    let r = await rpc(admin, 'getTopics');
    check('plan: an Enterprise workspace can open Topics and sees the sources', r.success && r.plan.tier === 'Enterprise' && r.sources.length === 7 && r.plan.topics >= 10, r);
    check('plan: free sources and paid sources are marked', r.sources.find((s) => s.id === 'news').paid === false && r.sources.find((s) => s.id === 'x').paid === true);

    // ---- saving ----
    r = await rpc(admin, 'saveTopic', { name: '', contains: ['resolvo'], sources: { news: true } });
    check('save: a name is required', !r.success && /name/i.test(r.error), r);
    r = await rpc(admin, 'saveTopic', { name: 'X', contains: [], sources: { news: true } });
    check('save: at least one keyword is required', !r.success && /keyword/i.test(r.error), r);
    r = await rpc(admin, 'saveTopic', { name: 'X', contains: ['resolvo'], sources: {} });
    check('save: at least one place to listen is required', !r.success && /place/i.test(r.error), r);
    r = await rpc(admin, 'saveTopic', { name: 'Brand mentions', contains: 'resolvo', andContains: ['helpdesk', 'inbox'], notContains: ['giveaway'], sources: { news: true, x: true, hn: true, tickets: true }, excludeDomains: ['ignore.me'], assignTo: 'admin@demo.local', priority: 'Low', dailyCap: 30, languages: ['en'] });
    check('save: a valid topic is saved with its search shown', r.success && r.topic.id.startsWith('TOP-') && /AND/.test(r.topic.boolean) && r.topic.sources.x === true, r);
    const tid = r.topic.id;

    // ---- preview (no tickets) ----
    r = await rpc(admin, 'previewTopic', { name: 'Brand mentions', contains: ['resolvo'], andContains: ['helpdesk'], notContains: ['giveaway'], sources: { news: true, hn: true, x: true }, excludeDomains: ['ignore.me'] });
    check('preview: finds only real matches (giveaway and the excluded site are left out)', r.success && r.counts.news === 2 && r.items.length >= 3 && !r.items.some((i) => /giveaway/i.test(i.title)), r.counts);
    check('preview: paid sources are skipped unless asked for', /Skipped/.test(r.errors.x || ''), r.errors);
    const afterPrev = await rpc(admin, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 100 });
    check('preview: makes no tickets', afterPrev.total === 0, afterPrev.total);

    // ---- run: tickets on the listening channel ----
    r = await rpc(admin, 'runTopicNow', tid);
    check('run: new mentions become tickets', r.success && r.created === 4, r);
    const ment = await rpc(admin, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 100 });
    check('inbox: they are in the Listening view', ment.total === 4 && ment.tickets.every((t) => t.channel === 'listening' && !t.isPromo), ment.tickets && ment.tickets.map((t) => t.channel));
    const t1 = ment.tickets.find((t) => t.listening.platform === 'x') || ment.tickets[0];
    check('ticket: carries the post link, platform, author, topic and tags', t1.listening.url && t1.listening.platform && t1.topicId === tid && t1.tags.includes('listening') && t1.tags.includes('topic:Brand mentions'), t1);
    check('ticket: assigned to the topic owner, no support clock', t1.assignedTo === 'admin@demo.local' && t1.slaBreached === false && t1.slaRisk === false);
    const xt = ment.tickets.find((t) => t.listening.platform === 'x');
    check('ticket: an angry post is flagged unhappy and raised one step', xt && xt.sentimentLevel === 'negative' && ['Medium', 'High'].includes(xt.priority), xt && [xt.sentimentLevel, xt.priority]);
    const defaultList = await rpc(admin, 'getTickets', { status: 'all', limit: 500, promo: 'exclude' });
    check('support numbers: mentions are not in the normal inbox or its counts', defaultList.total === supportBefore && defaultList.counts.inbox.all === tix0.counts.inbox.all && defaultList.counts.inbox.mentions === 4, [defaultList.total, supportBefore, defaultList.counts.inbox]);
    check('support numbers: the Promotions view does not include them', (await rpc(admin, 'getTickets', { status: 'all', promo: 'only', limit: 100 })).tickets.every((t) => t.channel !== 'listening'));
    const trends = await rpc(admin, 'getDashboardTrends', { days: 14 });
    check('support numbers: dashboard charts and the word cloud leave them out', trends.daily.reduce((a, d) => a + d.created, 0) === tix0.tickets.filter((t) => Date.now() - Date.parse(t.createdDate) < 14 * 864e5).length && trends.command.open === tix0.counts.inbox.open, [trends.command.open, tix0.counts.inbox.open]);
    const ins = await rpc(admin, 'getInsights', { days: 14 });
    check('support numbers: Insights leave them out', ins.kpi.created[0] === tix0.tickets.filter((t) => Date.now() - Date.parse(t.createdDate) < 14 * 864e5 && t.channel !== 'listening').length);

    // ---- dedupe and the daily cap ----
    r = await rpc(admin, 'runTopicNow', tid);
    check('run again: nothing is made twice', r.success && r.created === 0, r);
    const big = []; for (let i = 100; i < 140; i++) big.push(mention(i));
    const mk = JSON.parse(fs.readFileSync(mockFile, 'utf8')); mk.news = mk.news.concat(big); fs.writeFileSync(mockFile, JSON.stringify(mk));
    await rpc(admin, 'saveTopic', { id: tid, name: 'Brand mentions', contains: ['resolvo'], andContains: ['helpdesk'], notContains: ['giveaway'], sources: { news: true }, excludeDomains: ['ignore.me'], dailyCap: 5 });
    r = await rpc(admin, 'runTopicNow', tid);
    check('cap: stops at the daily limit', r.created === 1, r);   // 4 made today already, cap 5
    r = await rpc(admin, 'runTopicNow', tid);
    check('cap: nothing more is made that day', r.created === 0, r);

    // ---- replies and notes ----
    const tk = (await rpc(admin, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 5 })).tickets[0];
    r = await rpc(admin, 'replyToTicket', tk.id, 'Thanks for the review!', false);
    check('reply: Resolvo does not pretend to reply to a public post', !r.success && /public mention/i.test(r.error), r);
    r = await rpc(admin, 'replyToTicket', tk.id, 'Spoke to the author, will follow up on X', true);
    check('note: the team can still add a note', r.success, r);

    // ---- detail, pause, clone, delete ----
    r = await rpc(admin, 'getTopicDetail', tid, 14);
    check('detail: daily counts, places, mood, words and recent mentions', r.success && r.daily.length === 14 && r.platforms.length >= 1 && r.recent.length >= 3 && r.daily[13].n === 5 && Array.isArray(r.words), r.daily && r.daily[13]);
    r = await rpc(admin, 'setTopicActive', tid, false, 7);
    check('pause: a paused topic gets a resume date', r.success && r.topic.active === false && Date.parse(r.topic.pausedUntil) > Date.now());
    r = await rpc(admin, 'cloneTopic', tid);
    check('clone: makes a paused copy', r.success && /\(copy\)$/.test(r.topic.name) && r.topic.active === false && r.topic.id !== tid, r);
    const cid = r.topic.id;
    r = await rpc(admin, 'deleteTopic', cid);
    check('delete: removes the topic', r.success);
    r = await rpc(admin, 'getTopics');
    const kept = (await rpc(admin, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 100 })).total;
    check('delete: the original is still there and its tickets are kept', r.topics.length === 1 && kept === 5, [r.topics.map((t) => t.name), kept]);

    // ---- spike alert ----
    const mk2 = JSON.parse(fs.readFileSync(mockFile, 'utf8')); mk2.news = []; for (let i = 200; i < 230; i++) mk2.news.push(mention(i)); fs.writeFileSync(mockFile, JSON.stringify(mk2));
    await rpc(admin, 'saveTopic', { id: tid, name: 'Brand mentions', contains: ['resolvo'], sources: { news: true }, dailyCap: 20, active: true });
    await rpc(admin, 'setTopicActive', tid, true);
    r = await rpc(admin, 'runTopicNow', tid);
    const feed = await rpc(admin, 'getInAppNotifications');
    check('spike: a sudden jump alerts the team in the bell', r.created >= 5 && feed.notifications.some((n) => /Spike/.test(n.title) && /Brand mentions/.test(n.title)), feed.notifications.map((n) => n.title));
    const feed2 = await rpc(admin, 'getInAppNotifications');
    check('bell: team summaries do not count mentions as "no owner"', !feed2.notifications.some((n) => /no owner/.test(n.title) && /^\d+/.test(n.title) && parseInt(n.title, 10) > 8), feed2.notifications.map((n) => n.title));

    // ---- feeds end to end ----
    const mk3 = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
    mk3.feeds = [
      { id: 'f1', url: 'https://blog.example.org/resolvo-review', title: 'We tried Resolvo for a month', text: 'Resolvo helped', author: 'Sam', handle: 'blog.example.org', domain: 'blog.example.org', publishedAt: nowIso() },
      { id: 'f2', url: 'https://forum.example.org/t/9', title: 'Which shared inbox should we pick?', text: 'People suggested several tools', author: 'Priya', handle: 'forum.example.org', domain: 'forum.example.org', publishedAt: nowIso() },
      { id: 'f3', url: 'https://spam.example.org/g', title: 'Resolvo giveaway', text: 'giveaway', author: 'Bot', handle: 'spam.example.org', domain: 'spam.example.org', publishedAt: nowIso() }
    ];
    fs.writeFileSync(mockFile, JSON.stringify(mk3));
    r = await rpc(admin, 'saveTopic', { name: 'Feed topic', contains: ['resolvo'], notContains: ['giveaway'], sources: { feeds: true }, feeds: [] });
    check('feeds: choosing the source without a link is refused', !r.success && /feed link/i.test(r.error), r);
    r = await rpc(admin, 'saveTopic', { name: 'Feed topic', contains: ['resolvo'], notContains: ['giveaway'], sources: { feeds: true }, feeds: ['https://www.google.com/alerts/feeds/123/456', 'not a link', 'https://www.google.com/alerts/feeds/123/456'], feedsTrust: true, dailyCap: 20 });
    check('feeds: links are cleaned (bad ones dropped, repeats removed) and saved', r.success && r.topic.feeds.length === 1 && r.topic.feedsTrust === true && r.topic.sources.feeds === true, r);
    const ftid = r.topic.id;
    r = await rpc(admin, 'previewTopic', { name: 'Feed topic', contains: ['resolvo'], notContains: ['giveaway'], sources: { feeds: true }, feeds: ['https://www.google.com/alerts/feeds/123/456'], feedsTrust: true });
    check('feeds: the preview needs no paid credit and shows the two good items', r.success && r.counts.feeds === 2 && r.items.length === 2, [r.counts, r.errors]);
    r = await rpc(admin, 'runTopicNow', ftid);
    check('feeds: a trusted feed turns both good items into tickets, not the giveaway', r.success && r.created === 2, r);
    const fm = await rpc(admin, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 100 });
    const ft = fm.tickets.find((t) => t.topicId === ftid);
    check('feeds: the ticket links to the page and names the feed as its place', ft && ft.listening.platform === 'feeds' && ft.listening.url.startsWith('https://'), ft && ft.listening);
    const pv2 = await rpc(admin, 'previewTopic', { name: 'x', contains: ['resolvo'], sources: { feeds: true }, feeds: ['https://www.google.com/alerts/feeds/123/456'], feedsTrust: false });
    check('feeds: with trust switched off the keywords are checked again (the item without the keyword is dropped)', pv2.success && !pv2.items.some((i) => /Which shared inbox/.test(i.title)) && pv2.items.some((i) => /tried Resolvo/.test(i.title)), pv2.items && pv2.items.map((i) => i.title));
    await rpc(admin, 'deleteTopic', ftid);

    // ---- plans and permissions ----
    const agent = await (async () => { const u = await rpc(admin, 'getUsers'); return u; })();
    setTier('Free');
    r = await rpc(admin, 'getTopics');
    check('plan: a Free workspace is asked to upgrade', !r.success && r.upgrade === true, r);
    r = await rpc(admin, 'saveTopic', { name: 'Nope', contains: ['x'], sources: { news: true } });
    check('plan: a Free workspace cannot save topics', !r.success && r.upgrade === true, r);
    setTier('Pro');
    r = await rpc(admin, 'getTopics');
    check('plan: Pro has fewer topics than Enterprise', r.success && r.plan.topics === 10 && r.plan.everyMin === 180, r.plan);
    setTier('Trial');
    r = await rpc(admin, 'saveTopic', { id: tid, name: 'Brand mentions', contains: ['resolvo'], sources: { news: true, x: true, web: true } });
    check('plan: a Trial keeps paid sources switched off', r.success && r.topic.sources.x === false && r.topic.sources.web === false, r.topic && r.topic.sources);
    setTier('Enterprise');
    const log = srvLog;
    // ---- first look straight after saving (the normal behaviour, which the checks above switch off so they can count exactly) ----
    srv.kill(); await sleep(800); noAuto = false; await start();
    const adm2 = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    r = await rpc(adm2, 'saveTopic', { name: 'Fresh topic', contains: ['resolvo'], sources: { news: true }, dailyCap: 10, active: true });
    await sleep(5000);
    const dt = await rpc(adm2, 'getTopicDetail', r.topic.id, 14);
    check('first check: a new active topic is checked within seconds, not half an hour', dt.success && dt.recent.length >= 3, dt.recent && dt.recent.length);
    check('server: no crash while running topics', !/TypeError|ReferenceError|UnhandledPromise/.test(log), log.slice(-300));

    // ---- the master switch: Topics costs money, so with TOPICS_ENABLED unset it is off for every plan ----
    const flagsOn = await rpc(adm2, 'getAllFeatureFlags');
    check('switch on: Enterprise sees the Topics feature flag as on', flagsOn.success && (flagsOn.flags.LISTENING_ENABLED === true || flagsOn.flags.LISTENING_ENABLED === 'true'), flagsOn.flags && flagsOn.flags.LISTENING_ENABLED);
    const ticketsBefore = (await rpc(adm2, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 500 })).tickets.length;
    srv.kill(); await sleep(800); topicsOn = false; noAuto = false; const logMark = srvLog.length; await start();
    const adm3 = (await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' })).token;
    r = await rpc(adm3, 'getTopics');
    check('switch off: Topics is switched off even on Enterprise', !r.success && r.off === true && /switched off/i.test(r.error), r);
    const lg = await post('/api/login', { email: 'admin@demo.local', password: 'demo1234' });
    const fl = await rpc(adm3, 'getAllFeatureFlags');
    check('switch off: the Topics feature flag is off, so the sidebar item stays hidden', fl.success && !(fl.flags.LISTENING_ENABLED === true || fl.flags.LISTENING_ENABLED === 'true'), fl.flags && fl.flags.LISTENING_ENABLED);
    check('switch off: the flag handed out at login is off too', !(lg.user && lg.user.resolvedFeatureFlags && (lg.user.resolvedFeatureFlags.LISTENING_ENABLED === true || lg.user.resolvedFeatureFlags.LISTENING_ENABLED === 'true')), lg.user && lg.user.resolvedFeatureFlags && lg.user.resolvedFeatureFlags.LISTENING_ENABLED);
    for (const [fn, a] of [['saveTopic', [{ name: 'Sneaky', contains: ['x'], sources: { news: true } }]], ['previewTopic', [{ name: 'x', contains: ['x'], sources: { news: true } }]], ['runTopicNow', ['any']], ['getTopicDetail', ['any', 14]], ['cloneTopic', ['any']]]) {
      const rr = await rpc(adm3, fn, ...a);
      check('switch off: ' + fn + ' is refused and does nothing', !rr.success && rr.off === true, rr);
    }
    await sleep(2500);
    const ticketsAfter = (await rpc(adm3, 'getTickets', { status: 'all', mentions: 'only', promo: 'all', limit: 500 })).tickets.length;
    check('switch off: nothing is checked and no mention tickets appear', ticketsAfter === ticketsBefore, [ticketsBefore, ticketsAfter]);
    check('switch off: no Topics errors in the server log', !/\[Topics\]/.test(srvLog.slice(logMark)), srvLog.slice(logMark).slice(-300));
  } catch (e) { check('test run finished without an exception', false, String((e && e.stack) || e)); }
  srv.kill(); await sleep(500);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
