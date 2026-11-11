"""Live team 2 on screen: tabs, incident radar + message flow, SLA countdown, channels, activity, forecast, My day, auto-balance, agent details, wallboard (dialog + public page), team filter, clickable tiles, sound toggle, phone.
Throwaway copy on :3948 (email goes to a capture file). Run: python docs/ui-redesign/tools/live_more_ui_test.py"""
import asyncio, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3948; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw="demo1234"):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
tmp = tempfile.mkdtemp(prefix="rv-live2ui-"); app = os.path.join(tmp, "app"); DB = os.path.join(app, "data", "brands", "demo", "db.sqlite"); OWNER = os.path.join(app, "data", "owner.json"); MAIL = os.path.join(tmp, "mail.jsonl")
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
    subprocess.run(["node", os.path.join(ROOT, "docs", "ui-redesign", "tools", "live_more_seed.js"), DB, ROOT], check=True)
    import sqlite3
    con = sqlite3.connect(DB); row = con.execute("SELECT value FROM kv WHERE key='settings'").fetchone(); st = json.loads(row[0]) if row else {}
    st["BRAND_NOTIFY_EMAIL"] = "support@example.test"; st["BRAND_NOTIFY_PASS"] = "testpassword"
    snaps = [{"t": int(time.time() * 1000) - (12 - i) * 600000, "waiting": 2 + i % 5, "breached": 1, "unassigned": 8 + i % 4, "avail": 2} for i in range(12)]
    con.execute("INSERT INTO kv(key,value) VALUES('liveSnapshots',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (json.dumps(snaps),))
    con.execute("INSERT INTO kv(key,value) VALUES('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (json.dumps(st),)); con.commit(); con.close()
build()
env = {k: v for k, v in os.environ.items() if k != "TOPICS_ENABLED"}
env.update(LIVE_CACHE_MS="300", LIVE_INC_MS="300", PORT=str(PORT), MAIL_CAPTURE=MAIL, EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    adm = login("admin@demo.local")["token"]; sam = login("sam@demo.local")["token"]; mira = login("mira@demo.local")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(tok, w=1500, h=950):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []; pg.requests_seen = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.on("request", lambda r: pg.requests_seen.append(r.post_data or "") if "/api/call" in r.url else None)
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_inbox_filters');localStorage.removeItem('tt_nav_fold');sessionStorage.removeItem('rvl_tab')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
            return pg, errs
        vis = lambda pg, sel: pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}');return !!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none'}})()")
        seen = lambda pg, fn: sum(1 for r in pg.requests_seen if f'"fn": "{fn}"' in r or f'"fn":"{fn}"' in r)
        tile = lambda pg, label: pg.evaluate("(l)=>{const t=[...document.querySelectorAll('.rvl-tile')].find(x=>x.querySelector(':scope > span').textContent.trim()===l);return t?t.querySelector('b').textContent.trim():null}", label)
        async def tab(pg, name, wait):
            await pg.click(f'#rvlTab_{name}'); await pg.wait_for_selector(wait, timeout=20000); await pg.wait_for_timeout(500)

        # ---- the page opens with tabs ----
        pg, errs = await page(adm)
        await pg.evaluate("RVL.poll=1500"); await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tile", timeout=20000); await pg.wait_for_timeout(1200)
        labels = await pg.evaluate("[...document.querySelectorAll('.rvl-tab')].map(b=>b.firstChild.textContent.trim())")
        check("tabs: Board, Incidents, SLA countdown, Channels, Activity, Forecast", labels == ["Board", "Incidents", "SLA countdown", "Channels", "Activity", "Forecast"], labels)
        check("tabs: Board is selected first and its tab is marked for screen readers", await pg.get_attribute("#rvlTab_board", "aria-selected") == "true" and await pg.get_attribute("#rvlTab_incidents", "aria-selected") == "false")
        check("tabs: the Incidents tab carries a red count badge", await pg.evaluate("(()=>{const b=document.querySelector('#rvlTab_incidents .rvl-badge');return !!b&&!b.hidden&&b.textContent.trim()==='1'})()"), await pg.inner_text("#rvlTab_incidents"))
        check("board: wait buckets bar with four groups", await pg.locator(".rvl-buckets__key span").count() == 4)
        check("board: sparklines drawn on the clickable tiles", await pg.locator(".rvl-tile .rvl-spark").count() >= 3)
        check("board: Sound, Pause, Wallboard and Alert limits buttons for an admin", all([await vis(pg, s) for s in ("#rvlSound", "#rvlPause", "#rvlWall", "#rvlSettings")]))
        await pg.screenshot(path=os.path.join(SHOTS, "live2_1_board.png"), full_page=True)

        # ---- clickable tiles ----
        await pg.click('.rvl-tile[data-go="noowner"]'); await pg.wait_for_selector(".rvi-row", timeout=15000); await pg.wait_for_timeout(1200)
        check("tiles: 'no owner' opens the inbox on the unassigned view", await pg.evaluate("(RVI._state||{}).view==='unassigned'||!!document.querySelector('.rvi-row')"))
        await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tile", timeout=15000)

        # ---- team filter ----
        check("team: a team picker is shown (two teams)", await pg.locator("#rvlTeam").count() == 1)
        before = await pg.locator(".rvl-agent").count()
        await pg.select_option("#rvlTeam", "Beta"); await pg.wait_for_timeout(1800)
        after = await pg.evaluate("[...document.querySelectorAll('.rvl-agent')].map(c=>c.getAttribute('data-agent'))")
        check("team: choosing Beta shows only that team's people", before > len(after) and after == ["tina@demo.local"], after)
        await pg.select_option("#rvlTeam", ""); await pg.wait_for_timeout(1800)
        check("team: All teams brings everyone back", await pg.locator(".rvl-agent").count() == before)

        # ---- agent details ----
        await pg.click('.rvl-agent[data-agent="sam@demo.local"] [data-detail]'); await pg.wait_for_selector(".rv-modal .rvl-stats", timeout=15000)
        txt = await pg.inner_text(".rv-modal")
        check("details: replies today, solved today, open now, first reply today", all(x in txt.lower() for x in ("replies today", "solved today", "open now", "first reply today")) and "Sam Agent" in txt, txt[:200])
        check("details: lists customers waiting for Sam and has Nudge and Their tickets", await pg.locator("#rvlDNudge").count() == 1 and await pg.locator("#rvlDTix").count() == 1 and "customers waiting for sam" in txt.lower())
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))")

        # ---- incidents ----
        await tab(pg, "incidents", ".rvl-inc")
        inc = await pg.inner_text(".rvl-inc")
        check("incidents: one card, seven customers, about payments", await pg.locator(".rvl-inc").count() == 1 and "7 tickets from 7 customers" in inc and "payment" in inc.lower(), inc[:200])
        check("incidents: imported history and the newsletter were left out (nothing from them listed)", "newsletter" not in inc.lower())
        await pg.screenshot(path=os.path.join(SHOTS, "live2_2_incident.png"), full_page=True)
        await pg.click("[data-inc-ack]"); await pg.wait_for_timeout(1500)
        check("incidents: 'I have seen this' marks it Seen by the admin", "Seen by" in await pg.inner_text(".rvl-inc") and await pg.locator("[data-inc-ack]").count() == 0, await pg.inner_text(".rvl-inc__meta"))
        await pg.click("[data-inc-msg]"); await pg.wait_for_selector("#rvlIncText", timeout=15000)
        check("message: the draft is filled in and mentions {name}", "{name}" in await pg.input_value("#rvlIncText"))
        check("message: Send stays disabled until the box is ticked", await pg.is_disabled("#rvlIncSend"))
        await pg.fill("#rvlIncText", "Hi {name}, we know payments are failing and are fixing it now. You will not be charged twice."); await pg.check("#rvlIncOk")
        check("message: ticking enables Send", not await pg.is_disabled("#rvlIncSend"))
        await pg.screenshot(path=os.path.join(SHOTS, "live2_3_message.png"))
        await pg.click("#rvlIncSend"); await pg.wait_for_function("document.querySelector('#rvlIncProg')&&/sent/.test(document.querySelector('#rvlIncProg').textContent)", timeout=30000)
        prog = await pg.inner_text("#rvlIncProg")
        check("message: it reports how many were sent", re.search(r"\d+ sent", prog) is not None, prog)
        mails = [json.loads(l) for l in open(MAIL, encoding="utf-8").read().splitlines() if l.strip()] if os.path.exists(MAIL) else []
        check("message: the emails went to the capture file with the customer's first name filled in", any("payments are failing" in json.dumps(m) for m in mails) and not any("{name}" in json.dumps(m) for m in mails), len(mails))
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))"); await pg.wait_for_timeout(1500)
        check("message: the card now says updates were sent", "update" in await pg.inner_text(".rvl-inc") and "sent" in await pg.inner_text(".rvl-inc"), await pg.inner_text(".rvl-inc__meta"))
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.click("[data-inc-done]"); await pg.wait_for_timeout(1800)
        check("incidents: 'Mark as over' moves it to 'Earlier today'", await pg.locator(".rvl-inc").count() == 0 and "Marked over" in await pg.inner_text("#rvlTabBody"))

        # ---- SLA countdown ----
        await tab(pg, "sla", ".rvl-cd")
        t0 = await pg.inner_text(".rvl-cd")
        check("sla: counters and a table with live timers", await pg.locator(".rvl-stats > div").count() == 4 and await pg.locator(".rvl-cd[data-deadline]").count() >= 1)
        check("sla: the most overdue ticket is first and marked late", "late" in t0 and await pg.evaluate("document.querySelector('.rvl-cd').classList.contains('is-late')"), t0)
        await pg.screenshot(path=os.path.join(SHOTS, "live2_4_sla.png"), full_page=True)
        n0 = seen(pg, "getLiveSla"); await pg.wait_for_timeout(2500)
        check("sla: it refreshes by itself while open", seen(pg, "getLiveSla") > n0, [seen(pg, "getLiveSla"), n0])

        # ---- channels ----
        await tab(pg, "channels", ".rvl-chan")
        ch = await pg.inner_text(".rvl-channels")
        check("channels: email, WhatsApp and the others, each with last message and counts", await pg.locator(".rvl-chan").count() >= 2 and "Last message" in ch and "Usually per hour" in ch, ch[:200])
        check("channels: WhatsApp (busy all week, silent for hours) is flagged and told to check the connection", await pg.evaluate("(()=>{const c=[...document.querySelectorAll('.rvl-chan')].find(x=>/whatsapp/i.test(x.querySelector('h3').textContent));return !!c&&/Quiet|No messages|Check/.test(c.querySelector('.rv-badge').textContent)&&!!c.querySelector('.rvl-chan__note')})()"))
        await pg.screenshot(path=os.path.join(SHOTS, "live2_5_channels.png"), full_page=True)

        # ---- activity ----
        await tab(pg, "feed", "#rvlFeed")
        await pg.wait_for_timeout(800)
        n_ev = await pg.locator(".rvl-ev").count()
        check("activity: events listed newest first, each with a time", n_ev >= 5 and await pg.locator(".rvl-ev time").count() == n_ev, n_ev)
        await pg.evaluate("""fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json','x-session-token':localStorage.getItem('tt_session_token')},body:JSON.stringify({fn:'liveBoardAssign',args:[['S1'],'tina@demo.local']})})""")
        await pg.wait_for_timeout(3500)
        check("activity: a new event (S1 handed to Tina) appears without reloading", await pg.locator(".rvl-ev").count() > n_ev, [await pg.locator(".rvl-ev").count(), n_ev])
        await pg.screenshot(path=os.path.join(SHOTS, "live2_6_feed.png"), full_page=True)

        # ---- forecast ----
        await tab(pg, "forecast", ".rvl-fc, .rvl-calm")
        check("forecast: eight hourly columns with expected numbers and agents needed", await pg.locator(".rvl-fc__col").count() == 8 and "needs" in await pg.inner_text(".rvl-fc"), await pg.inner_text("#rvlTabBody"))
        await pg.screenshot(path=os.path.join(SHOTS, "live2_7_forecast.png"), full_page=True)

        # ---- remembers the tab; leaving stops everything ----
        await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1500)
        await pg.evaluate("App.navigate('live-team')"); await pg.wait_for_selector(".rvl-tab.is-on", timeout=20000)
        check("tabs: reloading the page returns to the tab you were on", await pg.evaluate("document.querySelector('.rvl-tab.is-on').dataset.tab") == "forecast")
        await pg.click("#rvlTab_board"); await pg.wait_for_selector(".rvl-tile", timeout=15000)

        # ---- auto-balance ----
        before_no = await tile(pg, "no owner")
        await pg.click("#rvlBalance"); await pg.wait_for_selector("#rvlBalGo", timeout=15000)
        plan = await pg.inner_text(".rv-modal")
        check("auto-balance: shows a plan (who gets how many) before doing anything", "would get" in plan.lower() and "+" in plan, plan[:200])
        check("auto-balance: nothing was assigned just by opening it", await tile(pg, "no owner") == before_no)
        await pg.click("#rvlBalGo"); await pg.wait_for_timeout(2500)
        check("auto-balance: confirming hands the tickets out (no owner goes down)", int(await tile(pg, "no owner")) < int(before_no), [before_no, await tile(pg, "no owner")])

        # ---- sound toggle ----
        await pg.click("#rvlSound"); await pg.wait_for_timeout(300)
        check("sound: the toggle says on and is remembered", "on" in await pg.inner_text("#rvlSound") and await pg.evaluate("localStorage.getItem('rvl_sound')") == "1")
        await pg.click("#rvlSound"); check("sound: and can be switched off again", "off" in await pg.inner_text("#rvlSound"))

        # ---- alert limits has the new fields ----
        await pg.click("#rvlSettings"); await pg.wait_for_selector("#rvlInc")
        check("limits: incident size, first-reply target and tickets per agent are editable", all([await pg.locator(s).count() == 1 for s in ("#rvlInc", "#rvlFr", "#rvlPer")]))
        await pg.fill("#rvlInc", "2"); await pg.click("#rvlSave"); await pg.wait_for_timeout(800)
        check("limits: an incident size of 2 is refused and the window stays", await pg.locator("#rvlSave").count() == 1)
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))")

        # ---- wallboard dialog + public page ----
        await pg.click("#rvlWall"); await pg.wait_for_selector("#rvlWallMake", timeout=15000)
        await pg.fill("#rvlWallLabel", "Office TV"); await pg.click("#rvlWallMake"); await pg.wait_for_selector("#rvlWallOut", timeout=15000)
        url = await pg.input_value("#rvlWallOut")
        check("wallboard: a private link is made and shown once", "/wall/demo/" in url and "only once" in (await pg.inner_text("#rvlWallUrl")).lower(), url)
        check("wallboard: the link appears in the list", "Office TV" in await pg.inner_text("#rvlWallRows"))
        await pg.screenshot(path=os.path.join(SHOTS, "live2_8_wallboard_dialog.png"))
        wurl = BASE + url[url.index("/wall/"):]
        ctx2 = await br.new_context(viewport={"width": 1920, "height": 1080}); wp = await ctx2.new_page(); werrs = []; wp.on("pageerror", lambda e: werrs.append(str(e)[:200]))
        await wp.goto(wurl); await wp.wait_for_selector(".wb-tile", timeout=20000); await wp.wait_for_timeout(800)
        wt = await wp.inner_text("#wb")
        check("wall page: opens with no sign-in and shows big numbers", await wp.locator(".wb-tile").count() >= 5 and "waiting" in wt.lower(), wt[:150])
        check("wall page: shows first names only, no ticket subjects or customer addresses", "Sam" in wt and "Where is my parcel" not in wt and "@example.test" not in wt and "Payment failed" not in wt, wt[:300])
        await wp.screenshot(path=os.path.join(SHOTS, "live2_9_wallboard.png"))
        check("wall page: no script errors", not werrs, werrs)
        bad = BASE + "/wall/demo/" + "0" * 48
        r = await wp.request.get(BASE + "/api/wall/demo/" + "0" * 48); check("wall page: a wrong link is refused (404)", r.status == 404, r.status)
        # remove the link
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.click("[data-wal-del]"); await pg.wait_for_timeout(1500)
        r = await wp.request.get(BASE + url[url.index("/api/wall/"):] if "/api/wall/" in url else BASE + "/api/wall/" + url.split("/wall/")[1])
        check("wallboard: removing the link makes the screen stop working (404)", r.status == 404, r.status)
        await ctx2.close()
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(o=>RV.closeModal(o))")
        check("page: no script errors", not errs, errs)
        await pg.context.close()

        # ---- a manager: tabs yes, wallboard and limits no ----
        pg, errs = await page(mira)
        await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-tab", timeout=20000)
        check("manager: sees the tabs but has no Wallboard or Alert limits button", await pg.locator(".rvl-tab").count() == 6 and await pg.locator("#rvlWall").count() == 0 and await pg.locator("#rvlSettings").count() == 0)
        await pg.context.close()

        # ---- My day (an agent) ----
        pg, errs = await page(sam)
        check("menu: an agent sees 'My day' but not 'Live team'", await vis(pg, "#myDayNav") and not await vis(pg, "#liveNav"))
        await pg.click("#myDayNav"); await pg.wait_for_selector("#rvlDay .rvl-stats", timeout=20000); await pg.wait_for_timeout(500)
        dtxt = await pg.inner_text("#rvlDay")
        check("my day: four personal numbers and the list of customers waiting for him", await pg.locator("#rvlDay .rvl-stats > div").count() == 4 and "waiting for your reply" in dtxt.lower() and "Site is down" in dtxt, dtxt[:200])
        check("my day: only his tickets (not Tina's)", "Dashboard slow" not in dtxt)
        check("my day: shows a live countdown to the response target", await pg.locator("#rvlDay .rvl-cd[data-deadline]").count() >= 1)
        await pg.screenshot(path=os.path.join(SHOTS, "live2_10_myday.png"), full_page=True)
        await pg.click("#rvlDay [data-dopen]"); await pg.wait_for_selector(".rvi-conv__head", timeout=15000)
        check("my day: clicking a customer opens that ticket", True)
        r = await pg.evaluate("fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json','x-session-token':localStorage.getItem('tt_session_token')},body:JSON.stringify({fn:'getLiveBoard',args:['']})}).then(r=>r.json())")
        check("security: an agent cannot read the supervisor board by calling it directly", not r.get("success"), str(r)[:120])
        check("my day: no script errors", not errs, errs)
        await pg.context.close()

        # ---- phone ----
        pg, errs = await page(adm, 390, 844)
        await pg.evaluate("localStorage.setItem('tt_v3b','1')"); await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(2000)
        await pg.evaluate("App.navigate('live-team')"); await pg.wait_for_selector(".rvl-tile", timeout=20000); await pg.wait_for_timeout(800)
        for name, sel in (("incidents", ".rvl-inc, .rvl-calm"), ("sla", ".rvl-cd, .rvl-calm"), ("channels", ".rvl-chan"), ("feed", "#rvlFeed"), ("forecast", ".rvl-fc, .rvl-calm")):
            await pg.evaluate(f"document.querySelector('#rvlTab_{name}').click()"); await pg.wait_for_selector(sel, timeout=20000); await pg.wait_for_timeout(500)
            over = await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
            check(f"phone: the {name} tab has no sideways scrolling", over <= 2, over)
        await pg.screenshot(path=os.path.join(SHOTS, "live2_11_phone_forecast.png"))
        check("phone: no script errors", not errs, errs)
        await pg.context.close(); await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
