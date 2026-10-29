"""Tests for the Insights page: server numbers cross-checked against the ticket list, every tab, range switch, sort, legacy pages with the tab bar, phone."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
async def login(pg):
    await pg.goto(BASE + "/")
    await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)
async def api(pg, fn, *a): return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(a)])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await login(pg)
        # seed a few sample tickets so there is something to count
        await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');const h={'x-session-token':t,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});await fetch('/api/sample-tickets',{method:'POST',headers:h})}""")
        r = await api(pg, "getInsights", {"days": 14})
        check("getInsights returns the expected shape", r["success"] and len(r["labels"]) == 14 and len(r["series"]["created"]) == 14 and len(r["series"]["createdPrev"]) == 14 and len(r["heat"]) == 7 and len(r["heat"][0]) == 6, list(r.keys()))
        allt = (await api(pg, "getTickets", {"status": "all", "limit": 1000, "promo": "exclude"}))["tickets"]
        from datetime import datetime, timedelta, timezone
        ist = timezone(timedelta(hours=5, minutes=30)); today = datetime.now(ist).date()
        start = today - timedelta(days=13)
        def d(t):
            try: return datetime.fromisoformat(t["createdDate"].replace("Z", "+00:00")).astimezone(ist).date()
            except Exception: return None
        mine = sum(1 for t in allt if d(t) and start <= d(t) <= today)
        check("created total matches the ticket list (excluding promotions)", r["kpi"]["created"][0] == mine, (r["kpi"]["created"][0], mine))
        check("series sums to the same total", sum(r["series"]["created"]) == r["kpi"]["created"][0])
        r7, r30 = await api(pg, "getInsights", {"days": 7}), await api(pg, "getInsights", {"days": 30})
        check("range options change the window (7 / 30)", len(r7["labels"]) == 7 and len(r30["labels"]) == 30 and r7["kpi"]["created"][0] <= r["kpi"]["created"][0] <= r30["kpi"]["created"][0])
        bad = await api(pg, "getInsights", {"days": 9999})
        check("days is clamped (max 90)", len(bad["labels"]) == 90)
        check("agents have numbers and a trend", all(isinstance(a["open"], int) and len(a["trend"]) == 14 for a in r["agents"]))
        await pg.evaluate("App.navigate('insights')"); await pg.wait_for_timeout(2000)
        check("Overview shows 5 KPI cards, a chart and cards", await pg.locator(".rvn-kpi").count() == 5 and await pg.locator(".rvn-chart").count() == 1 and await pg.locator(".rvn-card").count() >= 4)
        check("KPI 'Tickets' equals the server", (await pg.locator(".rvn-kpi").first.locator(".rvn-kpi__n").inner_text()).strip() == str(r["kpi"]["created"][0]))
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\insights_overview.png")
        before = await pg.locator(".rvn-head p").inner_text()
        await pg.click("#rvnRange button[data-days='30']"); await pg.wait_for_timeout(1500)
        check("30-day button redraws", (await pg.locator(".rvn-head p").inner_text()) != before and await pg.locator("#rvnRange button[aria-pressed=true]").inner_text() == "30 days")
        await pg.click("#rvnRange button[data-days='14']"); await pg.wait_for_timeout(1200)
        await pg.uncheck("#rvnCmp"); await pg.wait_for_timeout(300)
        check("compare toggle removes the dashed line and deltas", await pg.locator(".rvn-delta").count() == 0)
        await pg.check("#rvnCmp"); await pg.wait_for_timeout(300)
        await pg.get_by_role("tab", name="Questions").click(); await pg.wait_for_timeout(1500)
        check("Questions: six plain-language cards", await pg.locator(".rvn-q").count() == 6)
        txt = await pg.locator(".rvn-qs").inner_text()
        check("Questions: sentences, not blanks", "undefined" not in txt and "NaN" not in txt and "null" not in txt, txt[:200])
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\insights_questions.png")
        await pg.get_by_role("tab", name="Team").click(); await pg.wait_for_timeout(1500)
        check("Team: table, heatmap", await pg.locator("#rvnTbl").count() == 1 and await pg.locator(".rvn-hm i").count() == 42 or len(r["agents"]) == 0)
        if r["agents"]:
            await pg.locator("#rvnTbl th[data-k=resolved]").click(); await pg.wait_for_timeout(400)
            check("Team: click a column to sort", await pg.locator("#rvnTbl th[aria-sort]").count() == 1)
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\insights_team.png")
        await pg.get_by_role("tab", name="Reports").click(); await pg.wait_for_timeout(2500)
        check("Reports tab opens the existing Reports page with the tab bar on top", await pg.locator("#rvnStrip").count() == 1 and len((await pg.locator("#contentArea").inner_text()).strip()) > 100)
        check("sidebar keeps Insights highlighted", await pg.locator(".nav-item.active[data-page=insights]").count() == 1)
        await pg.get_by_role("tab", name="Customers").click(); await pg.wait_for_timeout(2500)
        check("Customers tab opens Customer health with the tab bar", await pg.locator("#rvnStrip").count() == 1)
        await pg.evaluate("App.navigate('analytics')"); await pg.wait_for_timeout(2000)
        check("old Analytics page still works", len((await pg.locator("#contentArea").inner_text()).strip()) > 50)
        await pg.evaluate("App.navigate('workload')"); await pg.wait_for_timeout(2000)
        check("old Workload page still works", len((await pg.locator("#contentArea").inner_text()).strip()) > 50)
        check("no console or page errors", not errs, errs[:3])
        await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{method:'DELETE',headers:{'x-session-token':t}})}""")
        await ctx.close()
        ctx2 = await b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True); pg2 = await ctx2.new_page(); await login(pg2)
        for tab in ("overview", "questions", "team"):
            await pg2.evaluate(f"App.renderInsights('{tab}')"); await pg2.wait_for_timeout(1700)
            check(f"phone: {tab} has no sideways scroll", not await pg2.evaluate("document.documentElement.scrollWidth>innerWidth+2"), await pg2.evaluate("document.documentElement.scrollWidth"))
        await pg2.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\insights_team_390.png")
        await ctx2.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
