"""Tests for Customers: health badges, last contact, promotions not becoming customers, duplicate detection and merge.
Seeds two same-name contacts (an email one and a WhatsApp one) into the LOCAL demo brand and removes them after."""
import asyncio, os, sqlite3, json, sys, uuid
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "brands", "demo", "db.sqlite")
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)) if d and not ok else ""))
def put(table, obj):
    c = sqlite3.connect(DB); c.execute(f"INSERT OR REPLACE INTO {table}(id,data) VALUES(?,?)", (obj["id"], json.dumps(obj))); c.commit(); c.close()
def rm(table, ids):
    c = sqlite3.connect(DB)
    for i in ids: c.execute(f"DELETE FROM {table} WHERE id=?", (i,))
    c.commit(); c.close()
async def main():
    ids_t = ["TKT-DUP-1", "TKT-DUP-2", "TKT-NEWS-1"]; ids_c = ["CON-DUP-1", "CON-DUP-2"]
    rm("tickets", ids_t); rm("crm_contacts", ids_c)
    now = "2026-10-26T10:00:00.000+05:30"
    mk = lambda i, frm, name, ch, subj, body: {"id": i, "subject": subj, "from": frm, "fromName": name, "body": body, "status": "open", "priority": "Medium", "assignedTo": "", "createdDate": now, "lastActivity": now, "channel": ch, "source": ch, "tags": [], "thread": [{"id": "M-" + i, "type": "incoming", "from": frm, "fromName": name, "body": body, "timestamp": now}]}
    put("tickets", mk("TKT-DUP-1", "meera.kapoor@gmail.com", "Meera Kapoor", "email", "Order late", "Where is my order?"))
    put("tickets", mk("TKT-DUP-2", "whatsapp:+919811122233", "Meera Kapoor", "whatsapp", "Refund", "Please refund"))
    put("tickets", mk("TKT-NEWS-1", "digest@mail.somenews.io", "Some News", "email", "Your digest", "Unsubscribe at the bottom."))
    put("crm_contacts", {"id": "CON-DUP-1", "name": "Meera Kapoor", "email": "meera.kapoor@gmail.com", "phone": "", "company": "", "source": "other", "createdDate": now})
    put("crm_contacts", {"id": "CON-DUP-2", "name": "Meera  Kapoor", "email": "", "phone": "+919811122233", "company": "Acme", "source": "whatsapp", "createdDate": now})
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(viewport={"width": 1440, "height": 900}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        await pg.goto(BASE + "/")
        await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2200)
        call = lambda path, opts=None: pg.evaluate("([p,o])=>App._crmFetch(p,o)", [path, opts or {}])
        r = await call("/api/crm/customers")
        names = [c["name"].lower() for c in r["customers"]]
        check("a newsletter sender does not become a customer", "some news" not in names and not any("somenews" in (c["email"] or "") for c in r["customers"]))
        check("customers carry a health state and last contact", all("health" in c and "lastContact" in c for c in r["customers"]))
        meera = [c for c in r["customers"] if c["id"] in ids_c]
        check("both Meera contacts are listed before merging", len(meera) == 2, meera)
        d = await call("/api/crm/duplicates")
        check("duplicates found (same name, different spacing)", any({"CON-DUP-1", "CON-DUP-2"} <= {c["id"] for c in g} for g in d["groups"]), d)
        await pg.evaluate("App.navigate('customers')"); await pg.wait_for_timeout(2500)
        check("banner offers a review", await pg.locator("#custDup .rv-alert").count() == 1)
        check("health badges appear in the list", await pg.locator(".cust-h").count() >= 1 or len(r["customers"]) == 0)
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\customers_list.png")
        await pg.locator("#custDup button").click(); await pg.wait_for_timeout(500)
        check("review dialog lists the pair", "Meera" in await pg.locator(".rv-overlay").inner_text())
        await pg.screenshot(path=r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline\customers_dupes.png")
        await pg.locator(".rv-overlay >> text=Merge into").first.click(); await pg.wait_for_timeout(1800)
        r2 = await call("/api/crm/customers")
        merged = [c for c in r2["customers"] if c["id"] in ids_c]
        check("after merging there is one Meera", len(merged) == 1, merged)
        m = merged[0] if merged else {}
        check("the merged customer keeps both the email and the phone", m.get("email") == "meera.kapoor@gmail.com" and ("9811122233" in (m.get("phone") or "") or m.get("altCount", 0) >= 1), m)
        check("tickets from both channels are counted on the one customer", m.get("tickets") == 2, m)
        full = await call(f"/api/crm/contacts/{m['id']}/360")
        check("the customer card shows both tickets", full["success"] and len(full["customer"].get("tickets", [])) >= 2, list(full.get("customer", {}).keys()))
        d2 = await call("/api/crm/duplicates")
        check("the pair is no longer reported", not any({"CON-DUP-1", "CON-DUP-2"} <= {c["id"] for c in g} for g in d2["groups"]))
        bad = await call("/api/crm/contacts/merge", {"method": "POST", "body": {"primaryId": "nope", "otherIds": ["x"]}})
        check("merge with unknown ids is refused", bad.get("success") is False, bad)
        errs = [e for e in errs if "400" not in e]   # the 400 is the refused merge above, on purpose
        check("no console or page errors", not errs, errs[:3])
        await b.close()
    rm("tickets", ids_t); rm("crm_contacts", ids_c)
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
