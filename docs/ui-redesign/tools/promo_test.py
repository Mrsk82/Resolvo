"""Tests for the Promotions and alerts view, bulk close, bulk assign and 'move back to inbox'.
Seeds newsletter-style tickets into the LOCAL demo brand (seed_promos.js) and removes them afterwards."""
import asyncio, os, subprocess, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); HERE = os.path.dirname(os.path.abspath(__file__))
PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
def seed(remove=False):
    subprocess.run(["node", os.path.join(HERE, "seed_promos.js")] + (["--remove"] if remove else []), check=True, capture_output=True)
async def api(pg, fn, *a): return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(a)])
async def main():
    seed(True); seed()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');localStorage.setItem('tt_inbox_focus','0')}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)
        r = await api(pg, "getTickets", {"status": "all", "limit": 300})
        promo = {t["id"] for t in r["tickets"] if t.get("isPromo")}
        check("server flags the 4 newsletter/alert tickets", {"TKT-PROMO-1", "TKT-PROMO-2", "TKT-PROMO-3", "TKT-PROMO-4"} <= promo, sorted(promo))
        check("a real customer email is NOT flagged", "TKT-REAL-1" not in promo)
        check("manual / widget / WhatsApp tickets are never flagged", not any(t.get("isPromo") for t in r["tickets"] if (t.get("channel") or "email") not in ("email",)))
        c = r["counts"]
        check("counts.inbox excludes promotions", c["inbox"]["promo"] >= 4 and c["inbox"]["all"] == c["all"] - len(promo), (c["inbox"], c["all"], len(promo)))
        ex = await api(pg, "getTickets", {"status": "all", "limit": 300, "promo": "exclude"})
        check("promo:'exclude' hides them", not any(t["id"].startswith("TKT-PROMO") for t in ex["tickets"]) and any(t["id"] == "TKT-REAL-1" for t in ex["tickets"]))
        on = await api(pg, "getTickets", {"status": "all", "limit": 300, "promo": "only"})
        check("promo:'only' shows only them", {t["id"] for t in on["tickets"]} == promo)

        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1800)
        rows = await pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.getAttribute('data-ticket-id'))")
        check("main inbox hides promotions but shows the real customer", "TKT-REAL-1" in rows and not any(x.startswith("TKT-PROMO") for x in rows), rows[:5])
        pill = await pg.locator("[data-act=view][data-view=promo]").first.inner_text()
        check("a Promotions view with a count exists", any(ch.isdigit() for ch in pill), pill)
        unassigned = int((await pg.locator(".rvi-pills [data-view=unassigned] .rv-tab__count").inner_text()))
        check("Unassigned count no longer includes promotions", unassigned == c["inbox"]["unassigned"], (unassigned, c["inbox"]["unassigned"]))
        await pg.locator(".rvi-pills [data-view=promo]").click(); await pg.wait_for_timeout(1500)
        rows = await pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.getAttribute('data-ticket-id'))")
        check("Promotions view lists the newsletters", {"TKT-PROMO-1", "TKT-PROMO-2"} <= set(rows) and "TKT-REAL-1" not in rows, rows)
        check("explanatory bar with Close all shows (admin)", await pg.locator(".rvi-promo").count() == 1 and await pg.locator("[data-act=promo-close]").count() == 1)
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\promo_view.png")

        # move one back
        await pg.locator(".rvi-row[data-ticket-id=TKT-PROMO-4]").click(); await pg.wait_for_timeout(1000)
        await pg.evaluate("document.querySelector('#rviMoveBack').click()"); await pg.wait_for_timeout(1500)
        check("'Move to inbox' un-flags a ticket for good", "TKT-PROMO-4" not in {t["id"] for t in (await api(pg, "getTickets", {"status": "all", "limit": 300, "promo": "only"}))["tickets"]})

        # close all (cancel first)
        await pg.click("[data-act=promo-close]"); await pg.wait_for_timeout(400)
        check("confirmation dialog appears", await pg.locator(".rv-overlay").count() == 1)
        await pg.evaluate("RV.closeModal(document.querySelector('.rv-overlay'))"); await pg.wait_for_timeout(300)
        check("cancel closes nothing", (await api(pg, "getTicketById", "TKT-PROMO-1"))["ticket"]["status"] == "new")
        await pg.click("[data-act=promo-block]"); await pg.click("#rviPromoOk"); await pg.wait_for_timeout(1800)
        t1 = (await api(pg, "getTicketById", "TKT-PROMO-1"))["ticket"]
        check("close-all closes them without a customer email", t1["status"] == "closed" and t1.get("autoResolved"))
        check("the real customer ticket is untouched", (await api(pg, "getTicketById", "TKT-REAL-1"))["ticket"]["status"] == "new")
        check("moved-back ticket is untouched", (await api(pg, "getTicketById", "TKT-PROMO-4"))["ticket"]["status"] == "new")
        cfg = await api(pg, "getEmailTicketingConfig")
        bl = str((cfg.get("config") or {}).get("senderBlocklist", ""))
        check("senders were blocked", "news@mail.apollo.io" in bl and "priya.test@gmail.com" not in bl, bl[:120])

        # bulk assign
        await pg.locator(".rvi-pills [data-view=all]").click(); await pg.wait_for_timeout(1500)
        await pg.locator(".rvi-row[data-ticket-id=TKT-REAL-1] .ticket-checkbox").check(); await pg.wait_for_timeout(300)
        check("bulk bar shows an Assign to... menu", await pg.locator("#bulkAssignSel").is_visible())
        await pg.select_option("#bulkAssignSel", "__me"); await pg.wait_for_timeout(1500)
        check("bulk assign to me works", (await api(pg, "getTicketById", "TKT-REAL-1"))["ticket"]["assignedTo"] == "admin@demo.local")
        bad = await api(pg, "bulkAssignTickets", ["TKT-REAL-1"], "nobody@nowhere.example")
        check("assigning to a non-member is refused", bad.get("success") is False, bad)
        check("no page errors", not errs, errs[:3])
        await b.close()
    seed(True)
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
