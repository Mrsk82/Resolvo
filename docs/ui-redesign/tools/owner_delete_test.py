"""Owner Console delete + recycle bin: workspace, user, ticket/issue, lead. Everything is deleted into a 30-day recycle bin and can be restored.
Runs a throwaway copy of the app on :3921 (made-up workspaces; MAIL_CAPTURE keeps email in a file). Run: python docs/ui-redesign/tools/owner_delete_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3921; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def http(path, tok=None, body=None):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    raw = urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=120).read().decode()
    return raw if raw.lstrip().startswith("<") else json.loads(raw or "null")
tmp = tempfile.mkdtemp(prefix="rv-del-"); app = os.path.join(tmp, "app"); backups = os.path.join(tmp, "backups"); mailf = os.path.join(tmp, "mail.jsonl")
D = lambda *a: os.path.join(app, "data", *a)
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(D("brands"))
    for slug in ("demo", "doomed", "other"): shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), D("brands", slug))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), D(f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    h = subprocess.run(["node", "-e", "console.log(require(process.argv[1]).hashSync('Owner-test-1',10))", os.path.join(ROOT, "node_modules", "bcryptjs")], capture_output=True, text=True).stdout.strip()
    now = datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat()
    demo = [b for b in o["brands"] if b["slug"] == "demo"][0]
    doomed = dict(demo, id="BRD-DOOM", slug="doomed", name="Doomed Co", status="active", tier="Free", majorAdminEmail="admin@demo.local", createdDate=now)
    other = dict(demo, id="BRD-OTH", slug="other", name="Other Co", status="active", tier="Free", majorAdminEmail="admin@demo.local", createdDate=now)
    o["brands"] = [demo, doomed, other]; o["passwordHash"] = h; o["auditLog"] = []
    o["prospects"] = [{"id": "P1", "name": "Lead Person", "email": "lead@example.com", "company": "Leadco", "status": "lead", "createdAt": now}]
    json.dump(o, open(D("owner.json"), "w", encoding="utf-8"))
    return o["email"]
owner_email = build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=mailf, BACKUP_DIR=backups, EMAIL_ENABLED="")
srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ownerj = lambda: json.load(open(D("owner.json"), encoding="utf-8"))
slugs = lambda: [b["slug"] for b in ownerj()["brands"]]

async def main():
    for _ in range(80):
        try: http("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    owner = http("/api/login", None, {"email": owner_email, "password": "Owner-test-1"})["token"]
    admin = http("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})["token"]
    # the same login exists in every copy; sign in separately for each workspace through the RPC of its own session
    rpc = lambda tok, fn, *a: http("/api/call", tok, {"fn": fn, "args": list(a)})
    dl = lambda body, tok=None: http("/api/owner/delete", tok or owner, body)

    # ---------- protection ----------
    check("delete: not available to a workspace admin", http("/api/owner/delete-preview?type=workspace&slug=doomed", admin).get("success") is False and dl({"type": "workspace", "slug": "doomed", "confirm": "Doomed Co"}, admin).get("success") is False)
    pv = http("/api/owner/delete-preview?type=workspace&slug=doomed", owner)
    check("preview: says what will go (users, tickets, issues) and what to type", pv["success"] and pv["confirmName"] == "Doomed Co" and "user" in pv["lines"][0] and "ticket" in pv["lines"][0] and pv["backup"] is True, pv)
    r = dl({"type": "workspace", "slug": "doomed", "confirm": "doomed co"})
    check("workspace: the wrong name (or capitals) does not delete", r["success"] is False and "slug" and "doomed" in slugs() and os.path.isdir(D("brands", "doomed")), r)
    r = dl({"type": "workspace", "slug": "doomed"})
    check("workspace: no confirmation does not delete", r["success"] is False and "doomed" in slugs())
    check("workspace: a made-up workspace is refused", dl({"type": "workspace", "slug": "nope", "confirm": "x"})["success"] is False)

    # ---------- delete a workspace ----------
    n_users = len(http("/api/owner/reports/admins", owner)["rows"])
    r = dl({"type": "workspace", "slug": "doomed", "confirm": "Doomed Co"})
    check("workspace: typing the exact name deletes it", r["success"] and "restore" in r["message"].lower(), r)
    check("workspace: gone from the owner file, even though the safeguard puts back missing workspaces", slugs() == ["demo", "other"], slugs())
    check("workspace: its data folder was moved out, not destroyed", not os.path.exists(D("brands", "doomed")) and os.path.exists(os.path.join(D("trash"), r["recycleId"], "brand", "db.sqlite")))
    bks = [f for f in os.listdir(backups) if f.endswith(".tar.gz")]
    unp = os.path.join(tmp, "unp"); os.makedirs(unp)
    subprocess.run(["tar", "-xzf", os.path.join(backups, bks[0])], cwd=unp, check=True)
    man = json.load(open(os.path.join(unp, bks[0].replace(".tar.gz", ""), "manifest.json")))
    check("workspace: a backup taken just before holds it (3 workspaces)", len(bks) >= 1 and man["workspacesInOwnerFile"] == 3 and "doomed" in man["brands"], man["brands"].keys())
    check("workspace: it no longer shows in search", http("/api/owner/find?q=doomed", owner)["results"]["workspaces"] == [])
    check("workspace: no longer in the reports (2 workspaces)", len(http("/api/owner/reports/busiest", owner)["rows"]) == 2)
    check("workspace: the delete is in the owner log, without secrets", any(a["action"] == "workspace_deleted" and a["details"]["brandSlug"] == "doomed" for a in ownerj()["auditLog"]) and "$2a$" not in json.dumps(ownerj()["auditLog"]))
    http("/api/owner/backups/run", owner, {})
    items = {i["id"]: i for i in http("/api/owner/attention", owner)["items"]}
    check("workspace: deleting on purpose does not set off the 'number went down' warning", "workspace-drop" not in items, list(items))
    tr = http("/api/owner/trash", owner)
    e = tr["items"][0]
    check("recycle bin: lists it with 30 days left", len(tr["items"]) == 1 and e["type"] == "workspace" and e["label"] == "Doomed Co" and e["daysLeft"] == 30 and e["by"] == owner_email, tr)
    check("recycle bin: not available to a workspace admin", http("/api/owner/trash", admin).get("success") is False)

    # ---------- restore the workspace ----------
    r = http(f"/api/owner/trash/{e['id']}/restore", owner, {})
    check("restore: the workspace comes back whole", r["success"] and "doomed" in slugs() and os.path.exists(D("brands", "doomed", "db.sqlite")) and http("/api/owner/trash", owner)["items"] == [], r)
    f = http("/api/owner/find?q=doomed", owner)["results"]; fp = http("/api/owner/find?q=admin@demo.local", owner)["results"]["people"]
    check("restore: it is found again, with its users", len(f["workspaces"]) == 1 and any(p["brand"] == "doomed" for p in fp), [f["workspaces"], fp])
    check("restore: restoring twice is refused", http(f"/api/owner/trash/{e['id']}/restore", owner, {})["success"] is False)
    items = {i["id"]: i for i in http("/api/owner/attention", owner)["items"]}
    check("restore: still no false 'went down' warning", "workspace-drop" not in items)

    # ---------- a user ----------
    uid = rpc(admin, "addUser", {"name": "Pat Test", "email": "pat@example.com", "role": "Agent", "team": "Support"})["userId"]
    pat = http("/api/login", None, {"email": "pat@example.com", "password": [m for m in map(json.loads, open(mailf, encoding="utf-8").read().splitlines()) if m["to"] == "pat@example.com"][0]["text"].split("Pass: ")[1].strip()})["token"]
    check("user: setup, Pat can sign in", bool(pat))
    r = dl({"type": "user", "slug": "demo", "id": uid})
    check("user: delete works with one confirmation", r["success"], r)
    check("user: Pat is out of the workspace and his session stops working", all(u["email"] != "pat@example.com" for u in rpc(admin, "getUsers").get("users", [])) and rpc(pat, "getUsers").get("success") is not True)
    check("user: Pat cannot sign in any more", http("/api/login", None, {"email": "pat@example.com", "password": "x"}).get("success") is False)
    e2 = http("/api/owner/trash", owner)["items"][0]
    r = http(f"/api/owner/trash/{e2['id']}/restore", owner, {})
    users = rpc(admin, "getUsers").get("users", [])
    check("user: restore puts Pat back with his old record", r["success"] and any(u["email"] == "pat@example.com" and u["id"] == uid for u in users), r)
    adminid = [u for u in users if u["email"] == "admin@demo.local"][0]["id"]
    r = dl({"type": "user", "slug": "doomed", "id": [u for u in http("/api/owner/find?q=admin@demo.local", owner)["results"]["people"] if u["brand"] == "doomed"][0]["id"]})
    check("user: the main admin of a workspace cannot be deleted on its own", r["success"] is False and "main admin" in r["error"], r)

    # ---------- ticket, issue, lead ----------
    tks = rpc(admin, "getTickets").get("tickets", []); tid = tks[0]["id"]
    n_t = len(tks)
    r = dl({"type": "ticket", "table": "tickets", "slug": "demo", "id": tid})
    check("ticket: delete works", r["success"] and len(rpc(admin, "getTickets").get("tickets", [])) == n_t - 1 and all(t["id"] != tid for t in rpc(admin, "getTickets")["tickets"]), r)
    e3 = [i for i in http("/api/owner/trash", owner)["items"] if i["type"] == "ticket"][0]
    http(f"/api/owner/trash/{e3['id']}/restore", owner, {})
    check("ticket: restore puts it back", any(t["id"] == tid for t in rpc(admin, "getTickets")["tickets"]))
    iss = rpc(admin, "getIssues").get("issues", []); iid = iss[0]["id"]
    r = dl({"type": "ticket", "table": "issues", "slug": "demo", "id": iid})
    check("issue: delete works and is labelled an issue", r["success"] and "Issue" in r["message"] and all(i["id"] != iid for i in rpc(admin, "getIssues")["issues"]), r)
    e4 = [i for i in http("/api/owner/trash", owner)["items"] if i["type"] == "ticket"][0]
    http(f"/api/owner/trash/{e4['id']}/restore", owner, {})
    check("issue: restore puts it back", any(i["id"] == iid for i in rpc(admin, "getIssues")["issues"]))
    r = dl({"type": "lead", "id": "P1"})
    check("lead: delete works", r["success"] and ownerj()["prospects"] == [], r)
    e5 = [i for i in http("/api/owner/trash", owner)["items"] if i["type"] == "lead"][0]
    http(f"/api/owner/trash/{e5['id']}/restore", owner, {})
    check("lead: restore puts it back", [p["id"] for p in ownerj()["prospects"]] == ["P1"])

    # ---------- delete for good ----------
    dl({"type": "lead", "id": "P1"})
    e6 = http("/api/owner/trash", owner)["items"][0]
    check("purge: refused without typing DELETE", http(f"/api/owner/trash/{e6['id']}/purge", owner, {})["success"] is False and len(http("/api/owner/trash", owner)["items"]) == 1)
    r = http(f"/api/owner/trash/{e6['id']}/purge", owner, {"confirm": "DELETE"})
    check("purge: deletes it for good", r["success"] and http("/api/owner/trash", owner)["items"] == [] and not os.path.exists(os.path.join(D("trash"), e6["id"])), r)
    r = http("/api/owner/trash/del-000000000000/restore", owner, {})
    check("restore: something not in the bin gives a clear message", r["success"] is False and "no longer" in r["error"], r)

    # ---------- screens ----------
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome")
        async def page(w, h):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
            await pg.goto(BASE + "/owner-console"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo')}", owner)
            await pg.goto(BASE + "/owner-console"); await pg.wait_for_timeout(1200); return pg, errs
        pg, errs = await page(1440, 1000)
        await pg.click(".rvc-tab[data-tab=browse]"); await pg.select_option("#selTable", "brands"); await pg.wait_for_selector("#tableWrap tbody tr")
        await pg.fill("#browseFilter", "doomed"); await pg.wait_for_timeout(200)
        check("screen: Browse > workspaces has Edit and Delete on each row", await pg.locator("#tableWrap [data-del=workspace]").count() == 1 and await pg.locator("#tableWrap [data-edit]").count() == 1)
        await pg.click("#tableWrap [data-del=workspace]"); await pg.wait_for_selector("#confirmOverlay:not([hidden])")
        body = await pg.inner_text("#confirmBody")
        check("screen: the dialog says what goes, that a backup comes first, and that it can be restored", "Doomed Co" in body and "users" in body and "safety backup" in body and "30 days" in body, body)
        check("screen: Delete is off until the workspace name is typed", await pg.locator("#confirmGo").is_disabled() and "Doomed Co" in await pg.inner_text("#confirmTypeLabel"))
        await pg.fill("#confirmType", "doomed co"); await pg.wait_for_timeout(100)
        check("screen: the wrong capitals keep it off", await pg.locator("#confirmGo").is_disabled())
        await pg.fill("#confirmType", "Doomed Co"); await pg.wait_for_timeout(100)
        check("screen: the exact name turns it on (red)", await pg.locator("#confirmGo").is_enabled() and "danger" in (await pg.get_attribute("#confirmGo", "class")))
        await pg.screenshot(path=os.path.join(SHOTS, "delete_confirm.png"))
        await pg.click("#confirmGo"); await pg.wait_for_function("document.querySelector('#trashBadge') && !document.querySelector('#trashBadge').hidden", timeout=20000)
        check("screen: the workspace is gone and the Recycle bin tab shows 1", "doomed" not in slugs() and await pg.inner_text("#trashBadge") == "1")
        await pg.click(".rvc-tab[data-tab=trash]"); await pg.wait_for_selector("#trashList .rvc-result")
        txt = await pg.inner_text("#trashList")
        check("screen: the Recycle bin lists it with days left and Restore / Delete for good", "Doomed Co" in txt and "30 days left" in txt and await pg.locator("[data-trash=restore]").count() == 1 and await pg.locator("[data-trash=purge]").count() == 1, txt)
        await pg.screenshot(path=os.path.join(SHOTS, "delete_bin.png"))
        await pg.click("[data-trash=purge]"); await pg.wait_for_selector("#confirmOverlay:not([hidden])")
        check("screen: deleting for good needs DELETE typed", await pg.locator("#confirmGo").is_disabled())
        await pg.click("#confirmCancel"); await pg.wait_for_timeout(200)
        check("screen: cancelling keeps it", len(http("/api/owner/trash", owner)["items"]) == 1)
        await pg.click("[data-trash=restore]"); await pg.wait_for_selector("#trashList .rvc-empty")
        check("screen: Restore brings the workspace back", "doomed" in slugs() and await pg.locator("#trashBadge").is_hidden())
        await pg.click(".rvc-tab[data-tab=find]"); await pg.fill("#findQ", "other co"); await pg.press("#findQ", "Enter"); await pg.wait_for_selector("#findOut .rvc-result")
        check("screen: Find results carry a Delete button too", await pg.locator("#findOut [data-act=del][data-type=workspace]").count() == 1)
        check("screen: no script errors", not errs, errs)
        await pg.context.close()

        pg, errs = await page(390, 844)
        await pg.click(".rvc-tab[data-tab=find]"); await pg.fill("#findQ", "other co"); await pg.press("#findQ", "Enter"); await pg.wait_for_selector("#findOut .rvc-result")
        await pg.click("#findOut [data-act=del]"); await pg.wait_for_selector("#confirmOverlay:not([hidden])")
        box = await pg.evaluate("(()=>{const r=document.querySelector('#confirmOverlay .rvc-dialog').getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})()")
        check("phone: the delete dialog fits the screen", box[0] >= 0 and box[1] <= 391 and box[3] <= 845, box)
        await pg.screenshot(path=os.path.join(SHOTS, "delete_phone_confirm.png"))
        await pg.fill("#confirmType", "Other Co"); await pg.click("#confirmGo"); await pg.wait_for_function("document.querySelector('#trashBadge') && !document.querySelector('#trashBadge').hidden", timeout=20000)
        await pg.click(".rvc-tab[data-tab=trash]"); await pg.wait_for_selector("#trashList .rvc-result")
        check("phone: the Recycle bin fits and does not scroll sideways", await pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"))
        await pg.screenshot(path=os.path.join(SHOTS, "delete_phone_bin.png"))
        check("phone: no script errors", not errs, errs)
        await br.close()

async def run():
    try: await main()
    finally:
        srv.terminate(); time.sleep(0.8)
        try: os.rmdir(os.path.join(app, "node_modules"))   # removes only the link, never the real folder
        except OSError: pass
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed"); sys.exit(1 if FAIL else 0)
asyncio.run(run())
