/* Resolvo website extras, one small file on every public page:
   1. A cookie choice. Google Analytics is only loaded after a visitor says yes. "No thanks" is remembered too.
   2. A "Chat on WhatsApp" button when the owner has set a number (Owner Console > Health & Backups > Website settings).
   Pages include it as <script src="/js/site.js" defer data-wa="1"></script>. Without data-wa it only handles the cookie choice;
   with data-banner="0" (the app) it shows nothing and Analytics stays off unless the visitor already said yes on the website. */
(function () {
  'use strict';
  var GA_ID = 'G-27BVPWPG8N', KEY = 'rv_consent', YEAR = 365 * 86400000;
  var tag = document.currentScript;
  var wantWA = !!(tag && tag.getAttribute('data-wa'));
  var noBanner = !!(tag && tag.getAttribute('data-banner') === '0');   // the app itself: never shown, analytics only if the visitor already agreed on the website
  var store = {
    get: function () { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Date.now() - v.at < YEAR ? v.v : null; } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify({ v: v, at: Date.now() })); } catch (e) {} }
  };
  // pages call gtag('event', ...); until a visitor agrees these calls do nothing
  window.dataLayer = window.dataLayer || [];
  var loaded = false;
  if (!window.gtag) window.gtag = function () {};
  function loadAnalytics() {
    if (loaded) return; loaded = true;
    window.gtag = function () { window.dataLayer.push(arguments); };
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID; document.head.appendChild(s);
    window.gtag('js', new Date()); window.gtag('config', GA_ID, { anonymize_ip: true });
  }
  if (store.get() === 'yes') loadAnalytics();

  var css = '.rvs-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;padding:14px 16px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:14px/1.5 Inter,system-ui,sans-serif}' +
    '.rvs-bar p{margin:0 0 10px}.rvs-bar a{color:#6ee7b7}.rvs-row{display:flex;gap:8px;flex-wrap:wrap}' +
    '.rvs-btn{min-height:40px;padding:8px 16px;border-radius:9px;border:1px solid #475569;background:transparent;color:#e2e8f0;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}' +
    '.rvs-btn.main{background:#10b981;border-color:#10b981;color:#052e22}.rvs-btn:focus-visible{outline:2px solid #6ee7b7;outline-offset:2px}' +
    '.rvs-wa{position:fixed;right:16px;bottom:16px;z-index:2147482000;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px 0 14px;border-radius:26px;background:#25d366;color:#052e16;font:700 14px Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.28)}' +
    '.rvs-wa:hover{filter:brightness(.95)}.rvs-wa svg{width:22px;height:22px;flex:0 0 22px}' +
    '@media(min-width:700px){.rvs-bar{left:auto;right:16px;bottom:16px;margin:0;max-width:380px}body.rvs-has-bar .rvs-wa{bottom:190px}}' +
    '@media(max-width:699px){.rvs-bar{padding:12px 14px;font-size:13px}.rvs-bar p{margin-bottom:8px}.rvs-btn{min-height:38px;padding:6px 14px;font-size:13px}}' +
    '@media(max-width:520px){.rvs-wa span{display:none}.rvs-wa{padding:0 13px}}';
  function style() { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }

  var bar = null;
  function closeBar() { if (bar) { bar.remove(); bar = null; } document.body.classList.remove('rvs-has-bar'); }
  function showBar() {
    if (bar) return; style();
    bar = document.createElement('div'); bar.className = 'rvs-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML = '<p>We would like to use Google Analytics cookies to see which pages help visitors. They are off unless you say yes. <a href="/privacy">Privacy</a></p><div class="rvs-row"><button type="button" class="rvs-btn main" data-c="yes">Yes, that is fine</button><button type="button" class="rvs-btn" data-c="no">No thanks</button></div>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      store.set(b.getAttribute('data-c')); if (b.getAttribute('data-c') === 'yes') loadAnalytics(); closeBar();
    });
    document.body.appendChild(bar); document.body.classList.add('rvs-has-bar');
  }
  window.rvCookieSettings = function () { showBar(); };

  // footers get a small link to change the choice later
  function footerLink() {
    var f = document.querySelector('footer'); if (!f || f.querySelector('[data-rvs-cookie]')) return;
    var a = document.createElement('a'); a.href = '#'; a.textContent = 'Cookie settings'; a.setAttribute('data-rvs-cookie', '1'); a.style.marginLeft = '12px';
    a.addEventListener('click', function (e) { e.preventDefault(); showBar(); });
    f.appendChild(a);
  }

  function whatsapp() {
    fetch('/api/site-config', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (c) {
      var n = c && String(c.whatsapp || '').replace(/\D/g, ''); if (!n || n.length < 8 || n.length > 15) return;
      style();
      var a = document.createElement('a'); a.className = 'rvs-wa'; a.target = '_blank'; a.rel = 'noopener';
      a.href = 'https://wa.me/' + n + '?text=' + encodeURIComponent(c.whatsappText || 'Hi, I have a question about Resolvo.');
      a.setAttribute('aria-label', 'Chat with Resolvo on WhatsApp');
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.5 3.5 0 0 0 1.6-.1 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3z"/></svg><span>Chat on WhatsApp</span>';
      document.body.appendChild(a);
      if (window.gtag) a.addEventListener('click', function () { window.gtag('event', 'whatsapp_click'); });
    }).catch(function () {});
  }

  /* ---- where did this visit come from? ----
     The tagged link (?utm_source=...) or the site that sent the visitor is kept for this browser tab only (sessionStorage), and it is used for two
     things: counting the visit without cookies, and labelling a form the visitor chooses to send (sign-up, demo, contact). */
  var ATTR = 'rv_attr', attr = null;
  function readAttr() {
    var q = new URLSearchParams(location.search), cur = null, host = '';
    try { cur = JSON.parse(sessionStorage.getItem(ATTR) || 'null'); } catch (e) {}
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
    var tagged = q.get('utm_source') ? { s: q.get('utm_source'), m: q.get('utm_medium') || '', c: q.get('utm_campaign') || '', t: q.get('utm_term') || '', n: q.get('utm_content') || '' } : null;
    if (tagged || !cur) cur = Object.assign({ r: tagged ? '' : host, l: location.pathname }, tagged || {});   // the first page of a visit, or a newly tagged link, sets it
    try { sessionStorage.setItem(ATTR, JSON.stringify(cur)); } catch (e) {}
    return cur;
  }
  window.rvAttr = function () { return attr || readAttr(); };
  function sendHit() {
    if (noBanner || navigator.doNotTrack === '1') return;   // the app is not counted; "Do Not Track" is respected
    var body = JSON.stringify({ p: location.pathname, a: attr, d: window.matchMedia && matchMedia('(max-width: 768px)').matches ? 'phone' : 'desktop' });
    try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' })))) fetch('/api/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }); } catch (e) {}
  }
  // Forms that matter carry the source with them, so a sign-up or demo request shows where it came from.
  var LEAD_URL = /\/api\/(signup|demo-request|contact)(\?|$)/, origFetch = window.fetch;
  if (origFetch) window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (init && init.method && String(init.method).toUpperCase() === 'POST' && LEAD_URL.test(url) && typeof init.body === 'string') {
        var o = JSON.parse(init.body); if (o && typeof o === 'object' && !o.attribution) { o.attribution = window.rvAttr(); init = Object.assign({}, init, { body: JSON.stringify(o) }); }
      }
    } catch (e) {}
    var p = origFetch.call(this, input, init);
    try {
      var m = LEAD_URL.exec(typeof input === 'string' ? input : (input && input.url) || '');
      if (m) p.then(function (r) { r.clone().json().then(function (j) { if (j && (j.success || j.ok)) window.gtag('event', m[1] === 'signup' ? 'sign_up' : 'generate_lead', { form: m[1] }); }).catch(function () {}); }).catch(function () {});
    } catch (e) {}
    return p;
  };
  // Standard events (only sent to Google Analytics if the visitor agreed): buttons that lead to sign-up, demo, partners, email; pricing seen; a form started.
  function wireEvents() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var h = a.getAttribute('href') || '', where = (a.closest('nav') ? 'nav' : a.closest('footer') ? 'footer' : a.closest('.hero') || a.closest('header') ? 'hero' : 'page');
      if (/^\/(signup|pro)(\?|#|$)/.test(h)) window.gtag('event', 'cta_signup', { location: where });
      else if (/^\/demo(\?|#|$)/.test(h)) window.gtag('event', 'cta_demo', { location: where });
      else if (/^\/partners/.test(h)) window.gtag('event', 'cta_partners', { location: where });
      else if (/^mailto:/.test(h)) window.gtag('event', 'click_email', { location: where });
      else if (/\/download\/android/.test(h)) window.gtag('event', 'download_android_app', { location: where });
    });
    document.addEventListener('focusin', function (e) {
      var f = e.target.form; if (!f || f.getAttribute('data-rv-started')) return;
      f.setAttribute('data-rv-started', '1'); window.gtag('event', 'form_start', { form: f.id || f.getAttribute('name') || 'form' });
    });
    var pr = document.getElementById('pricing');
    if (pr && 'IntersectionObserver' in window) { var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { window.gtag('event', 'view_pricing'); io.disconnect(); } }, { threshold: 0.3 }); io.observe(pr); }
  }

  function start() {
    attr = readAttr(); sendHit(); wireEvents();
    footerLink();
    if (store.get() === null && !noBanner) showBar();
    if (wantWA) whatsapp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
