"""Live team: who is active, breaks and "next ticket goes to", on screen: the break choice in the top-bar status menu (it survives a reload), the roster, the next-up card checked against the real assignment, the break timer, the long-break flag, the wallboard and the phone.
Throwaway copy on :3950. Run: python docs/ui-redesign/tools/live_break_ui_test.py"""
import asyncio, datetime, json, os, re, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3950; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw="demo1234"):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
tmp = tempfile.mkdtemp(prefix="rv-breakui-"); app = os.path.join(tmp, "app"); DB = os.path.join(app, "data", "brands", "demo", "db.sqlite"); OWNER = os.path.join(app, "data", "owner.json"); MAIL = os.path.join(tmp, "mail.jsonl")
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
    adm = login("admin@demo.local")["token"]; sam = login("sam@demo.local")["token"]
    def call(tok, fn, *a):
        r = urllib.request.Request(BASE + "/api/call", data=json.dumps({"fn": fn, "args": list(a)}).encode(), headers={"Content-Type": "application/json", "x-session-token": tok})
        return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(tok, w=1500, h=950):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_nav_fold');sessionStorage.removeItem('rvl_tab')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1800)
            return pg, errs
        group = lambda pg, g: pg.evaluate("(g)=>[...document.querySelectorAll('.rvl-roster__col[data-group=\"'+g+'\"] .rvl-chip')].map(c=>c.getAttribute('data-agent-chip'))", g)
        groups = lambda pg: asyncio.gather(*[group(pg, g) for g in ("active", "idle", "break", "away")])

        # ---- an agent starts a break from the top bar ----
        pg, errs = await page(sam)
        check("agent: the status menu has 'On a break' between Busy and Away", await pg.evaluate("[...document.querySelectorAll('#agentStatusMenu button')].map(b=>b.textContent.trim())") == ["🟢 Available", "🟡 Busy", "☕ On a break", "🔴 Away"])
        await pg.click("#agentStatusWrap > button"); await pg.click("#agentStatusMenu button:nth-child(3)"); await pg.wait_for_timeout(1200)
        check("agent: the top bar says 'On break' and the dot turns violet", "On break" in await pg.inner_text(".agent-status-badge") and "139, 92, 246" in await pg.evaluate("getComputedStyle(document.getElementById('agentStatusDot')).backgroundColor"), await pg.inner_text(".agent-status-badge"))
        check("agent: a message says new tickets will not be assigned", "will not be assigned" in await pg.inner_text("body"))
        await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(2500)
        check("agent: after reloading the page the top bar still says 'On break' (it no longer resets to Available)", "On break" in await pg.inner_text(".agent-status-badge"), await pg.inner_text(".agent-status-badge"))
        check("agent: no script errors", not errs, errs)
        await pg.context.close()

        # ---- the supervisor sees it ----
        call(adm, "saveQueueConfig", {"enabled": True, "mode": "roundrobin", "frozen": False, "agents": [{"email": e, "inQueue": True} for e in ("sam@demo.local", "ravi@demo.local", "tina@demo.local", "mira@demo.local")], "routingRules": [], "timeRules": []})
        pg, errs = await page(adm)
        await pg.evaluate("RVL.poll=1500"); await pg.click("#liveNav"); await pg.wait_for_selector(".rvl-roster", timeout=20000); await pg.wait_for_timeout(1500)
        check("roster: four groups (Active now, Idle, On a break, Away)", await pg.locator(".rvl-roster__col").count() == 4)
        gs = await groups(pg)
        check("roster: Sam is under 'On a break', Ravi under Away, Tina idle", gs[2] == ["sam@demo.local"] and "sam@demo.local" not in gs[0] and "ravi@demo.local" in gs[3] and "tina@demo.local" in gs[1], gs)
        check("roster: the break shows a live counter", await pg.locator(".rvl-chip--break .rvl-cd[data-since]").count() == 1)
        nxt = (await pg.inner_text(".rvl-next")).replace("\n", " ")
        top = nxt.upper().split("NOT GETTING")[0].title()
        check("next up: names who gets the next ticket (not Sam on a break, not Ravi away)", "next ticket goes to" in nxt.lower() and ("Tina" in top or "Mira" in top) and "Sam" not in top and "Ravi" not in top, nxt)
        check("next up: says why Sam and Ravi are skipped", "Sam on a break" in nxt and "Ravi away" in nxt, nxt)
        named = (await pg.inner_text(".rvl-next__who b")).strip()
        probe = call(adm, "createManualTicket", {"subject": "Probe screen", "customerEmail": "probe@example.test", "customerName": "Probe", "description": "Hi", "priority": "Low"})
        got = call(adm, "getTicketById", probe.get("ticketId") or probe.get("id"))["ticket"]["assignedTo"]
        check("next up: the person shown is the person who really gets the next ticket", got.split("@")[0].lower() == named.split(" ")[0].lower(), [named, got])
        sc = await pg.inner_text('.rvl-agent[data-agent="sam@demo.local"]')
        check("card: Sam's card says On break with a timer and no 'Away with open' warning", "On break" in sc and "Away with" not in sc and "ON A BREAK" in sc.upper(), sc[:240])
        check("card: every card shows Right now and Breaks today", await pg.locator(".rvl-agent .rvl-act").count() == await pg.locator(".rvl-agent").count() and "breaks today" in (await pg.inner_text(".rvl-agent")).lower())
        await pg.screenshot(path=os.path.join(SHOTS, "break_1_board.png"), full_page=True)
        opts = await pg.evaluate("document.querySelector('.rvl-give') ? document.querySelector('.rvl-give').innerText : ''")
        check("give to: Sam is listed as on break", "on break" in opts.lower(), opts[:200])

        # ---- a break that has gone on too long ----
        con = sqlite3.connect(DB); row = con.execute("SELECT id,data FROM users WHERE data LIKE '%sam@demo.local%'").fetchone(); u = json.loads(row[1])
        u["statusUpdatedAt"] = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=45)).astimezone(datetime.timezone(datetime.timedelta(hours=5, minutes=30))).isoformat(); con.execute("UPDATE users SET data=? WHERE id=?", (json.dumps(u), row[0])); con.commit(); con.close()
        await pg.wait_for_timeout(2800)
        check("long break: after 45 minutes the card says 'Long break' and the chip is flagged", "Long break" in await pg.inner_text('.rvl-agent[data-agent="sam@demo.local"]') and await pg.locator(".rvl-chip.is-long").count() == 1)
        await pg.click("#rvlSettings"); await pg.wait_for_selector("#rvlBreak")
        check("limits: 'a break counts as long after' is 30 minutes", await pg.input_value("#rvlBreak") == "30")
        await pg.fill("#rvlBreak", "2"); await pg.click("#rvlSave"); await pg.wait_for_timeout(700)
        check("limits: a value under 5 is refused and the window stays", await pg.locator("#rvlSave").count() == 1)
        await pg.fill("#rvlBreak", "90"); await pg.click("#rvlSave"); await pg.wait_for_timeout(2800)
        check("limits: 90 minutes saved, the flag goes away", await pg.locator(".rvl-chip.is-long").count() == 0)

        # ---- back from the break ----
        call(sam, "setAgentStatus", "available"); await pg.wait_for_timeout(2800)
        gs = await groups(pg)
        check("back: Sam leaves the break group and the counter stops", gs[2] == [] and await pg.locator(".rvl-chip--break").count() == 0, gs)
        check("back: his card shows 1 break today", "1 ·" in await pg.inner_text('.rvl-agent[data-agent="sam@demo.local"]'))

        # ---- auto-assign off / frozen ----
        call(adm, "saveQueueConfig", {"enabled": False, "agents": []}); await pg.wait_for_timeout(2800)
        check("next up: with auto-assign off it says so", "Auto-assign is off" in await pg.inner_text(".rvl-next"))
        call(adm, "saveQueueConfig", {"enabled": True, "frozen": True, "agents": [{"email": "sam@demo.local", "inQueue": True}]}); await pg.wait_for_timeout(2800)
        check("next up: a frozen queue says so", "frozen" in (await pg.inner_text(".rvl-next")).lower())
        check("page: no script errors", not errs, errs)

        # ---- wallboard ----
        call(sam, "setAgentStatus", "break"); call(adm, "saveQueueConfig", {"enabled": True, "mode": "roundrobin", "agents": [{"email": e, "inQueue": True} for e in ("sam@demo.local", "tina@demo.local", "mira@demo.local")]})
        lk = call(adm, "createWallboardLink", "break shot"); wurl = BASE + lk["url"][lk["url"].index("/wall/"):]
        ctx2 = await br.new_context(viewport={"width": 1920, "height": 1080}); wp = await ctx2.new_page(); await wp.goto(wurl); await wp.wait_for_selector(".wb-tile", timeout=20000); await wp.wait_for_timeout(800)
        wt = await wp.inner_text("#wb")
        check("wall page: shows 'Next ticket' with a first name and Sam on a break, no addresses", "Next ticket:" in wt and "on a break" in wt.lower() and "@" not in wt, wt[:300])
        await wp.screenshot(path=os.path.join(SHOTS, "break_2_wall.png")); await ctx2.close()
        await pg.context.close()

        # ---- phone ----
        pg, errs = await page(adm, 390, 844)
        await pg.evaluate("localStorage.setItem('tt_v3b','1')"); await pg.reload(); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(2000)
        await pg.evaluate("App.navigate('live-team')"); await pg.wait_for_selector(".rvl-roster", timeout=20000); await pg.wait_for_timeout(1000)
        over = await pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
        check("phone: no sideways scrolling and the roster fits", over <= 2, over)
        await pg.screenshot(path=os.path.join(SHOTS, "break_3_phone.png"))
        check("phone: no script errors", not errs, errs)
        await pg.context.close(); await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
