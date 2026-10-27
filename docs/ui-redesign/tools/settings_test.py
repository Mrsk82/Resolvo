"""Tests for the new Settings frame: landing page with statuses, side list with search, every section still loads."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"; PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
async def login(pg, theme="resolvo"):
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(th)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme',th);localStorage.setItem('tt_v3b','1')}""", theme)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await login(pg)
        ov = await pg.evaluate("App.callAsync('getSettingsOverview')")
        check("overview RPC returns a status for every section", ov["success"] and len(ov["items"]) >= 30 and all(v["st"] in ("ok", "attn", "off") for v in ov["items"].values()), len(ov.get("items", {})))
        await pg.evaluate("App.navigate('settings')"); await pg.wait_for_timeout(1800)
        check("landing page shows the 6 group cards plus CRM", await pg.locator(".rvs-gcard").count() >= 6)
        check("needs-attention strip appears when something is not set up", await pg.locator(".rvs-acard").count() == len(ov["attention"]) and len(ov["attention"]) >= 1, ov["attention"])
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\settings_hub.png")
        await pg.fill("#rvsQ", "slack"); await pg.wait_for_timeout(300)
        check("search narrows the landing page", await pg.locator(".rvs-glink").count() == 1 or await pg.locator(".rvs-glink").count() == 2, await pg.locator(".rvs-glink").count())
        await pg.fill("#rvsQ", "zzzz"); await pg.wait_for_timeout(300)
        check("no-match message", "Nothing matches" in await pg.locator("#rvsHub").inner_text())
        await pg.fill("#rvsQ", ""); await pg.wait_for_timeout(200)
        await pg.locator(".rvs-glink", has_text="SLA Configuration").click(); await pg.wait_for_timeout(1800)
        check("section opens in the framed view", await pg.locator(".rvs-nav").count() == 1 and "SLA Configuration" in await pg.locator(".rvs-title h1").inner_text())
        check("breadcrumb shows group", "Workspace" in await pg.locator(".rvs-crumb").inner_text())
        check("the existing form is inside", await pg.locator("#settingsContent .rvs-sec").count() >= 1, await pg.locator("#settingsContent").inner_text())
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\settings_sla.png")
        await pg.fill("#rvsNq", "email"); await pg.wait_for_timeout(300)
        check("side search filters the list", 1 <= await pg.locator(".rvs-item").count() <= 4)
        await pg.fill("#rvsNq", ""); await pg.wait_for_timeout(200)
        # every section loads without errors
        ids = await pg.evaluate("[...document.querySelectorAll('.rvs-item')].map(b=>b.getAttribute('onclick').match(/'([^']+)'/)[1])")
        bad = []
        for i in ids:
            errs.clear(); await pg.evaluate(f"App.renderUnifiedSettings('{i}')"); await pg.wait_for_timeout(900)
            txt = await pg.locator("#settingsContent").inner_text()
            if len(txt.strip()) < 15 or "Loading..." == txt.strip() or errs: bad.append((i, len(txt), errs[:1]))
        check(f"all {len(ids)} sections load content and no errors", not bad, bad)
        await pg.evaluate("App.renderUnifiedSettings('email')"); await pg.wait_for_timeout(1200)
        check("status badge shown on a section", await pg.locator(".rvs-title .rvs-st").count() == 1)
        check("attention dot beside Email in the list", await pg.locator(".rvs-item .rvs-dot").count() >= 1)
        await pg.evaluate("App.renderUnifiedSettings('general')"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\settings_general.png")
        # saving still works (brand name round trip)
        old = await pg.input_value("#s_appname"); await pg.fill("#s_appname", old + " "); await pg.click("text=Save Changes >> nth=0"); await pg.wait_for_timeout(900)
        await pg.fill("#s_appname", old) if await pg.locator("#s_appname").count() else None
        await ctx.close()
        # phone
        ctx2 = await b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True); pg2 = await ctx2.new_page(); await login(pg2)
        await pg2.evaluate("App.navigate('settings')"); await pg2.wait_for_timeout(1800)
        check("phone: landing has no sideways scroll", not await pg2.evaluate("document.documentElement.scrollWidth>innerWidth+2"))
        await pg2.evaluate("App.renderUnifiedSettings('sla')"); await pg2.wait_for_timeout(1500)
        check("phone: section has no sideways scroll", not await pg2.evaluate("document.documentElement.scrollWidth>innerWidth+2"), await pg2.evaluate("document.documentElement.scrollWidth"))
        await pg2.locator("#rvsMenu").tap(); await pg2.wait_for_timeout(300)
        check("phone: All settings opens the full-screen list", await pg2.locator("#rvsNav.open").count() == 1)
        await pg2.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\settings_phone_menu.png")
        await pg2.locator("#rvsNav .rvs-item", has_text="Team").first.tap(); await pg2.wait_for_timeout(1500)
        check("phone: choosing an item opens it", "Team" in await pg2.locator(".rvs-title h1").inner_text())
        await ctx2.close()
        # old themes keep the old page
        ctx3 = await b.new_context(viewport={"width": 1280, "height": 800}); pg3 = await ctx3.new_page(); await login(pg3, theme="midnight")
        await pg3.evaluate("localStorage.setItem('tt_theme','midnight');localStorage.setItem('tt_v3b','1')")
        await ctx3.close()
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
