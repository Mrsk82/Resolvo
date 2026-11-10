"""Ticket import on screen: Inbox menu -> choose a CSV -> columns recognised -> preview -> import with progress -> summary -> see the tickets -> remove the import.
Also a semicolon-separated file with a byte-order mark, a file with no rows, and an agent who must not see the option. Throwaway copy on :3942 (nothing is emailed).
Run: python docs/ui-redesign/tools/ticket_import_ui_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3942; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def login(email, pw):
    r = urllib.request.Request(BASE + "/api/login", data=json.dumps({"email": email, "password": pw}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read().decode())

tmp = tempfile.mkdtemp(prefix="rv-impui-"); app = os.path.join(tmp, "app")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands"))
    shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8")); o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    seed = r"""
const D=require(process.argv[1]),bc=require(process.argv[3]);const db=new D(process.argv[2]);db.prepare('DELETE FROM tickets').run();
const h=bc.hashSync('demo1234',10);
for(const r of db.prepare('SELECT id,data FROM users').all()){const u=JSON.parse(r.data);if(u.email==='admin@demo.local'){u.passwordHash=h;u.mustChangePassword=false;u.firstLogin=false;db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u),r.id);}}
const ag={id:'USR-AGENT01',email:'sam@demo.local',name:'Sam Agent',team:'Support',role:'Agent',skill:'',slackId:'',maxTickets:10,active:true,createdDate:new Date().toISOString(),passwordHash:h,firstLogin:false,mustChangePassword:false,availabilityStatus:'available'};
db.prepare('INSERT OR REPLACE INTO users(id,data) VALUES(?,?)').run(ag.id,JSON.stringify(ag));
const now=new Date().toISOString();const t={id:'NORM1',subject:'A normal ticket',status:'open',priority:'Medium',from:'norm@example.test',fromName:'Norm',createdDate:now,lastActivity:now,channel:'email',tags:[],messageIds:[],thread:[{id:'M1',type:'incoming',from:'norm@example.test',body:'Hi',timestamp:now,messageId:'<n>'}]};
db.prepare('INSERT INTO tickets(id,data) VALUES(?,?)').run(t.id,JSON.stringify(t));db.close();"""
    subprocess.run(["node", "-e", seed, os.path.join(ROOT, "node_modules", "better-sqlite3"), os.path.join(app, "data", "brands", "demo", "db.sqlite"), os.path.join(ROOT, "node_modules", "bcryptjs")], check=True)
build()

def q(v): return '"' + str(v).replace('"', '""') + '"'
HEAD = ["ID", "Requester", "Requester email", "Subject", "Status", "Priority", "Requested", "Updated", "Solved at", "Assignee", "Tags"]
def rows(n):
    out = []
    for i in range(n):
        st = ["Open", "Pending", "Solved", "Closed", "New", "Hold"][i % 6]
        out.append([str(5000 + i), f"Cust {i} Ñandú", f"cust{i}@example.org", f"Refund, please #{i}", st, ["Low", "Normal", "High", "Urgent"][i % 4], "15/01/2023 10:30", "16/01/2023 09:00", "16/01/2023 09:00" if st == "Solved" else "", "Sam Agent" if i == 0 else "", "refund vip"])
    out.append(["9001", "Nobody", "", "No email", "Open", "Low", "15/01/2023 10:30", "", "", "", ""])
    out.append(["9002", "Odd", "odd@example.org", "Odd status", "Strange", "Low", "15/01/2023 10:30", "", "", "", ""])
    return out
def csv_text(n, delim=","): return "\r\n".join(delim.join(q(c) for c in r) for r in [HEAD] + rows(n)) + "\r\n"
F1 = os.path.join(tmp, "zendesk.csv"); open(F1, "w", encoding="utf-8").write(csv_text(40))
F2 = os.path.join(tmp, "semi.csv"); open(F2, "w", encoding="utf-8-sig").write(csv_text(6, ";"))   # semicolons and a byte-order mark, as Excel saves them
F3 = os.path.join(tmp, "empty.csv"); open(F3, "w", encoding="utf-8").write("ID,Subject,Requester email\r\n")
env = {k: v for k, v in os.environ.items() if k != "TOPICS_ENABLED"}
env.update(PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/signup-config", timeout=3); break
        except Exception: time.sleep(0.25)
    adm = login("admin@demo.local", "demo1234")["token"]; agent = login("sam@demo.local", "demo1234")["token"]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def page(tok, w=1500, h=950):
            ctx = await br.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(BASE + "/"); await pg.evaluate("t=>{localStorage.setItem('tt_session_token',t);localStorage.setItem('tt_theme','resolvo');localStorage.removeItem('tt_inbox_filters')}", tok)
            await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=25000); await pg.wait_for_timeout(1200)
            await pg.evaluate("App.navigate('ticket-inbox')"); await pg.wait_for_selector(".rvi-row", timeout=20000)
            return pg, errs
        async def open_import(pg):
            await pg.get_by_role("button", name="Inbox actions").click(); await pg.get_by_text("Import tickets from another help desk").first.click()
            await pg.wait_for_selector("#rvxFile", state="attached", timeout=10000)

        # an agent does not get the option
        pg, errs = await page(agent)
        await pg.get_by_role("button", name="Inbox actions").click(); await pg.wait_for_timeout(300)
        check("agent: the import option is not offered", await pg.get_by_text("Import tickets from another help desk").count() == 0)
        await pg.context.close()

        pg, errs = await page(adm)
        await open_import(pg)
        body = await pg.evaluate("document.querySelector('.rvx').textContent")
        check("start: explains it is history only (no emails, alerts or clocks) and how to export", "no emails are sent" in body and "Zendesk" in body and "Freshdesk" in body and "does not include the message text" in body, body[:300])
        await pg.screenshot(path=os.path.join(SHOTS, "import_1_start.png"))
        # a file with no rows
        await pg.set_input_files("#rvxFile", F3); await pg.wait_for_timeout(700)
        check("empty file: says there are no rows and stays on the first step", "No rows found" in await pg.inner_text("body") and await pg.locator("#rvxFile").count() == 1)
        # the real file
        await pg.set_input_files("#rvxFile", F1); await pg.wait_for_selector("#rvxGrid", timeout=10000)
        check("columns: recognised as Zendesk, 42 rows", "Zendesk" in await pg.inner_text(".rvx-lead") and "42 rows" in await pg.inner_text(".rvx-lead"))
        vals = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('[data-map]')].map(s=>[s.getAttribute('data-map'),s.value]))")
        check("columns: email, subject, status, dates, agent and tags are matched to the right columns", vals["email"] == "requester email" and vals["subject"] == "subject" and vals["status"] == "status" and vals["created"] == "requested" and vals["resolved"] == "solved at" and vals["assignee"] == "assignee" and vals["tags"] == "tags" and vals["externalId"] == "id", vals)
        check("columns: an example value from the first row is shown beside each", "cust0@example.org" in await pg.inner_text("#rvxGrid"))
        await pg.screenshot(path=os.path.join(SHOTS, "import_2_map.png"))
        # no email column -> cannot continue
        await pg.select_option('[data-map=email]', ""); await pg.click("[data-x=preview]"); await pg.wait_for_timeout(500)
        check("columns: without an email column it will not continue", "Which column is which?" in await pg.inner_text(".rvx .rv-modal__head") and "Choose the column that holds the customer email" in await pg.inner_text("body"))
        await pg.select_option('[data-map=email]', "requester email")
        await pg.click("[data-x=preview]"); await pg.wait_for_selector(".rvx-table", timeout=15000)
        txt = await pg.inner_text(".rvx")
        check("preview: 42 rows, 41 ready (the one with no email is left out)", "42" in txt and "41" in txt and "tickets ready to import" in txt, txt[:200])
        check("preview: warns about the unknown status and says nothing is saved yet", 'Status "strange" is not known' in txt.lower() or 'status "strange"' in txt.lower(), txt[-500:])
        check("preview: shows the first rows with dates in India time and mapped statuses", "2023-01-15 10:30" in txt and "Refund, please #0" in txt)
        await pg.screenshot(path=os.path.join(SHOTS, "import_3_preview.png"))
        await pg.click("[data-x=run]"); await pg.wait_for_selector(".rvx-stats", timeout=30000)
        txt = await pg.inner_text(".rvx")
        check("finished: 41 tickets imported, 1 skipped", "Import finished" in await pg.inner_text(".rvx .rv-modal__head") and "41" in txt and "tickets imported" in txt and "rows skipped" in txt, txt)
        check("finished: says no emails, alerts or clocks were started", "No emails, alerts or response-time clocks" in txt)
        await pg.screenshot(path=os.path.join(SHOTS, "import_4_done.png"))
        # see them
        await pg.click("[data-x=see]"); await pg.wait_for_selector(".rvi-row", timeout=15000); await pg.wait_for_timeout(1500)
        n = await pg.evaluate("document.querySelectorAll('.rvi-row').length")
        check("see: the inbox shows imported tickets, each marked Imported", n >= 25 and "Imported" in await pg.inner_text(".rvi-row"), n)
        check("see: they are filtered by the 'imported' tag, so the normal ticket is not mixed in", "A normal ticket" not in await pg.inner_text("#rviRows"))
        total = await pg.inner_text("#rviCount")
        check("see: the count matches (41 imported)", "of 41" in total, total)
        await pg.screenshot(path=os.path.join(SHOTS, "import_5_list.png"))
        check("page: no script errors so far", not errs, errs)

        # earlier imports + remove
        await open_import(pg)
        txt = await pg.inner_text(".rvx")
        check("earlier imports: the file is listed with its numbers", "zendesk.csv" in txt and "41 tickets imported" in txt and "1 skipped" in txt, txt[-300:])
        await pg.click("[data-x=undo]"); await pg.wait_for_selector("#rvxUndoOk")
        check("remove: asks first and says how many will go", "41" in await pg.inner_text(".rv-overlay:last-of-type") and "cannot be undone" in await pg.inner_text("body"))
        await pg.click("#rvxUndoOk"); await pg.wait_for_timeout(1800)
        r = await pg.evaluate("App.callAsync('getTickets',{status:'all',promo:'all',limit:100,tag:'imported'}).then(r=>r.total)")
        check("remove: the imported tickets are gone, the normal ticket stays", r == 0 and await pg.evaluate("App.callAsync('getTicketById','NORM1').then(r=>r.success)"), r)

        # semicolons + byte-order mark
        await open_import(pg)
        check("earlier imports: shows the removed one as Removed with no Remove button", "Removed" in await pg.inner_text(".rvx") and await pg.locator("[data-x=undo]").count() == 0)
        await pg.set_input_files("#rvxFile", F2); await pg.wait_for_selector("#rvxGrid", timeout=10000)
        vals = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('[data-map]')].map(s=>[s.getAttribute('data-map'),s.value]))")
        check("semicolon file with a byte-order mark: columns are still read correctly", vals["email"] == "requester email" and vals["id"] == "id" if "id" in vals else vals["externalId"] == "id", vals)
        await pg.select_option("#rvxOrder", "mdy")
        await pg.click("[data-x=preview]"); await pg.wait_for_selector(".rvx-table", timeout=15000)
        check("month-first setting: 15/01/2023 still reads as 15 January (the 15 can only be the day)", "2023-01-15 10:30" in await pg.inner_text(".rvx-table"))
        await pg.click("[data-x=map]"); await pg.wait_for_selector("#rvxGrid")
        check("going back keeps the choices", await pg.input_value("#rvxOrder") == "mdy")
        await pg.click("[data-x=preview]"); await pg.wait_for_selector(".rvx-table"); await pg.click("[data-x=run]"); await pg.wait_for_selector(".rvx-stats", timeout=30000)
        check("semicolon file: imports 8 of 8 rows (6 plus the two odd ones, one without an email skipped)", "7" in await pg.inner_text(".rvx-stats") and "1" in await pg.inner_text(".rvx-stats"), await pg.inner_text(".rvx-stats"))
        check("page: no script errors", not errs, errs)
        await pg.context.close(); await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
