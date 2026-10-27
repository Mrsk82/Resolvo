"""Tests for the command palette (Ctrl+K), the slimmer sidebar and the ticket-to-issue link."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"; PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
async def api(pg, fn, *a): return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(a)])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');localStorage.setItem('tt_inbox_focus','0');const h={'x-session-token':r.token,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});await fetch('/api/sample-tickets',{method:'POST',headers:h})}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2500)
        nav = await pg.evaluate("[...document.querySelectorAll('.sidebar .nav-label')].map(e=>e.textContent.trim())")
        check("sidebar no longer repeats Automation (it lives in Settings)", "Automation" not in nav, nav)
        check("sidebar has one Insights entry and no separate Reports/Analytics/Workload", await pg.locator(".sidebar [data-page=insights]").count() == 1 and await pg.locator(".sidebar [data-page=reports], .sidebar [data-page=analytics], .sidebar [data-page=workload]").count() == 0)
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(500)
        check("Ctrl+K opens the palette with support actions", await pg.locator("#cmdOverlay.open").count() == 1 and "Work through my queue" in await pg.locator("#cmdResults").inner_text())
        await pg.keyboard.type("priya"); await pg.wait_for_timeout(1500)
        txt = await pg.locator("#cmdResults").inner_text()
        check("typing a customer name finds tickets and customers", "tickets" in txt.lower() and "Priya" in txt, txt[:200])
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\palette.png")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2500)
        check("Enter opens that ticket in the inbox", await pg.locator("#rvi").count() == 1 and await pg.locator(".rvi-row[aria-selected=true]").count() == 1)
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(400); await pg.keyboard.type("insights"); await pg.wait_for_timeout(700)
        check("typing 'insights' lists the Insights pages", "Insights: team" in await pg.locator("#cmdResults").inner_text())
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2200)
        check("Enter goes to Insights", await pg.locator(".rvn").count() >= 1)
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(400); await pg.keyboard.type("zzzzqq"); await pg.wait_for_timeout(1200)
        check("no-match message", "Nothing found" in await pg.locator("#cmdResults").inner_text())
        await pg.keyboard.press("Escape")
        # ticket <-> issue link
        tid = (await api(pg, "getTickets", {"status": "all", "limit": 1, "promo": "exclude"}))["tickets"][0]["id"]
        rr = await api(pg, "raiseTicketToIssue", tid, {"title": "Link test issue"})
        iid = rr["issueId"]
        await pg.evaluate(f"App._openInInbox('{tid}')"); await pg.wait_for_timeout(2500)
        check("the ticket shows its linked issue", await pg.locator(f"button:has-text('Issue {iid}')").count() >= 1)
        await pg.evaluate(f"App.navigate('issue-detail',{{id:'{iid}'}})"); await pg.wait_for_timeout(2500)
        check("the issue says which ticket it came from", await pg.locator("#issueFromTicket").count() == 1 and tid in await pg.locator("#issueFromTicket").inner_text())
        await pg.locator("#issueFromTicketBtn").click(); await pg.wait_for_timeout(2500)
        check("Open the ticket goes back to it", await pg.locator("#rvi").count() == 1)
        errs = [e for e in errs if "404" not in e]
        check("no console or page errors", not errs, errs[:3])
        await pg.evaluate(f"""async()=>{{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{{method:'DELETE',headers:{{'x-session-token':t}}}})}}""")
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
