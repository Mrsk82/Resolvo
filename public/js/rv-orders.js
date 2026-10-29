/* Shopify orders shown next to a ticket or a customer: order cards, "Add to reply", refresh.
   RVO.load(box, fetcher) fills a container; one click handler covers every card on the page. */
(function (w) {
  'use strict';
  var RVO = { _res: {}, _n: 0 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n, cur) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur || 'INR', maximumFractionDigits: 2 }).format(n || 0); } catch (e) { return (cur || '') + ' ' + n; } };
  var day = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  var badge = function (txt, kind) { return w.RV ? w.RV.badge(txt, kind) : '<span>' + esc(txt) + '</span>'; };

  function chips(o) {
    var pay = { paid: ['Paid', 'success'], pending: ['Payment pending', 'warning'], authorized: ['Payment pending', 'warning'], refunded: ['Refunded', 'danger'], partially_refunded: ['Partly refunded', 'warning'], partially_paid: ['Part paid', 'warning'], voided: ['Voided', 'danger'] }[o.paymentStatus];
    var ful = o.cancelled ? ['Cancelled', 'danger'] : { fulfilled: ['Shipped', 'success'], partial: ['Partly shipped', 'warning'], unfulfilled: ['Not shipped yet', 'info'] }[o.fulfillment];
    return (ful ? badge(ful[0], ful[1]) : '') + (pay ? badge(pay[0], pay[1]) : '');
  }
  RVO.card = function (o, key, i, canReply) {
    var items = (o.items || []).map(function (x) { return esc(x.qty + ' × ' + x.title); }).join(', ') + (o.itemCount > (o.items || []).length ? ' and ' + (o.itemCount - o.items.length) + ' more' : '');
    var trk = (o.tracking || []).map(function (t) { return '<div class="rvo-track">' + esc(t.company || 'Tracking') + ': ' + (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(t.number) + '</a>' : '<b>' + esc(t.number) + '</b>') + '</div>'; }).join('');
    return '<article class="rvo-card"><header class="rvo-head"><div><b>' + esc(o.name) + '</b><span class="rv-hint"> &middot; ' + esc(day(o.createdAt)) + ' &middot; ' + esc(money(o.total, o.currency)) + '</span></div><div class="rvo-chips">' + chips(o) + '</div></header>' +
      (items ? '<div class="rvo-items">' + items + '</div>' : '') + (o.shipTo ? '<div class="rv-hint">Ships to ' + esc(o.shipTo) + '</div>' : '') +
      (o.refunded ? '<div class="rv-hint">Refunded ' + esc(money(o.refunded, o.currency)) + '</div>' : '') + trk +
      (o.matchedBy ? '<div class="rvo-how">Found by ' + esc(o.matchedBy) + '</div>' : '') +
      '<footer class="rvo-act">' + (canReply ? '<button type="button" class="rv-btn rv-btn--sm" data-rvo="reply" data-key="' + key + '" data-i="' + i + '">Add to reply</button>' : '') +
      (o.adminUrl ? '<a class="rv-btn rv-btn--sm rv-btn--ghost" href="' + esc(o.adminUrl) + '" target="_blank" rel="noopener">Open in Shopify</a>' : '') + '</footer></article>';
  };
  // res: the RPC answer. opts: { canReply, hideWhenEmpty }
  RVO.html = function (res, key, opts) {
    opts = opts || {};
    if (!res || res.connected === false) return '';
    if (!res.success) return '<div class="rvo-msg rvo-msg--err">' + esc(res.error || 'Could not look up orders.') + ' <button type="button" class="rv-btn rv-btn--sm" data-rvo="refresh" data-key="' + key + '">Try again</button></div>';
    var list = res.orders || [];
    if (!list.length) return '<div class="rvo-msg">No Shopify orders found for ' + esc([res.query && res.query.orderNumber ? 'order ' + res.query.orderNumber : '', res.query && res.query.email, res.query && res.query.phone].filter(Boolean).join(', ') || 'this customer') + '. <button type="button" class="rv-btn rv-btn--sm" data-rvo="refresh" data-key="' + key + '">Check again</button></div>';
    return '<div class="rvo-list">' + list.map(function (o, i) { return RVO.card(o, key, i, opts.canReply); }).join('') + '</div>';
  };
  // Fill `box` using fetcher(refresh) -> Promise<res>. Returns the result.
  RVO.load = async function (box, fetcher, opts) {
    if (!box) return null;
    var key = box.getAttribute('data-rvo-key') || (box.getAttribute('data-rvo-key') || ('o' + (++RVO._n))); box.setAttribute('data-rvo-key', key);
    RVO._fetch = RVO._fetch || {}; RVO._fetch[key] = { fetcher: fetcher, opts: opts || {} };
    if (!box.innerHTML.trim()) box.innerHTML = '<div class="rvo-msg">Looking up orders&hellip;</div>';
    var res; try { res = await fetcher(false); } catch (e) { res = { success: false, error: 'Could not look up orders.' }; }
    if (!document.body.contains(box)) return res;
    RVO._res[key] = res; box.innerHTML = RVO.html(res, key, opts); if (opts && opts.onLoaded) opts.onLoaded(res);
    return res;
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-rvo]'); if (!el) return;
    var key = el.getAttribute('data-key'), act = el.getAttribute('data-rvo'), res = RVO._res[key], f = RVO._fetch && RVO._fetch[key];
    if (act === 'reply' && res) {
      var o = (res.orders || [])[+el.getAttribute('data-i')]; if (!o) return;
      var cm = document.querySelector('.rvf-composer, .rvi-composer'); if (cm) cm.classList.remove('is-collapsed');
      var ta = document.getElementById('replyText'); if (!ta) { if (w.RV) w.RV.toast('Open a ticket to reply with this order.', 'info'); return; }
      ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + o.summary; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus();
      if (w.RV) w.RV.toast('Order details added to your reply. Edit it before sending.', 'success');
    } else if (act === 'refresh' && f) {
      var box = document.querySelector('[data-rvo-key="' + key + '"]'); if (!box) return; box.innerHTML = '<div class="rvo-msg">Looking up orders&hellip;</div>';
      Promise.resolve(f.fetcher(true)).catch(function () { return { success: false, error: 'Could not look up orders.' }; }).then(function (r) { RVO._res[key] = r; box.innerHTML = RVO.html(r, key, f.opts); if (f.opts && f.opts.onLoaded) f.opts.onLoaded(r); });
    }
  });
  w.RVO = RVO;
})(window);
