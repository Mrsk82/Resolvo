"""New look (pilot) on screen: tidier top bar, foldable sidebar, inbox without the duplicate tabs, "Waiting 3 h" on rows, today's queue and setup checklist in the empty panel,
"Connect email" chip instead of the banner, reply tools under one More button, import offered in the empty inbox. And with the pilot switch OFF: nothing of it.
Throwaway copy on :3943 (nothing is emailed). Run: python docs/ui-redesign/tools/ui_polish_ui_test.py"""
import asyncio, json, os, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request, datetime
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3943; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
tmp = tempfile.mkdtemp(prefix="rv-polish-"); app = os.path.join(tmp, "app"); DB = os.path.join(app, "data", "brands", "demo", "db.sqlite")
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
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8")); o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    o["brands"][0].setdefault("featureOverrides", {})["INBOX_PLUS_ENABLED"] = True
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    seed = r"""
const D=require(process.argv[1]),bc=require(process.argv[3]);const db=new D(process.argv[2]);db.prepare('DELETE FROM tickets').run();
const h=bc.hashSync('demo1234',10);
for(const r of db.prepare('SELECT id,data FROM users').all()){const u=JSON.parse(r.data);if(u.email==='admin@demo.local'){u.passwordHash=h;u.mustChangePassword=false;u.firstLogin=false;db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u),r.id);}}
const iso=m=>new Date(Date.now()-m*60000).toISOString();
const inc=(id,b,m)=>({id:'M-'+id+'-in',type:'incoming',from:id+'@example.test',fromName:id,body:b,timestamp:iso(m),messageId:'<'+id+'>'});
const out=(id,b,m)=>({id:'M-'+id+'-out',type:'reply',from:'admin@demo.local',fromName:'Admin',body:b,timestamp:iso(m),sentAsEmail:true,deliveryStatus:'sent'});
const mk=(id,s,age,th,extra)=>({id,subject:s,status:'open',priority:'Medium',from:id.toLowerCase()+'@example.test',fromName:'Customer '+id,createdDate:iso(age),lastActivity:iso(age),channel:'email',tags:[],messageIds:[],thread:th,...(extra||{})});
const T=[mk('W1','Refund still not received',1800,[inc('W1','Where is my refund?',1800)]),mk('W2','Question about invoice',5,[inc('W2','Can I get a GST invoice?',5)]),mk('W3','Thanks for the help',300,[inc('W3','Hi',320),out('W3','Done',300)])];
const ins=db.prepare('INSERT INTO tickets(id,data) VALUES(?,?)');T.forEach(t=>ins.run(t.id,JSON.stringify(t)));db.close();"""
    subprocess.run(["node", "-e", seed, os.path.join(ROOT, "node_modules", "better-sqlite3"), DB, os.path.join(ROOT, "node_modules", "bcryptjs")], check=True)
build()
env = {k: v for k, v in os.environ.items() if k != "TOPICS_ENABLED"}
env.update(PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)
def set_flag(on):
    f = os.path.join(app, "data", "owner.json"); o = json.load(open(f, encoding="utf-8")); o["brands"][0]["featureOverrides"]["INBOX_PLUS_ENABLED"] = on; json.dump(o, open(f, "w", encoding="utf-8"))

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    tok = login("admin@demo.local", "demo1234")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(w=1600, h=950, keep=False):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_inbox_filters');localStorage.removeItem('tt_nav_fold');localStorage.removeItem('tt_inbox_views_hidden');localStorage.removeItem('onb_hidden_demo')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
            await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvi-row, .rv-empty", timeout=20000); await pg.wait_for_timeout(800)
            return pg, errs
        vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}');return !!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'}})()")

        # ================= pilot ON =================
        pg, errs = await page()
        check("body: the new-look class is on", await pg.evaluate("document.body.classList.contains('rv-plus')"))
        # top bar
        check("top bar: the separate SLA count badge is gone (the bell carries it)", not await vis(pg, "#slaAlert"))
        check("top bar: the duplicate search icon is gone, the search box stays", not await vis(pg, '.topbar-icon-group [aria-label="Open search"]') and await vis(pg, "#shellSearch"))
        w0 = await pg.evaluate("document.getElementById('aiBarWrap').getBoundingClientRect().width")
        check("top bar: the AI box is compact and says 'Ask AI'", w0 <= 200 and await pg.get_attribute("#aiBar", "placeholder") == "Ask AI", w0)
        await pg.focus("#aiBar"); await pg.wait_for_timeout(400)
        w1 = await pg.evaluate("document.getElementById('aiBarWrap').getBoundingClientRect().width")
        check("top bar: it opens up when you click into it", w1 > 300, w1)
        await pg.evaluate("document.activeElement.blur()")
        ov = await pg.evaluate("(()=>{const b=document.querySelector('.notif-bell-btn#notifBellBtn').getBoundingClientRect();return [...document.querySelectorAll('.topbar-icon-group *')].filter(e=>e!==document.querySelector('#notifBellBtn')&&!document.querySelector('#notifBellBtn').contains(e)&&!e.contains(document.querySelector('#notifBellBtn'))&&e.id!=='notifPanel'&&!e.closest('#notifPanel')&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().right>b.left+6&&e.getBoundingClientRect().left<b.right-6&&e.getBoundingClientRect().top<b.bottom&&e.getBoundingClientRect().bottom>b.top).length})()")
        check("top bar: nothing overlaps the bell", ov == 0, ov)
        # sidebar
        issues = "(()=>{const s=[...document.querySelectorAll('.nav-section')].find(x=>x.querySelector(':scope > .nav-label')&&x.querySelector(':scope > .nav-label').textContent.trim().toLowerCase()==='issues');return s})()"
        check("sidebar: Issues starts folded, its items are hidden", await pg.evaluate(f"(()=>{{const s={issues};return s.classList.contains('nav-folded')&&[...s.querySelectorAll('.nav-item')].every(i=>getComputedStyle(i).display==='none')}})()"))
        check("sidebar: Inbox and Home sections are open", await vis(pg, '.nav-item[data-page="ticket-inbox"]') and await vis(pg, '.nav-item[data-page="dashboard"]'))
        await pg.evaluate(f"{issues}.querySelector(':scope > .nav-label').click()"); await pg.wait_for_timeout(250)
        check("sidebar: clicking the label opens it", await pg.evaluate(f"[...{issues}.querySelectorAll('.nav-item')].some(i=>getComputedStyle(i).display!=='none')") and await pg.evaluate(f"{issues}.querySelector(':scope > .nav-label').getAttribute('aria-expanded')") == "true")
        await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
        check("sidebar: the choice is remembered after a reload", await pg.evaluate(f"!{issues}.classList.contains('nav-folded')"))
        await pg.evaluate(f"{issues}.querySelector(':scope > .nav-label').focus()"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(250)
        check("sidebar: the keyboard (Enter) folds it again", await pg.evaluate(f"{issues}.classList.contains('nav-folded')"))
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvi-row", timeout=20000); await pg.wait_for_timeout(800)

        # inbox
        check("inbox: the tab row above the tickets is hidden while the views list is beside it", not await vis(pg, ".rvi-pills"))
        sw = await pg.evaluate("document.getElementById('ticketSearch').getBoundingClientRect().width")
        check("inbox: the search box is wide enough and says 'Search'", sw >= 120 and await pg.get_attribute("#ticketSearch", "placeholder") == "Search", sw)
        check("inbox: no big yellow 'email is not connected' banner; a small 'Connect email' chip instead", await pg.locator(".rvi-banner").count() == 0 and await vis(pg, ".rvi-emailchip") and "Connect email" in await pg.inner_text(".rvi-emailchip"))
        rows = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('.rvi-row')].map(r=>[r.getAttribute('data-ticket-id'),r.querySelector('.rvi-row__meta').innerText.trim()+'|'+(r.querySelector('.rvi-wait')?r.querySelector('.rvi-wait').className:'')]))")
        check("rows: a customer waiting 30 hours shows 'Waiting 30 h' in the late colour", rows["W1"].startswith("Waiting 30 h") and "is-late" in rows["W1"], rows)
        check("rows: a fresh one shows 'Waiting 5 min'; one we already answered shows the time instead", rows["W2"].startswith("Waiting 5 min") and "Waiting" not in rows["W3"], rows)
        await pg.click('[data-act=views-collapse]'); await pg.wait_for_timeout(400)
        check("inbox: with the views list hidden the tab row comes back", await vis(pg, ".rvi-pills"))
        await pg.click('[data-act=views-panel]'); await pg.wait_for_timeout(400)
        # today's queue
        txt = await pg.inner_text(".rvi-today")
        check("empty panel: shows today's queue with the number needing a reply", "Today's queue" in txt and await pg.evaluate("[...document.querySelectorAll('.rvi-today__stat')].map(s=>s.querySelector('b').textContent+' '+s.querySelector('span').textContent)[0]") == "2 need a reply", txt[:200])
        check("empty panel: names the ticket that has waited longest", "Refund still not received" in txt and "waiting 30 h" in txt, txt)
        await pg.screenshot(path=os.path.join(SHOTS, "polish_1_inbox.png"))
        await pg.click('.rvi-today [data-act=open]'); await pg.wait_for_selector(".rvi-conv__head", timeout=15000); await pg.wait_for_timeout(600)
        check("empty panel: 'Open it' opens that ticket", "Refund still not received" in await pg.inner_text(".rvi-conv__head h2"))
        # reply tools
        check("reply box: Send is on its own; Saved replies and AI suggestion are not shown as buttons", await vis(pg, "#rviSend") and not await vis(pg, ".rvi-hidden-tools [data-act=canned]") and not await vis(pg, ".rvi-hidden-tools [data-act=ai]") and await vis(pg, '.rvi-composer [aria-label="More reply tools"]'))
        await pg.click('.rvi-composer [aria-label="More reply tools"]'); await pg.wait_for_timeout(250)
        items = await pg.evaluate("[...document.querySelectorAll('.rvi-composer .rv-menu__item')].map(i=>i.textContent.trim())")
        check("reply box: More offers Saved replies and AI suggestion", items == ["Saved replies", "AI suggestion"], items)
        await pg.click('.rvi-composer .rv-menu__item >> text=Saved replies'); await pg.wait_for_timeout(900)
        check("reply box: Saved replies from the More menu still works (opens the list or says there are none)", await pg.locator(".rv-overlay").count() == 1 or "No saved replies" in await pg.inner_text("body"))
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))")
        await pg.screenshot(path=os.path.join(SHOTS, "polish_2_conv.png"))
        # setup checklist + chip actions
        await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvi-today", timeout=20000); await pg.wait_for_timeout(1500)
        check("empty panel: admin sees a 'Get set up' checklist while setup is unfinished", await pg.locator(".rvi-setup").count() == 1 and "Get set up" in await pg.inner_text(".rvi-setup"), await pg.inner_text(".rvi-today"))
        await pg.click(".rvi-emailchip"); await pg.wait_for_timeout(1200)
        check("chip: 'Connect email' goes to the email settings", await pg.evaluate("App.currentPage") == "email-ticketing", await pg.evaluate("App.currentPage"))
        check("page: no script errors", not errs, errs)
        await pg.context.close()

        # empty inbox: import offered
        con = sqlite3.connect(DB); con.execute("DELETE FROM tickets"); con.commit(); con.close()
        pg, errs = await page()
        check("empty inbox: offers 'Import from another help desk' next to 'Create a ticket'", "Import from another help desk" in await pg.inner_text("#rviRows") and "Create a ticket" in await pg.inner_text("#rviRows"))
        check("empty panel: the checklist adds 'Bring in your old tickets' while there are no tickets", "Bring in your old tickets" in await pg.inner_text(".rvi-setup"))
        await pg.click(".rvi-setup >> text=Bring in your old tickets"); await pg.wait_for_selector("#rvxFile", state="attached", timeout=10000)
        check("empty panel: that opens the import screen", True)
        await pg.screenshot(path=os.path.join(SHOTS, "polish_3_empty.png"))
        await pg.context.close()

        # ================= phone, pilot ON =================
        set_flag(True)
        pg, errs = await page(390, 844)
        await pg.evaluate("localStorage.setItem('tt_v3b','1')"); await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(2500)
        for name in ("ticket-inbox", "dashboard"):
            await pg.evaluate(f"App.navigate('{name}')"); await pg.wait_for_timeout(2500)
            over = await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
            check(f"phone, new look: {name} does not scroll sideways", over <= 2, over)
        check("phone, new look: no script errors", not errs, errs)
        await pg.context.close()

        # ================= pilot OFF =================
        set_flag(False)
        pg, errs = await page()
        check("off: the new-look class is not set", not await pg.evaluate("document.body.classList.contains('rv-plus')"))
        check("off: top bar as before (SLA badge element and AI placeholder untouched)", await pg.get_attribute("#aiBar", "placeholder") == 'Ask AI: "show critical tickets"' and await pg.evaluate("document.getElementById('aiBarWrap').getBoundingClientRect().width") > 200)
        check("off: no section is folded and the labels are plain text", await pg.evaluate("document.querySelectorAll('.nav-folded').length") == 0 and await pg.evaluate("document.querySelectorAll('.nav-label[role=button]').length") == 0)
        check("off: the inbox keeps its tab row, its banner and no chip", await pg.locator(".rvi-pills").count() == 1 and await pg.locator(".rvi-banner").count() == 1 and await pg.locator(".rvi-emailchip").count() == 0)
        check("off: the empty panel is the plain 'Select a ticket'", "Select a ticket" in await pg.inner_text("#rviConv") and await pg.locator(".rvi-today").count() == 0)
        check("off: page has no script errors", not errs, errs)
        await pg.context.close(); await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
