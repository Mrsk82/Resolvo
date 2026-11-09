/* Phone and app extras: an outbox for replies written without signal, saved drafts, dictation, photos and files, replies by situation,
   an app lock (PIN and fingerprint) and the "Phone & app" settings sheet.
   Works in the browser and in the Android app. The few things that need the Android app itself (fingerprint, native dictation,
   the home-screen widget) talk to the ResolvoNative plugin when it is there and quietly stay off when it is not. */
(function (w) {
  'use strict';
  var RVM = {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var A = function () { try { return App; } catch (e) { return null; } };   // App is a script-level constant, not on window
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var me = function () { var a = A(); return String(((a && a.currentUser) || {}).email || '').toLowerCase(); };
  var toast = function (m, k, act) { if (w.RV && w.RV.toast) w.RV.toast(m, k, act); };
  // The Android app's own plugin. Capacitor lists it under Plugins; if a page loaded from the website does not get that list, call the bridge directly.
  var viaBridge = null;
  var native = function () {
    try {
      var C = w.Capacitor; if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.isNative)) return null;
      if (C.Plugins && C.Plugins.ResolvoNative) return C.Plugins.ResolvoNative;
      if (typeof C.nativePromise !== 'function') return null;
      if (!viaBridge) { viaBridge = {}; ['biometric', 'speechStart', 'speechStop', 'setSession'].forEach(function (m) { viaBridge[m] = function (o) { return C.nativePromise('ResolvoNative', m, o || {}); }; }); }
      return viaBridge;
    } catch (e) { return null; }
  };
  RVM.native = native;
  function onApp(cb) { var n = 0, t = setInterval(function () { if (A() && A().callAsync) { clearInterval(t); cb(A()); } else if (++n > 160) clearInterval(t); }, 125); }
  var NET = /failed to fetch|networkerror|network request failed|load failed|the internet connection|timeout/i;

  /* =====================================================================
     1. Outbox: a reply or new ticket written with no signal is kept and sent when the connection returns
     ===================================================================== */
  var OUT_KEY = 'rv_outbox', QUEUEABLE = { replyToTicket: 'reply', createManualTicket: 'new ticket' }, flushing = false;
  var outbox = function () { return store.get(OUT_KEY, []); };
  function label(it) {
    if (it.fn === 'replyToTicket') return (it.args[2] ? 'Note on ' : 'Reply to ') + it.args[0] + ': ' + String(it.args[1] || '').slice(0, 70);
    return 'New ticket: ' + String((it.args[0] || {}).subject || '').slice(0, 70);
  }
  function enqueue(fn, args) {
    var list = outbox(), it = { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), fn: fn, args: args, at: Date.now(), who: me() };
    list.push(it); if (list.length > 50) list = list.slice(-50);
    store.set(OUT_KEY, list); drawPill(); return it;
  }
  function removeItem(id) { store.set(OUT_KEY, outbox().filter(function (x) { return x.id !== id; })); drawPill(); }
  RVM.flush = async function (manual) {
    var a = A(); if (flushing || !a || !a._rvmRaw) return { sent: 0 };
    var mine = outbox().filter(function (x) { return !x.who || x.who === me(); }); if (!mine.length) return { sent: 0 };
    flushing = true; var sent = 0, failed = 0;
    try {
      for (var i = 0; i < mine.length; i++) {
        var it = mine[i], r = await a._rvmRaw.apply(a, [it.fn].concat(it.args));
        if (r && r.success !== false) { removeItem(it.id); sent++; if (it.fn === 'replyToTicket') store.del('rv_draft:' + me() + ':' + it.args[0]); }
        else if (r && NET.test(String(r.error || ''))) break;   // still no signal: keep the rest for later
        else { removeItem(it.id); failed++; var l = store.get('rv_outbox_failed', []); l.push({ label: label(it), error: String((r && r.error) || 'Not accepted'), at: Date.now() }); store.set('rv_outbox_failed', l.slice(-20)); toast('A saved message could not be sent: ' + String((r && r.error) || 'not accepted') + ' (' + label(it) + ')', 'error'); }
      }
    } finally { flushing = false; }
    if (sent) { toast(sent === 1 ? 'Your saved message was sent.' : sent + ' saved messages were sent.', 'success'); try { var v = w.RVI; if (v && v.refresh && A().currentPage === 'ticket-inbox') v.refresh(); } catch (e) {} }
    else if (manual && !failed) toast('Still no signal. Your messages are kept.', 'info');
    drawPill(); return { sent: sent, failed: failed };
  };
  function wrapCalls(a) {
    if (a._rvmRaw) return;
    a._rvmRaw = a.callAsync;
    a.callAsync = function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (!QUEUEABLE[fn]) return a._rvmRaw.apply(a, arguments);
      // one key per send: if the answer is lost and the saved copy is replayed later, the server recognises it and does not send twice
      if (fn === 'replyToTicket' && !args[3]) { args[2] = !!args[2]; args[3] = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
      var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline) { enqueue(fn, args); return Promise.resolve({ success: true, queued: true }); }
      return a._rvmRaw.apply(a, [fn].concat(args)).then(function (r) {
        if (r && r.success === false && NET.test(String(r.error || ''))) { enqueue(fn, args); return { success: true, queued: true }; }
        if (r && r.success && fn === 'replyToTicket') store.del('rv_draft:' + me() + ':' + args[0]);
        return r;
      });
    };
  }
  var pill = null;
  function drawPill() {
    var n = outbox().filter(function (x) { return !x.who || x.who === me(); }).length;
    if (!n) { if (pill) { pill.remove(); pill = null; } return; }
    if (!pill) { pill = document.createElement('button'); pill.type = 'button'; pill.className = 'rvm-pill'; pill.setAttribute('aria-live', 'polite'); pill.addEventListener('click', RVM.openOutbox); document.body.appendChild(pill); }
    pill.textContent = '📤 ' + n + (n === 1 ? ' message' : ' messages') + ' waiting to send' + (navigator.onLine === false ? ' (no signal)' : '');
  }
  RVM.openOutbox = function () {
    var list = outbox().filter(function (x) { return !x.who || x.who === me(); });
    var body = '<p class="rvm-p">These were written without signal. They are sent by themselves when you are back online.</p>' + (list.length ? list.map(function (it) {
      return '<div class="rvm-row"><div class="rvm-row__t">' + esc(label(it)) + '<small>' + esc(new Date(it.at).toLocaleString()) + '</small></div><button type="button" class="rv-btn rv-btn--sm" data-rvm="discard" data-id="' + esc(it.id) + '">Discard</button></div>';
    }).join('') : '<p class="rvm-p">Nothing is waiting.</p>');
    var ov = w.RV.modal({ title: 'Waiting to send', body: body, foot: '<button type="button" class="rv-btn rv-btn--primary" data-rvm="send-now">Send now</button>' });
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rvm]'); if (!b) return;
      if (b.getAttribute('data-rvm') === 'discard') { removeItem(b.getAttribute('data-id')); b.closest('.rvm-row').remove(); }
      else if (b.getAttribute('data-rvm') === 'send-now') { RVM.flush(true).then(function () { w.RV.closeModal(ov); }); }
    });
  };
  w.addEventListener('online', function () { drawPill(); setTimeout(function () { RVM.flush(false); }, 800); });
  w.addEventListener('offline', function () { drawPill(); toast('No signal. You can keep writing: replies are saved and sent when you are back.', 'info'); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && navigator.onLine !== false && outbox().length) RVM.flush(false); });
  setInterval(function () { if (navigator.onLine !== false && outbox().length) RVM.flush(false); }, 30000);

  /* =====================================================================
     2. Drafts: what you were typing is kept for each ticket
     ===================================================================== */
  function ticketId() { try { return w.RVI && w.RVI.currentId ? w.RVI.currentId() : null; } catch (e) { return null; } }
  var draftKey = function (id) { return 'rv_draft:' + me() + ':' + id; };
  var draftTimer = null;
  document.addEventListener('input', function (e) {
    var ta = e.target; if (!ta || ta.id !== 'replyText') return;
    var id = ticketId(); if (!id) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var v = ta.value;
      if (v.trim()) { store.set(draftKey(id), { t: v, at: Date.now() }); pruneDrafts(); } else store.del(draftKey(id));
    }, 400);
  }, true);
  function pruneDrafts() {
    var keys = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('rv_draft:') === 0) keys.push(k); } } catch (e) { return; }
    if (keys.length <= 40) return;
    keys.map(function (k) { return { k: k, at: (store.get(k, {}) || {}).at || 0 }; }).sort(function (a, b) { return a.at - b.at; }).slice(0, keys.length - 40).forEach(function (x) { store.del(x.k); });
  }
  function restoreDraft(ta) {
    var id = ticketId(); if (!id || ta.value.trim()) return;
    var d = store.get(draftKey(id), null); if (!d || !d.t || Date.now() - d.at > 14 * 86400000) return;
    ta.value = d.t; ta.dispatchEvent(new Event('input', { bubbles: true }));
    var cm = ta.closest('.rvi-composer, .rvf-composer'); if (cm) cm.classList.remove('is-collapsed');
    toast('Your unsent draft was restored.', 'info');
  }

  /* =====================================================================
     3. Dictation (microphone) in the reply box
     ===================================================================== */
  var LANGS = [['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['mr-IN', 'Marathi'], ['gu-IN', 'Gujarati'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['bn-IN', 'Bengali'], ['kn-IN', 'Kannada']];
  var SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  var voiceLang = function () { return store.get('rv_voice_lang', 'en-IN'); };
  var listening = null;
  RVM.canDictate = function () { return !!(native() || SR); };
  function putText(ta, text) {
    var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, e = ta.selectionEnd == null ? s : ta.selectionEnd, before = ta.value.slice(0, s), after = ta.value.slice(e);
    var sp = before && !/\s$/.test(before) ? ' ' : '';
    ta.value = before + sp + text + after; ta.selectionStart = ta.selectionEnd = (before + sp + text).length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function stopDictation() {
    if (!listening) return; var l = listening; listening = null;
    try { if (l.rec) l.rec.stop(); if (l.native) native().speechStop(); } catch (e) {}
    if (l.btn) { l.btn.classList.remove('is-on'); l.btn.setAttribute('aria-pressed', 'false'); }
  }
  function toggleDictation(ta, btn) {
    if (listening) { stopDictation(); return; }
    var lang = voiceLang(), N = native();
    var begin = function () { listening = { btn: btn }; btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true'); };
    if (N && N.speechStart) {
      begin(); listening.native = true;
      N.speechStart({ lang: lang }).then(function (r) { if (r && r.text) putText(ta, r.text); stopDictation(); })
        .catch(function (e) { stopDictation(); toast(/permission/i.test(String(e && e.message)) ? 'Allow the microphone for Resolvo in your phone settings.' : 'Could not hear anything. Try again.', 'error'); });
      return;
    }
    if (!SR) { toast('Dictation is not available in this browser. Try Chrome on Android.', 'info'); return; }
    var rec = new SR(); rec.lang = lang; rec.interimResults = false; rec.continuous = true; begin(); listening.rec = rec;
    rec.onresult = function (ev) { for (var i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) putText(ta, ev.results[i][0].transcript.trim()); };
    rec.onerror = function (ev) { stopDictation(); toast(ev.error === 'not-allowed' ? 'Allow the microphone for this site to dictate.' : ev.error === 'no-speech' ? 'Did not hear anything.' : 'Dictation stopped (' + ev.error + ').', 'error'); };
    rec.onend = function () { if (listening && listening.rec === rec) stopDictation(); };
    try { rec.start(); toast('Listening in ' + (LANGS.filter(function (x) { return x[0] === lang; })[0] || [0, lang])[1] + '. Tap the microphone again to stop.', 'info'); } catch (e) { stopDictation(); }
  }

  /* =====================================================================
     4. Photos and files: uploaded, and the link is added to the reply
     ===================================================================== */
  function pickFile(accept, capture, cb) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = !capture; if (capture) inp.setAttribute('capture', capture);
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.addEventListener('change', function () { var fs = Array.prototype.slice.call(inp.files || []); inp.remove(); if (fs.length) cb(fs); });
    inp.click();
  }
  function toBase64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = function () { rej(new Error('Could not read the file')); }; r.readAsDataURL(blob); }); }
  // Photos from a phone camera are 4 to 8 MB: shrink them so they send quickly on mobile data
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 400 * 1024) { resolve({ blob: file, name: file.name }); return; }
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b && b.size < file.size ? { blob: b, name: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' } : { blob: file, name: file.name }); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ blob: file, name: file.name }); };
      img.src = url;
    });
  }
  async function attach(files, ta) {
    if (navigator.onLine === false) { toast('Attachments need a signal. Your reply text is saved.', 'error'); return; }
    var a = A(), lines = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i]; toast('Uploading ' + f.name + '…', 'info');
      try {
        var s = await shrink(f), b64 = await toBase64(s.blob);
        var r = await a._rvmRaw.call(a, 'uploadFile', s.name, s.blob.type || f.type, b64);
        if (!r || !r.success) { toast((r && r.error) || 'Could not upload ' + f.name, 'error'); continue; }
        lines.push('📎 ' + s.name + ': ' + location.origin + r.url);
      } catch (e) { toast('Could not upload ' + f.name + ': ' + e.message, 'error'); }
    }
    if (lines.length) { ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '') + lines.join('\n') + '\n'; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); toast(lines.length === 1 ? 'Attached. The customer gets a link.' : lines.length + ' files attached. The customer gets links.', 'success'); }
  }

  /* =====================================================================
     5. Replies by situation (with the customer's name, order and your name filled in)
     ===================================================================== */
  var TEMPLATES = [
    ['Order status', [
      ['Order is on its way', 'Hi {{name}}, thank you for your patience. Your order {{order}} has been shipped and is on its way to you. You can track it with the link on your order confirmation. Please tell us if you need anything else.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['Order is being prepared', 'Hi {{name}}, your order {{order}} is being prepared and will be shipped shortly. We will send you the tracking details as soon as it leaves us.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['Checking with the courier', 'Hi {{name}}, I am checking the status of {{order}} with the courier right now and will come back to you within a few hours with an update.\n\nRegards,\n{{agent}}, {{brand}}']]],
    ['Refund / return', [
      ['Refund approved', 'Hi {{name}}, your refund for {{order}} has been approved. It will reach your original payment method in 5 to 7 working days. I am sorry for the trouble.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['How to return', 'Hi {{name}}, I am sorry the item was not right. To return it, please keep it unused in its original packing and reply with a photo of the item. We will arrange the pickup and share the next steps.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['Need photos', 'Hi {{name}}, I am sorry about this. To resolve it quickly, could you please send a clear photo of the item and the packing? As soon as we have it, we will sort this out for you.\n\nRegards,\n{{agent}}, {{brand}}']]],
    ['Sorry for the delay', [
      ['Apology for delay', 'Hi {{name}}, I am sorry for the delay in getting back to you. Thank you for waiting. I am looking into this now and will update you shortly.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['Still working on it', 'Hi {{name}}, a quick update: we are still working on your request ({{ticket}}). I will write again by end of day, or sooner if I have news.\n\nRegards,\n{{agent}}, {{brand}}']]],
    ['Follow up', [
      ['Did that solve it?', 'Hi {{name}}, I wanted to check whether the solution worked for you. If you still face any problem, just reply here and we will help.\n\nRegards,\n{{agent}}, {{brand}}'],
      ['Need more details', 'Hi {{name}}, to help you faster, could you please share a few more details about the problem, and your order number if it is about an order? Thank you.\n\nRegards,\n{{agent}}, {{brand}}']]],
    ['Thanks and close', [
      ['Thank you', 'Hi {{name}}, thank you for contacting {{brand}}. I am glad we could help. If you need anything else, just reply to this message.\n\nRegards,\n{{agent}}']]]
  ];
  RVM.TEMPLATES = TEMPLATES;
  function whoName() { var el = document.querySelector('.rvi-conv__who, .rvf-who'); var n = el ? el.textContent.trim() : ''; if (!n || /@/.test(n) || /^\+?\d[\d\s-]{6,}$/.test(n)) return n && !/@/.test(n) ? 'there' : (n ? n.split('@')[0] : 'there'); return n.split(/\s+/)[0]; }
  function lastOrder() { try { var res = w.RVO && w.RVO._res; if (!res) return ''; var keys = Object.keys(res); for (var i = keys.length - 1; i >= 0; i--) { var o = ((res[keys[i]] || {}).orders || [])[0]; if (o && o.name) return o.name; } } catch (e) {} return ''; }
  RVM.fill = function (text, ctx) {
    ctx = ctx || {}; var a = A(), u = (a && a.currentUser) || {};
    var vals = { name: ctx.name || whoName() || 'there', order: ctx.order || lastOrder() || 'your order', agent: (u.name || '').trim() || 'Support', brand: u.brandName || (a && a.brandName) || 'our team', ticket: ctx.ticket || ticketId() || 'your ticket' };
    return String(text).replace(/\{\{(\w+)\}\}/g, function (m, k) { return vals[k] != null ? vals[k] : m; });
  };
  // A reply for a Shopify order, written from its real status. Always edited by the agent before it is sent.
  RVM.orderText = function (o, name) {
    name = name || 'there'; var num = o.name || 'your order', trk = (o.tracking || [])[0], status;
    if (o.cancelled) status = 'Your order ' + num + ' has been cancelled' + (o.refunded ? ' and ' + moneyText(o.refunded, o.currency) + ' has been refunded, which reaches you in 5 to 7 working days' : '') + '.';
    else if (o.fulfillment === 'fulfilled') status = 'Good news: your order ' + num + ' has been shipped' + (trk ? ' with ' + (trk.company || 'our courier') + '. Tracking number: ' + trk.number + (trk.url ? '\nTrack it here: ' + trk.url : '') : '. The tracking details will follow shortly') + '.';
    else if (o.fulfillment === 'partial') status = 'Part of your order ' + num + ' has been shipped' + (trk ? ' (' + (trk.company || 'courier') + ', tracking ' + trk.number + (trk.url ? ', ' + trk.url : '') + ')' : '') + ', and the rest will follow soon.';
    else if (o.paymentStatus === 'pending' || o.paymentStatus === 'authorized') status = 'Your order ' + num + ' is waiting for the payment to be confirmed. As soon as it is, we will prepare it for shipping.';
    else status = 'Your order ' + num + ' is confirmed and is being prepared. It has not shipped yet, and we will send you the tracking details as soon as it does.';
    var items = (o.items || []).slice(0, 3).map(function (x) { return x.qty + ' × ' + x.title; }).join(', ');
    return RVM.fill('Hi ' + name + ',\n\n' + status + (items ? '\n\nItems: ' + items + '.' : '') + '\n\nPlease let us know if there is anything else we can do.\n\nRegards,\n{{agent}}, {{brand}}', { order: num });
  };
  function moneyText(n, cur) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur || 'INR', maximumFractionDigits: 2 }).format(n || 0); } catch (e) { return (cur || '') + ' ' + n; } }
  function openTemplates(ta) {
    var cat = 0, a = A();
    var render = function (ov) {
      var chips = TEMPLATES.map(function (c, i) { return '<button type="button" class="rvm-chip' + (i === cat ? ' is-on' : '') + '" data-rvm="cat" data-i="' + i + '">' + esc(c[0]) + '</button>'; }).join('') + '<button type="button" class="rvm-chip' + (cat === 'mine' ? ' is-on' : '') + '" data-rvm="cat" data-i="mine">My saved replies</button>';
      var items;
      if (cat === 'mine') { var mine = (w.RVI && w.RVI.canned && w.RVI.canned()) || []; items = mine.length ? mine.map(function (c, i) { return '<button type="button" class="rvm-tpl" data-rvm="mine" data-i="' + i + '"><b>' + esc(c.title || c.shortcut || 'Reply') + '</b><span>' + esc(String(c.body || c.text || c.content || '').slice(0, 110)) + '</span></button>'; }).join('') : '<p class="rvm-p">No saved replies yet. Add some in Settings.</p>'; }
      else items = TEMPLATES[cat][1].map(function (t, i) { return '<button type="button" class="rvm-tpl" data-rvm="tpl" data-i="' + i + '"><b>' + esc(t[0]) + '</b><span>' + esc(RVM.fill(t[1]).replace(/\n+/g, ' ').slice(0, 110)) + '…</span></button>'; }).join('');
      ov.querySelector('.rv-modal__body').innerHTML = '<div class="rvm-chips">' + chips + '</div><div class="rvm-tpls">' + items + '</div><p class="rvm-p">Names and order numbers are filled in for you. You can edit the text before you send it.</p>';
    };
    var ov = w.RV.modal({ title: 'Reply for a situation', body: '' }); render(ov);
    if (w.RVI && w.RVI.loadCanned) w.RVI.loadCanned().then(function () { if (cat === 'mine') render(ov); }).catch(function () {});
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rvm]'); if (!b) return; var k = b.getAttribute('data-rvm'), i = b.getAttribute('data-i');
      if (k === 'cat') { cat = i === 'mine' ? 'mine' : +i; render(ov); return; }
      var text = k === 'tpl' ? RVM.fill(TEMPLATES[cat][1][+i][1]) : RVM.fill(String(((w.RVI.canned() || [])[+i] || {}).body || ''));
      if (!text) return; putText(ta, text); w.RV.closeModal(ov); ta.focus(); toast('Added. Edit it before you send.', 'success');
    });
  }

  /* =====================================================================
     Composer tools (microphone, photo, file, situations) added under the reply box whenever one is on screen
     ===================================================================== */
  function icon(n) { return w.RV && w.RV.icon ? w.RV.icon(n, 16) : ''; }
  function enhance() {
    var ta = document.getElementById('replyText'); if (!ta || ta.getAttribute('data-rvm')) return;
    ta.setAttribute('data-rvm', '1');
    var tools = document.createElement('div'); tools.className = 'rvm-tools'; tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Reply tools');
    var btn = function (act, label, svg, extra) { return '<button type="button" class="rvm-tool' + (extra || '') + '" data-rvm-tool="' + act + '" aria-label="' + label + '" title="' + label + '">' + svg + '<span>' + label + '</span></button>'; };
    var S = function (d) { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    tools.innerHTML = (RVM.canDictate() ? btn('mic', 'Dictate', S('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>')) : '') +
      btn('photo', 'Photo', S('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')) +
      btn('file', 'File', S('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>')) +
      btn('tpl', 'Replies', S('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'));
    ta.parentNode.insertBefore(tools, ta);
    tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rvm-tool]'); if (!b) return; var k = b.getAttribute('data-rvm-tool');
      if (k === 'mic') toggleDictation(ta, b);
      else if (k === 'photo') pickFile('image/*', 'environment', function (fs) { attach(fs, ta); });
      else if (k === 'file') pickFile('image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.m4a,.zip', null, function (fs) { attach(fs, ta); });
      else if (k === 'tpl') openTemplates(ta);
    });
    restoreDraft(ta);
  }
  var raf = 0;
  new MutationObserver(function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; enhance(); }); }).observe(document.documentElement, { childList: true, subtree: true });

  /* =====================================================================
     6. App lock: PIN, with fingerprint or face in the Android app
     ===================================================================== */
  var LOCK = 'rv_lock', SESS = 'rv_unlocked';
  var lockCfg = function () { return store.get(LOCK, null); };
  var enc = new TextEncoder();
  async function hashPin(pin, saltHex) {
    var salt = new Uint8Array(saltHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
    var key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 120000 }, key, 256);
    return Array.prototype.map.call(new Uint8Array(bits), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var newSalt = function () { return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
  RVM.setPin = async function (pin, opts) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('The PIN must be 4 to 8 digits.');
    var salt = newSalt(), cfg = lockCfg() || {};
    store.set(LOCK, { on: true, salt: salt, hash: await hashPin(pin, salt), bio: !!(opts ? opts.bio : cfg.bio), idle: opts && opts.idle != null ? opts.idle : (cfg.idle != null ? cfg.idle : 5), fails: 0 });
    try { sessionStorage.setItem(SESS, String(Date.now())); } catch (e) {}
  };
  RVM.lockOff = function () { store.del(LOCK); try { sessionStorage.removeItem(SESS); } catch (e) {} hideLock(); };
  RVM.lockConfig = lockCfg;
  var hiddenAt = 0, lockEl = null, entered = '';
  var unlockedNow = function () { try { sessionStorage.setItem(SESS, String(Date.now())); } catch (e) {} };
  function needsLock() { var c = lockCfg(); if (!c || !c.on) return false; try { return !sessionStorage.getItem(SESS); } catch (e) { return true; } }
  function hideLock() { if (lockEl) { lockEl.remove(); lockEl = null; } entered = ''; document.documentElement.classList.remove('rvm-locked'); }
  function showLock() {
    if (lockEl) return; var c = lockCfg(); if (!c || !c.on) return; entered = '';
    document.documentElement.classList.add('rvm-locked');
    lockEl = document.createElement('div'); lockEl.className = 'rvm-lock'; lockEl.setAttribute('role', 'dialog'); lockEl.setAttribute('aria-modal', 'true'); lockEl.setAttribute('aria-label', 'Resolvo is locked');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'].map(function (k) { return k === '' ? '<span></span>' : '<button type="button" class="rvm-key" data-k="' + k + '" aria-label="' + (k === '<' ? 'Delete' : k) + '">' + (k === '<' ? '⌫' : k) + '</button>'; }).join('');
    lockEl.innerHTML = '<div class="rvm-lock__box"><div class="rvm-lock__logo">⟳</div><h2>Resolvo is locked</h2><p id="rvmLockMsg" class="rvm-lock__msg" role="status">Enter your PIN</p><div class="rvm-dots" id="rvmDots" aria-hidden="true"></div><div class="rvm-keys">' + keys + '</div>' +
      (c.bio && native() ? '<button type="button" class="rvm-lock__link" data-k="bio">Use fingerprint or face</button>' : '') + '<button type="button" class="rvm-lock__link" data-k="out">Forgot PIN? Sign out</button></div>';
    document.body.appendChild(lockEl); dots();
    lockEl.addEventListener('click', onKey);
    if (c.bio && native()) setTimeout(tryBio, 250);
  }
  function dots() { var d = document.getElementById('rvmDots'); if (d) d.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(4, entered.length)).map(function (i) { return '<i class="' + (i < entered.length ? 'on' : '') + '"></i>'; }).join(''); }
  function say(m, bad) { var e = document.getElementById('rvmLockMsg'); if (e) { e.textContent = m; e.classList.toggle('bad', !!bad); } }
  function tryBio() {
    var N = native(); if (!N || !N.biometric) return;
    N.biometric({ title: 'Unlock Resolvo', subtitle: 'Use your fingerprint or face' }).then(function (r) { if (r && r.ok) { unlockedNow(); hideLock(); } }).catch(function () { say('Use your PIN', false); });
  }
  async function checkPin() {
    var c = lockCfg(); if (!c) { hideLock(); return; }
    if (c.until && Date.now() < c.until) { say('Too many tries. Wait ' + Math.ceil((c.until - Date.now()) / 1000) + ' seconds.', true); entered = ''; dots(); return; }
    var ok = (await hashPin(entered, c.salt)) === c.hash; entered = ''; dots();
    if (ok) { c.fails = 0; delete c.until; store.set(LOCK, c); unlockedNow(); hideLock(); return; }
    c.fails = (c.fails || 0) + 1;
    if (c.fails >= 10) { store.set(LOCK, c); signOut('Too many wrong PINs. You were signed out.'); return; }
    if (c.fails % 5 === 0) c.until = Date.now() + 30000 * (c.fails / 5);
    store.set(LOCK, c); say(c.until && Date.now() < c.until ? 'Wrong PIN. Wait ' + Math.ceil((c.until - Date.now()) / 1000) + ' seconds.' : 'Wrong PIN. ' + (10 - c.fails) + ' tries left.', true);
  }
  function signOut() { RVM.lockOff(); try { localStorage.removeItem('tt_session_token'); } catch (e) {} location.reload(); }
  function onKey(e) {
    var b = e.target.closest('[data-k]'); if (!b) return; var k = b.getAttribute('data-k');
    if (k === 'bio') { tryBio(); return; }
    if (k === 'out') { if (confirm('Sign out of Resolvo on this phone? You will need your password to come back.')) signOut(); return; }
    if (k === '<') entered = entered.slice(0, -1); else if (entered.length < 8) entered += k;
    dots(); var c = lockCfg();
    if (entered.length >= 4 && c && entered.length === (c.len || 0)) checkPin();
    else if (entered.length === 8) checkPin();
    else if (entered.length >= 4) lockEl.querySelector('#rvmDots').setAttribute('data-ready', '1');
  }
  // PIN length is known (4 to 8): unlock as soon as that many digits are typed
  var origSet = RVM.setPin;
  RVM.setPin = async function (pin, opts) { await origSet(pin, opts); var c = lockCfg(); c.len = pin.length; store.set(LOCK, c); };
  document.addEventListener('visibilitychange', function () {
    var c = lockCfg(); if (!c || !c.on) return;
    if (document.hidden) { hiddenAt = Date.now(); return; }
    var idle = c.idle == null ? 5 : c.idle;
    if (idle >= 0 && hiddenAt && Date.now() - hiddenAt >= idle * 60000) { try { sessionStorage.removeItem(SESS); } catch (e) {} showLock(); }
  });
  if (needsLock()) { document.documentElement.classList.add('rvm-locked'); document.addEventListener('DOMContentLoaded', showLock); if (document.readyState !== 'loading') showLock(); }

  /* =====================================================================
     7. Phone & app settings
     ===================================================================== */
  RVM.openSettings = function () {
    var c = lockCfg() || {}, N = native(), lang = voiceLang(), n = outbox().length;
    var idleOpts = [[0, 'Every time I leave the app'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes'], [30, 'After 30 minutes']].map(function (o) { return '<option value="' + o[0] + '"' + ((c.idle == null ? 5 : c.idle) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    var body = '<div class="rvm-set">' +
      '<section><h3>App lock</h3><p class="rvm-p">Ask for a PIN' + (N ? ' (or your fingerprint)' : '') + ' when the app opens, so customer data stays private if your phone is lost.</p>' +
      '<div class="rvm-line"><span>' + (c.on ? '🔒 Lock is <b>on</b>' : 'Lock is <b>off</b>') + '</span><button type="button" class="rv-btn rv-btn--sm" data-rvm="pin">' + (c.on ? 'Change PIN' : 'Turn on') + '</button>' + (c.on ? '<button type="button" class="rv-btn rv-btn--sm" data-rvm="lock-off">Turn off</button>' : '') + '</div>' +
      (c.on ? '<label class="rvm-lab">Lock<select id="rvmIdle" class="rv-select">' + idleOpts + '</select></label>' + (N ? '<label class="rvm-chk"><input type="checkbox" id="rvmBio"' + (c.bio ? ' checked' : '') + '> Unlock with fingerprint or face</label>' : '<p class="rvm-p rvm-dim">Fingerprint unlock works in the Android app.</p>') : '') + '</section>' +
      '<section><h3>Dictation</h3>' + (RVM.canDictate() ? '<label class="rvm-lab">Language<select id="rvmLang" class="rv-select">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label><p class="rvm-p rvm-dim">Tap Dictate under the reply box and speak.</p>' : '<p class="rvm-p rvm-dim">Not available in this browser. Chrome on Android and the Resolvo app support it.</p>') + '</section>' +
      '<section><h3>Messages waiting to send</h3><div class="rvm-line"><span>' + (n ? n + ' waiting' : 'Nothing waiting') + '</span>' + (n ? '<button type="button" class="rv-btn rv-btn--sm" data-rvm="outbox">Open</button>' : '') + '</div></section>' +
      '<section><h3>Alerts and widget</h3><p class="rvm-p">' + (N ? 'Add the <b>Resolvo</b> widget: press and hold your home screen, tap Widgets, then Resolvo. It shows your open and overdue tickets.' : 'Alerts with Reply, Assign and Resolve buttons work in Chrome on Android once you allow alerts. The home-screen widget is in the Android app.') + '</p>' +
      '<div class="rvm-line"><button type="button" class="rv-btn rv-btn--sm" data-rvm="alerts">Alerts on this device</button>' + (N ? '' : '<a class="rv-btn rv-btn--sm" href="/app">Get the Android app</a>') + '</div></section></div>';
    var ov = w.RV.modal({ title: 'Phone & app', body: body });
    ov.addEventListener('change', function (e) {
      var cfg = lockCfg();
      if (e.target.id === 'rvmLang') { store.set('rv_voice_lang', e.target.value); toast('Dictation language saved.', 'success'); }
      else if (e.target.id === 'rvmIdle' && cfg) { cfg.idle = +e.target.value; store.set(LOCK, cfg); toast('Saved.', 'success'); }
      else if (e.target.id === 'rvmBio' && cfg) { cfg.bio = e.target.checked; store.set(LOCK, cfg); toast('Saved.', 'success'); }
    });
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rvm]'); if (!b) return; var k = b.getAttribute('data-rvm');
      if (k === 'pin') askPin(function () { w.RV.closeModal(ov); RVM.openSettings(); });
      else if (k === 'lock-off') { if (confirm('Turn off the app lock?')) { RVM.lockOff(); toast('App lock is off.', 'success'); w.RV.closeModal(ov); RVM.openSettings(); } }
      else if (k === 'outbox') { w.RV.closeModal(ov); RVM.openOutbox(); }
      else if (k === 'alerts') {
        var D = w.RVD; if (!D) { toast('Alerts are not available here.', 'info'); return; } b.disabled = true;
        D.state().then(function (st) {
          if (!st.supported) { toast('This browser cannot show alerts. Use Chrome on Android.', 'info'); return; }
          return (st.on ? D.disable() : D.enable()).then(function () { toast(st.on ? 'Alerts are off on this device.' : 'Alerts are on. New and overdue tickets will buzz this phone, with Reply, Assign and Resolve buttons.', 'success'); b.textContent = st.on ? 'Turn alerts on' : 'Turn alerts off'; });
        }).catch(function (x) { toast(x.message, 'error'); }).then(function () { b.disabled = false; });
      }
    });
    if (w.RVD && w.RVD.state) w.RVD.state().then(function (st) { var ab = ov.querySelector('[data-rvm=alerts]'); if (ab) ab.textContent = !st.supported ? 'Alerts not supported here' : (st.on ? 'Turn alerts off' : 'Turn alerts on'); }).catch(function () {});
    return ov;
  };
  function askPin(done) {
    var ov = w.RV.modal({ title: 'Choose a PIN', body: '<p class="rvm-p">4 to 8 digits. You need it each time the app locks.</p><label class="rvm-lab">New PIN<input id="rvmP1" class="rv-input" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label><label class="rvm-lab">Type it again<input id="rvmP2" class="rv-input" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label><p id="rvmPerr" class="rvm-p rvm-bad" role="alert"></p>', foot: '<button type="button" class="rv-btn rv-btn--primary" id="rvmPsave">Save PIN</button>' });
    var go = async function () {
      var p1 = ov.querySelector('#rvmP1').value, p2 = ov.querySelector('#rvmP2').value, er = ov.querySelector('#rvmPerr');
      if (p1 !== p2) { er.textContent = 'The two PINs are different.'; return; }
      try { await RVM.setPin(p1, { bio: !!native() }); toast('App lock is on.', 'success'); w.RV.closeModal(ov); done && done(); } catch (e) { er.textContent = e.message; }
    };
    ov.querySelector('#rvmPsave').addEventListener('click', go);
    ov.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  /* =====================================================================
     8. Widget: the Android app keeps the signed-in session for the widget (never sent anywhere else)
     ===================================================================== */
  function syncWidget() {
    var N = native(); if (!N || !N.setSession) return;
    var t = ''; try { t = localStorage.getItem('tt_session_token') || ''; } catch (e) {}
    N.setSession({ token: t, base: location.origin }).catch(function () {});
  }
  RVM.syncWidget = syncWidget;

  onApp(function (a) { wrapCalls(a); drawPill(); RVM.flush(false); syncWidget(); });
  w.addEventListener('storage', function (e) { if (e.key === 'tt_session_token') syncWidget(); });
  setInterval(syncWidget, 10 * 60 * 1000);
  w.RVM = RVM;
})(window);
