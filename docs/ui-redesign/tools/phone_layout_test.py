"""Phone layout checks (390x844): bottom bar, single new-ticket button, aligned header, 2-up stats, customer cards."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:250]) if d and not ok else ""))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ananya@showcase.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2400)
        labels = await pg.evaluate("[...document.querySelectorAll('#mobileNav .mobile-nav-item')].map(e=>e.innerText.trim().split('\\n')[0])")
        check("bottom bar is Inbox, Customers, New, Insights, More", labels == ["Inbox", "Customers", "New", "Insights", "More"], labels)
        vis = lambda sel: pg.evaluate(f"[...document.querySelectorAll('{sel}')].some(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none')")
        check("floating + and header 'New ticket' are hidden (one new button)", not await vis("#quickCaptureFab") and not await vis("#topbarPrimary"))
        row = await pg.evaluate("""()=>{const h=document.getElementById('topbarHamburger').getBoundingClientRect(),t=document.getElementById('pageTitle').getBoundingClientRect();return {dy:Math.abs((h.top+h.height/2)-(t.top+t.height/2)),sameRow:t.left>h.right-2}}""")
        check("menu button and title are on one centred line", row["sameRow"] and row["dy"] < 6, row)
        st = await pg.evaluate("[...document.querySelectorAll('.rv-grid--kpi')][0] && getComputedStyle(document.querySelector('.rv-grid--kpi')).gridTemplateColumns.split(' ').length")
        check("dashboard stats are two across", st == 2, st)
        check("dashboard has no sideways scroll", not await pg.evaluate("document.documentElement.scrollWidth>innerWidth+2"))
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_timeout(2000)
        check("customers: table header hidden, rows are cards", not await vis(".cust-head") and await pg.locator(".cust-row").count() > 3)
        r = await pg.evaluate("""()=>{const n=document.querySelector('.cust-row > div:first-child > div:nth-child(2) > div:first-child');return {w:Math.round(n.getBoundingClientRect().width),txt:n.innerText}}""")
        check("customers: names are readable, not cut to one letter", r["w"] > 100 and len(r["txt"]) > 3, r)
        check("customers: search box fits (no sideways scroll)", not await pg.evaluate("document.documentElement.scrollWidth>innerWidth+2"))
        await pg.locator("#mobileNav .mobile-nav-item", has_text="Insights").tap(); await pg.wait_for_timeout(1500)
        check("Insights tab is highlighted when open", await pg.evaluate("document.querySelector('#mobileNav .mobile-nav-item.active').innerText.includes('Insights')"))
        await pg.locator("#mobileNav .mobile-nav-item", has_text="Inbox").tap(); await pg.wait_for_timeout(1500)
        badge = await pg.evaluate("(()=>{const b=document.getElementById('mobileInboxBadge');return b&&!b.hidden?b.textContent:null})()")
        check("Inbox tab shows the unread count", badge is not None and badge.isdigit(), badge)
        await pg.locator("#mobileNav .mbn-new").tap(); await pg.wait_for_timeout(1200)
        check("centre + opens the new-ticket flow", await pg.locator(".modal-overlay, .rv-overlay, .rv-modal, [id*=quickCapture], [id*=newTicket], #contentArea form").count() > 0)
        await pg.evaluate("document.querySelectorAll('.modal-overlay, .rv-overlay').forEach(e=>e.remove())")
        await pg.locator("#mobileNav .mobile-nav-item", has_text="More").tap(); await pg.wait_for_timeout(700)
        check("More opens the full menu drawer", await pg.evaluate("document.querySelector('.sidebar').getBoundingClientRect().left>=-1"))
        check("no page errors", not errs, errs[:2])
        await ctx.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
