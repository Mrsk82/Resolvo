"""Regression test for inbox A (three-panel refinements) and B (Focus mode).
Runs against the local server on 3001. It only ever acts on the sample tickets (".invalid" addresses, nothing is
emailed): Focus queue requests are filtered to those in the browser, so the demo brand's other tickets are never touched.
Usage: python inbox_focus_test.py"""
import asyncio, json, os, sys
from datetime import datetime
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"
OUT = r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline"
os.makedirs(OUT, exist_ok=True)
PASS, FAIL = [], []

def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("PASS  " if ok else "FAIL  ") + name + (("  -> " + str(detail)) if (detail and not ok) else ""))

async def install_routes(ctx, state):
    """One handler for /api/call: keeps Focus queue requests to sample tickets, and can inject failures."""
    async def handler(route):
        body = route.request.post_data or ""
        try:
            req = json.loads(body)
        except Exception:
            return await route.continue_()
        fn, args = req.get("fn"), req.get("args") or []
        if fn == "getTickets" and args and isinstance(args[0], dict) and args[0].get("active"):
            resp = await route.fetch(); data = await resp.json()
            data["tickets"] = [t for t in data.get("tickets", []) if t.get("isSample")]; data["total"] = len(data["tickets"])
            return await route.fulfill(response=resp, json=data)
        if fn == "replyToTicket" and state.get("mode") == "fail_reply":
            return await route.fulfill(json={"success": False, "error": "Mail server unreachable"})
        if fn == "updateTicketStatus" and state.get("mode") == "fail_status":
            return await route.fulfill(json={"success": False, "error": "Locked by another agent"})
        if fn == "getClassificationConfig" and state.get("disp"):
            return await route.fulfill(json={"success": True, "config": {"requireDisposition": True, "dispositions": ["Answered", "Duplicate"]}})
        return await route.continue_()
    await ctx.route("**/api/call", handler)

async def login(pg, focus=None):
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(fc)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');if(fc!==null)localStorage.setItem('tt_inbox_focus',fc)}""", focus)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)

async def api(pg, fn, *args):
    return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(args)])

async def reset_samples(pg):
    await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');const h={'x-session-token':t,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});return fetch('/api/sample-tickets',{method:'POST',headers:h}).then(r=>r.json())}""")

async def open_inbox(pg):
    await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1700)

async def toasts(pg):
    return await pg.evaluate("[...document.querySelectorAll('.rv-toast')].map(x=>x.textContent)")

async def queue_ids(pg):
    return await pg.evaluate("[...document.querySelectorAll('#rvfList .rvf-item')].map(x=>x.getAttribute('data-ticket-id'))")

async def blur(pg):
    await pg.evaluate("document.activeElement&&document.activeElement.blur()")

async def read_status(pg, tid):
    return (await api(pg, "getTicketById", tid))["ticket"]

PRI = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
def ts(t):
    return datetime.fromisoformat(t["createdDate"].replace("Z", "+00:00")).timestamp() if t.get("createdDate") else 0
def expected_order(tickets, me):
    needs = [t for t in tickets if not t.get("awaitingCustomer") and (not t.get("assignedTo") or t["assignedTo"].lower() == me)]
    return [t["id"] for t in sorted(needs, key=lambda t: (0 if t.get("slaBreached") else 1 if t.get("slaRisk") else 2, PRI.get(t.get("priority"), 4), 0 if t.get("unread") else 1, ts(t)))]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        state = {"mode": None, "disp": False}
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await install_routes(ctx, state)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append("PAGE:" + str(e)[:160]))
        pg.on("console", lambda m: errs.append("CONSOLE:" + m.text[:160]) if m.type == "error" else None)
        await login(pg, focus="0")
        await reset_samples(pg)

        # ---------- A: three-panel refinements ----------
        await open_inbox(pg)
        await pg.fill("#ticketSearch", "sample.invalid"); await pg.wait_for_timeout(1300)
        rows = await pg.locator(".rvi-row").count()
        check("A: ticket rows render", rows >= 4, rows)
        check("A: row shows channel chip", await pg.locator(".rvi-row .rvi-row__ch").count() == rows)
        check("A: list header has count + Focus mode button", await pg.locator(".rvi-tools__head #rviCount").count() == 1 and await pg.locator("[data-act=focus-on]").count() == 1)
        badge_counts = await pg.evaluate("[...document.querySelectorAll('.rvi-row')].map(r=>r.querySelectorAll('.rvi-row__tags .rv-badge').length)")
        check("A: rows carry few badges (max 3)", max(badge_counts) <= 3, badge_counts)
        check("A: view counts shown", await pg.locator(".rvi-view__n").count() >= 5)
        await pg.locator(".rvi-row").first.click(); await pg.wait_for_timeout(1000)
        subj = await pg.locator(".rvi-conv__head h2").inner_text()
        check("A: header shows customer name and subject", await pg.locator(".rvi-conv__who").count() == 1 and len(subj) > 3, subj)
        check("A: selected row is marked", await pg.locator(".rvi-row[aria-selected=true]").count() == 1)
        check("A: composer tidy (tabs + recipient on one line)", await pg.locator(".rvi-composer__top .rv-tab").count() == 2)
        check("A: customer card still loads", await pg.locator("#rviCustBody").count() == 1)
        await pg.screenshot(path=os.path.join(OUT, "ab_A_three_panel_1440.png"))
        t_a = await pg.evaluate("document.querySelector('.rvi-row[aria-selected=true]').getAttribute('data-ticket-id')")
        await pg.fill("#replyText", "Thanks for writing in. We are on it.")
        await pg.click("#rviSend"); await pg.wait_for_timeout(1300)
        check("A: reply sent toast", any("Reply sent" in t for t in await toasts(pg)), await toasts(pg))
        check("A: reply appears in thread", "We are on it" in await pg.locator("#rviThread").inner_text())
        await pg.select_option("#c_status", "pending"); await pg.wait_for_timeout(1100)
        check("A: status change works", (await read_status(pg, t_a))["status"] == "pending")

        # ---------- B: Focus mode ----------
        await pg.click("[data-act=focus-on]"); await pg.wait_for_timeout(1700)
        check("B: Focus screen shows", await pg.locator("#rvf").count() == 1)
        check("B: greeting", "Good" in await pg.locator(".rvf-head h1").inner_text())
        check("B: three stat cards", await pg.locator(".rvf-stat").count() == 3)
        r = await api(pg, "getTickets", {"status": "all", "active": True, "sort": "sla", "limit": 200})
        exp = expected_order(r["tickets"], "admin@demo.local"); got = await queue_ids(pg)
        check("B: queue order = breached/at risk, then priority, unread, oldest", got == exp and len(got) >= 3, (got, exp))
        needs_n = int(await pg.locator(".rvf-stat").nth(0).locator("b").inner_text())
        check("B: 'Needs you now' count matches queue", needs_n == len(got), (needs_n, len(got)))
        wait_n = int(await pg.locator(".rvf-stat").nth(1).locator("b").inner_text())
        check("B: 'Waiting on customer' comes from the server count", wait_n == r["counts"]["waiting"] and wait_n >= 1, (wait_n, r["counts"]["waiting"]))
        check("B: the ticket answered in A is not in 'Needs you now'", t_a not in got, t_a)
        await pg.screenshot(path=os.path.join(OUT, "ab_B_focus_queue_1440.png"))

        idx = lambda: pg.evaluate("[...document.querySelectorAll('#rvfList .rvf-item')].findIndex(x=>x.classList.contains('is-focus'))")
        await pg.keyboard.press("j"); await pg.wait_for_timeout(150)
        check("B: J moves highlight down", await idx() == 1)
        await pg.keyboard.press("k"); await pg.wait_for_timeout(150)
        check("B: K moves highlight up", await idx() == 0)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1300)
        pos = await pg.locator("#rvfPos").inner_text()
        check("B: Enter opens first ticket as '1 of N'", pos == f"1 of {len(got)}", pos)
        check("B: queue hidden while reading", not await pg.locator("#rvfQueue").is_visible())
        await pg.keyboard.press("j"); await pg.wait_for_timeout(1100)
        check("B: J goes to next ticket (2 of N)", (await pg.locator("#rvfPos").inner_text()) == f"2 of {len(got)}")
        await pg.keyboard.press("k"); await pg.wait_for_timeout(1100)
        check("B: K goes back (1 of N)", (await pg.locator("#rvfPos").inner_text()) == f"1 of {len(got)}")
        await pg.screenshot(path=os.path.join(OUT, "ab_B_focus_reading_1440.png"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
        check("B: Esc returns to queue", await pg.locator("#rvfQueue").is_visible())
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1100)

        t1 = got[0]
        await pg.keyboard.press("r"); await pg.wait_for_timeout(200)
        check("B: R focuses the reply box", await pg.evaluate("document.activeElement && document.activeElement.id") == "replyText")
        await pg.keyboard.type("typing e, j, k and r inside the reply box")
        check("B: typing shortcut letters in the reply box does not resolve or move", (await read_status(pg, t1))["status"] not in ("resolved", "closed") and (await pg.locator("#rvfPos").inner_text()) == f"1 of {len(got)}")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        check("B: Esc in the reply box leaves the box but stays on the ticket", await pg.locator("#rvfRead").is_visible())
        await pg.keyboard.press("e"); await pg.wait_for_timeout(600)
        check("B: E with an unsent draft is refused", (await read_status(pg, t1))["status"] not in ("resolved", "closed") and any("unsent" in t for t in await toasts(pg)), await toasts(pg))
        check("B: draft kept", "typing e, j, k" in await pg.input_value("#replyText"))

        state["mode"] = "fail_reply"
        await pg.click("#rvfSendNext"); await pg.wait_for_timeout(900)
        tk = await read_status(pg, t1)
        check("B: failed reply -> ticket NOT resolved and nothing stored", tk["status"] not in ("resolved", "closed") and not any("typing e" in (m.get("body") or "") for m in tk["thread"]), tk["status"])
        check("B: failed reply -> text kept, same ticket", "typing e, j, k" in await pg.input_value("#replyText") and (await pg.locator("#rvfPos").inner_text()) == f"1 of {len(got)}")
        check("B: failed reply -> clear error shown", any("Not sent" in t for t in await toasts(pg)), await toasts(pg))
        check("B: send buttons usable again after a failure", not await pg.locator("#rvfSendNext").is_disabled())

        state["mode"] = "fail_status"
        await pg.click("#rvfSendNext"); await pg.wait_for_timeout(1700)
        tk = await read_status(pg, t1)
        check("B: reply sent but resolve failed -> reply is in the thread", any("typing e" in (m.get("body") or "") for m in tk["thread"]))
        check("B: ...ticket still open and still on screen", tk["status"] not in ("resolved", "closed") and (await pg.locator("#rvfPos").inner_text()) == f"1 of {len(got)}")
        check("B: ...and the message says exactly that", any("could not be resolved" in t for t in await toasts(pg)), await toasts(pg))
        state["mode"] = None
        res_before = (await api(pg, "getTickets", {"status": "all", "limit": 1}))["counts"]["resolvedToday"]

        await pg.fill("#replyText", "All sorted, thank you for your patience.")
        head_before = await pg.locator(".rvf-card__head h2").inner_text()
        await pg.click("#rvfSendNext"); await pg.wait_for_timeout(2400)
        tk = await read_status(pg, t1)
        check("B: Send & resolve -> reply stored", any("All sorted" in (m.get("body") or "") for m in tk["thread"]))
        check("B: Send & resolve -> ticket resolved", tk["status"] == "resolved", tk["status"])
        check("B: moved to the NEXT ticket", (await pg.locator(".rvf-card__head h2").inner_text()) != head_before and (await pg.evaluate("document.querySelector('.rvf-card__head .rv-hint').textContent")).find(got[1]) >= 0, got[:2])
        check("B: counter shows '1 of N-1'", (await pg.locator("#rvfPos").inner_text()) == f"1 of {len(got) - 1}", await pg.locator("#rvfPos").inner_text())
        check("B: 'Resolved today' went up by one", (await api(pg, "getTickets", {"status": "all", "limit": 1}))["counts"]["resolvedToday"] == res_before + 1)
        check("B: success toast", any("resolved" in t.lower() for t in await toasts(pg)), await toasts(pg))

        await pg.wait_for_timeout(600)
        dbg = [await pg.evaluate("(()=>{const b=document.getElementById('rvfSendNext').getBoundingClientRect();const e=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return e.id+'|'+e.className+'|'+e.tagName})()"), await pg.locator("#rvfSendNext").is_disabled(), await pg.locator("#rvfSendNext").bounding_box(), await pg.input_value("#replyText"), await pg.locator("#rvfPos").inner_text()]
        await pg.click("#rvfSendNext"); await pg.wait_for_timeout(500)
        check("B: Send & resolve with an empty reply is refused", any("Write a reply first" in t for t in await toasts(pg)), (await toasts(pg), dbg))
        check("B: ...and nothing changed", (await read_status(pg, got[1]))["status"] not in ("resolved", "closed"))

        await blur(pg)
        open_before = (await api(pg, "getTickets", {"status": "all", "active": True, "limit": 200}))["total"]
        await pg.keyboard.press("e"); await pg.wait_for_timeout(2300)
        open_after = (await api(pg, "getTickets", {"status": "all", "active": True, "limit": 200}))["total"]
        check("B: E resolves the open ticket without a reply", open_after == open_before - 1, (open_before, open_after))
        check("B: ...and moves on", await pg.locator("#rvfPos").count() == 1 and (await pg.locator("#rvfPos").inner_text()).startswith("1 of "))

        for _ in range(15):
            if await pg.locator("#rvfQueue").is_visible():
                break
            await blur(pg); await pg.keyboard.press("e"); await pg.wait_for_timeout(1700)
        check("B: after the last ticket we land back on the queue", await pg.locator("#rvfQueue").is_visible())
        check("B: empty state says caught up", "caught up" in await pg.locator("#rvfBody").inner_text(), await pg.locator("#rvfBody").inner_text())
        check("B: needs-you stat is 0", await pg.locator(".rvf-stat").nth(0).locator("b").inner_text() == "0")
        await pg.screenshot(path=os.path.join(OUT, "ab_B_focus_clear_1440.png"))
        await pg.locator(".rvf-stat").nth(2).click(); await pg.wait_for_timeout(1500)
        n_res = await pg.locator("#rvfList .rvf-item").count()
        check("B: 'Resolved today' tab lists the tickets resolved", n_res >= 3, n_res)

        await pg.click("[data-act=focus-off]"); await pg.wait_for_timeout(1600)
        check("B: Full inbox button returns to three panels", await pg.locator("#rvi").count() == 1 and await pg.locator("#rvf").count() == 0)
        check("B: choice remembered", await pg.evaluate("localStorage.getItem('tt_inbox_focus')") == "0")
        await open_inbox(pg)
        check("B: still three panels after leaving and coming back", await pg.locator("#rvi").count() == 1)
        await pg.evaluate("RVI.setFocus(true)"); await pg.wait_for_timeout(1300)
        await pg.evaluate("App._inboxView('unassigned')"); await pg.wait_for_timeout(1600)
        check("B: a dashboard link that names a view shows the full inbox even when Focus is on", await pg.locator("#rvi").count() == 1)
        check("no console or page errors (desktop)", not errs, errs[:3])
        await ctx.close()

        # ---------- a required disposition is asked for before anything is sent ----------
        state2 = {"mode": None, "disp": True}
        ctx2 = await b.new_context(viewport={"width": 1280, "height": 900}); await install_routes(ctx2, state2)
        pg2 = await ctx2.new_page(); errs2 = []
        pg2.on("pageerror", lambda e: errs2.append(str(e)[:160]))
        await login(pg2, focus="1"); await reset_samples(pg2); await open_inbox(pg2)
        ids = await queue_ids(pg2)
        await pg2.keyboard.press("Enter"); await pg2.wait_for_timeout(1300)
        first = ids[0]
        await pg2.fill("#replyText", "Resolved with a disposition.")
        await pg2.click("#rvfSendNext"); await pg2.wait_for_timeout(800)
        check("disposition: dialog appears first", await pg2.locator(".rv-overlay").count() == 1)
        tk = await read_status(pg2, first)
        check("disposition: nothing sent or resolved yet", tk["status"] not in ("resolved", "closed") and not any("Resolved with a disposition" in (m.get("body") or "") for m in tk["thread"]))
        await pg2.keyboard.press("e"); await pg2.wait_for_timeout(300)
        check("disposition: shortcut keys are ignored while the dialog is open", (await read_status(pg2, first))["status"] not in ("resolved", "closed"))
        await pg2.select_option("#rviDisp", "Answered"); await pg2.click("#rviDispOk"); await pg2.wait_for_timeout(2500)
        tk = await read_status(pg2, first)
        check("disposition: reply sent, resolved, disposition saved", tk["status"] == "resolved" and tk.get("disposition") == "Answered" and any("Resolved with a disposition" in (m.get("body") or "") for m in tk["thread"]), (tk["status"], tk.get("disposition")))
        check("disposition: moved on to the next ticket", (await pg2.locator("#rvfPos").inner_text()).startswith("1 of "))
        check("no page errors (disposition run)", not errs2, errs2[:3])
        await ctx2.close()

        # ---------- phones: Focus is the default ----------
        state3 = {"mode": None, "disp": False}
        ctx3 = await b.new_context(viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True); await install_routes(ctx3, state3)
        pg3 = await ctx3.new_page(); errs3 = []
        pg3.on("pageerror", lambda e: errs3.append(str(e)[:160]))
        await login(pg3, focus=None); await reset_samples(pg3); await open_inbox(pg3)
        check("phone: Focus mode is the default", await pg3.locator("#rvf").count() == 1)
        check("phone: queue has no sideways scroll", not await pg3.evaluate("document.documentElement.scrollWidth > innerWidth + 2"))
        await pg3.screenshot(path=os.path.join(OUT, "ab_B_focus_queue_390.png"))
        await pg3.locator("#rvfList .rvf-item").first.tap(); await pg3.wait_for_timeout(1400)
        check("phone: ticket opens full width", await pg3.locator("#rvfRead").is_visible() and not await pg3.locator("#rvfQueue").is_visible())
        check("phone: reading view has no sideways scroll", not await pg3.evaluate("document.documentElement.scrollWidth > innerWidth + 2"))
        await pg3.screenshot(path=os.path.join(OUT, "ab_B_focus_reading_390.png"))
        th, cm = await pg3.locator("#rviThread").bounding_box(), await pg3.locator(".rvf-composer").bounding_box()
        check("phone: composer follows the thread and does not cover it", cm["y"] >= th["y"] + th["height"] - 1, (th, cm))
        if await pg3.locator(".rvp-bar__input").is_visible(): await pg3.locator(".rvp-bar__input").tap(); await pg3.wait_for_timeout(500)   # the reply starts as a one-line bar on phones
        await pg3.locator("#replyText").scroll_into_view_if_needed(); await pg3.wait_for_timeout(300)
        cm = await pg3.locator(".rvf-composer").bounding_box()
        check("phone: composer reachable by scrolling, above the bottom bar", cm["y"] + cm["height"] <= 800 - 40, cm)
        await pg3.screenshot(path=os.path.join(OUT, "ab_B_focus_reply_390.png"))
        await pg3.locator("[data-act=fback]").tap(); await pg3.wait_for_timeout(500)
        check("phone: Queue button goes back", await pg3.locator("#rvfQueue").is_visible())
        await pg3.locator("[data-act=focus-off]").tap(); await pg3.wait_for_timeout(1600)
        check("phone: Full inbox is still available (one pane at a time)", await pg3.locator("#rvi").count() == 1)
        await pg3.screenshot(path=os.path.join(OUT, "ab_A_three_panel_390.png"))
        check("no page errors (phone)", not errs3, errs3[:3])
        await ctx3.close()

        # leave the demo brand clean
        ctx4 = await b.new_context(); pg4 = await ctx4.new_page(); await login(pg4, focus="0")
        await pg4.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{method:'DELETE',headers:{'x-session-token':t}})}""")
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:", *FAIL, sep="\n  ")
        sys.exit(1)

asyncio.run(main())
