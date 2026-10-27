"""Takes the product screenshots used on the website, from the fictional 'Brightkart Support' workspace (seed_showcase.js).
Output: public/img/app-*.jpg. Usage: python shoot_showcase.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "img")
LOGIN = """async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@showcase.local',password:'demo1234'})}).then(x=>x.json());if(!r.token)throw new Error('login failed '+JSON.stringify(r));localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');localStorage.setItem('tt_inbox_focus','0');localStorage.setItem('onb_hidden_showcase','1')}"""
async def shot(pg, name, **kw):
    path = os.path.join(OUT, name); await pg.screenshot(path=path, type="jpeg", quality=84, **kw); print("saved", name, os.path.getsize(path) // 1024, "KB")
async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page()
        await pg.goto(BASE + "/"); await pg.evaluate(LOGIN); await pg.goto(BASE + "/"); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.getElementById('quickCaptureFab')&&(document.getElementById('quickCaptureFab').style.display='none')")
        hide_fab = "document.querySelectorAll('#quickCaptureFab,.fab').forEach(e=>e.style.display='none')"
        await pg.evaluate("App.navigate('dashboard')"); await pg.wait_for_timeout(3000); await pg.evaluate(hide_fab); await shot(pg, "app-today.jpg")
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(2500)
        await pg.locator(".rvi-row", has_text="Refund for order").first.click(); await pg.wait_for_timeout(1500); await pg.evaluate(hide_fab); await shot(pg, "app-inbox.jpg")
        await pg.evaluate("RVI.setView('promo');App.renderTicketInbox()"); await pg.wait_for_timeout(2000); await pg.evaluate(hide_fab); await shot(pg, "app-promotions.jpg")
        await pg.evaluate("RVI.setView('all');RVI.setFocus(true)"); await pg.wait_for_timeout(2500); await pg.evaluate(hide_fab); await shot(pg, "app-focus-queue.jpg")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1800); await pg.evaluate(hide_fab); await shot(pg, "app-focus-reading.jpg")
        await pg.evaluate("RVI.setFocus(false)"); await pg.wait_for_timeout(500)
        for tab, name in (("overview", "app-insights.jpg"), ("questions", "app-insights-questions.jpg"), ("team", "app-insights-team.jpg")):
            await pg.evaluate(f"App.renderInsights('{tab}')"); await pg.wait_for_timeout(2500); await pg.evaluate(hide_fab); await shot(pg, name)
        await pg.evaluate("App.navigate('settings')"); await pg.wait_for_timeout(2500); await pg.evaluate(hide_fab); await shot(pg, "app-settings.jpg")
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_timeout(3000); await pg.evaluate(hide_fab); await shot(pg, "app-customers.jpg")
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(500); await pg.keyboard.type("meera"); await pg.wait_for_timeout(1500); await shot(pg, "app-palette.jpg")
        await ctx.close()
        m = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pm = await m.new_page()
        await pm.goto(BASE + "/"); await pm.evaluate(LOGIN); await pm.evaluate("localStorage.removeItem('tt_inbox_focus')"); await pm.goto(BASE + "/"); await pm.wait_for_timeout(3000)
        await pm.evaluate("App.navigate('ticket-inbox')"); await pm.wait_for_timeout(2800); await pm.evaluate(hide_fab); await shot(pm, "app-phone-queue.jpg")
        await pm.locator(".rvf-item").first.tap(); await pm.wait_for_timeout(1800); await shot(pm, "app-phone-reading.jpg")
        await b.close()
asyncio.run(main())
