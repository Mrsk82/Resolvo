"""Tests: the nine older themes map to Resolvo Light/Dark, the picker offers two, a brand theme does not override the person's choice, the single-letter shortcuts work (and stay out of the inbox)."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
async def boot(b, theme, vw=1280):
    ctx = await b.new_context(viewport={"width": vw, "height": 800}); pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(th)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_v3b','1');if(th)localStorage.setItem('tt_theme',th);localStorage.setItem('tt_brand_theme','midnight')}""", theme)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2500)
    return ctx, pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for old, want in (("midnight", "resolvo-dark"), ("nova", "resolvo-dark"), ("forest", "resolvo-dark"), ("arctic", "resolvo"), ("uiux", "resolvo"), ("clarity", "resolvo"), ("resolvo-dark", "resolvo-dark"), ("resolvo", "resolvo"), (None, "resolvo")):
            ctx, pg, errs = await boot(b, old)
            got = await pg.evaluate("document.documentElement.getAttribute('data-theme')")
            saved = await pg.evaluate("localStorage.getItem('tt_theme')")
            check(f"saved theme {old!r} becomes {want}", got == want and (saved == want or old is None), (got, saved))
            await ctx.close()
        ctx, pg, errs = await boot(b, "resolvo")
        check("the brand theme 'midnight' does not override the person's Light choice", await pg.evaluate("document.documentElement.getAttribute('data-theme')") == "resolvo")
        check("the theme picker offers exactly two themes", await pg.locator(".theme-option").count() == 2, await pg.locator(".theme-option").count())
        await pg.evaluate("Themes.apply('neon', true)")
        check("applying a retired theme by code falls back to Dark", await pg.evaluate("document.documentElement.getAttribute('data-theme')") == "resolvo-dark")
        await pg.evaluate("Themes.apply('resolvo', true)")
        # shortcuts
        await pg.evaluate("App.navigate('dashboard')"); await pg.wait_for_timeout(1500)
        await pg.keyboard.press("n"); await pg.wait_for_timeout(1200)
        check("N opens New issue (it used to throw an error)", await pg.evaluate("App.currentPage") in ("create-issue",) or "New Issue" in await pg.locator(".topbar, #pageTitle, h1").first.inner_text(), await pg.evaluate("App.currentPage"))
        await pg.keyboard.press("d"); await pg.wait_for_timeout(1500)
        check("D goes to the dashboard", await pg.evaluate("App.currentPage") == "dashboard")
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(2000)
        await pg.keyboard.press("k"); await pg.wait_for_timeout(800)
        check("in the inbox, K does not jump to the Kanban board", await pg.evaluate("App.currentPage") == "ticket-inbox", await pg.evaluate("App.currentPage"))
        await pg.locator("#ticketSearch").click(); await pg.keyboard.type("nkdl"); await pg.wait_for_timeout(500)
        check("typing in a field never triggers shortcuts", await pg.evaluate("App.currentPage") == "ticket-inbox")
        check("no page errors", not errs, errs[:3])
        await ctx.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
