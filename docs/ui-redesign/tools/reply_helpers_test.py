"""Tests for: '/' saved replies in the reply box, the 'customer has been waiting' nudge, and quick snooze.
Local server, sample tickets only. Adds one canned reply and removes it afterwards."""
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
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');localStorage.setItem('tt_inbox_focus','0');const h={'x-session-token':r.token,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});await fetch('/api/sample-tickets',{method:'POST',headers:h})}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)
        cid = (await api(pg, "saveCannedResponse", {"title": "Refund policy", "shortcut": "refund", "body": "Refunds are issued within 5 working days."}))["id"]
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1700)
        await pg.fill("#ticketSearch", "sample.invalid"); await pg.wait_for_timeout(1300)
        # waiting nudge: the sample Priya ticket is about a day old
        await pg.locator(".rvi-row", has_text="Order #48213").click(); await pg.wait_for_timeout(1200)
        nud = await pg.locator(".rvi-nudge").inner_text() if await pg.locator(".rvi-nudge").count() else ""
        check("waiting nudge shows for an old unanswered ticket", "waiting" in nud and ("hours" in nud or "days" in nud), nud)
        # slash
        await pg.click("#replyText"); await pg.keyboard.type("Hello, ")
        await pg.keyboard.type("/ref"); await pg.wait_for_timeout(700)
        check("typing / offers matching saved replies", await pg.locator(".rvi-slash__item").count() >= 1 and "Refund policy" in await pg.locator(".rvi-slash").inner_text())
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\slash_menu.png")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        val = await pg.input_value("#replyText")
        check("Enter inserts the reply in place of the /word", val == "Hello, Refunds are issued within 5 working days.", val)
        check("menu closes after picking", await pg.locator(".rvi-slash").count() == 0)
        await pg.fill("#replyText", ""); await pg.keyboard.type("/"); await pg.wait_for_timeout(600)
        check("a bare / lists replies", await pg.locator(".rvi-slash__item").count() >= 1)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        check("Esc closes the menu and keeps the text", await pg.locator(".rvi-slash").count() == 0 and await pg.input_value("#replyText") == "/")
        await pg.fill("#replyText", "10/12 is fine"); await pg.wait_for_timeout(300)
        check("a slash inside a word does not open the menu", await pg.locator(".rvi-slash").count() == 0)
        await pg.fill("#replyText", "")
        # snooze
        tid = await pg.evaluate("document.querySelector('.rvi-row[aria-selected=true]').getAttribute('data-ticket-id')")
        await pg.evaluate(f"RVI.snooze('{tid}','tomorrow')"); await pg.wait_for_timeout(1500)
        tk = (await api(pg, "getTicketById", tid))["ticket"]
        check("snooze until tomorrow 9am is saved", tk.get("snoozedUntil") and tk["snoozedUntil"] > __import__("datetime").datetime.utcnow().isoformat(), tk.get("snoozedUntil"))
        rows = await pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.getAttribute('data-ticket-id'))")
        check("snoozed ticket leaves the list and the conversation closes", tid not in rows and await pg.locator(".rvi-conv__empty").count() == 1)
        await api(pg, "unsnoozeTicket", tid)
        await api(pg, "deleteCannedResponse", cid)
        await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{method:'DELETE',headers:{'x-session-token':t}})}""")
        check("no page errors", not errs, errs[:3])
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
