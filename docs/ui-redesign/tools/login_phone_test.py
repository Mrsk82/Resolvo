"""Login screen on phones: fits the screen, readable fields, Show password works, signing in still works."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"; PASS, FAIL = [], []
OUT = "C:/Users/Asif/Desktop/New/Resolvo-UI-files/mobile-audit/login_"
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:250]) if d and not ok else ""))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for w, h in [(390, 844), (360, 640)]:
            ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = await ctx.new_page()
            await pg.goto(BASE + "/?source=app"); await pg.wait_for_selector("#loginEmail"); await pg.wait_for_timeout(600)
            r = await pg.evaluate("""()=>{const f=document.getElementById('login-right').getBoundingClientRect(),i=document.getElementById('loginEmail').getBoundingClientRect(),b=document.getElementById('loginBtn').getBoundingClientRect(),fg=[...document.querySelectorAll('#login-right button')].find(x=>/Forgot/.test(x.innerText)).getBoundingClientRect();
              return {panelW:Math.round(f.width),inputRight:Math.round(i.right),inputH:Math.round(i.height),btnH:Math.round(b.height),btnRight:Math.round(b.right),forgotRight:Math.round(fg.right),sw:document.documentElement.scrollWidth,logo:getComputedStyle(document.getElementById('login-mobile-logo')).display}}""")
            check(f"{w}px: form fits the screen (no cut-off)", r["panelW"] <= w and r["inputRight"] <= w - 12 and r["btnRight"] <= w - 12 and r["forgotRight"] <= w - 12 and r["sw"] <= w + 1, r)
            check(f"{w}px: fields and button are thumb-sized", r["inputH"] >= 50 and r["btnH"] >= 52, r)
            check(f"{w}px: logo shows", r["logo"] == "flex", r)
            await pg.screenshot(path=OUT + f"after_{w}.png")
            if w == 390:
                await pg.fill("#loginPassword", "secret12")
                await pg.locator("#loginShowPw").tap()
                check("Show reveals the password", await pg.evaluate("document.getElementById('loginPassword').type") == "text" and (await pg.locator("#loginShowPw").inner_text()) == "Hide")
                await pg.locator("#loginShowPw").tap()
                check("Hide masks it again", await pg.evaluate("document.getElementById('loginPassword').type") == "password")
                await pg.fill("#loginEmail", "ananya@showcase.local"); await pg.fill("#loginPassword", "demo1234")
                await pg.locator("#loginPassword").press("Enter"); await pg.wait_for_timeout(3500)
                check("signing in with Enter works", await pg.evaluate("!!(App.currentUser&&App.currentUser.email)") and not await pg.locator("#login-screen:visible").count())
            await ctx.close()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page()
        await pg.goto(BASE + "/"); await pg.wait_for_selector("#loginEmail"); await pg.wait_for_timeout(600)
        check("desktop: brand panel and form still side by side", await pg.evaluate("document.getElementById('login-left').getBoundingClientRect().width>300&&Math.round(document.getElementById('login-right').getBoundingClientRect().width)===460"))
        check("desktop: mobile logo stays hidden", await pg.evaluate("getComputedStyle(document.getElementById('login-mobile-logo')).display==='none'"))
        await pg.screenshot(path=OUT + "after_desktop.png")
        await ctx.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
