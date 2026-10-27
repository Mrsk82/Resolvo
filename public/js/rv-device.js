/* Resolvo on a device: the service worker, "install the app", and alerts on this device (web push).
   Nothing here asks for permission until a person flips the switch. */
(function (w) {
  'use strict';
  var RVD = {}, deferred = null;
  var tok = function () { try { return localStorage.getItem('tt_session_token') || ''; } catch (e) { return ''; } };
  var api = function (path, body) { return fetch(path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'x-session-token': tok() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json(); }); };
  var standalone = function () { return (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || w.navigator.standalone === true; };
  var isIOS = /iphone|ipad|ipod/i.test(w.navigator.userAgent || '');
  var supported = 'serviceWorker' in navigator && 'PushManager' in w && 'Notification' in w;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    w.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
    // a tap on an alert while the app is open
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.open) RVD.open(e.data.open); });
  }
  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; var b = document.getElementById('rvdInstall'); if (b) b.hidden = false; });
  w.addEventListener('appinstalled', function () { deferred = null; var b = document.getElementById('rvdInstall'); if (b) b.hidden = true; });

  // open a ticket from a link like /?open=TKT-123 (used by alerts)
  RVD.open = function (url) {
    var m = /[?&]open=([^&]+)/.exec(String(url || '')); if (!m) return;
    var id = decodeURIComponent(m[1]).replace(/[^A-Za-z0-9_-]/g, '');
    if (id && typeof App !== 'undefined' && App._openInInbox) App._openInInbox(id);   // App is a script-level constant, not on window
  };
  RVD.deepLink = function () {
    if (!/[?&]open=/.test(location.search)) return;
    var tries = 0, t = setInterval(function () {
      if (typeof App !== 'undefined' && App.currentUser && App._openInInbox) { clearInterval(t); RVD.open(location.search); try { history.replaceState(null, '', '/'); } catch (e) {} }
      else if (++tries > 40) clearInterval(t);
    }, 500);
  };
  RVD.deepLink();

  function b64ToBytes(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  RVD.state = async function () {
    var cfg = await api('/api/push/config').catch(function () { return null; });
    var reg = supported ? await navigator.serviceWorker.getRegistration().catch(function () { return null; }) : null;
    var sub = reg ? await reg.pushManager.getSubscription().catch(function () { return null; }) : null;
    return { supported: supported, serverOn: !!(cfg && cfg.enabled), key: cfg && cfg.publicKey, on: !!sub && !!(cfg && cfg.subscribed), permission: supported ? Notification.permission : 'unsupported', standalone: standalone(), ios: isIOS };
  };
  RVD.enable = async function () {
    var st = await RVD.state(); if (!st.serverOn) throw new Error('Alerts on devices are not available on this server.');
    var perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(st.key) });
    var r = await api('/api/push/subscribe', { subscription: sub.toJSON() }); if (!r || !r.success) throw new Error((r && r.error) || 'Could not turn on alerts.');
  };
  RVD.disable = async function () {
    var reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  };
  RVD.install = async function () { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; var b = document.getElementById('rvdInstall'); if (b) b.hidden = true; };

  // the card shown in Settings > My Notifications
  RVD.card = function () {
    return '<div class="rvs-sec"><div class="rvs-sec__t">Alerts on this device</div><div id="rvdBox"><span class="rv-hint">Checking...</span></div></div>';
  };
  RVD.fill = async function () {
    var box = document.getElementById('rvdBox'); if (!box) return;
    var st = await RVD.state(), esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var row = function (l, d, r) { return '<div class="rvs-row"><div class="rvs-row__l"><b>' + l + '</b><span>' + d + '</span></div><div class="rvs-row__r">' + r + '</div></div>'; };
    var html = '';
    if (!st.supported || (st.ios && !st.standalone)) html += row('Alerts', st.ios && !st.standalone ? 'On iPhone and iPad, first add Resolvo to your Home Screen (Share, then Add to Home Screen), then open it from there to turn alerts on.' : 'This browser does not support alerts.', '');
    else if (!st.serverOn) html += row('Alerts', 'Not available on this server yet.', '');
    else html += row('Alert me on this device', 'A notification when a ticket is assigned to you, or is close to or past its target time.', '<label class="switch" style="display:inline-flex"><input type="checkbox" id="rvdPush"' + (st.on ? ' checked' : '') + ' aria-label="Alerts on this device"></label>') +
      (st.on ? row('Send a test alert', 'Check that it reaches this device.', '<button type="button" class="rv-btn rv-btn--sm" id="rvdTest">Send test</button>') : '');
    html += row('Install Resolvo as an app', st.standalone ? 'You are already using the installed app.' : 'Opens in its own window and from your home screen.', st.standalone ? '' : '<button type="button" class="rv-btn rv-btn--sm" id="rvdInstall"' + (deferred ? '' : ' hidden') + '>Install</button>' + (deferred ? '' : '<span class="rv-hint">Use your browser menu: Install app / Add to Home Screen</span>'));
    box.innerHTML = html;
    var sw = document.getElementById('rvdPush');
    if (sw) sw.onchange = async function () {
      sw.disabled = true;
      try { if (sw.checked) await RVD.enable(); else await RVD.disable(); if (w.RV) RV.toast(sw.checked ? 'Alerts are on for this device' : 'Alerts are off for this device', 'success'); }
      catch (e) { sw.checked = !sw.checked; if (w.RV) RV.toast(e.message || 'That did not work', 'error'); }
      sw.disabled = false; RVD.fill();
    };
    var t = document.getElementById('rvdTest'); if (t) t.onclick = async function () { var r = await api('/api/push/test', {}); if (w.RV) RV.toast(r && r.sent ? 'Test alert sent' : 'Nothing was sent. Turn alerts off and on again.', r && r.sent ? 'success' : 'error'); };
    var ib = document.getElementById('rvdInstall'); if (ib) ib.onclick = RVD.install;
  };
  w.RVD = RVD;
})(window);
