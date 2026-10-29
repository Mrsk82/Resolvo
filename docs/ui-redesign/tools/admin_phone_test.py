"""Phone glitch fixes on admin screens (390x844): nothing runs off the screen, tables become cards, three broken pages render."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:250]) if d and not ok else ""))
PAGES = [("user-management", "App.navigate('user-management')"), ("export", "App.navigate('export')"), ("ai-hub", "App.navigate('ai-hub')"),
         ("reports", "App.navigate('reports')"), ("email settings", "App.renderUnifiedSettings('email')"), ("settings", "App.navigate('settings')"),
         ("integrations", "App.renderUnifiedSettings('integrations')"), ("queue settings", "App.renderUnifiedSettings('queue-config')"),
         ("sla settings", "App.renderUnifiedSettings('sla')"), ("whatsapp", "App.navigate('whatsapp-settings')"), ("customers", "App.navigate('customers')"),
         ("insights", "App.navigate('insights')"), ("dashboard", "App.navigate('dashboard')"), ("announcements", "App.navigate('announcements')"),
         ("teams", "App.navigate('teams')"), ("escalations", "App.navigate('escalations')"), ("leaderboard", "App.navigate('leaderboard')"), ("cfd", "App.navigate('cfd')")]
async def session(b, email):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(em)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""", email)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2400)
    return ctx, pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for email in ("admin@showcase.local", "admin@demo.local"):
            ctx, pg, errs = await session(b, email)
            wide, broke = [], []
            for name, call in PAGES:
                errs.clear(); await pg.evaluate(call); await pg.wait_for_timeout(1300)
                if await pg.evaluate("document.documentElement.scrollWidth") > 392: wide.append(name)
                txt = (await pg.locator("#contentArea").inner_text()).strip()
                if errs or len(txt) < 20 or await pg.locator("#contentArea .loader-bar").count(): broke.append((name, errs[:1]))
            check(f"{email}: no admin screen is wider than the phone", not wide, wide)
            check(f"{email}: no admin screen is blank or throws an error", not broke, broke)
            if email == "admin@showcase.local":
                await pg.evaluate("App.navigate('user-management')"); await pg.wait_for_timeout(1500)
                r = await pg.evaluate("""()=>{const tr=document.querySelector('.um-table tbody tr');const h=document.querySelector('.um-table thead');const b=[...document.querySelectorAll('.page-header button')].map(e=>Math.round(e.getBoundingClientRect().right));return {grid:getComputedStyle(tr).display,head:getComputedStyle(h).display,maxRight:Math.max(...b),rowH:Math.round(tr.getBoundingClientRect().height)}}""")
                check("users: each person is a card and the header buttons fit", r["grid"] == "grid" and r["head"] == "none" and r["maxRight"] <= 380 and r["rowH"] < 260, r)
                await pg.evaluate("App.navigate('export')"); await pg.wait_for_timeout(1500)
                r = await pg.evaluate("""()=>{const a=document.querySelector('.exp-hist').getBoundingClientRect(),b=document.querySelector('.exp-panel').getBoundingClientRect();return {stacked:b.top>=a.bottom-2,panelW:Math.round(b.width),right:Math.round(Math.max(...[...document.querySelectorAll('.exp-panel input')].map(e=>e.getBoundingClientRect().right)))}}""")
                check("download data: history above, form below, fields inside the screen", r["stacked"] and r["panelW"] > 300 and r["right"] <= 380, r)
                await pg.evaluate("App.navigate('ai-hub')"); await pg.wait_for_timeout(1500)
                cols = await pg.evaluate("getComputedStyle(document.querySelector('.rvm-stack')).gridTemplateColumns.split(' ').length")
                check("AI hub: cards stack in one column", cols == 1, cols)
                await pg.evaluate("App.navigate('reports')"); await pg.wait_for_timeout(1500)
                r = await pg.evaluate("""()=>{const s=document.querySelector('.rpt-sel').getBoundingClientRect(),d=[...document.querySelectorAll('.rpt-date')].map(e=>e.getBoundingClientRect());return {selW:Math.round(s.width),dates:d.length,sameRow:Math.abs(d[0].top-d[1].top)<4,right:Math.round(Math.max(...d.map(x=>x.right)))}}""")
                check("reports: picker full width, two dates side by side", r["selW"] > 300 and r["dates"] == 2 and r["sameRow"] and r["right"] <= 380, r)
                await pg.evaluate("App.navigate('cfd')"); await pg.wait_for_timeout(1200)
                check("cumulative flow shows a bar for each status", await pg.locator("#contentArea").inner_text() and "Open" in await pg.locator("#contentArea").inner_text() and "Resolved" in await pg.locator("#contentArea").inner_text())
                await pg.evaluate("App.navigate('escalations')"); await pg.wait_for_timeout(1200)
                check("escalation rules list their names", "Unassigned for 2 hours" in await pg.locator("#contentArea").inner_text())
                tiny = await pg.evaluate("[...document.querySelectorAll('#contentArea button')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.height<34}).length")
                check("buttons on a phone are thumb-sized", tiny == 0, tiny)
            await ctx.close()
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
