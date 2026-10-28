/* Phone helpers: Call / WhatsApp / Email buttons for a customer, and pull-to-refresh on the main lists.
   Everything here is inert on a desktop-width screen. */
(function (w) {
  'use strict';
  var RVP = {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  RVP.isPhone = function () { return !!(w.matchMedia && w.matchMedia('(max-width: 768px)').matches); };

  // "98765 43210", "+91 98765 43210", "whatsapp:+919876543210" -> { tel: '+919876543210', wa: '919876543210' }. Ten digits are taken as Indian numbers.
  RVP.phone = function (raw) {
    var s = String(raw || '').trim().replace(/^[a-z]+:\s*/i, ''); if (!s || /@/.test(s)) return null;
    var plus = s.charAt(0) === '+', d = s.replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) return null;
    if (!plus) { if (d.length === 10) d = '91' + d; else if (d.length === 11 && d.charAt(0) === '0') d = '91' + d.slice(1); }
    return { tel: '+' + d, wa: d };
  };
  // Buttons that open the phone dialler, WhatsApp or the mail app. Returns '' when there is nothing to use.
  RVP.contact = function (o) {
    o = o || {}; var p = RVP.phone(o.phone), em = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email || '').trim()) ? String(o.email).trim() : '';
    var icon = function (n) { return w.RV ? w.RV.icon(n, 16) : ''; };
    var a = function (href, label, ico, kind, ext) { return '<a class="rv-btn rv-btn--sm rvp-act rvp-act--' + kind + '" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + ' data-rvp="' + kind + '">' + icon(ico) + '<span>' + label + '</span></a>'; };
    var showMail = em && !(o.hideLoneEmail && !p);   // on a ticket, an Email button alone just duplicates Reply
    var out = (p ? a('tel:' + p.tel, 'Call', 'phone', 'call') + a('https://wa.me/' + p.wa, 'WhatsApp', 'chat', 'wa', true) : '') + (showMail ? a('mailto:' + em, 'Email', 'mail', 'mail') : '');
    return out ? '<div class="rvp-acts" role="group" aria-label="Contact this customer">' + out + '</div>' : '';
  };

  // ---------- pull to refresh ----------
  var PAGES = { 'dashboard': 1, 'ticket-inbox': 1, 'customers': 1 }, PULL = 80, st = null, bar = null;
  function page() { try { return typeof App !== 'undefined' ? App.currentPage : ''; } catch (e) { return ''; } }
  function scroller() { return document.getElementById('contentArea'); }
  function canPull(target) {
    if (!RVP.isPhone() || !PAGES[page()]) return false;
    var sc = scroller(); if (!sc || !sc.contains(target) || sc.scrollTop > 0) return false;
    if (target.closest && target.closest('input,textarea,select,[contenteditable="true"],.rv-overlay,.modal-overlay,.rvf-composer,.rvi-composer')) return false;
    var open = false; document.querySelectorAll('.rv-overlay,.modal-overlay').forEach(function (o) { var r = o.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && w.getComputedStyle(o).visibility !== 'hidden') open = true; });
    if (open) return false;
    if (page() === 'ticket-inbox' && w.RVI && w.RVI.canPull && !w.RVI.canPull()) return false;
    return true;
  }
  function el() {
    if (!bar) { bar = document.createElement('div'); bar.className = 'rvp-ptr'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); bar.innerHTML = '<span class="rvp-ptr__spin" aria-hidden="true"></span><span class="rvp-ptr__txt"></span>'; document.body.appendChild(bar); }
    return bar;
  }
  function show(px, text, spinning) {
    var b = el(); b.classList.add('is-on'); b.classList.toggle('is-spin', !!spinning); b.style.transform = 'translate(-50%, ' + Math.round(px) + 'px)'; b.querySelector('.rvp-ptr__txt').textContent = text;
    b.querySelector('.rvp-ptr__spin').style.transform = spinning ? '' : 'rotate(' + Math.min(180, px * 3) + 'deg)';
  }
  function hide() { if (bar) { bar.classList.remove('is-on', 'is-spin'); bar.style.transform = 'translate(-50%, -64px)'; } }
  // What "refresh" means on each page
  RVP.refresh = async function () {
    var p = page();
    if (p === 'ticket-inbox' && w.RVI && w.RVI.pullRefresh) return w.RVI.pullRefresh();
    if (p === 'customers' && typeof App !== 'undefined' && App._custReload) return App._custReload();
    if (typeof App !== 'undefined' && App.navigate) { App.navigate(p); return new Promise(function (r) { setTimeout(r, 700); }); }
  };
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || !canPull(e.target)) { st = null; return; }
    st = { x: e.touches[0].clientX, y: e.touches[0].clientY, dy: 0, lock: null };
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!st) return; var t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y, sc = scroller();
    if (st.lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.lock = (dy > 0 && dy > Math.abs(dx) * 1.5) ? 'y' : 'n';
    if (st.lock === 'n') { st = null; return; }
    if (st.lock !== 'y') return;
    if (sc && sc.scrollTop > 0) { st = null; hide(); return; }
    st.dy = dy; show(Math.min(dy * 0.5, 72) - 40, dy >= PULL ? 'Release to refresh' : 'Pull to refresh', false);
  }, { passive: true });
  function end() {
    if (!st) return; var s = st; st = null;
    if (s.lock === 'y' && s.dy >= PULL) {
      show(32, 'Refreshing…', true); try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
      Promise.resolve().then(RVP.refresh).catch(function () {}).then(function () { setTimeout(hide, 250); });
    } else hide();
  }
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', function () { st = null; hide(); });

  w.RVP = RVP;
})(window);
