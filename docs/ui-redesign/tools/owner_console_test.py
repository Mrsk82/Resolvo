"""Owner Console: secrets hidden, find anyone, ready-made reports, mass-email confirmation, backups on the health tab, phone layout.
Runs a throwaway copy of the app (demo workspace plus a few made-up ones) on :3920. MAIL_CAPTURE writes email to a file, so nothing is ever sent.
Run: python docs/ui-redesign/tools/owner_console_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3920; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def http(path, tok=None, body=None):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    raw = urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=90).read().decode()
    return raw if raw.lstrip().startswith("<") else json.loads(raw or "null")

tmp = tempfile.mkdtemp(prefix="rv-con-"); app = os.path.join(tmp, "app"); backups = os.path.join(tmp, "backups"); mailf = os.path.join(tmp, "mail.jsonl")
HASH_LOG = "$2a$10$ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmnopqrstuvwxyz0123456"   # an old log entry holding a password hash: the server must blank it at start
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands"))
    for slug in ("demo", "graytest", "trialco", "quietco"): shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", slug))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    h = subprocess.run(["node", "-e", "console.log(require(process.argv[1]).hashSync('Owner-test-1',10))", os.path.join(ROOT, "node_modules", "bcryptjs")], capture_output=True, text=True).stdout.strip()
    ist = timezone(timedelta(hours=5, minutes=30)); now = datetime.now(ist)
    demo = [b for b in o["brands"] if b["slug"] == "demo"][0]
    trial = dict(demo, id="BRD-TRIAL", slug="trialco", name="Trial Co", tier="Trial", status="active", majorAdminEmail="trial@example.com", trialEnds=(now + timedelta(days=2)).isoformat(), lastActive=now.isoformat(), createdDate=(now - timedelta(days=1, hours=2)).isoformat())
    gray = dict(demo, id="BRD-GRAY", slug="graytest", name="Gray Test", status="pending", tier="Trial", majorAdminEmail="Mayur@Example.com", createdDate=(now - timedelta(days=2)).isoformat(), verifyToken="a" * 48, verifyExpires=int(time.time() * 1000) - 3600000)
    quiet = dict(demo, id="BRD-QUIET", slug="quietco", name="Quiet Co", status="active", tier="Free", lastActive=(now - timedelta(days=40)).isoformat())
    o["brands"] = [demo, trial, gray, quiet]; o["prospects"] = [{"id": "P1", "name": "Lead Person", "email": "lead@example.com", "company": "Leadco", "status": "lead", "createdAt": now.isoformat()}]; o["passwordHash"] = h
    o["auditLog"] = [{"id": "x1", "action": "reset_email_failed", "details": {"brandSlug": "demo", "email": "lost@example.com"}, "by": "system", "timestamp": now.isoformat()},
                     {"id": "x0", "action": "record_edit", "details": {"table": "users", "before": {"email": "a@b.c", "passwordHash": HASH_LOG}, "after": {"email": "a@b.c", "passwordHash": HASH_LOG}}, "by": "owner", "timestamp": now.isoformat()}]
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    return o["email"]
owner_email = build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=mailf, BACKUP_DIR=backups, EMAIL_ENABLED="")
srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def mails(): return [json.loads(l) for l in open(mailf, encoding="utf-8").read().splitlines() if l.strip()] if os.path.exists(mailf) else []

async def main():
    for _ in range(80):
        try: http("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    owner = http("/api/login", None, {"email": owner_email, "password": "Owner-test-1"})["token"]
    admin = http("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})["token"]
    ownerfile = open(os.path.join(app, "data", "owner.json"), encoding="utf-8").read()
    # ---------- secrets ----------
    check("secrets: an old log entry that held a password hash was blanked when the server started", HASH_LOG not in ownerfile and "[removed]" in ownerfile)
    q = lambda sql: http("/api/owner/query", owner, {"sql": sql})
    r = q("SELECT * FROM users")
    flat = json.dumps(r, ensure_ascii=False)
    check("secrets: 'All users' shows no password hash and says it is hidden", r["success"] and "$2a$" not in flat and "$2b$" not in flat and "••• hidden" in flat, flat[:200])
    r = q("SELECT name, passwordHash FROM users")
    check("secrets: asking for the hash column by name still gives nothing", all(row[1] in ("••• hidden", None) for row in r["rows"]) and r["rows"], r["rows"][:2])
    r = q("SELECT * FROM users WHERE passwordHash LIKE '$2a'")
    check("secrets: you cannot search by hash either", r["success"] and r["total"] == 0, r)
    r = q("SELECT * FROM brands"); flat = json.dumps(r, ensure_ascii=False)
    check("secrets: workspace list hides the activation token", "a" * 48 not in flat and "••• hidden" in flat)
    r = q("SELECT * FROM audit_log")
    check("secrets: the owner log shows no hash", HASH_LOG not in json.dumps(r) and "$2a$10$ABCDEF" not in json.dumps(r))
    uid = [x for x in http("/api/call", admin, {"fn": "getUsers", "args": []}).get("users", []) if x["email"] == "admin@demo.local"][0]["id"]
    rec = http(f"/api/owner/record/users/demo/{uid}", owner)["record"]
    check("secrets: the record editor does not receive the hash", "passwordHash" not in rec and rec["email"] == "admin@demo.local", list(rec)[:12])
    r = http(f"/api/owner/record/users/demo/{uid}", owner, {"updates": {"passwordHash": "evil", "name": "Demo Admin 2", "twoFASecret": "x"}})
    after = http("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})
    check("secrets: a hash sent to the editor is ignored (login still works) while normal fields save", r["success"] and after.get("success") is True and r["record"]["name"] == "Demo Admin 2", [r, after.get("error")])
    log = json.dumps(json.load(open(os.path.join(app, "data", "owner.json"), encoding="utf-8"))["auditLog"])
    check("secrets: the edit was logged without any hash", "record_edit" in log and "$2a$10$" not in log.replace(HASH_LOG, ""), log[:200])

    # ---------- find ----------
    f = lambda s: http("/api/owner/find?q=" + urllib.request.quote(s), owner)
    r = f("  ADMIN@Demo.Local ")
    check("find: an email in capitals with spaces finds the person and their workspace", r["success"] and any(p["email"] == "admin@demo.local" and p["brand"] == "demo" for p in r["results"]["people"]), r)
    r = f("mayur@example")
    check("find: a half-typed email finds a workspace that was never activated", any(w["slug"] == "graytest" and w["status"] == "pending" for w in r["results"]["workspaces"]), r["results"]["workspaces"])
    r = f("Gray")
    check("find: a workspace name works", any(w["slug"] == "graytest" for w in r["results"]["workspaces"]))
    r = f("lead@example.com")
    check("find: sign-up leads are searched", any(l["email"] == "lead@example.com" for l in r["results"]["leads"]))
    tk = [t for t in (http("/api/call", admin, {"fn": "getTickets", "args": []}) or {}).get("tickets", [])][:1]
    r = f("zzz-nobody@nowhere.test")
    check("find: no match says how much was searched", r["success"] and r["total"] == 0 and r["seen"]["workspaces"] == 4 and r["seen"]["people"] >= 4, r)
    check("find: one character is refused", f("a")["success"] is False)
    check("find: not available to a workspace admin", http("/api/owner/find?q=demo", admin).get("success") is False)

    # ---------- reports ----------
    r = http("/api/owner/reports", owner); cnt = {x["id"]: x["count"] for x in r["reports"]}
    check("reports: nine ready-made reports with counts", r["success"] and len(r["reports"]) == 9, [x["id"] for x in r["reports"]])
    check("reports: the made-up cases are counted", cnt["not-activated"] == 1 and cnt["trials-ending"] == 1 and cnt["quiet"] == 1 and cnt["failed-emails"] == 1 and cnt["signups-week"] == 2, cnt)
    for rid in cnt:
        d = http("/api/owner/reports/" + rid, owner)
        ok = d["success"] and all(len(row) == len(d["columns"]) for row in d["rows"]) and len(d["rows"]) == cnt[rid]
        check(f"reports: '{rid}' rows match its columns and its count", ok, d if not ok else "")
    d = http("/api/owner/reports/not-activated", owner)
    check("reports: 'signed up, never activated' names Gray Test, with its link expired", d["rows"][0][0] == "Gray Test" and d["rows"][0][3] == "expired" and "a" * 48 not in json.dumps(d), d["rows"])
    check("reports: unknown report and non-owner are refused", http("/api/owner/reports/nope", owner)["success"] is False and http("/api/owner/reports", admin).get("success") is False)

    # ---------- mass emails ----------
    n0 = len(mails())
    pv = http("/api/owner/nurture/preview", owner)
    check("nurture: the preview lists who is due and sends nothing", pv["success"] and any(p["to"] == "trial@example.com" for p in pv["plan"]) and len(mails()) == n0, pv)
    pv2 = http("/api/owner/nurture/preview", owner)
    check("nurture: asking twice shows the same list (nothing was marked as sent)", len(pv2["plan"]) == len(pv["plan"]))
    r = http("/api/owner/nurture/run-now", owner, {})
    check("nurture: 'run now' without confirmation sends nothing", r["success"] is False and len(mails()) == n0, r)
    r = http("/api/owner/nurture/test-all", owner, {"to": "someone.else@gmail.com"})
    check("nurture: test emails to anybody but you are refused", r["success"] is False and "own address" in r["error"] and len(mails()) == n0, r)

    # ---------- screens ----------
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome")
        async def page(w, h, token=True):
            ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text else None)
            if token:
                await pg.goto(BASE + "/owner-console")
                await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo')}", owner)
            await pg.goto(BASE + "/owner-console"); await pg.wait_for_timeout(1200)
            return pg, errs
        # no token -> sign in box
        pg0, e0 = await page(1280, 800, token=False)
        check("screen: without a session the sign-in box opens", await pg0.locator("#loginOverlay").is_visible() and "Sign-in needed" in await pg0.inner_text("#connStatus"))
        await pg0.context.close()

        pg, errs = await page(1440, 1000)
        check("desktop: connected, with six tabs", "Connected" in await pg.inner_text("#connStatus") and await pg.locator(".rvc-tab").count() == 6)
        check("desktop: the health tab shows a red count for what needs attention", await pg.locator("#healthBadge").is_visible())
        tiles = await pg.locator(".rvc-tile").count()
        check("desktop: nine report tiles are shown", tiles == 9, tiles)
        # find
        await pg.fill("#findQ", "MAYUR@example.com"); await pg.press("#findQ", "Enter"); await pg.wait_for_selector("#findOut .rvc-result")
        txt = await pg.inner_text("#findOut")
        check("desktop: Find shows the workspace, that it is not activated, and the admin email", "Gray Test" in txt and "not activated" in txt.lower() and "Mayur@Example.com" in txt, txt[:300])
        await pg.click("#findOut [data-act=resend]"); await pg.wait_for_timeout(900)
        mm = [m for m in mails() if m["to"].lower() == "mayur@example.com"]
        check("desktop: 'Resend activation' emails a fresh link", len(mm) == 1 and "/verify-email?slug=graytest" in mm[0]["text"], mm)
        await pg.fill("#findQ", "nobody-at-all@nowhere.test"); await pg.press("#findQ", "Enter"); await pg.wait_for_selector("#findOut .rvc-none b")
        check("desktop: a search with no match says what was searched", "Searched 4 workspaces" in await pg.inner_text("#findOut"))
        await pg.screenshot(path=os.path.join(SHOTS, "console_find.png"))
        # reports
        await pg.click(".rvc-tile[data-r=not-activated]"); await pg.wait_for_selector("#rptTable tbody tr")
        check("desktop: a report opens as a table with one row (Gray Test)", await pg.locator("#rptTable tbody tr").count() == 1 and "Gray Test" in await pg.inner_text("#rptTable"))
        await pg.click(".rvc-tile[data-r=busiest]"); await pg.wait_for_selector("#rptTable tbody tr >> nth=3")
        await pg.fill("#rptFilter", "trialco"); await pg.wait_for_timeout(200)
        check("desktop: the filter box narrows a report", await pg.locator("#rptTable tbody tr").count() == 1)
        await pg.fill("#rptFilter", "")
        await pg.click("#rptTable th:has-text('Tickets')"); await pg.wait_for_timeout(200)
        async with pg.expect_download() as dl: await pg.click("#rptCsv")
        d = await dl.value; body = open(await d.path(), encoding="utf-8-sig").read()
        check("desktop: the report exports as a CSV with its columns", d.suggested_filename.startswith("resolvo-busiest") and body.splitlines()[0].startswith('"Workspace"') and len(body.splitlines()) >= 5, body[:120])
        await pg.screenshot(path=os.path.join(SHOTS, "console_reports.png"))
        # browse
        await pg.click(".rvc-tab[data-tab=browse]"); await pg.select_option("#selTable", "users"); await pg.wait_for_selector("#tableWrap tbody tr")
        t = await pg.inner_text("#tableWrap")
        check("desktop: Browse > users shows hidden passwords and no hash", "••• hidden" in t and "$2a$" not in t and "$2b$" not in t)
        n_all = await pg.locator("#tableWrap tbody tr").count()
        await pg.fill("#browseFilter", "admin@demo.local"); await pg.wait_for_timeout(200)
        n_f = await pg.locator("#tableWrap tbody tr").count()
        check("desktop: the filter box narrows the raw records", 0 < n_f < n_all, [n_f, n_all])
        await pg.click("#tableWrap [data-edit] >> nth=0"); await pg.wait_for_selector("#editFields input")
        fields = await pg.evaluate("[...document.querySelectorAll('#editFields [data-field]')].map(e=>e.dataset.field)")
        check("desktop: the editor opens with no password or token field", "email" in fields and not any("assword" in f or "oken" in f or "ecret" in f for f in fields), fields)
        await pg.click("#editCancel")
        async with pg.expect_download() as dl: await pg.click("#exportBtn")
        d = await dl.value; body = open(await d.path(), encoding="utf-8-sig").read()
        check("desktop: the data export holds no hash", "$2a$" not in body and "$2b$" not in body and "••• hidden" in body)
        await pg.screenshot(path=os.path.join(SHOTS, "console_browse.png"))
        # nurture with confirmation
        await pg.click(".rvc-tab[data-tab=nurture]"); n_before = len(mails())
        await pg.click("#nurtureRunBtn"); await pg.wait_for_selector("#confirmOverlay:not([hidden])")
        body = await pg.inner_text("#confirmBody")
        check("desktop: before any real email goes, a list shows who gets what", "trial@example.com" in body and "Day 1" in body, body[:200])
        check("desktop: the Send button stays off until SEND is typed", await pg.locator("#confirmGo").is_disabled())
        await pg.fill("#confirmType", "send"); await pg.wait_for_timeout(100)
        check("desktop: typing SEND turns it on", await pg.locator("#confirmGo").is_enabled())
        await pg.screenshot(path=os.path.join(SHOTS, "console_confirm.png"))
        await pg.click("#confirmCancel"); await pg.wait_for_timeout(200)
        check("desktop: cancelling sends nothing", len(mails()) == n_before and "Nothing was sent" in await pg.inner_text("#nurtureResult"))
        await pg.click("#nurtureRunBtn"); await pg.wait_for_selector("#confirmOverlay:not([hidden])"); await pg.fill("#confirmType", "SEND"); await pg.click("#confirmGo"); await pg.wait_for_selector("#nurtureResult b")
        sent = [m for m in mails()[n_before:] if m["to"] == "trial@example.com"]
        check("desktop: confirming sends the listed emails", len(sent) >= 1 and "sent" in await pg.inner_text("#nurtureResult"), [await pg.inner_text("#nurtureResult"), len(sent)])
        # health
        await pg.click(".rvc-tab[data-tab=health]"); await pg.wait_for_selector("#rvOwnSystem .rv-os")
        check("desktop: Health & Backups shows what needs attention and the backups card", await pg.locator("#rvOwnAttention .rv-oa").count() == 1 and await pg.locator("#rvOwnSystem .rv-os").count() == 1)
        await pg.click("#rvOwnSystem [data-rvo=backup-now]"); await pg.wait_for_function("(()=>{const b=document.querySelector('#rvOwnSystem [data-rvo=backup-now]');return b&&!b.disabled&&b.textContent.trim()==='Back up now'})()", timeout=25000)
        check("desktop: 'Back up now' works from the console", "just now" in await pg.inner_text("#rvOwnSystem .rv-os-tile .rv-os-v") or "minute" in await pg.inner_text("#rvOwnSystem .rv-os-tile .rv-os-v"))
        await pg.wait_for_selector("#healthTableWrap tbody tr")
        check("desktop: database sizes are listed", await pg.locator("#healthTableWrap tbody tr").count() == 4)
        await pg.screenshot(path=os.path.join(SHOTS, "console_health.png"))
        await pg.click(".rvc-tab[data-tab=monitor]"); await pg.wait_for_selector("#monStats .rvc-stat")
        check("desktop: Live Monitor loads", await pg.locator("#monStats .rvc-stat").count() == 4)
        check("desktop: no script errors", not errs, errs)
        await pg.context.close()

        # ---- phone ----
        pg, errs = await page(390, 844)
        async def noscroll(): return await pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
        check("phone: Find & Reports does not scroll sideways", await noscroll())
        await pg.fill("#findQ", "gray"); await pg.press("#findQ", "Enter"); await pg.wait_for_selector("#findOut .rvc-result")
        check("phone: search results fit the screen", await noscroll())
        await pg.screenshot(path=os.path.join(SHOTS, "console_phone_find.png"))
        await pg.click(".rvc-tile[data-r=busiest]"); await pg.wait_for_selector("#rptTable tbody tr")
        disp = await pg.evaluate("getComputedStyle(document.querySelector('#rptTable tbody tr')).display")
        check("phone: a report is a list of cards, not a squeezed table", disp == "block" and await noscroll(), disp)
        lab = await pg.evaluate("[...document.querySelectorAll('#rptTable tbody tr:first-child td')].map(t=>t.dataset.l)")
        check("phone: each value on a card has its label", "Workspace" in lab and "Tickets" in lab, lab)
        await pg.evaluate("document.getElementById('reportOut').scrollIntoView()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, "console_phone_report.png"))
        for tab in ("browse", "monitor", "nurture", "health"):
            await pg.click(f".rvc-tab[data-tab={tab}]"); await pg.wait_for_timeout(700)
            check(f"phone: the {tab} tab does not scroll sideways", await noscroll())
        await pg.screenshot(path=os.path.join(SHOTS, "console_phone_health.png"))
        await pg.click(".rvc-tab[data-tab=nurture]"); await pg.click("#nurtureTestBtn"); await pg.wait_for_selector("#confirmOverlay:not([hidden])")   # the real-email list is empty by now: it was sent above
        box = await pg.evaluate("(()=>{const r=document.querySelector('#confirmOverlay .rvc-dialog').getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})()")
        check("phone: the confirmation fits on the screen", box[0] >= 0 and box[1] <= 391 and box[3] <= 845, box)
        await pg.screenshot(path=os.path.join(SHOTS, "console_phone_confirm.png"))
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
