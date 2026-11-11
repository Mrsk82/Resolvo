"""Live team on screen: sidebar item for supervisors only, tiles, agent cards, "needs a hand" list with Give to, nudge, alert limits, automatic refresh, pause, history, phone.
Throwaway copy on :3946 (nothing is emailed). Run: python docs/ui-redesign/tools/live_team_ui_test.py"""
import asyncio, datetime, json, os, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3946; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw="demo1234"):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
def call(tok, fn, *a):
    r = urllib.request.Request(BASE + "/api/call", data=json.dumps({"fn": fn, "args": list(a)}).encode(), headers={"Content-Type": "application/json", "x-session-token": tok})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
tmp = tempfile.mkdtemp(prefix="rv-liveui-"); app = os.path.join(tmp, "app"); DB = os.path.join(app, "data", "brands", "demo", "db.sqlite"); OWNER = os.path.join(app, "data", "owner.json")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands")); shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8")); o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    o["brands"][0].setdefault("featureOverrides", {})["INBOX_PLUS_ENABLED"] = True
    json.dump(o, open(OWNER, "w", encoding="utf-8"))
    subprocess.run(["node", os.path.join(ROOT, "docs", "ui-redesign", "tools", "live_team_seed.js"), DB, ROOT], check=True)
build()
env = {k: v for k, v in os.environ.items() if k != "TOPICS_ENABLED"}
env.update(LIVE_CACHE_MS="300", PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)
def set_flag(on):
    o = json.load(open(OWNER, encoding="utf-8")); o["brands"][0]["featureOverrides"]["INBOX_PLUS_ENABLED"] = on; json.dump(o, open(OWNER, "w", encoding="utf-8"))
def add_ticket(tid, minutes_ago=3):
    now = datetime.datetime.now(datetime.timezone.utc); ts = (now - datetime.timedelta(minutes=minutes_ago)).isoformat()
    t = {"id": tid, "subject": "Late arrival " + tid, "status": "open", "priority": "Medium", "from": tid.lower() + "@example.test", "fromName": "Cust " + tid, "assignedTo": "", "createdDate": ts, "lastActivity": ts, "channel": "email", "tags": [], "messageIds": [],
         "thread": [{"id": "MI-" + tid, "type": "incoming", "from": tid.lower() + "@example.test", "fromName": "Cust " + tid, "body": "Hello?", "timestamp": ts, "messageId": "<" + tid + ">"}]}
    con = sqlite3.connect(DB); con.execute("INSERT OR REPLACE INTO tickets(id,data) VALUES(?,?)", (tid, json.dumps(t))); con.commit(); con.close()

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    adm = login("admin@demo.local")["token"]; mira = login("mira@demo.local")["token"]; sam = login("sam@demo.local")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(tok, w=1500, h=950):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []; pg.requests_seen = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.on("request", lambda r: pg.requests_seen.append(r.post_data or "") if "/api/call" in r.url else None)
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_inbox_filters');localStorage.removeItem('tt_nav_fold')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
            return pg, errs
        vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}');return !!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none'}})()")
        seen = lambda pg, fn: sum(1 for r in pg.requests_seen if f'"fn": "{fn}"' in r or f'"fn":"{fn}"' in r)
        tile = lambda pg, label: pg.evaluate("(l)=>{const t=[...document.querySelectorAll('.rvl-tile')].find(x=>x.querySelector(':scope > span').textContent.trim()===l);return t?t.querySelector('b').textContent.trim():null}", label)

        # ---- who sees the menu item ----
        pg, errs = await page(adm)
        check("menu: an admin sees 'Live team' under Inbox", await vis(pg, "#liveNav") and "Live team" in await pg.inner_text("#liveNav"))
        await pg.context.close()
        pg, errs = await page(sam)
        check("menu: an agent does not", not await vis(pg, "#liveNav"))
        await pg.context.close()
        set_flag(False); pg, errs = await page(adm)
        check("menu: with the pilot switch off, nobody sees it", not await vis(pg, "#liveNav"))
        await pg.evaluate("App.navigate('live-team')"); await pg.wait_for_timeout(1500)
        check("page: opened by address with the switch off it says it is not switched on", "not switched on" in (await pg.inner_text("#contentArea")).lower())
        await pg.context.close(); set_flag(True)

        # ---- the page ----
        pg, errs = await page(adm)
        await pg.evaluate("RVL.poll=1000"); await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tile", timeout=20000); await pg.wait_for_timeout(1800)
        check("page: the title is in the top bar (not repeated) and the 'updated' line is shown", "Live team" in await pg.inner_text("#pageTitle") and await pg.locator(".rvl-head h1").count() == 0 and "refreshes every 1 s" in await pg.inner_text("#rvlUpdated"), await pg.inner_text("#rvlUpdated"))
        check("tiles: six tiles with the real numbers (7 waiting for a first reply, 3 with no owner)", await pg.locator(".rvl-tile").count() == 6 and await tile(pg, "waiting for a first reply") == "7" and await tile(pg, "no owner") == "3" and await tile(pg, "past SLA") == "1", [await tile(pg, "waiting for a first reply"), await tile(pg, "no owner")])
        check("tiles: the longest wait is shown in hours and names the ticket", "6 h" in await tile(pg, "longest wait") and "Subject B1" in await pg.inner_text(".rvl-tile--bad .rvl-link"), await tile(pg, "longest wait"))
        check("tiles: available shows '4 of 5'", await tile(pg, "available") == "4 of 5")
        cards = await pg.evaluate("[...document.querySelectorAll('.rvl-agent')].map(c=>c.getAttribute('data-agent'))")
        check("agents: a card for each person (Sam, Ravi, Tina, Mira, the admin), the busiest first", len(cards) == 5 and cards[0] == "sam@demo.local", cards)
        sam_card = await pg.inner_text('.rvl-agent[data-agent="sam@demo.local"]'); ravi = await pg.inner_text('.rvl-agent[data-agent="ravi@demo.local"]'); tina = await pg.inner_text('.rvl-agent[data-agent="tina@demo.local"]')
        check("agents: Sam shows 4 of 5 open and 3 waiting on him", "4 of 5" in sam_card and "Available" in sam_card, sam_card)
        check("agents: Ravi is flagged away with an open ticket; Tina is flagged quiet", "Away with 1 open" in ravi and "Quiet for" in tina, [ravi, tina])
        check("agents: the workload bar is amber at 80%", await pg.evaluate("document.querySelector('.rvl-agent[data-agent=\"sam@demo.local\"] .rvl-bar').classList.contains('is-high')"))
        hot = await pg.evaluate("[...document.querySelectorAll('.rvl-table')][0].querySelectorAll('tbody tr').length")
        check("needs a hand: a row for each ticket that needs attention, the overdue one first", hot >= 6 and "Subject B1" in await pg.inner_text(".rvl-table tbody tr:first-child"), hot)
        check("history: a 24-hour chart and a 7-day table", await pg.locator(".rvl-chart g").count() == 24 and await pg.locator(".rvl-hist .rvl-table tbody tr").count() == 7)
        await pg.screenshot(path=os.path.join(SHOTS, "live_1_board.png"), full_page=True)

        # ---- refreshes by itself ----
        add_ticket("LATE1", 3); await pg.wait_for_timeout(3500)
        check("refresh: a new ticket appears without touching the page (no owner 3 to 4)", await tile(pg, "no owner") == "4", await tile(pg, "no owner"))
        # pause
        await pg.click("#rvlPause"); check("pause: the button says Resume and the line says Paused", await pg.inner_text("#rvlPause") == "Resume" and "Paused" in await pg.inner_text("#rvlUpdated"))
        add_ticket("LATE2", 2); n0 = seen(pg, "getLiveBoard"); await pg.wait_for_timeout(3000)
        check("pause: nothing is asked of the server and the numbers stay", seen(pg, "getLiveBoard") == n0 and await tile(pg, "no owner") == "4", [seen(pg, "getLiveBoard"), n0])
        await pg.click("#rvlPause"); await pg.wait_for_timeout(2500)
        check("pause: Resume brings it up to date (no owner 5)", await tile(pg, "no owner") == "5", await tile(pg, "no owner"))

        # ---- give a ticket to someone ----
        await pg.select_option('[data-give="U1"]', "tina@demo.local"); await pg.wait_for_timeout(1800)
        check("give to: the ticket moves to that person (no owner 4, Tina now has 2 open)", await tile(pg, "no owner") == "4" and "2 of 10" in await pg.inner_text('.rvl-agent[data-agent="tina@demo.local"]'), await pg.inner_text('.rvl-agent[data-agent="tina@demo.local"]'))
        check("give to: it is a normal assignment on the ticket", call(adm, "getTicketById", "U1")["ticket"]["assignedTo"] == "tina@demo.local")

        # ---- their tickets ----
        await pg.click('.rvl-agent[data-agent="sam@demo.local"] [data-tickets]'); await pg.wait_for_selector(".rvi-row", timeout=15000); await pg.wait_for_timeout(1200)
        ids = await pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.getAttribute('data-ticket-id')).sort()")
        check("their tickets: opens the inbox showing only Sam's tickets", ids == ["B1", "S1", "S2", "S3"], ids)
        await pg.evaluate("App._ticketAssignee='all'");

        # ---- leaving the page stops the refreshing ----
        n1 = seen(pg, "getLiveBoard"); await pg.wait_for_timeout(3500)
        check("leaving: the page stops asking the server once you are somewhere else", seen(pg, "getLiveBoard") == n1, [seen(pg, "getLiveBoard"), n1])

        # ---- open a ticket from the board ----
        await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tile", timeout=15000); await pg.wait_for_timeout(800)
        await pg.locator(".rvl-table tbody tr:first-child .rvl-link").first.click(); await pg.wait_for_selector(".rvi-conv__head", timeout=15000)
        check("open: clicking a ticket on the board opens it in the inbox", "Subject B1" in await pg.inner_text(".rvi-conv__head h2"))

        # ---- nudge ----
        await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-agent", timeout=15000); await pg.wait_for_timeout(500)
        await pg.click('.rvl-agent[data-agent="sam@demo.local"] [data-nudge]'); await pg.wait_for_selector("#rvlMsg")
        check("nudge: a window with ready-made messages", await pg.locator("[data-preset]").count() == 3 and "Sam Agent" in await pg.inner_text(".rv-modal__head"))
        await pg.click('[data-preset="1"]'); check("nudge: choosing a ready-made message fills the box", "customer is waiting" in await pg.input_value("#rvlMsg"))
        await pg.click("#rvlSend"); await pg.wait_for_timeout(900)
        bell = call(sam, "getInAppNotifications")["notifications"]
        check("nudge: Sam receives it in his bell", any("nudged you" in n["title"] and "customer is waiting" in n["body"] for n in bell), [n["title"] for n in bell])
        await pg.click('.rvl-agent[data-agent="sam@demo.local"] [data-nudge]'); await pg.wait_for_selector("#rvlMsg"); await pg.click("#rvlSend"); await pg.wait_for_timeout(600)
        check("nudge: an empty message is not sent and the window stays", await pg.locator("#rvlMsg").count() == 1)
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))")

        # ---- alert limits ----
        await pg.click("#rvlSettings"); await pg.wait_for_selector("#rvlWait"); await pg.screenshot(path=os.path.join(SHOTS, "live_2_limits.png"))
        check("limits: the current limits are shown (10 minutes, 10 customers, 20 tickets)", await pg.input_value("#rvlWait") == "10" and await pg.input_value("#rvlCount") == "10" and await pg.input_value("#rvlQueue") == "20")
        await pg.fill("#rvlCount", "0"); await pg.click("#rvlSave"); await pg.wait_for_timeout(700)
        check("limits: a value that is out of range is refused with a clear message and the window stays", await pg.locator("#rvlSave").count() == 1 and "between 1 and 500" in await pg.inner_text("body"))
        await pg.fill("#rvlCount", "3"); await pg.click("#rvlTest"); await pg.wait_for_timeout(700)
        check("limits: 'Send myself a test alert' explains when no device is set up", "No device is set up" in await pg.inner_text("#rvlTestMsg"), await pg.inner_text("#rvlTestMsg"))
        await pg.click("#rvlSave"); await pg.wait_for_timeout(1800)
        check("limits: saving shows the alert bar straight away", await pg.locator(".rvl-alert").count() >= 1 and "waited more than 10 minutes" in await pg.inner_text("#rvlAlerts"), await pg.inner_text("#rvlAlerts"))
        await pg.screenshot(path=os.path.join(SHOTS, "live_3_alert.png"), full_page=True)
        check("page: no script errors", not errs, errs)
        await pg.context.close()

        # ---- a manager ----
        pg, errs = await page(mira)
        await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tile", timeout=20000)
        check("manager: can open it, but has no 'Alert limits' button", await pg.locator("#rvlSettings").count() == 0 and await pg.locator(".rvl-agent").count() == 5)
        await pg.context.close()

        # ---- phone ----
        pg, errs = await page(adm, 390, 844)
        await pg.evaluate("localStorage.setItem('tt_v3b','1')"); await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(2000)
        await pg.evaluate("App.navigate('live-team')"); await pg.wait_for_selector(".rvl-tile", timeout=20000); await pg.wait_for_timeout(1000)
        over = await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth"); cols = await pg.evaluate("getComputedStyle(document.getElementById('rvlTiles')).gridTemplateColumns.split(' ').length")
        check("phone: no sideways scrolling, tiles in two columns, agent cards in one", over <= 2 and cols == 2, [over, cols])
        await pg.screenshot(path=os.path.join(SHOTS, "live_4_phone.png"))
        check("phone: no script errors", not errs, errs)
        await pg.context.close(); await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
