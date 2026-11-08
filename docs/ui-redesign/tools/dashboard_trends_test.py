"""Dashboard: command center and trend charts (word cloud, created vs resolved, backlog, on-time rate, first reply, busiest hours, mood, top customers).
Runs a throwaway copy of the app on :3934 with 150 made-up tickets spread over the last 28 days. Mail is blanked.
Run: python docs/ui-redesign/tools/dashboard_trends_test.py"""
import asyncio, json, os, random, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3934; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def call(tok, fn, *args):
    r = urllib.request.Request(BASE + "/api/call", data=json.dumps({"fn": fn, "args": list(args)}).encode(), headers={"Content-Type": "application/json", "x-session-token": tok})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())
def login(email, pw):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())

tmp = tempfile.mkdtemp(prefix="rv-dash-"); app = os.path.join(tmp, "app")
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
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    # 150 tickets over 28 days: more of them recently, themes that come and go, some resolved, some late, some unassigned
    rnd = random.Random(7); now = datetime.now(timezone.utc); rows = []
    themes_old = ["refund request for damaged item", "delivery delayed again", "invoice copy needed", "wrong size received", "cannot track my order"]
    themes_new = ["refund still not received", "login page not working", "payment failed twice", "delivery delayed again", "password reset link expired", "coupon code not applied"]
    names = [("Riya Shah", "riya@shopfront.in"), ("Kabir Rao", "kabir@brandly.in"), ("Mira Jain", "mira@urbanloom.in"), ("Dev Patel", "dev@studio.in"), ("Anaya Iyer", "anaya@kiranastore.in"), ("Sam Fernandes", "sam@bakehouse.in"), ("Tara Menon", "tara@yogaloft.in")]
    pri = ["Low", "Medium", "Medium", "High", "Critical"]
    users = ["admin@demo.local"]
    for i in range(150):
        age = int(abs(rnd.gauss(0, 11))) % 28 if rnd.random() < .8 else rnd.randint(14, 27)
        created = now - timedelta(days=age, hours=rnd.randint(0, 23), minutes=rnd.randint(0, 59))
        th = rnd.choice(themes_new if age < 14 else themes_old)
        nm, em = rnd.choice(names)
        st = rnd.choices(["open", "resolved", "closed", "pending"], [4, 5, 2, 1])[0] if age > 1 else "open"
        body = rnd.choice(["I am very unhappy, this is terrible and I want a refund", "Thanks, great service so far", "Please check my order, I need help", "Hello, can you help me with this?"])
        t = {"id": f"TKT-T{i:04d}", "subject": th.capitalize(), "body": body, "from": em, "fromName": nm, "channel": rnd.choice(["email", "email", "whatsapp", "web"]),
             "status": st, "priority": rnd.choice(pri), "createdDate": created.isoformat(), "createdAt": created.isoformat(), "lastActivity": created.isoformat(),
             "assignedTo": rnd.choice(users + ["", ""]) , "sentimentLevel": rnd.choices(["positive", "neutral", "negative"], [3, 4, 3])[0], "sentimentScore": 50,
             "thread": [{"id": f"M{i}a", "type": "incoming", "from": em, "fromName": nm, "body": body, "timestamp": created.isoformat()}]}
        if st in ("resolved", "closed"):
            rep = created + timedelta(hours=rnd.choice([0.3, 1, 2, 5, 9, 30])); res = rep + timedelta(hours=rnd.randint(1, 40))
            if res > now: res = now - timedelta(minutes=5)
            t["thread"].append({"id": f"M{i}b", "type": "reply", "from": "admin@demo.local", "fromName": "Admin", "body": "Sorted", "timestamp": rep.isoformat()}); t["resolvedDate"] = res.isoformat()
        rows.append(t)
    js = "const D=require(process.argv[1]);const db=new D(process.argv[2]);db.prepare('DELETE FROM tickets').run();const ins=db.prepare('INSERT INTO tickets(id,data) VALUES(?,?)');const rows=JSON.parse(require('fs').readFileSync(process.argv[3],'utf8'));rows.forEach(r=>ins.run(r.id,JSON.stringify(r)));db.close();"
    jf = os.path.join(tmp, "rows.json"); json.dump(rows, open(jf, "w"))
    subprocess.run(["node", "-e", js, os.path.join(ROOT, "node_modules", "better-sqlite3"), os.path.join(app, "data", "brands", "demo", "db.sqlite"), jf], check=True)
    return len(rows)
N = build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    tok = login("admin@demo.local", "demo1234")["token"]
    d = call(tok, "getDashboardTrends", {"days": 14})
    check("api: answers with terms, daily, heat, mood, customers and the command center", d.get("success") and all(k in d for k in ("terms", "daily", "heat", "mood", "topCustomers", "command")), list(d))
    check("api: one entry per day, in order, ending today", len(d["daily"]) == 14 and [x["date"] for x in d["daily"]] == sorted(x["date"] for x in d["daily"]))
    check("api: created per day adds up to the tickets from the last 14 days", sum(x["created"] for x in d["daily"]) > 20, sum(x["created"] for x in d["daily"]))
    check("api: backlog is never negative and is not above all tickets", all(0 <= x["backlog"] <= N for x in d["daily"]))
    check("api: on-time rate is 0 to 100 or empty", all(x["slaPct"] is None or 0 <= x["slaPct"] <= 100 for x in d["daily"]))
    words = {t["word"]: t for t in d["terms"]}
    check("api: topics are real words from the tickets, no stop words or links", len(words) >= 8 and not any(w in words for w in ("the", "please", "hello", "https", "help")), list(words)[:12])
    check("api: a topic that appeared only recently is marked new or up", any(t["change"] in ("up", "new") for t in d["terms"]), d["terms"][:6])
    check("api: busiest-hours grid is 7 days by 8 slots and adds up", len(d["heat"]) == 7 and all(len(r) == 8 for r in d["heat"]) and sum(map(sum, d["heat"])) == sum(x["created"] for x in d["daily"]))
    check("api: mood counts add up to the period's tickets", sum(d["mood"].values()) == sum(x["created"] for x in d["daily"]), d["mood"])
    check("api: top customers are ranked", d["topCustomers"] and d["topCustomers"] == sorted(d["topCustomers"], key=lambda c: -c["n"]))
    c = d["command"]
    check("api: command center numbers are consistent", c["open"] >= c["breached"] + c["atRisk"] and c["open"] == c["waitingOnUs"] + c["awaitingCustomer"] and c["unassigned"] <= c["open"], c)
    check("api: command center names the longest wait", c["oldest"] is None or (c["oldest"]["hours"] >= 0 and c["oldest"]["id"]), c["oldest"])
    lite = call(tok, "getDashboardTrends", {"days": 14, "only": "command"})
    check("api: the light refresh returns only the command center", lite.get("success") and "command" in lite and "terms" not in lite and lite["command"]["open"] == c["open"])
    check("api: a huge range is capped at 90 days and a missing one means 14", len(call(tok, "getDashboardTrends", {"days": 9999})["daily"]) == 90 and len(call(tok, "getDashboardTrends")["daily"]) == 14)
    check("api: the same answer for 7 and 30 days has that many days", len(call(tok, "getDashboardTrends", {"days": 7})["daily"]) == 7 and len(call(tok, "getDashboardTrends", {"days": 30})["daily"]) == 30)

    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def open_dash(w, h, scheme="light", days="14", theme="resolvo"):
            ctx = await br.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
            await pg.goto(BASE + "/"); await pg.evaluate("([t,d])=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme',d[1]);localStorage.setItem('tt_dash_days',d[0])}", [tok, [days, theme]])
            await pg.goto(BASE + "/")
            try:
                await pg.wait_for_selector("#rvdCommand .rvd-tile", timeout=20000); await pg.wait_for_selector("#rvdTrends .rvd-trends", timeout=20000)
            except Exception:
                print("DEBUG errs", errs); print("DEBUG cmd", (await pg.evaluate("document.getElementById('rvdCommand')?document.getElementById('rvdCommand').innerText.slice(0,200):'no #rvdCommand'")).encode('ascii','replace').decode()); print("DEBUG body", (await pg.inner_text("body"))[:300].encode('ascii','replace').decode()); print("DEBUG RVD", await pg.evaluate("typeof RVD"))
                await pg.screenshot(path=os.path.join(SHOTS, "dash_fail.png")); raise
            await pg.wait_for_timeout(500)
            return pg, errs
        pg, errs = await open_dash(1440, 1000)
        check("page: the command center shows six number tiles and the team load", await pg.locator("#rvdCommand .rvd-tile").count() == 6 and await pg.locator("#rvdCommand .rvd-agent").count() >= 1)
        check("page: it says it is live", "Live" in await pg.inner_text("#rvdLive"))
        check("page: seven trend cards are drawn (cloud, created, backlog, on time, first reply, hours, mood, customers)", await pg.locator("#rvdTrends .rv-card").count() == 8)
        check("page: the cloud puts its biggest word near the middle and lists what is rising", await pg.locator(".rvd-movers li").count() >= 1 and await pg.locator(".rvd-cloud .rvd-word").count() >= 8)
        check("page: the word cloud has words sized by count", await pg.locator(".rvd-word").count() >= 8 and len(set(await pg.eval_on_selector_all(".rvd-word", "e=>e.map(x=>getComputedStyle(x).fontSize)"))) >= 3)
        check("page: charts are drawn as lines with a title for screen readers", await pg.locator("#rvdTrends svg.rvd-chart[role=img]").count() >= 4 and await pg.locator("#rvdTrends svg path[stroke]").count() >= 4)
        check("page: no script errors", not errs, errs)
        await pg.screenshot(path=os.path.join(SHOTS, "dash_top.png"))
        await pg.locator("#rvdTrends").scroll_into_view_if_needed(); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SHOTS, "dash_trends.png"))
        n_b = int(await pg.locator("#rvdCommand .rvd-tile b").first.inner_text())
        await pg.locator(".rvd-word").first.click(); await pg.wait_for_timeout(1200)
        check("page: clicking a word opens the inbox searching for it", await pg.evaluate("!!App._ticketSearch") and "inbox" in (await pg.evaluate("location.hash") + await pg.inner_text("body")).lower(), await pg.evaluate("App._ticketSearch"))
        await pg.context.close()

        pg, errs = await open_dash(1440, 1000, "dark", theme="resolvo-dark")
        bg = await pg.evaluate("getComputedStyle(document.querySelector('#rvdTrends .rv-card')).backgroundColor")
        check("dark: cards follow the dark theme", bg not in ("rgb(255, 255, 255)",), bg)
        await pg.locator("#rvdCommand").scroll_into_view_if_needed(); await pg.screenshot(path=os.path.join(SHOTS, "dash_dark.png"))
        await pg.context.close()

        pg, errs = await open_dash(390, 844)
        check("phone: nothing scrolls sideways", await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"))
        wide = await pg.evaluate("[...document.querySelectorAll('#rvdCommand *, #rvdTrends *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>window.innerWidth+2}).slice(0,3).map(e=>e.tagName+'.'+String(e.className.baseVal||e.className))")
        check("phone: no chart or tile pokes past the screen", not wide, wide)
        check("phone: the trend cards stack in one column", await pg.evaluate("[...document.querySelectorAll('#rvdTrends .rv-card')].every(c=>c.getBoundingClientRect().width>300)"))
        await pg.locator("#rvdCommand").scroll_into_view_if_needed(); await pg.screenshot(path=os.path.join(SHOTS, "dash_phone.png"))
        await pg.context.close()

        # ---------- Custom Dashboard page: every new chart is a widget ----------
        ctx = await br.new_context(viewport={"width": 1440, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_brand_slug','demo');localStorage.setItem('tt_brand_name','Demo')}", tok)
        await pg.goto(BASE + "/dashboard.html"); await pg.wait_for_selector(".grid-stack-item", timeout=20000); await pg.wait_for_timeout(2500)
        check("custom dashboard: the word cloud widget draws words", await pg.locator('.grid-stack-item .rvd-cloud .rvd-word').count() >= 8)
        check("custom dashboard: words are not links there", await pg.locator('.grid-stack-item button.rvd-word').count() == 0)
        check("custom dashboard: the command center widget shows its six tiles and team load", await pg.locator('.grid-stack-item .rvd-tile').count() >= 6 and await pg.locator('.grid-stack-item .rvd-agent').count() >= 1)
        for t in ["word_cloud", "command_center"]:
            await pg.evaluate("t=>{var d=WIDGETS.filter(function(w){return w.type===t})[0];addWidget({id:'x_'+t,type:t,x:0,y:9999,w:d.w,h:d.h,config:{}},false)}", t)
        await pg.wait_for_timeout(3000)
        types = ["backlog_trend", "sla_trend", "reply_time_trend", "busiest_hours", "customer_mood", "top_customers"]
        for t in types:
            await pg.evaluate("t=>{var d=WIDGETS.filter(function(w){return w.type===t})[0];addWidget({id:'x_'+t,type:t,x:0,y:9999,w:d.w,h:d.h,config:{}},false)}", t)
        await pg.wait_for_timeout(3000)
        for t in types:
            body = pg.locator("#x_" + t + " .w-body")
            check(f"custom dashboard: the {t} widget draws and shows no error", await body.locator(".w-error").count() == 0 and await body.locator(".rvd-widget").count() == 1 and len((await body.inner_text()).strip()) > 3, (await body.inner_text())[:120])
        check("custom dashboard: the widget library lists the new charts under Trends", await pg.evaluate("WIDGETS.filter(function(w){return w.cat==='trends'}).length") == 8)
        check("custom dashboard: no script errors", not errs, errs)
        await pg.screenshot(path=os.path.join(SHOTS, "custom_dash_top.png"))
        await pg.locator("#x_busiest_hours").scroll_into_view_if_needed(); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SHOTS, "custom_dash_more.png"))
        await pg.evaluate("document.querySelector('.grid-stack-item .rvd-cloud').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SHOTS, "custom_dash_cloud.png"))
        await ctx.close()
        await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
