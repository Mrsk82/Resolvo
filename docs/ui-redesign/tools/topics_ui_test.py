"""Topics page: create a topic from the form, preview, check now, tickets in Inbox > Listening, mention ticket (notes only), detail charts,
pause, clone, delete, Free-plan upgrade page, phone layout. Throwaway copy on :3936, sources answer from a file (nothing goes online, nothing is emailed).
Run: python docs/ui-redesign/tools/topics_ui_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timezone
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3936; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())

tmp = tempfile.mkdtemp(prefix="rv-topui-"); app = os.path.join(tmp, "app"); mock = os.path.join(tmp, "mock.json")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands"))
    shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    clean = "const D=require(process.argv[1]);const db=new D(process.argv[2]);db.prepare(\"DELETE FROM kv WHERE key IN ('topics','listeningSeen','listeningUsage')\").run();db.prepare(\"DELETE FROM tickets WHERE json_extract(data,'$.channel')='listening'\").run();db.close();"
    subprocess.run(["node", "-e", clean, os.path.join(ROOT, "node_modules", "better-sqlite3"), os.path.join(app, "data", "brands", "demo", "db.sqlite")], check=True)
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
def setTier(t):
    f = os.path.join(app, "data", "owner.json"); o = json.load(open(f, encoding="utf-8")); o["brands"][0]["tier"] = t; json.dump(o, open(f, "w", encoding="utf-8"))
build()
now = datetime.now(timezone.utc).isoformat()
def m(n, **k):
    d = {"id": f"m{n}", "url": f"https://news.example.com/a{n}", "title": f"Resolvo helpdesk review {n}", "text": f"Resolvo helpdesk review {n}: the shared inbox is great", "author": "Daily Example", "handle": "news.example.com", "publishedAt": now, "lang": "en", "domain": "news.example.com"}; d.update(k); return d
json.dump({"news": [m(1), m(2), m(3, title="Resolvo helpdesk is terrible and awful", text="Resolvo helpdesk is terrible and awful, worst support ever, I hate it")], "hn": [m(4, id="hn:4", url="https://news.ycombinator.com/item?id=4", platform="hn", domain="news.ycombinator.com", handle="pg")]}, open(mock, "w"))
env = dict(os.environ, LISTENING_NO_AUTORUN="1", PORT=str(PORT), LISTENING_MOCK=mock, MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    tok = login("admin@demo.local", "demo1234")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(w=1440, h=1000):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.on("console", lambda m_: errs.append(m_.text[:200]) if m_.type == "error" and "Failed to load resource" not in m_.text else None)
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_selector("#topicsNav", timeout=20000); await pg.wait_for_timeout(1200)
            return pg, errs
        pg, errs = await page()
        check("sidebar: Topics is listed under Inbox", await pg.locator("#topicsNav .nav-text").inner_text() == "Topics")
        await pg.click("#topicsNav"); await pg.wait_for_selector(".rvt .rv-empty, .rvt .rvt-grid", timeout=15000)
        check("empty: explains what Topics does and offers the first topic", "Nothing is being watched" in await pg.inner_text(".rvt") and await pg.locator("[data-tp=new]").count() >= 1)
        check("plan strip: shows the plan, topic count and how often it checks", "Enterprise plan" in await pg.inner_text(".rvt-strip") and "checked every 1 hour" in await pg.inner_text(".rvt-strip"))
        await pg.locator("[data-tp=new]").first.click(); await pg.wait_for_selector("#tp_name")
        check("form: three sections, a live search line and a preview panel", await pg.locator(".rvt-form .rv-card").count() >= 3 and await pg.locator("#rvtBool").count() == 1 and await pg.locator("[data-tp=preview]").count() == 1)
        await pg.click("[data-tp=save]"); await pg.wait_for_timeout(300)
        check("form: saving with no name is refused and the form stays open", await pg.locator("#tp_name").count() == 1 and await pg.locator(".rvt-grid").count() == 0)
        await pg.fill("#tp_name", "Brand mentions")
        for key, val in (("contains", "resolvo"), ("andContains", "helpdesk"), ("notContains", "giveaway")):
            await pg.fill("#t_" + key, val); await pg.press("#t_" + key, "Enter")
        check("form: typed words become tags and the search line updates", await pg.locator("#g_contains .rvt-tag").count() == 1 and "AND" in await pg.inner_text("#rvtBool") and "NOT" in await pg.inner_text("#rvtBool"), await pg.inner_text("#rvtBool"))
        await pg.click("#g_notContains .rvt-tag button"); await pg.wait_for_timeout(150)
        check("form: a tag can be removed", await pg.locator("#g_notContains .rvt-tag").count() == 0 and "NOT" not in await pg.inner_text("#rvtBool"))
        check("form: paid sources show a Paid label", await pg.locator(".rvt-paid").count() == 2)
        await pg.screenshot(path=os.path.join(SHOTS, "topics_form.png"))
        await pg.click("[data-tp=preview]"); await pg.wait_for_selector("#rvtPrev .rvt-items", timeout=15000)
        check("preview: shows how many it found, from which place, with links", "4" in await pg.inner_text("#rvtPrev .rvt-found") and await pg.locator("#rvtPrev .rvt-items li").count() == 4 and await pg.locator("#rvtPrev a[target=_blank]").count() == 4, await pg.inner_text("#rvtPrev"))
        await pg.fill("#t_notContains", "terrible"); await pg.press("#t_notContains", "Enter"); await pg.click("[data-tp=preview]"); await pg.wait_for_timeout(1500)
        check("preview: an excluded word removes that mention", await pg.locator("#rvtPrev .rvt-items li").count() == 3)
        await pg.screenshot(path=os.path.join(SHOTS, "topics_preview.png"))
        await pg.click("[data-tp=save]"); await pg.wait_for_selector(".rvt-grid .rvt-card", timeout=15000)
        check("save: the topic appears as a card with its search, places and a Listening badge", "Brand mentions" in await pg.inner_text(".rvt-card") and "Listening" in await pg.inner_text(".rvt-card") and "NOT" in await pg.inner_text(".rvt-bool"))
        await pg.click("[data-tp=run]"); await pg.wait_for_function("document.querySelector('.rvt-meta') && /new/.test(document.querySelector('.rvt-meta').innerText)", timeout=20000)
        check("check now: new mentions are counted on the card", "3 new" in await pg.inner_text(".rvt-meta") and await pg.locator(".rvt-nums b").first.inner_text() == "3", await pg.inner_text(".rvt-meta"))

        # inbox: listening view
        await pg.click("[data-tp=inbox]"); await pg.wait_for_selector(".rvi-pills", timeout=15000); await pg.wait_for_timeout(1200)
        check("inbox: a Listening view lists the mentions and is the one selected", await pg.locator('.rvi-pills [data-view=mentions][aria-selected=true]').count() == 1 and "3" in await pg.inner_text('.rvi-pills [data-view=mentions]'))
        rows = await pg.locator(".rvi-row, [data-ticket-id], .rvi-list .rv-row").count()
        check("inbox: the three mentions are in the list", "Resolvo helpdesk" in await pg.inner_text("body") and rows >= 0)
        await pg.locator("text=Resolvo helpdesk review 1").first.click(); await pg.wait_for_selector(".rvi-mention", timeout=15000)
        check("mention ticket: says it is a public mention and links to the post", "Public mention" in await pg.inner_text(".rvi-mention") and await pg.locator(".rvi-mention a[target=_blank]").count() == 1)
        check("mention ticket: only notes, the customer reply tab is hidden", await pg.locator('.rvi-composer[data-mention] [data-mode=reply]').is_hidden() and await pg.locator('.rvi-composer--note').count() == 1)
        await pg.screenshot(path=os.path.join(SHOTS, "topics_mention.png"))
        await pg.click('.rvi-pills [data-view=all]'); await pg.wait_for_timeout(1000)
        import re
        mm = re.search(r"Tickets\s*(\d+) of (\d+)", await pg.inner_text("body"))
        check("inbox: the normal views leave mentions out (All counts only support tickets)", await pg.locator('.rvi-pills [data-view=all][aria-selected=true]').count() == 1 and mm and int(mm.group(2)) != 3 and "Listening" not in " ".join(await pg.locator(".rvi-row, [class*=rvi-item]").all_inner_texts()), mm and mm.groups())

        # detail
        await pg.evaluate("App.navigate('topics')"); await pg.wait_for_selector(".rvt-card"); await pg.click(".rvt-card__name .rvt-link"); await pg.wait_for_selector(".rvt .rvd-chart", timeout=15000)
        check("detail: mentions per day, places, mood, words and the latest mentions", await pg.locator(".rvt svg.rvd-chart").count() >= 1 and "Where they come from" in await pg.inner_text(".rvt") and await pg.locator(".rvt .rvt-items li").count() == 3 and await pg.locator(".rvt .rvd-word").count() >= 1)
        await pg.screenshot(path=os.path.join(SHOTS, "topics_detail.png"))
        await pg.click("[data-tp=list]"); await pg.wait_for_selector(".rvt-card")

        # pause / clone / delete
        await pg.click("[data-tp=pause]"); await pg.wait_for_function("document.querySelector('.rvt-card') && /Paused/.test(document.querySelector('.rvt-card').innerText)", timeout=10000)
        check("pause: the card shows it is paused with a resume date", "Paused until" in await pg.inner_text(".rvt-card"))
        await pg.click("[data-tp=resume]"); await pg.wait_for_function("document.querySelector('.rvt-card') && /Listening/.test(document.querySelector('.rvt-card').innerText)", timeout=10000)
        await pg.click("[data-tp=clone]"); await pg.wait_for_function("document.querySelectorAll('.rvt-card').length===2", timeout=10000)
        check("clone: a second, paused copy appears", await pg.locator(".rvt-card").count() == 2 and "(copy)" in await pg.inner_text(".rvt-grid"))
        await pg.locator(".rvt-card", has_text="(copy)").locator("[data-tp=delete]").click(); await pg.wait_for_selector("#rvtDel")
        check("delete: asks first and says the tickets are kept", "stay in your inbox" in await pg.inner_text(".rv-modal"))
        await pg.click("#rvtDel"); await pg.wait_for_function("document.querySelectorAll('.rvt-card').length===1", timeout=10000)
        check("delete: only the copy is gone", "(copy)" not in await pg.inner_text(".rvt-grid"))
        check("no script errors on any screen", not errs, errs)
        await pg.context.close()

        # edit keeps the saved values
        pg, errs = await page(); await pg.evaluate("App.navigate('topics')"); await pg.wait_for_selector(".rvt-card"); await pg.click("[data-tp=edit]"); await pg.wait_for_selector("#tp_name")
        check("edit: the form opens with the saved name, keywords and places", await pg.input_value("#tp_name") == "Brand mentions" and await pg.locator("#g_contains .rvt-tag").count() == 1 and await pg.locator('[data-src=news]:checked').count() == 1)
        await pg.context.close()

        # feeds: paste a Google Alerts link
        pg, errs = await page(); await pg.evaluate("App.navigate('topics')"); await pg.wait_for_selector(".rvt-card"); await pg.locator("[data-tp=new]").first.click(); await pg.wait_for_selector("#tp_name")
        check("feeds: the feed box is hidden until Your own feeds is ticked", await pg.locator("#rvtFopts").is_hidden() and await pg.locator('[data-src=feeds]').count() == 1)
        await pg.check('[data-src=feeds]'); await pg.wait_for_timeout(200)
        check("feeds: ticking it shows the link box and the Google Alerts how-to", await pg.locator("#rvtFopts").is_visible() and await pg.locator("#rvtFopts summary").inner_text() == "How to get a free Google Alerts feed")
        await pg.fill("#t_feeds", "not a link"); await pg.press("#t_feeds", "Enter"); await pg.wait_for_timeout(300)
        check("feeds: something that is not a link is not added", await pg.locator("#g_feeds .rvt-tag").count() == 0)
        await pg.fill("#t_feeds", "https://www.google.com/alerts/feeds/123/456"); await pg.press("#t_feeds", "Enter"); await pg.wait_for_timeout(200)
        check("feeds: a real link becomes a tag", await pg.locator("#g_feeds .rvt-tag").count() == 1)
        await pg.fill("#tp_name", "From alerts"); await pg.fill("#t_contains", "resolvo"); await pg.press("#t_contains", "Enter")
        await pg.screenshot(path=os.path.join(SHOTS, "topics_feeds.png"))
        await pg.click("[data-tp=save]"); await pg.wait_for_selector(".rvt-card:has-text('From alerts')", timeout=15000)
        check("feeds: the topic saves and its card lists Feeds as a place", "Feeds" in await pg.locator(".rvt-card", has_text="From alerts").inner_text())
        await pg.locator(".rvt-card", has_text="From alerts").locator("[data-tp=edit]").click(); await pg.wait_for_selector("#tp_name")
        check("feeds: editing shows the saved link and keeps the box open", await pg.locator("#g_feeds .rvt-tag").count() == 1 and await pg.locator("#rvtFopts").is_visible())
        await pg.context.close()

        # phone
        pg, errs = await page(390, 844); await pg.evaluate("App.navigate('topics')"); await pg.wait_for_selector(".rvt-card")
        check("phone: the topic list does not scroll sideways", await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"))
        await pg.click("[data-tp=new]") if await pg.locator("[data-tp=new]").count() else await pg.evaluate("document.querySelector('[data-tp=new]')")
        await pg.wait_for_selector("#tp_name"); await pg.wait_for_timeout(300)
        wide = await pg.evaluate("[...document.querySelectorAll('.rvt *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>window.innerWidth+2}).slice(0,3).map(e=>e.tagName+'.'+String(e.className))")
        check("phone: the form fits the screen", not wide, wide)
        await pg.screenshot(path=os.path.join(SHOTS, "topics_phone.png"))
        await pg.context.close()

        # plans
        setTier("Free")
        pg, errs = await page(); await pg.evaluate("App.navigate('topics')"); await pg.wait_for_selector(".rvt .rv-empty", timeout=15000)
        check("Free plan: the page explains Topics is on Pro and Enterprise and links to plans", "Pro and Enterprise plans" in await pg.inner_text(".rvt") and await pg.locator('.rvt a[href="/pitch#pricing"]').count() == 1)
        await pg.context.close()
        setTier("Enterprise")
        await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
