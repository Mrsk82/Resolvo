"""Phone extras: outbox for replies written offline, saved drafts, dictation, photos/files, replies by situation, order reply text,
app lock (PIN and fingerprint through the Android bridge), Today cards, customer contact icons, alert action buttons, widget numbers.
Runs a throwaway copy of the app on :3922 (demo workspace; MAIL_CAPTURE keeps email in a file). Run: python docs/ui-redesign/tools/phone_plus_test.py"""
import asyncio, base64, hashlib, hmac, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3922; BASE = f"http://localhost:{PORT}"; SECRET = "test-secret-for-phone-plus"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def http(path, tok=None, body=None, raw=False):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    try: r = urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=60); code = r.status; txt = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e: code = e.code; txt = e.read().decode("utf-8", "replace")
    if raw: return code, txt
    try: return json.loads(txt)
    except Exception: return {"_status": code, "_text": txt[:200]}
tmp = tempfile.mkdtemp(prefix="rv-ph-"); app = os.path.join(tmp, "app"); mailf = os.path.join(tmp, "mail.jsonl")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands")); shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8")); o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=mailf, EMAIL_ENABLED="", APP_SECRET=SECRET, BACKUP_DIR=os.path.join(tmp, "bk"))
srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def token_for(slug, email, ticket, age_ms=0, secret=SECRET):
    b = base64.urlsafe_b64encode(json.dumps({"k": "push", "s": slug, "e": email, "t": ticket, "ts": int(time.time() * 1000) - age_ms}, separators=(",", ":")).encode()).rstrip(b"=").decode()
    return b + "." + base64.urlsafe_b64encode(hmac.new(secret.encode(), b.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
NATIVE = """window.__nat={calls:[],bio:localStorage.getItem('__nobio')!=='1'};window.Capacitor={isNativePlatform:()=>true,Plugins:{ResolvoNative:{
 biometric:async()=>{window.__nat.calls.push('bio');if(!window.__nat.bio)throw new Error('cancelled');return{ok:true}},
 speechStart:async(o)=>{window.__nat.calls.push('speech:'+o.lang);return{text:'native words'}},speechStop:async()=>{},
 setSession:async(o)=>{window.__nat.calls.push('session');window.__nat.session=o}}}};"""
SPEECH = """window.SpeechRecognition=window.webkitSpeechRecognition=class{start(){const s=this;setTimeout(()=>{s.onresult&&s.onresult({resultIndex:0,results:{length:1,0:{isFinal:true,length:1,0:{transcript:'hello from voice'}}}})},60)}stop(){this.onend&&this.onend()}};"""

async def main():
    for _ in range(80):
        try: http("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    adm = http("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})["token"]
    rpc = lambda fn, *a, tok=None: http("/api/call", tok or adm, {"fn": fn, "args": list(a)})
    tickets = rpc("getTickets", {"status": "all", "limit": 300, "sort": "newest"}).get("tickets", [])
    mail_t = [t for t in tickets if t.get("channel") in ("email", "web", None, "") and str(t.get("status")) not in ("resolved", "closed")]
    tid = (mail_t[0] if mail_t else tickets[0])["id"]

    # ---------- server pieces ----------
    c, _ = http("/api/widget-summary", None, None, raw=True)
    check("widget: needs a signed-in session", c == 401)
    w = http("/api/widget-summary", adm)
    check("widget: gives open, mine, overdue and due-soon counts", w["success"] and all(isinstance(w[k], int) for k in ("open", "mine", "unassigned", "overdue", "soon")) and w["open"] >= w["mine"], w)
    r = rpc("uploadFile", "evil.html", "text/html", base64.b64encode(b"<script>1</script>").decode())
    check("upload: an .html file is refused", r.get("success") is False and "cannot be uploaded" in r.get("error", ""), r)
    r = rpc("uploadFile", "x.svg", "image/svg+xml", base64.b64encode(b"<svg/>").decode())
    check("upload: an .svg file is refused", r.get("success") is False, r)
    r = rpc("uploadFile", "photo.PNG", "image/png", base64.b64encode(PNG).decode())
    code, body = http(r.get("url", "/none"), None, None, raw=True) if r.get("success") else (0, "")
    check("upload: a photo is accepted and served", r.get("success") is True and code == 200, r)
    code, j = http("/api/push-action", None, {"token": "nope", "action": "assign"}, raw=True)
    check("alert buttons: a made-up token is refused", code == 401, j)
    bad = token_for("demo", "admin@demo.local", tid, secret="other-secret")
    check("alert buttons: a token signed with another secret is refused", http("/api/push-action", None, {"token": bad, "action": "assign"}, raw=True)[0] == 401)
    old = token_for("demo", "admin@demo.local", tid, age_ms=25 * 3600 * 1000)
    check("alert buttons: a token older than 24 hours is refused", http("/api/push-action", None, {"token": old, "action": "assign"}, raw=True)[0] == 401)
    good = token_for("demo", "admin@demo.local", tid)
    r = http("/api/push-action", None, {"token": good, "action": "assign"})
    t_after = rpc("getTicketById", tid).get("ticket", {})
    check("alert buttons: 'Assign to me' assigns the ticket", r.get("success") is True and str(t_after.get("assignedTo", "")).lower() == "admin@demo.local", [r, t_after.get("assignedTo")])
    r = http("/api/push-action", None, {"token": good, "action": "reply", "text": ""})
    check("alert buttons: an empty reply is refused", r.get("success") is False)
    r = http("/api/push-action", None, {"token": good, "action": "dance"})
    check("alert buttons: an unknown action is refused", r.get("success") is False)
    r = http("/api/push-action", None, {"token": good, "action": "reply", "text": "Reply typed on the alert"})
    th = [m.get("body") or m.get("text") or "" for m in rpc("getTicketById", tid).get("ticket", {}).get("thread", [])]
    check("alert buttons: 'Reply' sends the typed text through the normal reply path", r.get("success") is True and any("Reply typed on the alert" in x for x in th), [r, th[-2:]])
    r = http("/api/push-action", None, {"token": good, "action": "resolve"})
    check("alert buttons: 'Resolve' resolves the ticket", r.get("success") is True and rpc("getTicketById", tid)["ticket"]["status"] == "resolved", r)
    rpc("updateTicketStatus", tid, "open")
    ghost = token_for("demo", "nobody@demo.local", tid)
    check("alert buttons: a token for someone who is not in the workspace is refused", http("/api/push-action", None, {"token": ghost, "action": "assign"}).get("success") is False)
    src = open(os.path.join(ROOT, "server.js"), encoding="utf-8").read(); sw = open(os.path.join(ROOT, "public", "sw.js"), encoding="utf-8").read()
    check("alert buttons: alerts about a ticket carry Reply, Assign and Resolve, and the service worker acts on them", "actionToken" in src and "PUSH_ACTIONS" in src and "e.reply" in sw and "/api/push-action" in sw and "actions: Array.isArray" in sw)
    check("owner: the Owner Console is linked from the owner Tools menu", "Owner Console" in open(os.path.join(ROOT, "public", "index.html"), encoding="utf-8").read())

    # ---------- screens ----------
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome")
        async def phone(init=None, w_=390, h_=844):
            ctx = await br.new_context(viewport={"width": w_, "height": h_}, is_mobile=True, has_touch=True, device_scale_factor=2, accept_downloads=True)
            if init:
                for s in init: await ctx.add_init_script(s)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}", adm)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvf-stat", timeout=20000); await pg.wait_for_timeout(500)
            return ctx, pg, errs
        async def open_ticket(pg, id_):
            await pg.click('.rvf-tabs [data-tab=all]'); await pg.wait_for_timeout(300)
            await pg.click(f'.rvf-item[data-ticket-id="{id_}"]'); await pg.wait_for_selector("#replyText", state="attached", timeout=15000)
            if await pg.locator(".rvp-bar__input").first.is_visible(): await pg.click(".rvp-bar__input")
            await pg.wait_for_selector("#replyText"); await pg.wait_for_timeout(400)

        # ----- Today cards -----
        ctx, pg, errs = await phone()
        cards = await pg.locator(".rvf-stat").all_inner_texts()
        check("today: five cards: Needs you now, Overdue, Due soon, Waiting, Resolved today", len(cards) == 5 and [c.split("\n")[0] for c in cards][:3] == ["Needs you now", "Overdue", "Due soon"], cards)
        cols = await pg.evaluate("getComputedStyle(document.querySelector('.rvf-stats')).gridTemplateColumns.split(' ').length")
        check("today: two cards across on a phone, no sideways scroll", cols == 2 and await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), cols)
        n_over = int((await pg.locator('.rvf-stat[data-tab=overdue] b').inner_text()).strip())
        await pg.click('.rvf-stat[data-tab=overdue]'); await pg.wait_for_timeout(300)
        shown = await pg.locator(".rvf-item").count()
        check("today: tapping Overdue lists exactly the overdue tickets", shown == n_over, [shown, n_over])
        await pg.click('.rvf-stat[data-tab=soon]'); await pg.wait_for_timeout(300)
        n_soon = int((await pg.locator('.rvf-stat[data-tab=soon] b').inner_text()).strip())
        check("today: tapping Due soon lists exactly those tickets", await pg.locator(".rvf-item").count() == n_soon)
        await pg.click('.rvf-stat[data-tab=needs]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, "phone_today.png"))

        # ----- composer tools, situations -----
        await open_ticket(pg, tid)
        tools = await pg.locator(".rvm-tool").all_inner_texts()
        check("composer: Dictate, Photo, File and Replies buttons sit under the reply box", [t.strip() for t in tools] == ["Dictate", "Photo", "File", "Replies"], tools)
        check("composer: the buttons are easy to tap (at least 34 px high)", await pg.evaluate("[...document.querySelectorAll('.rvm-tool')].every(b=>b.getBoundingClientRect().height>=34)"))
        await pg.click('[data-rvm-tool=tpl]'); await pg.wait_for_selector(".rvm-tpl")
        cats = await pg.locator(".rvm-chip").all_inner_texts()
        check("situations: grouped (Order status, Refund / return, Sorry for the delay, Follow up, Thanks and close, My saved replies)", cats == ["Order status", "Refund / return", "Sorry for the delay", "Follow up", "Thanks and close", "My saved replies"], cats)
        await pg.click('.rvm-tpl[data-i="0"]'); await pg.wait_for_timeout(300)
        txt = await pg.input_value("#replyText")
        check("situations: the reply is filled in with a name and your name, nothing left as {{...}}", txt.startswith("Hi ") and "{{" not in txt and "Regards" in txt, txt[:200])
        await pg.screenshot(path=os.path.join(SHOTS, "phone_composer.png"))

        # ----- drafts survive a reload -----
        await pg.fill("#replyText", "Half written reply about the refund"); await pg.wait_for_timeout(700)
        await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvf-stat"); await open_ticket(pg, tid)
        check("drafts: an unsent reply is back after the app is reopened", "Half written reply about the refund" in await pg.input_value("#replyText"))

        # ----- offline outbox -----
        await pg.fill("#replyText", "Written with no signal"); await pg.wait_for_timeout(300)
        await ctx.set_offline(True); await pg.wait_for_timeout(300)
        await pg.click("#rviSend, #rvfSend, [data-act=send]")
        await pg.wait_for_selector(".rvm-pill", timeout=8000)
        check("outbox: sending with no signal saves it and shows how many are waiting", "1 message waiting" in await pg.inner_text(".rvm-pill") and await pg.input_value("#replyText") == "", await pg.inner_text(".rvm-pill"))
        before = [m.get("body") or m.get("text") or "" for m in rpc("getTicketById", tid).get("ticket", {}).get("thread", [])]
        await pg.screenshot(path=os.path.join(SHOTS, "phone_outbox.png"))
        await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))")
        await pg.wait_for_function("!document.querySelector('.rvm-pill')", timeout=15000)
        after = [m.get("body") or m.get("text") or "" for m in rpc("getTicketById", tid).get("ticket", {}).get("thread", [])]
        check("outbox: when the signal returns it is sent by itself, once", not any("Written with no signal" in x for x in before) and sum("Written with no signal" in x for x in after) == 1, after[-3:])
        r = await pg.evaluate("""async()=>{const a=App;await new Promise(r=>setTimeout(r,200));return a._rvmRaw?true:false}""")
        check("outbox: the app's call function is wrapped once", r is True)
        await ctx.set_offline(True)
        q = await pg.evaluate("App.callAsync('createManualTicket',{subject:'Made offline',description:'x',customerEmail:'off@example.com',customerName:'Off Line',priority:'Medium',channel:'email'})")
        await pg.wait_for_selector(".rvm-pill")
        check("outbox: a new ticket written offline is saved too", q.get("queued") is True and "1 message" in await pg.inner_text(".rvm-pill"), q)
        await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))"); await pg.wait_for_function("!document.querySelector('.rvm-pill')", timeout=15000)
        subs = [t.get("subject") for t in rpc("getTickets", {"status": "all", "limit": 300, "sort": "newest"}).get("tickets", [])]
        check("outbox: and the ticket is created when the signal returns", "Made offline" in subs, subs[:5])
        await ctx.set_offline(True)
        await pg.evaluate("App.callAsync('replyToTicket','"+tid+"','will be discarded',false)"); await pg.wait_for_selector(".rvm-pill"); await pg.click(".rvm-pill"); await pg.wait_for_selector(".rvm-row")
        check("outbox: the list shows what is waiting", "will be discarded" in await pg.inner_text(".rvm-row"))
        await pg.click('[data-rvm=discard]'); await pg.wait_for_function("!document.querySelector('.rvm-pill')")
        check("outbox: a waiting message can be discarded", await pg.evaluate("JSON.parse(localStorage.getItem('rv_outbox')||'[]').length")==0)
        await ctx.set_offline(False)
        check("outbox/drafts: no script errors", not errs, errs)
        await ctx.close()

        # ----- dictation (browser speech) -----
        ctx, pg, errs = await phone([SPEECH]); await open_ticket(pg, tid)
        await pg.fill("#replyText", "Hello"); await pg.click('[data-rvm-tool=mic]'); await pg.wait_for_function("document.getElementById('replyText').value.includes('hello from voice')", timeout=5000)
        check("dictation: spoken words are added to the reply box", "Hello hello from voice" in await pg.input_value("#replyText"), await pg.input_value("#replyText"))
        await ctx.close()

        # ----- the Android bridge: native dictation, fingerprint lock, widget session -----
        ctx, pg, errs = await phone([NATIVE]); await open_ticket(pg, tid)
        await pg.click('[data-rvm-tool=mic]'); await pg.wait_for_function("document.getElementById('replyText').value.includes('native words')", timeout=5000)
        calls = await pg.evaluate("window.__nat.calls")
        check("android: dictation goes through the app's own speech service, in the chosen language", "speech:en-IN" in calls, calls)
        check("android: the signed-in session is handed to the widget", "session" in calls and (await pg.evaluate("window.__nat.session.base")).startswith("http"), calls)
        await pg.evaluate("RVM.openSettings()"); await pg.wait_for_selector(".rvm-set")
        await pg.select_option("#rvmLang", "hi-IN")
        check("settings: the dictation language is remembered", await pg.evaluate("JSON.parse(localStorage.getItem('rv_voice_lang'))") == "hi-IN")
        await pg.click('[data-rvm=pin]'); await pg.wait_for_selector("#rvmP1"); await pg.fill("#rvmP1", "2468"); await pg.fill("#rvmP2", "2468"); await pg.click("#rvmPsave"); await pg.wait_for_timeout(700)
        cfg = await pg.evaluate("JSON.parse(localStorage.getItem('rv_lock'))")
        check("lock: the PIN is stored only as a salted hash, with fingerprint on in the app", cfg["on"] and cfg["bio"] and "2468" not in json.dumps(cfg) and len(cfg["hash"]) == 64, cfg)
        await pg.evaluate("sessionStorage.clear()"); await pg.reload(); await pg.wait_for_selector(".rvm-lock", timeout=10000)   # closing and reopening the app starts a new session
        await pg.wait_for_function("window.__nat.calls.includes('bio')", timeout=5000)
        await pg.wait_for_function("!document.querySelector('.rvm-lock')", timeout=8000)
        check("lock: on opening, the fingerprint prompt appears and unlocks the app", True)
        await pg.evaluate("localStorage.setItem('__nobio','1')"); await pg.evaluate("sessionStorage.clear()"); await pg.reload(); await pg.wait_for_selector(".rvm-lock")
        await pg.wait_for_timeout(900)
        check("lock: if the fingerprint is cancelled, the PIN pad stays", await pg.locator(".rvm-lock").is_visible() and "PIN" in await pg.inner_text("#rvmLockMsg"))
        for d in "1111": await pg.click(f'.rvm-key[data-k="{d}"]')
        await pg.wait_for_timeout(900)
        check("lock: a wrong PIN is refused with the tries left", "Wrong PIN" in await pg.inner_text("#rvmLockMsg") and "9 tries left" in await pg.inner_text("#rvmLockMsg"), await pg.inner_text("#rvmLockMsg"))
        shown = await pg.evaluate("[...document.body.children].filter(e=>!e.classList.contains('rvm-lock')&&getComputedStyle(e).display!=='none').map(e=>e.tagName+'#'+e.id)")
        check("lock: nothing of the app is drawn behind the lock", not shown, shown)
        await pg.screenshot(path=os.path.join(SHOTS, "phone_lock.png"))
        for d in "2468": await pg.click(f'.rvm-key[data-k="{d}"]')
        await pg.wait_for_function("!document.querySelector('.rvm-lock')", timeout=8000)
        check("lock: the right PIN opens the app", await pg.locator("#app").is_visible() and await pg.locator(".rvm-lock").count() == 0)
        await pg.evaluate("""()=>{const c=JSON.parse(localStorage.getItem('rv_lock'));c.idle=0;localStorage.setItem('rv_lock',JSON.stringify(c));
          Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));}""")
        await pg.wait_for_selector(".rvm-lock", timeout=5000)
        check("lock: leaving the app and coming back locks it again (when set to every time)", True)
        for _ in range(5):   # one attempt at a time: each PIN is checked (about 0.1 s) before the next one is typed
            for d in "9999": await pg.click(f'.rvm-key[data-k="{d}"]')
            await pg.wait_for_timeout(700)
        cfg = await pg.evaluate("JSON.parse(localStorage.getItem('rv_lock'))")
        check("lock: five wrong PINs in a row make you wait before trying again", "Wait" in await pg.inner_text("#rvmLockMsg") or cfg.get("until"), [cfg.get("fails"), await pg.inner_text("#rvmLockMsg")])
        await pg.evaluate("()=>{const c=JSON.parse(localStorage.getItem('rv_lock'));c.fails=9;delete c.until;localStorage.setItem('rv_lock',JSON.stringify(c))}")
        for d in "9999": await pg.click(f'.rvm-key[data-k="{d}"]')
        await pg.wait_for_timeout(2500)
        check("lock: the tenth wrong PIN signs the phone out", await pg.evaluate("localStorage.getItem('tt_session_token')") in (None, "") and await pg.evaluate("localStorage.getItem('rv_lock')") is None)
        await ctx.close()

        # ----- attachments -----
        ctx, pg, errs = await phone(); await open_ticket(pg, tid)
        async with pg.expect_file_chooser() as fc: await pg.click('[data-rvm-tool=photo]')
        ch = await fc.value
        check("photo: the Photo button opens the camera / photo chooser", ch.is_multiple() is False)
        open(os.path.join(tmp, "dot.png"), "wb").write(PNG); await ch.set_files(os.path.join(tmp, "dot.png"))
        await pg.wait_for_function("document.getElementById('replyText').value.includes('/uploads/')", timeout=15000)
        val = await pg.input_value("#replyText"); link = val.split(": ")[-1].strip().split()[0]
        code, _b = http(link.replace(BASE, ""), None, None, raw=True)
        check("photo: it is uploaded and a link is added to the reply, and the link works", val.startswith("📎 dot.png: ") and code == 200, [val, code])
        async with pg.expect_file_chooser() as fc2: await pg.click('[data-rvm-tool=file]')
        check("file: the File button opens the file chooser (several files allowed)", (await fc2.value).is_multiple() is True)
        await ctx.set_offline(True); await pg.evaluate("document.getElementById('replyText').value=''")
        async with pg.expect_file_chooser() as fc3: await pg.click('[data-rvm-tool=photo]')
        await (await fc3.value).set_files(os.path.join(tmp, "dot.png")); await pg.wait_for_timeout(600)
        check("photo: with no signal it says so and adds nothing", "/uploads/" not in await pg.input_value("#replyText"))
        await ctx.set_offline(False)
        # order reply text
        txts = await pg.evaluate("""()=>{const o=(x)=>Object.assign({name:'#1042',currency:'INR',items:[{qty:2,title:'Blue kurta'}]},x);
          return {ship:RVM.orderText(o({fulfillment:'fulfilled',tracking:[{company:'Delhivery',number:'DL123',url:'https://t.example/DL123'}]}),'Asha'),
                  none:RVM.orderText(o({fulfillment:'unfulfilled'}),'Asha'), canc:RVM.orderText(o({cancelled:true,refunded:499}),'Asha'),
                  part:RVM.orderText(o({fulfillment:'partial',tracking:[{number:'P9'}]}),'Asha'), pend:RVM.orderText(o({fulfillment:'unfulfilled',paymentStatus:'pending'}),'Asha')}}""")
        check("order reply: shipped orders get the courier, tracking number and link", "Delhivery" in txts["ship"] and "DL123" in txts["ship"] and "https://t.example/DL123" in txts["ship"] and txts["ship"].startswith("Hi Asha"))
        check("order reply: not shipped, cancelled, partly shipped and unpaid orders each say the right thing", "has not shipped yet" in txts["none"] and "cancelled" in txts["canc"] and "refunded" in txts["canc"] and "rest will follow" in txts["part"] and "waiting for the payment" in txts["pend"])
        check("order reply: no placeholder is left in any of them", not any("{{" in v for v in txts.values()) and all("1042" in v for v in txts.values()))
        await pg.evaluate("""()=>{RVO._res.kk={orders:[{name:'#7',currency:'INR',items:[],fulfillment:'fulfilled',tracking:[{company:'Bluedart',number:'B77',url:'https://t.example/B77'}]}]};
          document.body.insertAdjacentHTML('beforeend','<button id="tmpDraft" data-rvo="draft" data-key="kk" data-i="0">x</button>');}""")
        await pg.evaluate("document.getElementById('replyText').value=''"); await pg.evaluate("document.getElementById('tmpDraft').click()")
        check("order reply: the 'Write the reply' button puts the reply in the box", "B77" in await pg.input_value("#replyText"))
        check("order reply: order cards offer 'Write the reply' and 'Add details'", await pg.evaluate("(()=>{const h=RVO.card({name:'#1',items:[],currency:'INR'},'k',0,true);return h.includes('data-rvo=\"draft\"')&&h.includes('Write the reply')&&h.includes('Add details')})()"))
        await ctx.close()

        # ----- customers: call and WhatsApp -----
        ctx, pg, errs = await phone()
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_selector(".cust-row"); await pg.wait_for_timeout(500)
        n_acts = await pg.locator(".cust-row .cust-acts").count()
        if n_acts == 0:   # demo customers may have no phone: create a ticket from a phone number so a customer with one exists
            rpc("createManualTicket", {"subject": "Phone customer", "description": "x", "customerName": "Phone Person", "customerEmail": "phone.person@example.com", "customerPhone": "+91 98765 43210", "priority": "Medium", "channel": "email"})
            await pg.evaluate("App._custReload()"); await pg.wait_for_timeout(900); n_acts = await pg.locator(".cust-row .cust-acts").count()
        check("customers: rows with a phone number show Call and WhatsApp", n_acts >= 1 and await pg.locator(".cust-row .cust-acts a.call").first.is_visible(), n_acts)
        href = await pg.get_attribute(".cust-acts a.call", "href"); wa = await pg.get_attribute(".cust-acts a.wa", "href")
        check("customers: the links are a real phone call and a WhatsApp chat", href.startswith("tel:+") and wa.startswith("https://wa.me/"), [href, wa])
        h0 = await pg.evaluate("location.hash + App.currentPage")
        await pg.evaluate("document.querySelector('.cust-acts a.wa').addEventListener('click',e=>e.preventDefault())")
        await pg.click(".cust-acts a.wa"); await pg.wait_for_timeout(300)
        check("customers: tapping Call or WhatsApp does not also open the customer", await pg.evaluate("location.hash + App.currentPage") == h0)
        check("customers: nothing sticks out sideways", await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"))
        await pg.screenshot(path=os.path.join(SHOTS, "phone_customers.png"))
        await ctx.close()
        dctx = await br.new_context(viewport={"width": 1280, "height": 800}); dpg = await dctx.new_page()
        await dpg.goto(BASE + "/"); await dpg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo')}", adm); await dpg.goto(BASE + "/")
        await dpg.wait_for_timeout(2500); await dpg.evaluate("App.navigate('customers')"); await dpg.wait_for_selector(".cust-row")
        check("customers: on a computer the extra buttons stay hidden", await dpg.locator(".cust-row .cust-acts").first.is_hidden() if await dpg.locator(".cust-row .cust-acts").count() else True)
        await dctx.close()

        # ----- settings sheet and menu -----
        ctx, pg, errs = await phone()
        await pg.evaluate("document.getElementById('topbarHamburger') && document.getElementById('topbarHamburger').click()"); await pg.wait_for_timeout(500)
        item = pg.locator('.nav-item:has-text("Phone & app")')
        check("settings: 'Phone & app' is in the app menu", await item.count() >= 1)
        await pg.evaluate("RVM.openSettings()"); await pg.wait_for_selector(".rvm-set")
        txt = await pg.inner_text(".rvm-set")
        check("settings: lock, dictation, waiting messages, alerts and widget sections", all(k in txt for k in ["App lock", "Dictation", "Messages waiting to send", "Alerts and widget"]), txt[:200])
        check("settings: the sheet fits on the phone", await pg.evaluate("(()=>{const r=document.querySelector('.rv-modal').getBoundingClientRect();return r.left>=0&&r.right<=391})()"))
        await pg.screenshot(path=os.path.join(SHOTS, "phone_settings.png"))
        check("settings: no script errors", not errs, errs)
        await ctx.close(); await br.close()

async def run():
    try: await main()
    finally:
        srv.terminate(); time.sleep(0.8)
        try: os.rmdir(os.path.join(app, "node_modules"))   # removes only the link, never the real folder
        except OSError: pass
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed"); sys.exit(1 if FAIL else 0)
asyncio.run(run())
