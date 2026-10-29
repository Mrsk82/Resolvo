"""Tests for the 'Today' dashboard: Needs-you-now list, numbers that match the inbox, links into the inbox and Focus mode, onboarding steps."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
async def api(pg, fn, *a): return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(a)])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');const h={'x-session-token':r.token,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});await fetch('/api/sample-tickets',{method:'POST',headers:h})}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2800)
        r = await api(pg, "getTickets", {"status": "all", "limit": 1})
        inbox = r["counts"]["inbox"]
        check("counts.inbox has open and resolved", "open" in inbox and "resolved" in inbox and inbox["open"] + inbox["resolved"] == inbox["all"], inbox)
        check("dashboard shows the Needs you now card", await pg.locator(".rvd-now").count() >= 1)
        kp = await pg.evaluate("[...document.querySelectorAll('.rv-stat')].slice(0,3).map(e=>e.innerText.replace(/\\s+/g,' '))")
        check("Total tickets KPI equals the inbox's All count", str(inbox["all"]) in kp[0], (kp[0], inbox["all"]))
        check("Open tickets KPI equals the inbox's open count", str(inbox["open"]) in kp[1], (kp[1], inbox["open"]))
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\dashboard_today.png")
        first_id = await pg.evaluate("document.querySelector('.rvd-now').getAttribute('onclick').match(/'([^']+)'/)[1]")
        await pg.locator(".rvd-now").first.click(); await pg.wait_for_timeout(2500)
        check("clicking a row opens the inbox with that ticket open", await pg.locator("#rvi").count() == 1 and await pg.locator(".rvi-row[aria-selected=true]").get_attribute("data-ticket-id") == first_id, first_id)
        await pg.evaluate("App.navigate('dashboard')"); await pg.wait_for_timeout(2500)
        await pg.locator("text=Work through them").click(); await pg.wait_for_timeout(2500)
        check("Work through them opens Focus mode", await pg.locator("#rvf").count() == 1)
        await pg.evaluate("RVI.setFocus(false)"); await pg.wait_for_timeout(1000)
        od = await pg.evaluate("fetch('/api/onboarding-status',{headers:{'x-session-token':localStorage.getItem('tt_session_token')}}).then(r=>r.json())")
        ids = [s["id"] for s in od["steps"]]
        check("first-run steps: connect email, see a conversation, first reply, invite, saved reply", ids[:3] == ["connect_email", "try_sample", "first_reply"] and "invite_user" in ids and "canned" in ids, ids)
        check("no console or page errors", not errs, errs[:3])
        await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{method:'DELETE',headers:{'x-session-token':t}})}""")
        await ctx.close()
        ctx2 = await b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True); pg2 = await ctx2.new_page()
        await pg2.goto(BASE + "/")
        await pg2.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
        await pg2.goto(BASE + "/"); await pg2.wait_for_timeout(2800)
        check("phone: dashboard has no sideways scroll", not await pg2.evaluate("document.documentElement.scrollWidth>innerWidth+2"))
        await pg2.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\dashboard_today_390.png")
        await ctx2.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
