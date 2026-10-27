"""Checks for the first-customer blockers: agent role walk-through, inbox connection errors, WhatsApp setup guide.
Runs against the local server on :3001 (demo + showcase workspaces). Changes to demo WhatsApp config are reset at the end;
the simulated WhatsApp ticket is deleted. No email or WhatsApp message is ever sent."""
import asyncio, json, re, sys, urllib.parse, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"; PASS, FAIL = [], []
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def http(path, tok=None, body=None, form=False):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    raw = urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=40).read().decode()
    return raw if raw.lstrip().startswith("<") else json.loads(raw or "null")
def token(em): return http("/api/login", None, {"email": em, "password": "demo1234"})["token"]
def rpc(tok, fn, *args): return http("/api/call", tok, {"fn": fn, "args": list(args)})
async def ui_login(pg, em):
    await pg.goto(BASE + "/")
    await pg.evaluate("""async(em)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""", em)
    await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)

ADMIN_PAGES = ["settings", "user-management", "sla-settings", "system-settings", "ai-intelligence", "brand-features", "integrations",
               "email-ticketing", "announcements", "escalations", "teams", "platform-admin", "cfd", "leaderboard"]

async def main():
    adm, agt = token("admin@demo.local"), token("ananya@showcase.local")
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        # ---- 1. agent role ----
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        await ui_login(pg, "ananya@showcase.local")
        me = await pg.evaluate("App.currentUser.role")
        check("signed in as a non-admin (Agent)", me != "Admin", me)
        bad = []
        for pgid in ADMIN_PAGES:
            await pg.evaluate(f"App.navigate('{pgid}')"); await pg.wait_for_timeout(500)
            t = await pg.locator("#contentArea").inner_text()
            if "This area is for admins" not in t or await pg.locator("#contentArea .loader-bar").count(): bad.append(pgid)
        check(f"all {len(ADMIN_PAGES)} admin-only pages show the 'for admins' page to an agent (no blank spinner)", not bad, bad)
        await pg.locator("#contentArea >> text=Back to inbox").click(); await pg.wait_for_timeout(1500)
        check("'Back to inbox' works from the admin gate", await pg.locator(".rvi-row, .ticket-row").count() > 0)
        for pgid in ["dashboard", "ticket-inbox", "customers", "insights", "my-issues", "kanban"]:
            errs.clear(); await pg.evaluate(f"App.navigate('{pgid}')"); await pg.wait_for_timeout(1500)
            t = await pg.locator("#contentArea").inner_text()
            check(f"agent can use {pgid}", len(t.strip()) > 40 and "This area is for admins" not in t and not errs, errs[:1] or t[:60])
        check("agent is refused admin RPCs", all(not rpc(agt, f, *a).get("success") for f, a in [("exportAllData", []), ("saveWorkingHours", [{}]), ("getWhatsAppSetupStatus", []), ("verifyWhatsAppTwilio", [])]))
        await ctx.close()

        # ---- 2. inbox connection ----
        ctx = await b.new_context(viewport={"width": 1440, "height": 1000}); pg = await ctx.new_page(); await ui_login(pg, "admin@demo.local")
        d = http("/api/email-ticketing/detect", adm, {"email": "someone@gmail.com"})
        check("detects Gmail host from the address", d.get("host") == "imap.gmail.com", d)
        d = http("/api/email-ticketing/detect", adm, {"email": "ops@konnectinsights.com"})
        check("detects Google Workspace on a company domain", d.get("host") == "imap.gmail.com" and d.get("certain"), d)
        check("rejects a half-typed address", http("/api/email-ticketing/detect", adm, {"email": "nope"}).get("success") is False)
        r = http("/api/email-ticketing/test", adm, {"host": "imap.gmail.com", "user": "", "pass": "x"})
        check("test: missing address gets a plain message", r.get("kind") == "input" and "email address" in r["error"], r)
        r = http("/api/email-ticketing/test", adm, {"host": "imap.gmail.com", "user": "a@b.com", "pass": ""})
        check("test: missing password does not crash and explains App Passwords", r.get("kind") == "input" and "App Password" in r["error"], r)
        r = http("/api/email-ticketing/test", adm, {"host": "imap.gmail.com", "user": "nobody.zz91@gmail.com", "pass": "abcd efgh ijkl mnop"})
        check("test: wrong Gmail password explains App Passwords with steps", r.get("kind") == "app-password" and len(r.get("steps", [])) >= 3, r)
        r = http("/api/email-ticketing/test", adm, {"host": "127.0.0.1", "port": 9, "user": "a@b.com", "pass": "x"})
        check("test: refused connection gets a port hint and keeps the raw text", r.get("kind") == "port" and "ECONNREFUSED" in r.get("detail", ""), r)
        await pg.evaluate("App.renderUnifiedSettings('email')"); await pg.wait_for_timeout(1500)
        await pg.fill("#et_user", "help@gmail.com"); await pg.locator("#et_user").blur(); await pg.wait_for_timeout(900)
        check("typing the address fills the mail server", await pg.input_value("#et_host") == "imap.gmail.com")
        await pg.fill("#et_pass", "wrong wrong wrong wrong"); await pg.locator("text=Test Connection").first.click(); await pg.wait_for_timeout(8000)
        t = await pg.locator("#et_result").inner_text()
        check("UI shows the friendly failure with 'How to fix it'", "How to fix it" in t and "App Password" in t, t)
        await ctx.close()

        # ---- 3. WhatsApp setup ----
        cfg = lambda **k: http("/api/whatsapp/config", adm, {"enabled": False, "number": "", "accountSid": "", "authToken": "", **k})
        cfg(number="+10000000000"); cfg()  # changing the number clears anything left over from earlier runs
        s = rpc(adm, "getWhatsAppSetupStatus")
        check("setup status starts empty", s["success"] and not s["hasCreds"] and not s["hasNumber"] and not s["lastInboundAt"], s)
        check("check-connection refuses before credentials are saved", "Save your Twilio" in rpc(adm, "verifyWhatsAppTwilio")["error"])
        cfg(enabled=True, number="+14155238886", accountSid="ACdeadbeefdeadbeefdeadbeefdeadbeef", authToken="badtoken")
        v = rpc(adm, "verifyWhatsAppTwilio")["verified"]
        check("bad Twilio credentials give a plain-language error", v["ok"] is False and "Account SID" in v["error"], v)
        s = rpc(adm, "getWhatsAppSetupStatus")
        check("status knows credentials, number and sandbox", s["hasCreds"] and s["hasNumber"] and s["isSandbox"])
        http("/api/whatsapp/webhook", None, {"From": "whatsapp:+919000000001", "To": "whatsapp:+14155238886", "Body": "setup test hello", "ProfileName": "Setup Test", "WaId": "919000000001"}, form=True)
        s = rpc(adm, "getWhatsAppSetupStatus")
        check("first inbound message is recorded", s["lastInboundAt"] and s["inboundCount"] >= 1, s)
        cfg(enabled=True, number="+14155230000", accountSid="ACdeadbeefdeadbeefdeadbeefdeadbeef", authToken="badtoken")
        check("changing the number resets 'message received'", not rpc(adm, "getWhatsAppSetupStatus")["lastInboundAt"])
        cfg(enabled=True, number="+14155238886", accountSid="ACdeadbeefdeadbeefdeadbeefdeadbeef", authToken="badtoken")
        tk = [x for x in rpc(adm, "getTickets", {"search": "setup test"}).get("tickets", []) if "setup test" in (x.get("subject", "") + x.get("body", "")).lower()]
        for x in tk: rpc(adm, "deleteTicket", x["id"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 1000}); pg = await ctx.new_page(); await ui_login(pg, "admin@demo.local")
        await pg.evaluate("App.navigate('whatsapp-settings')"); await pg.wait_for_timeout(2000)
        t = await pg.locator("#waSetup").inner_text()
        check("checklist shows 4 steps and the sandbox-vs-own-number guidance", "Setup progress" in t and "Sandbox now" in t and "24 hours" in t, t[:120])
        check("checklist is above the credential form", await pg.evaluate("document.getElementById('waSetup').getBoundingClientRect().top < document.getElementById('wa_sid').getBoundingClientRect().top"))
        await pg.locator("#waSetup button", has_text=re.compile("Check")).click(); await pg.wait_for_timeout(2500)
        check("Check connection shows the failure in the checklist", "did not accept" in await pg.locator("#waSetup").inner_text())
        await ctx.close()
        # 24-hour rule on an old chat in the showcase workspace (blocked before any send)
        sh = token("admin@showcase.local"); import datetime
        old = None
        for x in rpc(sh, "getTickets", {"channel": "whatsapp", "limit": 100}).get("tickets", []):
            if x.get("channel") != "whatsapp": continue
            th = (rpc(sh, "getTicketById", x["id"]).get("ticket") or {}).get("thread", []); ins = [m for m in th if m.get("type") == "incoming"]
            if ins and (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(ins[-1]["timestamp"])).total_seconds() > 86400: old = x["id"]; break
        if old:
            r = rpc(sh, "replyToTicket", old, "hi", False)
            check("reply on a WhatsApp chat older than 24h is blocked with a clear reason", r.get("code") == "wa_window" and "24 hours" in r.get("error", ""), r)
        cfg()
        # ---- 4. role dropdowns ----
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); await ui_login(pg, "admin@showcase.local")
        users = rpc(sh, "getUsers")["users"]; ag = [u for u in users if u["role"] == "Agent"][0]
        await pg.evaluate("(u)=>App.showEditUserModal(u)", ag); await pg.wait_for_timeout(1200)
        sel = await pg.evaluate("(document.getElementById('euRole')||{}).value || null")
        check("editing an Agent keeps the role Agent (no silent promotion to Admin)", sel == "Agent", sel)
        await ctx.close(); await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
