"""Phone features: compact reply bar, saved-reply chips, swipe actions (with Undo), pull to refresh, call/WhatsApp buttons.
Runs against the local showcase workspace at 390x844. The resolve swipe is undone with the Undo button, so nothing is left changed."""
import asyncio, json, sys, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"; PASS, FAIL = [], []
SHOTS = "C:/Users/Asif/Desktop/New/Resolvo-UI-files/mobile-audit/feat_"
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:250]) if d and not ok else ""))
def rpc(tok, fn, *args):
    r = urllib.request.Request(BASE + "/api/call", data=json.dumps({"fn": fn, "args": list(args)}).encode(), headers={"Content-Type": "application/json", "x-session-token": tok})
    return json.load(urllib.request.urlopen(r, timeout=30))
def token(em):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": em, "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r))["token"]

# synthetic touch helpers (Playwright's touchscreen can only tap)
TOUCH_JS = """
window.__touch = (type, sel, x, y) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  const t = new Touch({identifier: 7, target: el, clientX: x, clientY: y});
  const list = type === 'touchend' || type === 'touchcancel' ? [] : [t];
  el.dispatchEvent(new TouchEvent(type, {touches: list, targetTouches: list, changedTouches: [t], bubbles: true, cancelable: true}));
};
undefined;
"""

async def main():
    tok = token("ananya@showcase.local")
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ananya@showcase.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2400)
        await pg.evaluate(TOUCH_JS)
        # saved replies must exist for the chips test
        canned = rpc(tok, "getCannedResponses").get("responses", [])
        check("showcase has saved replies to test with", len(canned) > 0, len(canned))

        # ---------- 1. compact reply bar + 5. chips ----------
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1800)
        await pg.locator(".rvf-tabs .rv-tab", has_text="All open").tap(); await pg.wait_for_timeout(500)
        await pg.locator(".rvf-item").first.tap(); await pg.wait_for_timeout(2000)
        vis = lambda sel: pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}');return !!e&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'}})()")
        check("reply starts as one line: bar visible, text box hidden", await vis(".rvp-bar") and not await vis("#replyText"))
        h = await pg.evaluate("Math.round(document.querySelector('.rvf-composer').getBoundingClientRect().height)")
        check("collapsed composer is slim (under 90px)", h < 90, h)
        check("bar is pinned to the bottom of the screen", await pg.evaluate("(()=>{const r=document.querySelector('.rvf-composer').getBoundingClientRect();return r.bottom<=innerHeight-55&&r.bottom>innerHeight-130})()"))
        await pg.screenshot(path=SHOTS + "1_collapsed.png")
        await pg.locator(".rvp-bar__input").tap(); await pg.wait_for_timeout(1200)
        check("tapping the bar opens the full box and focuses it", await vis("#replyText") and not await vis(".rvp-bar") and await pg.evaluate("document.activeElement.id==='replyText'"))
        chips = await pg.locator(".rvp-chip").count()
        check("saved replies show as chips", chips >= 2, chips)
        first = await pg.locator(".rvp-chip[data-i='0']").inner_text()
        await pg.locator(".rvp-chip[data-i='0']").tap(); await pg.wait_for_timeout(300)
        val = await pg.input_value("#replyText")
        check("tapping a chip puts that reply in the box", len(val) > 5 and val == (canned[0].get("body") or canned[0].get("text") or canned[0].get("content") or ""), val[:60])
        await pg.screenshot(path=SHOTS + "2_expanded_chips.png")
        await pg.fill("#replyText", ""); await pg.evaluate("document.activeElement.blur()"); await pg.wait_for_timeout(600)
        check("empty box folds back into the bar", await vis(".rvp-bar") and not await vis("#replyText"))
        await pg.locator(".rvp-bar__input").tap(); await pg.fill("#replyText", "draft text"); await pg.evaluate("document.activeElement.blur()"); await pg.wait_for_timeout(600)
        check("a box with a draft stays open", await vis("#replyText"))
        await pg.fill("#replyText", "")
        # ---------- 4. contact buttons ----------
        pj = await pg.evaluate("""()=>{const d=document.createElement('div');d.innerHTML=RVP.contact({phone:'98765 43210',email:'a@b.com'});return [...d.querySelectorAll('a')].map(a=>a.getAttribute('href'))}""")
        check("contact buttons: call, WhatsApp and email links are right", pj == ["tel:+919876543210", "https://wa.me/919876543210", "mailto:a@b.com"], pj)
        check("no buttons when there is no phone or email", await pg.evaluate("RVP.contact({phone:'instagram:123',email:''})") == "")
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_timeout(1800)
        await pg.locator(".cust-row", has_text="+9198").first.tap(); await pg.wait_for_timeout(2200)
        links = await pg.evaluate("[...document.querySelectorAll('#contentArea .rvp-acts a')].map(a=>a.getAttribute('href'))")
        check("customer profile shows Call and WhatsApp for a customer with a phone", any(l.startswith("tel:+91") for l in links) and any("wa.me/91" in l for l in links), links)
        await pg.screenshot(path=SHOTS + "3_customer_contact.png")

        # ---------- 2. swipe actions ----------
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1800)
        if await pg.locator("#rvf.is-reading").count(): await pg.locator("[data-act=fback]").first.tap(); await pg.wait_for_timeout(600)
        await pg.locator(".rvf-tabs .rv-tab", has_text="All open").tap(); await pg.wait_for_timeout(500)
        tid = await pg.evaluate("document.querySelector('.rvf-item').getAttribute('data-ticket-id')")
        before = rpc(tok, "getTicketById", tid)["ticket"]["status"]
        swipe = lambda dx, end="touchcancel": pg.evaluate("""([dx,end])=>{const row=document.querySelector('.rvf-item');const r=row.getBoundingClientRect(),y=r.top+r.height/2,x0=r.left+40;
          __touch('touchstart',row,x0,y);__touch('touchmove',row,x0+dx/2,y+1);__touch('touchmove',row,x0+dx,y+2);return row.className}""", [dx, end])
        cls = await swipe(120); check("short swipe right shows 'Assign to me'", "is-swipe-r" in cls and "is-swipe-r2" not in cls, cls)
        await pg.screenshot(path=SHOTS + "4_swipe_assign.png")
        await pg.evaluate("__touch('touchcancel',document.querySelector('.rvf-item'),0,0)"); await pg.wait_for_timeout(250)
        cls = await swipe(280); check("long swipe right switches to 'Resolve'", "is-swipe-r2" in cls, cls)
        await pg.screenshot(path=SHOTS + "5_swipe_resolve.png")
        await pg.evaluate("__touch('touchcancel',document.querySelector('.rvf-item'),0,0)"); await pg.wait_for_timeout(250)
        cls = await swipe(-120); check("swipe left shows snooze", "is-swipe-l" in cls, cls)
        await pg.evaluate("__touch('touchcancel',document.querySelector('.rvf-item'),0,0)"); await pg.wait_for_timeout(250)
        check("cancelled swipes change nothing", rpc(tok, "getTicketById", tid)["ticket"]["status"] == before)
        # release the resolve swipe for real, then undo it
        await pg.evaluate("""()=>{const row=document.querySelector('.rvf-item');const r=row.getBoundingClientRect(),y=r.top+r.height/2,x0=r.left+40;
          __touch('touchstart',row,x0,y);__touch('touchmove',row,x0+140,y+1);__touch('touchmove',row,x0+280,y+2);__touch('touchend',row,x0+280,y+2)}""")
        await pg.wait_for_timeout(1800)
        resolved = rpc(tok, "getTicketById", tid)["ticket"]["status"]
        needs_disp = await pg.locator(".rv-overlay").count() > 0
        if needs_disp:
            check("resolve swipe asks for a disposition when the workspace requires one", True)
        else:
            check("releasing the long swipe resolves the ticket", resolved in ("resolved", "closed"), resolved)
            check("an Undo button appears", await pg.locator(".rv-toast__action").count() == 1)
            await pg.screenshot(path=SHOTS + "6_undo_toast.png")
            await pg.locator(".rv-toast__action").tap(); await pg.wait_for_timeout(1500)
            check("Undo puts the ticket back as it was", rpc(tok, "getTicketById", tid)["ticket"]["status"] == before, rpc(tok, "getTicketById", tid)["ticket"]["status"])
        await pg.evaluate("document.querySelectorAll('.rv-overlay').forEach(e=>e.remove())")

        # ---------- 3. pull to refresh ----------
        await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_timeout(1800)
        if await pg.locator("#rvf.is-reading").count(): await pg.locator("[data-act=fback]").first.tap(); await pg.wait_for_timeout(600)
        await pg.evaluate("window.__refreshed=0; const o=RVI.pullRefresh; RVI.pullRefresh=function(){window.__refreshed++;return o.apply(this,arguments)}; undefined")
        await pg.evaluate("""()=>{const el=document.querySelector('.rvf-head');const sc=document.getElementById('contentArea');sc.scrollTop=0;
          __touch('touchstart',el,200,120);__touch('touchmove',el,200,170);__touch('touchmove',el,200,260)}""")
        label = await pg.evaluate("document.querySelector('.rvp-ptr .rvp-ptr__txt').textContent")
        check("pulling down shows 'Release to refresh'", label == "Release to refresh", label)
        await pg.screenshot(path=SHOTS + "7_pull.png")
        await pg.evaluate("__touch('touchend',document.querySelector('.rvf-head'),200,260)"); await pg.wait_for_timeout(900)
        check("releasing refreshes the inbox once", await pg.evaluate("window.__refreshed") == 1, await pg.evaluate("window.__refreshed"))
        await pg.wait_for_timeout(600)
        await pg.evaluate("""()=>{const el=document.querySelector('.rvf-head');__touch('touchstart',el,200,120);__touch('touchmove',el,200,150);__touch('touchend',el,200,150)}""")
        await pg.wait_for_timeout(400)
        check("a short pull does nothing", await pg.evaluate("window.__refreshed") == 1)
        check("no page errors", not errs, errs[:2])
        await ctx.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
