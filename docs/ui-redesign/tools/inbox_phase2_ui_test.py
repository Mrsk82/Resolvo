"""Inbox 2.0 phase 2 on screen: grouped views list (docked on wide screens, remembered when hidden, slide-over on narrow), counts, Waiting/Following/Archived views,
new filters, search inside messages, bulk read/unread/archive with confirmation, follow, saved views keep every filter. Throwaway copy on :3939 (nothing is emailed).
Run: python docs/ui-redesign/tools/inbox_phase2_ui_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3939; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())

tmp = tempfile.mkdtemp(prefix="rv-p2ui-"); app = os.path.join(tmp, "app")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands"))
    shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    o["brands"][0].setdefault("featureOverrides", {})["INBOX_PLUS_ENABLED"] = True   # the pilot switch, on for this workspace
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    seed = r"""
const D=require(process.argv[1]);const db=new D(process.argv[2]);db.prepare('DELETE FROM tickets').run();{const bc=require(process.argv[3]);const r=db.prepare("SELECT id,data FROM users WHERE json_extract(data,'$.email')='admin@demo.local'").get();const u=JSON.parse(r.data);u.passwordHash=bc.hashSync('demo1234',10);u.mustChangePassword=false;u.firstLogin=false;u.active=true;db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u),r.id);}
const iso=m=>new Date(Date.now()-m*60000).toISOString();
const inc=(id,b,m)=>({id:'M-'+id+'-in',type:'incoming',from:id+'@example.test',fromName:id,body:b,timestamp:iso(m),messageId:'<'+id+'>'});
const out=(id,b,m)=>({id:'M-'+id+'-out',type:'reply',from:'admin@demo.local',fromName:'Admin',body:b,timestamp:iso(m),sentAsEmail:true,deliveryStatus:'sent'});
const mk=(id,o,th)=>({id,subject:'Subject '+id,status:'open',priority:'Medium',from:id.toLowerCase()+'@example.test',fromName:'Customer '+id,createdDate:iso(o.age||60),lastActivity:iso(o.act||60),channel:'email',tags:[],messageIds:[],thread:th,...(o.t||{})});
const T=[mk('A1',{age:300,act:10,t:{sentimentLevel:'negative',priority:'High',isVIP:true,tags:['VIP'],status:'new'}},[inc('A1','My refund has not arrived, this is unacceptable',300)]),
mk('A2',{age:200,act:100,t:{sentimentLevel:'positive'}},[inc('A2','Thanks, the invoice looks great',200),out('A2','Glad to hear it',150)]),
mk('A3',{age:100,act:50,t:{status:'pending',watchers:['admin@demo.local']}},[inc('A3','Can you change my address?',100)]),
mk('A4',{age:500,act:400,t:{status:'resolved'}},[inc('A4','Where is the warranty card?',500),out('A4','It is in the box',450)]),
mk('A6',{age:30,act:5,t:{priority:'High'}},[inc('A6','Fresh question about shipping',30)])];
const ins=db.prepare('INSERT INTO tickets(id,data) VALUES(?,?)');T.forEach(t=>ins.run(t.id,JSON.stringify(t)));db.close();"""
    subprocess.run(["node", "-e", seed, os.path.join(ROOT, "node_modules", "better-sqlite3"), os.path.join(app, "data", "brands", "demo", "db.sqlite"), os.path.join(ROOT, "node_modules", "bcryptjs")], check=True)
build()
env = {k: v for k, v in os.environ.items() if k != "TOPICS_ENABLED"}
env.update(PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    tok = login("admin@demo.local", "demo1234")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(w=1600, h=950):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_inbox_views_hidden');localStorage.removeItem('tt_inbox_filters')}", tok)
            if w < 500: await pg.evaluate("localStorage.setItem('tt_v3b','1')")
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1200)
            await pg.evaluate("App.navigate('ticket-inbox')")
            if w >= 500: await pg.wait_for_selector(".rvi-row", timeout=20000)
            else: await pg.wait_for_timeout(2500)   # phones use their own inbox layout
            await pg.wait_for_timeout(500)
            return pg, errs
        rows = lambda pg: pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.getAttribute('data-ticket-id')).sort()")
        view = lambda pg, v: pg.click(f'[data-act=view][data-view="{v}"]')

        # ---------- wide screen ----------
        pg, errs = await page()
        heads = await pg.evaluate("[...document.querySelectorAll('#rviViews h3')].map(h=>h.textContent.trim())")
        check("views: the groups are Workspace, Priority, Status, Other and Custom views", heads[:4] == ["Workspace", "Priority", "Status", "Other"] and "Custom views" in heads, heads)
        names = await pg.evaluate("[...document.querySelectorAll('#rviViews .rvi-view > span:first-child')].map(s=>s.textContent.trim())")
        want = ["All inbox", "My conversations", "Unassigned", "Following", "Urgent", "High priority", "SLA at risk", "SLA breached", "New", "Open", "Pending", "Waiting for customer", "Resolved", "Closed", "Archived"]
        check("views: every item from the brief is there", all(w in names for w in want), [w for w in want if w not in names])
        box = await pg.evaluate("(()=>{const v=document.getElementById('rviViews').getBoundingClientRect(),l=document.querySelector('.rvi-list').getBoundingClientRect();return {vw:v.width,vx:v.x,lx:l.x,pos:getComputedStyle(document.getElementById('rviViews')).position}})()")
        check("wide screen: the views list sits beside the ticket list, not over it", box["pos"] == "static" and 200 < box["vw"] < 280 and box["lx"] >= box["vx"] + box["vw"] - 2, box)
        cnt = await pg.evaluate("(()=>{const o={};document.querySelectorAll('#rviViews .rvi-view').forEach(b=>{const k=b.getAttribute('data-view'),n=b.querySelector('.rvi-view__n');if(k)o[k]=n?n.textContent.trim():null});return o})()")
        check("counts: Following 1, Waiting for customer 2, High priority 2, Archived 0", cnt.get("following") == "1" and cnt.get("status:waiting") == "2" and cnt.get("high") == "2" and cnt.get("status:archived") == "0", cnt)
        check("counts: real status counts (New 1, Open 2, Pending 1, Resolved 1)", cnt.get("status:new") == "1" and cnt.get("status:open") == "2" and cnt.get("status:pending") == "1" and cnt.get("status:resolved") == "1", cnt)
        await view(pg, "status:waiting"); await pg.wait_for_timeout(700)
        check("view: Waiting for customer lists A2 and A3 and is marked as current", await rows(pg) == ["A2", "A3"] and await pg.get_attribute('[data-view="status:waiting"]', "aria-current") == "true", await rows(pg))
        await view(pg, "following"); await pg.wait_for_timeout(700)
        check("view: Following lists only the ticket I follow", await rows(pg) == ["A3"], await rows(pg))
        await view(pg, "high"); await pg.wait_for_timeout(700)
        check("view: High priority lists open High tickets", await rows(pg) == ["A1", "A6"], await rows(pg))
        await view(pg, "status:open"); await pg.wait_for_timeout(700)
        check("view: Open lists the open tickets", await rows(pg) == ["A2", "A6"], await rows(pg))
        check("view: a sidebar status view does not also show a duplicate status chip", await pg.locator(".rvi-chip").count() == 0)
        await view(pg, "all"); await pg.wait_for_timeout(700)

        # filters
        await pg.click('[data-act=filters]'); await pg.wait_for_selector("#f_sentiment")
        labels = await pg.evaluate("[...document.querySelectorAll('#rviFilters label')].map(l=>l.textContent.trim())")
        check("filters: customer mood, read/unread and VIP are in the filter panel", all(x in labels for x in ["Customer mood", "Read or unread", "Customer"]), labels)
        await pg.select_option("#f_sentiment", "negative"); await pg.wait_for_timeout(800)
        check("filter: negative mood shows only A1, with a chip and an 'Unhappy' marker", await rows(pg) == ["A1"] and "Mood: negative" in await pg.inner_text(".rvi-chips") and "Unhappy" in await pg.inner_text(".rvi-row"), await rows(pg))
        # saved views keep every filter
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept("Unhappy customers")))
        await pg.click('[data-act=save-view]'); await pg.wait_for_timeout(900)
        await pg.click('[data-act=clear]'); await pg.wait_for_timeout(700)
        check("saved view: clearing filters shows everything again", len(await rows(pg)) == 5, await rows(pg))
        await pg.click('[data-act=saved]'); await pg.wait_for_timeout(900)
        check("saved view: applying it brings back the mood filter too", await rows(pg) == ["A1"], await rows(pg))
        await pg.click('[data-act=clear]'); await pg.wait_for_timeout(700)
        await pg.select_option("#f_vip", "1"); await pg.wait_for_timeout(700)
        check("filter: VIP customers only", await rows(pg) == ["A1"], await rows(pg))
        await pg.click('[data-act=clear]'); await pg.wait_for_timeout(700)
        await pg.fill("#ticketSearch", "warranty card"); await pg.wait_for_timeout(1300)
        check("search: words inside a message find the ticket", await rows(pg) == ["A4"], await rows(pg))
        await pg.click('[data-act=clear]'); await pg.wait_for_timeout(700)

        # bulk: read, unread, archive
        await pg.check('.ticket-checkbox[data-ticket-id="A4"]'); await pg.wait_for_timeout(300)
        bar = await pg.inner_text("#ticketBulkBar")
        check("bulk bar: Mark read, Mark unread and Archive are offered", all(x in bar for x in ["Mark read", "Mark unread", "Archive"]), bar)
        await pg.click('[data-act=bulk-unread]'); await pg.wait_for_timeout(900)
        check("bulk: Mark unread makes the row unread", await pg.evaluate("document.querySelector('.rvi-row[data-ticket-id=A4]').classList.contains('is-unread')"))
        await pg.check('.ticket-checkbox[data-ticket-id="A4"]'); await pg.click('[data-act=bulk-archive]'); await pg.wait_for_selector(".rv-overlay")
        check("archive: it asks first and explains what happens", "Archive 1 ticket?" in await pg.inner_text(".rv-overlay") and "comes back by itself" in await pg.inner_text(".rv-overlay"))
        await pg.click("#rviArchOk"); await pg.wait_for_timeout(1200)
        check("archive: the ticket leaves the list and the Archived count becomes 1", "A4" not in await rows(pg) and await pg.inner_text('[data-view="status:archived"] .rvi-view__n') == "1")
        await pg.check('.ticket-checkbox[data-ticket-id="A6"]'); await pg.click('[data-act=bulk-archive]'); await pg.wait_for_timeout(700)
        check("archive: an open ticket cannot be archived; it says so and shows no dialog", await pg.locator(".rv-overlay").count() == 0 and "Only resolved or closed" in await pg.inner_text("body"))
        await pg.click('[data-act=bulk-clear]'); await pg.wait_for_timeout(300)
        await view(pg, "status:archived"); await pg.wait_for_timeout(800)
        check("view: Archived shows the archived ticket, with a 'Move back to inbox' action", await rows(pg) == ["A4"], await rows(pg))
        await pg.check('.ticket-checkbox[data-ticket-id="A4"]'); await pg.wait_for_timeout(300)
        check("archive: in the Archived view the bulk bar offers Move back to inbox", "Move back to inbox" in await pg.inner_text("#ticketBulkBar"))
        await pg.click('[data-act=bulk-unarchive]'); await pg.wait_for_selector(".rv-overlay"); await pg.click("#rviArchOk"); await pg.wait_for_timeout(1200)
        check("unarchive: the ticket is back in the inbox", await pg.inner_text('[data-view="status:archived"] .rvi-view__n') == "0")
        await view(pg, "all"); await pg.wait_for_timeout(700)

        # follow from the conversation
        await pg.evaluate("RVI.open('A6')"); await pg.wait_for_selector(".rvi-conv__head", timeout=15000); await pg.wait_for_timeout(600)
        await pg.evaluate("RVI.toggleFollow()"); await pg.wait_for_timeout(1500)
        check("follow: following a ticket adds it to the Following view", await pg.inner_text('[data-view="following"] .rvi-view__n') == "2")
        await pg.evaluate("RVI.toggleFollow()"); await pg.wait_for_timeout(1500)
        check("follow: stopping removes it again", await pg.inner_text('[data-view="following"] .rvi-view__n') == "1")

        # a long conversation: first message + latest three, the middle folded; system events sit between messages
        import sqlite3, datetime
        con = sqlite3.connect(os.path.join(app, "data", "brands", "demo", "db.sqlite")); now = datetime.datetime.now(datetime.timezone.utc)
        iso = lambda m: (now - datetime.timedelta(minutes=m)).isoformat()
        th = [{"id": f"L{i}", "type": "incoming" if i % 2 == 0 else "reply", "from": "long@example.test", "fromName": "Long Customer", "body": f"Message number {i}", "timestamp": iso(200 - i * 10), **({} if i % 2 == 0 else {"sentAsEmail": True, "deliveryStatus": "sent"})} for i in range(10)]
        tk = {"id": "A7", "subject": "A long one", "status": "open", "priority": "Medium", "from": "long@example.test", "fromName": "Long Customer", "createdDate": iso(210), "lastActivity": iso(5), "channel": "email", "tags": [], "messageIds": [], "thread": th,
              "timeline": [{"event": "assigned", "by": "admin@demo.local", "byName": "Admin User", "at": iso(195 - 5 * 10), "detail": "Assigned to Sam"}, {"event": "email_sent", "by": "admin@demo.local", "at": iso(60), "detail": "Delivered through smtp"}]}
        con.execute("INSERT INTO tickets(id,data) VALUES(?,?)", ("A7", json.dumps(tk))); con.commit(); con.close()
        await pg.evaluate("RVI.refresh()"); await pg.wait_for_timeout(1200)
        await pg.evaluate("RVI.open('A7')"); await pg.wait_for_selector(".rvi-fold", timeout=15000)
        shown = await pg.evaluate("document.querySelectorAll('#rviThread .rvi-msg').length")
        check("long thread: only the first message and the latest three are shown, the rest folded", shown == 4 and "Show 6 earlier messages" in await pg.inner_text(".rvi-fold"), shown)
        check("long thread: system events in the folded part are folded too", await pg.locator("#rviThread .rvi-sys").count() == 0)
        await pg.click(".rvi-fold"); await pg.wait_for_timeout(400)
        check("long thread: one click shows every message", await pg.evaluate("document.querySelectorAll('#rviThread .rvi-msg').length") == 10 and await pg.locator(".rvi-fold").count() == 0)
        order = await pg.evaluate("[...document.querySelectorAll('#rviThread .rvi-msg, #rviThread .rvi-sys')].map(e=>e.classList.contains('rvi-sys')?'sys':'msg')")
        check("timeline: the assignment event appears between messages, in time order, once", order.count("sys") == 1 and 0 < order.index("sys") < len(order) - 1, order)
        check("timeline: delivery events are not repeated (the message shows Delivered)", "Delivered through" not in await pg.inner_text("#rviThread"))
        await pg.evaluate("RVI.open('A6')"); await pg.wait_for_timeout(800)
        check("short thread: nothing is folded", await pg.locator(".rvi-fold").count() == 0)

        # collapse and remember
        await pg.click('[data-act=views-collapse]'); await pg.wait_for_timeout(500)
        check("collapse: the views list hides and the ticket list takes the room", not await pg.locator("#rviViews").is_visible())
        await pg.screenshot(path=os.path.join(SHOTS, "inbox2_collapsed.png"))
        await pg.reload(); await pg.wait_for_selector("#main-app", state="attached", timeout=20000); await pg.wait_for_timeout(1500); await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvi-row", timeout=20000); await pg.wait_for_timeout(800)
        check("collapse: it is still hidden after a reload (remembered)", not await pg.locator("#rviViews").is_visible())
        await pg.click('[data-act=views-panel]'); await pg.wait_for_timeout(500)
        check("collapse: the Views button brings it back", await pg.locator("#rviViews").is_visible())
        await pg.screenshot(path=os.path.join(SHOTS, "inbox2_wide.png"))
        check("page: no script errors", not errs, errs)
        await pg.context.close()

        # ---------- narrower screen: slides over ----------
        pg, errs = await page(1000, 800)
        pos = await pg.evaluate("getComputedStyle(document.getElementById('rviViews')).position")
        check("narrow: the views list slides over instead of taking a column", pos == "absolute", pos)
        await pg.click('[data-act=views-panel]'); await pg.wait_for_timeout(500)
        check("narrow: the Views button opens it", await pg.evaluate("document.getElementById('rvi').classList.contains('rvi--views-open')"))
        await pg.screenshot(path=os.path.join(SHOTS, "inbox2_narrow.png"))
        await pg.context.close()

        # ---------- phone ----------
        pg, errs = await page(390, 844)
        wide = await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
        check("phone: the page does not scroll sideways", wide <= 2, wide)
        await pg.context.close()

        # ---------- pilot switch OFF: the inbox is as it was ----------
        f = os.path.join(app, "data", "owner.json"); oo = json.load(open(f, encoding="utf-8")); oo["brands"][0]["featureOverrides"]["INBOX_PLUS_ENABLED"] = False; json.dump(oo, open(f, "w", encoding="utf-8"))
        pg, errs = await page()
        heads = await pg.evaluate("[...document.querySelectorAll('#rviViews h3')].map(h=>h.textContent.trim())")
        check("switch off: the views list is the old one (Views, Saved views), no Workspace/Priority/Status groups", heads[:1] == ["Views"] and "Workspace" not in heads and "Status" not in heads, heads)
        check("switch off: no docked sidebar (it slides over as before)", await pg.evaluate("getComputedStyle(document.getElementById('rviViews')).position") == "absolute")
        await pg.click('[data-act=filters]'); await pg.wait_for_selector("#f_status")
        check("switch off: no mood / read / VIP filters and the old sort list", await pg.locator("#f_sentiment").count() == 0 and await pg.locator("#f_vip").count() == 0 and "Latest activity" not in await pg.inner_text("#rviFilters"))
        await pg.check('.ticket-checkbox[data-ticket-id="A6"]'); await pg.wait_for_timeout(300)
        check("switch off: the bulk bar has no Archive / Mark read", "Archive" not in await pg.inner_text("#ticketBulkBar") and "Mark read" not in await pg.inner_text("#ticketBulkBar"))
        await pg.click('[data-act=bulk-clear]')
        await pg.evaluate("RVI.open('A7')"); await pg.wait_for_selector(".rvi-conv__head", timeout=15000); await pg.wait_for_timeout(600)
        check("switch off: a long thread is shown in full, with no folding or system lines", await pg.evaluate("document.querySelectorAll('#rviThread .rvi-msg').length") == 10 and await pg.locator(".rvi-fold, .rvi-sys").count() == 0)
        check("switch off: delivery state still shows (the sending fix is for everyone)", "Delivered" in await pg.inner_text("#rviThread"))
        await pg.context.close()
        oo["brands"][0]["featureOverrides"]["INBOX_PLUS_ENABLED"] = True; json.dump(oo, open(f, "w", encoding="utf-8"))
        await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
