"""Shopify order lookup, end to end, against the showcase workspace and a fake store (mock_shopify.js).
Needs: node docs/ui-redesign/tools/mock_shopify.js 4599 running, and the Resolvo server started with SHOPIFY_TEST_BASE=http://127.0.0.1:4599 (set in .env while testing).
Set RESOLVO_BASE if the server is not on :3001. The workspace is left disconnected from Shopify at the end."""
import asyncio, json, os, sqlite3, sys, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
DB = r"C:\Users\Asif\Desktop\New\TechTrack\data\brands\showcase\db.sqlite"
SHOTS = "C:/Users/Asif/Desktop/New/Resolvo-UI-files/mobile-audit/shopify_"
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def rpc(tok, fn, *args):
    r = urllib.request.Request(BASE + "/api/call", data=json.dumps({"fn": fn, "args": list(args)}).encode(), headers={"Content-Type": "application/json", "x-session-token": tok})
    return json.load(urllib.request.urlopen(r, timeout=40))
def token(em):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": em, "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r))["token"]
def stored():
    c = sqlite3.connect("file:" + DB.replace("\\", "/") + "?mode=ro", uri=True); r = c.execute("select value from kv where key='shopifyConfig'").fetchone(); c.close(); return r[0] if r else ""
TOKEN = "shpat_demotoken000000"
async def login(pg, em):
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(em)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""", em)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2300)
async def open_ticket(pg, tid, phone=True):
    """Open a ticket in the Focus view the way a phone user does: queue, then tap it."""
    await pg.evaluate("RVI.setFocus(true)"); await pg.wait_for_timeout(1800)
    if await pg.locator("#rvf.is-reading").count(): await pg.locator("[data-act=fback]").first.click(); await pg.wait_for_timeout(500)
    await pg.locator(".rvf-tabs .rv-tab", has_text="All open").click(); await pg.wait_for_timeout(500)
    await pg.locator(f".rvf-item[data-ticket-id='{tid}']").click(); await pg.wait_for_timeout(2600)

async def main():
    adm, agt = token("admin@showcase.local"), token("ananya@showcase.local")
    rpc(adm, "disconnectShopify")
    # ---------- server ----------
    s = rpc(adm, "getShopifyStatus"); check("starts disconnected", s["success"] and not s["connected"], s)
    check("lookup says 'not connected' instead of failing", rpc(agt, "lookupShopifyOrders", "TKT-15025") == {"success": True, "connected": False})
    check("an agent cannot connect a store", rpc(agt, "saveShopifyConfig", "brightkart", TOKEN, "", "").get("error") == "Admin only")
    check("an agent cannot disconnect it either", rpc(agt, "disconnectShopify").get("error") == "Admin only")
    for bad in ["evil.com", "127.0.0.1", "localhost:3000", "a.myshopify.com.evil.com", ""]:
        r = rpc(adm, "saveShopifyConfig", bad, TOKEN, "", "")
        check(f"store address '{bad}' is refused", not r["success"] and "myshopify.com" in r["error"], r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", "", "", ""); check("missing credentials get a plain message", not r["success"] and "access token" in r["error"], r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", "has spaces in it", "", ""); check("a token with spaces is refused", not r["success"] and "shpat_" in r["error"], r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", TOKEN, "cid", "sec"); check("token and client credentials together are refused", not r["success"] and "either" in r["error"], r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", "shpat_wrongwrongwrong1", "", ""); check("a wrong token says Shopify did not accept it", not r["success"] and r["kind"] == "auth" and "token" in r["error"], r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", "", "democlient1", "wrongsecret99"); check("a wrong client secret is explained", not r["success"] and "Client ID and secret" in r["error"], r)
    check("nothing is saved after failed attempts", not rpc(adm, "getShopifyStatus")["connected"])
    r = rpc(adm, "saveShopifyConfig", "Brightkart", TOKEN, "", ""); check("a valid token connects (store name looked up)", r["success"] and r["shopName"] == "Brightkart" and r["shop"] == "brightkart.myshopify.com", r)
    raw = stored(); check("the token is stored encrypted, not as text", raw and "shpat_demotoken" not in raw and raw.count(":") >= 2, raw[:120])
    check("agents can see that Shopify is connected, but none of the credentials", (lambda x: x["connected"] and not [k for k in x if any(w in k.lower() for w in ("ref", "secret", "token", "client"))])(rpc(agt, "getShopifyStatus")))
    r = rpc(agt, "lookupShopifyOrders", "TKT-15025")
    o = (r.get("orders") or [{}])[0]
    check("ticket 'Refund for order #4821': finds the order by its number", r["success"] and o.get("name") == "#4821" and "order number" in r["matchedBy"], r)
    check("  with status, items, city and tracking", o.get("fulfillment") == "fulfilled" and o["paymentStatus"] == "paid" and o["items"][0]["qty"] == 2 and o["shipTo"] == "Pune, Maharashtra" and o["tracking"][0]["number"] == "DLV8821450", o)
    check("  and a reply sentence the agent can send", "shipped with Delhivery" in o["summary"] and "DLV8821450" in o["summary"], o.get("summary"))
    r = rpc(agt, "lookupShopifyOrders", "TKT-27231"); o = r["orders"][0]
    check("refund ticket: cancelled order shows the refund", o["name"] == "#4897" and o["cancelled"] and o["refunded"] == 799 and "refunded" in o["summary"], o)
    r = rpc(agt, "lookupShopifyOrders", "TKT-262ED")
    check("ticket with an order number and an email: both orders, no duplicates", [x["name"] for x in r["orders"]] == ["#4893", "#4650"] and "order number" in r["matchedBy"] and "email" in r["matchedBy"], r)
    r = rpc(agt, "lookupShopifyOrders", "TKT-279D3")
    check("WhatsApp ticket: found by phone number", r["success"] and r["orders"] and r["orders"][0]["name"] == "#4880" and r["matchedBy"] == ["phone"], r)
    check("customer profile lookup works by email", [x["name"] for x in rpc(agt, "lookupShopifyContact", "tanvi.bose@mailbox.example", "")["orders"]] == ["#4893", "#4650"])
    check("customer with no orders gets an empty list", rpc(agt, "lookupShopifyContact", "nobody@mailbox.example", "")["orders"] == [])
    check("unknown ticket id is a clean error", rpc(agt, "lookupShopifyOrders", "TKT-NOPE").get("error") == "Ticket not found")
    r = rpc(adm, "testShopify"); check("test connection works for the admin", r["success"] and r["shopName"] == "Brightkart", r)
    check("agents cannot run the connection test", rpc(agt, "testShopify").get("error") == "Admin only")
    r = rpc(adm, "saveShopifyConfig", "brightkart", "", "democlient1", "demosecret123"); check("switching to Client ID and secret works", r["success"] and r["mode"] == "client", r)
    raw = stored(); check("the client secret is stored encrypted too", "demosecret123" not in raw and "democlient1" not in raw and "clientSecretRef" in raw, raw[:120])
    r = rpc(agt, "lookupShopifyOrders", "TKT-15025"); check("lookups work with the 24-hour token", r["success"] and r["orders"][0]["name"] == "#4821", r)
    r = rpc(adm, "saveShopifyConfig", "brightkart", "", "", ""); check("re-saving with nothing new typed keeps the saved credentials", r["success"] and r.get("mode") == "client", r)

    # ---------- screens ----------
    rpc(adm, "saveShopifyConfig", "brightkart", TOKEN, "", "")
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); errs = []
        # phone: agent opens the ticket
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await login(pg, "ananya@showcase.local"); await open_ticket(pg, "TKT-15025")
        check("phone ticket: Orders section is there with a count of 1", await pg.locator("#rvfOrders").count() == 1 and (await pg.locator("#rvoCount").inner_text()) == "1")
        check("phone ticket: the order the customer mentioned opens by itself", await pg.evaluate("document.getElementById('rvfOrders').open"))
        t = await pg.locator("#rvfOrders").inner_text()
        check("phone ticket: card shows number, status, items and tracking", all(x in t for x in ["#4821", "Shipped", "Paid", "2 × Ceramic planter", "Pune", "DLV8821450", "Found by order number"]), t)
        await pg.locator("#rvfOrders").scroll_into_view_if_needed(); await pg.screenshot(path=SHOTS + "1_phone_ticket.png")
        await pg.locator("[data-rvo=reply]").first.tap(); await pg.wait_for_timeout(500)
        val = await pg.input_value("#replyText")
        check("'Add to reply' puts the order update in the reply box and opens it", "Your order #4821" in val and "DLV8821450" in val and await pg.evaluate("!document.querySelector('.rvf-composer').classList.contains('is-collapsed')"), val)
        await pg.screenshot(path=SHOTS + "2_phone_reply.png")
        check("'Open in Shopify' link goes to the store's order page", "https://brightkart.myshopify.com/admin/orders/9001" in await pg.locator("a:has-text('Open in Shopify')").first.get_attribute("href"))
        await open_ticket(pg, "TKT-279D3")
        tx = await pg.evaluate("document.getElementById('rvfOrders').textContent")
        check("WhatsApp ticket shows the order found by phone (section stays closed: nothing was named in the message)", "#4880" in tx and "Found by phone" in tx and not await pg.evaluate("document.getElementById('rvfOrders').open"), tx[:200])
        await ctx.close()
        # desktop: three-panel view and customer profile
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await login(pg, "admin@showcase.local")
        await pg.evaluate("RVI.setFocus(false)"); await pg.wait_for_timeout(1800)
        await pg.evaluate("App._openInInbox('TKT-27231')"); await pg.wait_for_timeout(2600)
        t = await pg.locator("#rviCust").inner_text()
        check("desktop customer panel lists the cancelled, refunded order", "#4897" in t and "Cancelled" in t and "Refunded" in t, t[:300])
        await pg.screenshot(path=SHOTS + "3_desktop_panel.png")
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_timeout(1500)
        await pg.fill("#custSearch", "Tanvi"); await pg.wait_for_timeout(1000); await pg.locator(".cust-row").first.click(); await pg.wait_for_timeout(2500)
        t = await pg.locator("#c360Orders").inner_text()
        check("customer profile shows both of her Shopify orders, with no reply button", "#4893" in t and "#4650" in t and await pg.locator("#c360Orders [data-rvo=reply]").count() == 0, t[:200])
        await pg.screenshot(path=SHOTS + "4_profile.png")
        # settings: connect through the screen
        rpc(adm, "disconnectShopify")
        await pg.evaluate("App.renderUnifiedSettings('integrations')"); await pg.wait_for_timeout(1800)
        check("settings shows the Shopify card first, with the how-to", await pg.locator("#shp_shop").count() == 1 and "Dev Dashboard" in await pg.evaluate("document.body.textContent"))
        await pg.fill("#shp_shop", "brightkart"); await pg.fill("#shp_cid", "democlient1"); await pg.fill("#shp_csec", "wrongsecret99")
        await pg.locator("button:has-text('Connect Shopify')").click(); await pg.wait_for_timeout(1500)
        check("a wrong secret shows the plain error on the screen", "Client ID and secret" in await pg.locator("#shp_result").inner_text())
        await pg.screenshot(path=SHOTS + "5_settings_error.png")
        await pg.fill("#shp_csec", "demosecret123"); await pg.locator("button:has-text('Connect Shopify')").click(); await pg.wait_for_timeout(2500)
        check("the right credentials connect it and the card turns green", "Connected to Brightkart" in await pg.locator("body").inner_text())
        await pg.locator("button[onclick*='_shopifyTest']").click(); await pg.wait_for_timeout(1500)
        check("test connection reports success", "Shopify is answering" in await pg.locator("#shp_result").inner_text())
        await pg.screenshot(path=SHOTS + "6_settings_connected.png")
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.locator("button[onclick*='_shopifyDisconnect']").click(); await pg.wait_for_timeout(2000)
        check("disconnect returns the card to the form", await pg.locator("#shp_shop").count() == 1 and not (rpc(adm, "getShopifyStatus"))["connected"])
        # not connected: admin sees a nudge, agent sees nothing
        await open_ticket(pg, "TKT-15025")
        check("not connected: an admin sees a 'Connect Shopify' hint", "Connect Shopify" in await pg.evaluate("document.getElementById('rvfRead').textContent"))
        await ctx.close()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await login(pg, "ananya@showcase.local"); await open_ticket(pg, "TKT-15025")
        check("not connected: an agent sees no Orders section at all", "Orders" not in await pg.locator("#rvfRead .rvf-folds").inner_text())
        await ctx.close(); await b.close()
        check("no page errors", not errs, errs[:3])
    rpc(adm, "disconnectShopify")
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
