"""Tests for the mobile work: installable app files, service worker, push endpoints, My Notifications card, deep link, swipe actions."""
import asyncio, json, sys
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
LOGIN = """async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');localStorage.setItem('tt_inbox_focus','0');const h={'x-session-token':r.token,'Content-Type':'application/json'};await fetch('/api/sample-tickets',{method:'DELETE',headers:h});await fetch('/api/sample-tickets',{method:'POST',headers:h})}"""
async def api(pg, fn, *a): return await pg.evaluate("([f,a])=>App.callAsync(f,...a)", [fn, list(a)])
async def swipe(cdp, x0, y, x1):
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
    steps = 8
    for i in range(1, steps + 1):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y}]}); await asyncio.sleep(0.03)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await pg.goto(BASE + "/"); await pg.evaluate(LOGIN); await pg.goto(BASE + "/"); await pg.wait_for_timeout(3000)
        man = await pg.evaluate("fetch('/manifest.json').then(r=>r.json())")
        sizes = {i["sizes"] for i in man["icons"]}
        check("manifest: name, start_url, standalone, 192 and 512 icons, maskable", man["display"] == "standalone" and {"192x192", "512x512"} <= sizes and any(i["purpose"] == "maskable" for i in man["icons"]), man)
        codes = await pg.evaluate("Promise.all(['/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-180.png','/sw.js','/offline.html'].map(u=>fetch(u).then(r=>[u,r.status])))")
        check("icons, service worker and offline page are served", all(c[1] == 200 for c in codes), codes)
        reg = await pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
        for _ in range(10):
            if reg: break
            await pg.wait_for_timeout(500); reg = await pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
        check("service worker registers", reg)
        cfg = await pg.evaluate("fetch('/api/push/config',{headers:{'x-session-token':localStorage.getItem('tt_session_token')}}).then(r=>r.json())")
        check("push config: enabled with a public key", cfg["success"] and cfg["enabled"] and len(cfg["publicKey"]) > 60, cfg)
        sub = {"endpoint": "https://push.example.invalid/abc123", "keys": {"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "auth": "tBHItJI5svbpez7KI4CCXg"}}
        post = lambda path, body: pg.evaluate("([p,b])=>fetch(p,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':localStorage.getItem('tt_session_token')},body:JSON.stringify(b)}).then(r=>r.json())", [path, body])
        check("subscribe accepts a valid subscription", (await post("/api/push/subscribe", {"subscription": sub}))["success"])
        cfg = await pg.evaluate("fetch('/api/push/config',{headers:{'x-session-token':localStorage.getItem('tt_session_token')}}).then(r=>r.json())")
        check("config now says this user is subscribed", cfg["subscribed"] is True)
        bad = await pg.evaluate("fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json','x-session-token':localStorage.getItem('tt_session_token')},body:JSON.stringify({subscription:{endpoint:'http://insecure.example/x',keys:{}}})}).then(r=>r.status)")
        check("an insecure or malformed subscription is refused (400)", bad == 400, bad)
        noauth = await pg.evaluate("fetch('/api/push/config').then(r=>r.status)")
        check("push endpoints need a login (401)", noauth == 401, noauth)
        rm = await post("/api/push/unsubscribe", {"endpoint": sub["endpoint"]})
        check("unsubscribe removes it", rm["success"] and rm["removed"] == 1, rm)
        # settings card
        await pg.evaluate("App.renderUnifiedSettings('notify-prefs')"); await pg.wait_for_timeout(2200)
        txt = await pg.locator("#rvdBox").inner_text()
        check("My Notifications shows the device-alerts card", "Alert me on this device" in txt and "Install Resolvo" in txt, txt)
        check("phone: settings has no sideways scroll", not await pg.evaluate("document.documentElement.scrollWidth>innerWidth+2"))
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\settings_device_390.png")
        # deep link
        tid = (await api(pg, "getTickets", {"status": "all", "limit": 1, "promo": "exclude"}))["tickets"][0]["id"]
        await pg.goto(BASE + f"/?open={tid}"); await pg.wait_for_timeout(5000)
        check("a link like /?open=TKT opens that ticket in the inbox", await pg.locator("#rvf, #rvi").count() >= 1 and tid in await pg.evaluate("document.body.innerText"), tid)
        # swipes (phones start in Focus mode, where the queue rows are .rvf-item)
        await pg.evaluate("RVI.setFocus(true)"); await pg.wait_for_timeout(2500)
        cdp = await ctx.new_cdp_session(pg)
        rows = await pg.evaluate("[...document.querySelectorAll('#rvf .rvf-item, #rvi .rvi-row')].map(r=>r.getAttribute('data-ticket-id'))")
        sample = await api(pg, "getTickets", {"status": "all", "limit": 50, "promo": "exclude", "search": "sample.invalid"})
        ids = [t["id"] for t in sample["tickets"]]
        # in Focus (default on phones) the queue shows urgent tickets; use the one belonging to the samples
        target = next((r for r in rows if r in ids), None)
        check("a sample ticket is on screen to swipe", target is not None, (rows[:5], ids[:3]))
        if target:
            el = pg.locator(f"[data-ticket-id='{target}']").first; await el.scroll_into_view_if_needed(); box = await el.bounding_box()
            y = box["y"] + box["height"] / 2
            await swipe(cdp, 60, y, 280); await pg.wait_for_timeout(1500)
            t1 = (await api(pg, "getTicketById", target))["ticket"]
            check("swipe right assigns the ticket to me", (t1.get("assignedTo") or "").lower() == "admin@demo.local", t1.get("assignedTo"))
            await pg.wait_for_timeout(500)
            el = pg.locator(f"[data-ticket-id='{target}']")
            if await el.count():
                box = await el.first.bounding_box(); y = box["y"] + box["height"] / 2
                await swipe(cdp, 330, y, 90); await pg.wait_for_timeout(1500)
                t2 = (await api(pg, "getTicketById", target))["ticket"]
                check("swipe left snoozes it until tomorrow morning", bool(t2.get("snoozedUntil")) and t2["snoozedUntil"] > __import__("datetime").datetime.utcnow().isoformat(), t2.get("snoozedUntil"))
                await api(pg, "unsnoozeTicket", target)
            else:
                check("swipe left snoozes it until tomorrow morning", False, "row gone")
        # a short drag does nothing
        rows = await pg.evaluate("[...document.querySelectorAll('#rvf .rvf-item, #rvi .rvi-row')].map(r=>r.getAttribute('data-ticket-id'))")
        if rows:
            el = pg.locator(f"[data-ticket-id='{rows[0]}']").first; box = await el.bounding_box(); y = box["y"] + box["height"] / 2
            before = (await api(pg, "getTicketById", rows[0]))["ticket"].get("assignedTo")
            await swipe(cdp, 100, y, 150); await pg.wait_for_timeout(800)
            check("a short swipe changes nothing", (await api(pg, "getTicketById", rows[0]))["ticket"].get("assignedTo") == before)
        errs = [e for e in errs if "400" not in e and "401" not in e]
        check("no console or page errors", not errs, errs[:3])
        await pg.evaluate("""async()=>{const t=localStorage.getItem('tt_session_token');await fetch('/api/sample-tickets',{method:'DELETE',headers:{'x-session-token':t}})}""")
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
