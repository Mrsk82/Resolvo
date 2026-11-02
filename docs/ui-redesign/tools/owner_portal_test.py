"""Owner portal: needs-attention list, system and backups card, phone layout.
Builds a throwaway copy of the app (demo workspace only) on :3919 with a never-activated sign-up, a failed reset email and a trial about to end.
MAIL_CAPTURE writes email to a file, so nothing is ever sent. Run: python docs/ui-redesign/tools/owner_portal_test.py"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3919; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
def http(path, tok=None, body=None):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    raw = urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=40).read().decode()
    return raw if raw.lstrip().startswith("<") else json.loads(raw or "null")

tmp = tempfile.mkdtemp(prefix="rv-own-"); app = os.path.join(tmp, "app"); backups = os.path.join(tmp, "backups"); mailf = os.path.join(tmp, "mail.jsonl")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        out = [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
        return out
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands"))
    shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "graytest"))
    for f in ("credentials.key", "vapid.json", "app-secret.txt"):
        if os.path.exists(os.path.join(ROOT, "data", f)): shutil.copy(os.path.join(ROOT, "data", f), os.path.join(app, "data", f))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    h = subprocess.run(["node", "-e", "console.log(require(process.argv[1]).hashSync('Owner-test-1',10))", os.path.join(ROOT, "node_modules", "bcryptjs")], capture_output=True, text=True).stdout.strip()
    ist = timezone(timedelta(hours=5, minutes=30)); now = datetime.now(ist)
    demo = [b for b in o["brands"] if b["slug"] == "demo"][0]
    trial = dict(demo, id="BRD-TRIAL", slug="trialco", name="Trial Co", tier="Trial", status="active", trialEnds=(now + timedelta(days=2)).isoformat(), lastActive=now.isoformat())
    gray = dict(demo, id="BRD-GRAY", slug="graytest", name="Gray Test", status="pending", tier="Trial", majorAdminEmail="mayur@example.com",
                createdDate=(now - timedelta(days=2)).isoformat(), verifyToken="a" * 48, verifyExpires=int(time.time() * 1000) - 3600000)
    shutil.copytree(os.path.join(app, "data", "brands", "demo"), os.path.join(app, "data", "brands", "trialco"))
    quiet = dict(demo, id="BRD-QUIET", slug="quietco", name="Quiet Co", status="active", tier="Free", lastActive=(now - timedelta(days=40)).isoformat())   # nobody has opened it for 40 days
    shutil.copytree(os.path.join(app, "data", "brands", "demo"), os.path.join(app, "data", "brands", "quietco"))
    o["brands"] = [demo, trial, gray, quiet]; o["prospects"] = []; o["passwordHash"] = h
    o["auditLog"] = [{"id": "x1", "action": "reset_email_failed", "details": {"brandSlug": "demo", "email": "lost@example.com"}, "by": "system", "timestamp": now.isoformat()}]
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    return o["email"]
build_email = build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=mailf, BACKUP_DIR=backups, EMAIL_ENABLED="")
srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def mails(): return [json.loads(l) for l in open(mailf, encoding="utf-8").read().splitlines() if l.strip()] if os.path.exists(mailf) else []
def get_titles(r): return [i["title"] for i in r.get("items", [])]

async def main():
    for _ in range(80):
        try: http("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    owner = http("/api/login", None, {"email": build_email, "password": "Owner-test-1"})["token"]
    admin = http("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})
    # ---------- API ----------
    r = http("/api/owner/attention", owner); items = {i["id"]: i for i in r["items"]}
    check("attention: a sign-up that never activated is listed, as urgent, with email, resend and link buttons", "pending-graytest" in items and items["pending-graytest"]["severity"] == "high" and [a["kind"] for a in items["pending-graytest"]["actions"]] == ["resend-activation", "copy-activation"] and "mayur@example.com" in items["pending-graytest"]["text"], items.get("pending-graytest"))
    check("attention: says the link has expired", "expired" in items["pending-graytest"]["text"], items["pending-graytest"]["text"])
    check("attention: a failed reset email is listed with the address", "reset-failed" in items and "lost@example.com" in items["reset-failed"]["text"], items.get("reset-failed"))
    check("attention: a trial ending soon is listed", "trials" in items and "Trial Co" in items["trials"]["text"], items.get("trials"))
    check("attention: a workspace unused for 14 days is listed (low)", "quiet" in items and items["quiet"]["severity"] == "low", items.get("quiet"))
    check("attention: workspaces that cannot email customers are listed (low)", "no-sender" in items and items["no-sender"]["severity"] == "low")
    check("attention: urgent items come first", [i["severity"] for i in r["items"]] == sorted([i["severity"] for i in r["items"]], key={"high": 0, "med": 1, "low": 2}.get))
    check("attention: not available to a workspace admin", http("/api/owner/attention", admin["token"]).get("success") is False)
    s = http("/api/owner/system", owner)
    check("system: uptime, memory, disk and backup block are there", s["success"] and s["uptimeSec"] >= 0 and s["memoryMB"] > 0 and s["disk"] and s["disk"]["freeGB"] > 0 and s["backup"]["count"] == 0, s)
    rs = http("/api/owner/brands/graytest/resend-activation", owner, {})
    mm = [m for m in mails() if m["to"] == "mayur@example.com"]
    check("resend activation: emails him a fresh link", rs["success"] and rs["sent"] is True and len(mm) == 1 and "/verify-email?slug=graytest&token=" in mm[0]["text"], [rs, mm])
    cl = http("/api/owner/brands/graytest/resend-activation", owner, {"send": False})
    check("copy link: gives the link and sends no email", cl["success"] and "/verify-email?slug=graytest&token=" in cl["link"] and len([m for m in mails() if m["to"] == "mayur@example.com"]) == 1, cl)
    check("resend activation: refuses a workspace that is already active", http("/api/owner/brands/trialco/resend-activation", owner, {})["success"] is False)
    page = http("/verify-email" + cl["link"].split("/verify-email")[1])   # the link is built from the configured site address, so only its path is used here
    ow = json.load(open(os.path.join(app, "data", "owner.json"), encoding="utf-8"))
    check("the link activates the workspace", "activated" in page.lower() and [b for b in ow["brands"] if b["slug"] == "graytest"][0]["status"] == "active", page[:200])
    r = http("/api/owner/attention", owner)
    check("attention: the sign-up item is gone once activated", not any(i["id"].startswith("pending-") for i in r["items"]), get_titles(r))
    check("attention: both resend actions were recorded for the owner", sum(1 for a in ow["auditLog"] if a["action"] == "activation_link_issued") == 2)

    # ---------- backups card + history ----------
    b = http("/api/owner/backups/run", owner, {})
    s = http("/api/owner/system", owner)
    check("backup: now there is one, with a history row of 4 workspaces", b["success"] and s["backup"]["count"] == 1 and s["backup"]["history"][-1]["workspaces"] == 4 and s["backup"]["history"][-1]["users"] >= 1, s["backup"])
    r = http("/api/owner/attention", owner)
    check("attention: no backup warnings while backups are current", not any(i["id"].startswith("backup") for i in r["items"]), get_titles(r))
    hist = json.load(open(os.path.join(backups, "history.json"))); hist.insert(0, {"at": "2026-10-01", "name": "old", "workspaces": 9, "users": 20, "tickets": 5, "bytes": 1})
    json.dump(hist, open(os.path.join(backups, "history.json"), "w"))
    r = http("/api/owner/attention", owner); it = [i for i in r["items"] if i["id"] == "workspace-drop"]
    check("attention: a drop in the workspace count (9 then, 4 now) is raised as urgent", it and it[0]["severity"] == "high" and "9 then, 4 now" in it[0]["title"], get_titles(r))

    # ---------- screens ----------
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome")
        async def open_portal(w, h):
            ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
            await pg.goto(BASE + "/")
            await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@demo.local',password:'Owner-test-1'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_is_owner','true');localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1')}""")
            await pg.goto(BASE + "/"); await pg.wait_for_selector("#rvOwnSystem .rv-os", timeout=15000); await pg.wait_for_timeout(600)
            return pg, errs
        pg, errs = await open_portal(1440, 1000)
        check("desktop: the attention list and the system card are on the page", await pg.locator("#rvOwnAttention .rv-oa").count() == 1 and await pg.locator("#rvOwnSystem .rv-os").count() == 1)
        txt = await pg.inner_text("#rvOwnAttention")
        check("desktop: urgent items show first, low-priority ones are folded behind a link", "workspace" in txt.lower() and "Show" in txt and "more (lower priority)" in txt, txt[:400])
        await pg.click("#rvOwnAttention [data-rvo=toggle-all]"); await pg.wait_for_timeout(200)
        check("desktop: the link opens the low-priority items", "not been used for 14 days" in await pg.inner_text("#rvOwnAttention"))
        tiles = await pg.inner_text("#rvOwnSystem")
        check("desktop: the card shows last backup, workspaces, backups kept and server", all(k in tiles for k in ["LAST BACKUP", "WORKSPACES", "BACKUPS KEPT", "SERVER"]) and "Email sender: off" in tiles, tiles[:300])
        await pg.click("#rvOwnSystem [data-rvo=backup-now]")
        await pg.wait_for_timeout(300)
        await pg.wait_for_function("(()=>{const b=document.querySelector('#rvOwnSystem [data-rvo=backup-now]');return b&&!b.disabled&&b.textContent.trim()==='Back up now'})()", timeout=20000)
        first = await pg.inner_text("#rvOwnSystem .rv-os-tile .rv-os-v")
        check("desktop: Back up now finishes and the card shows the backup as just made", "just now" in first or "minute" in first, first)
        await pg.click("#rvOwnSystem [data-rvo=toggle-backups]"); await pg.wait_for_timeout(200)
        n = await pg.locator("#rvOwnSystem .rv-os-item").count()
        check("desktop: All backups lists them with Download buttons", n >= 1 and await pg.locator("#rvOwnSystem [data-rvo=download]").count() == n, n)
        async with pg.expect_download() as dl: await pg.click("#rvOwnSystem [data-rvo=download] >> nth=0")
        d = await dl.value; path = await d.path()
        with open(path, "rb") as fh: magic = fh.read(2)
        check("desktop: Download saves a real gzip backup file", d.suggested_filename.endswith(".tar.gz") and magic == b"\x1f\x8b", d.suggested_filename)
        await pg.screenshot(path=os.path.join(SHOTS, "owner_desktop.png"), full_page=False)
        await pg.evaluate("document.getElementById('owner-dashboard').scrollTop=0")
        await pg.click("button:has-text('Backups & system')"); await pg.wait_for_timeout(500)
        check("desktop: the side-menu item opens the backups list", await pg.locator("#rvOwnSystem .rv-os-list").count() == 1)
        check("desktop: no page errors", not errs, errs)
        await pg.context.close()

        pg, errs = await open_portal(390, 844)
        sw = await pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && document.getElementById('owner-dashboard').scrollWidth <= document.getElementById('owner-dashboard').clientWidth + 1")
        check("phone: no sideways scrolling", sw)
        side = await pg.evaluate("(()=>{const r=document.querySelector('.rv-own-side').getBoundingClientRect();return r.right})()")
        check("phone: the menu is tucked away until opened", side <= 1, side)
        check("phone: the menu button is shown", await pg.locator(".rv-own-burger").is_visible())
        await pg.screenshot(path=os.path.join(SHOTS, "owner_phone_top.png"))
        await pg.click(".rv-own-burger"); await pg.wait_for_timeout(400)
        side = await pg.evaluate("document.querySelector('.rv-own-side').getBoundingClientRect().left")
        check("phone: the menu button opens the menu", side >= -1 and await pg.locator(".rv-own-side button:has-text('MRR Dashboard')").is_visible(), side)
        await pg.screenshot(path=os.path.join(SHOTS, "owner_phone_menu.png"))
        await pg.click(".rv-own-side button:has-text('Needs attention')"); await pg.wait_for_timeout(500)
        check("phone: choosing an item closes the menu", await pg.evaluate("!document.getElementById('owner-dashboard').classList.contains('rv-own-nav-open')"))
        cards = await pg.evaluate("[...document.querySelectorAll('#ownerBrandsTableBody tr')].map(r=>({d:getComputedStyle(r).display,w:Math.round(r.getBoundingClientRect().width)}))")
        check("phone: each workspace is a card, not a squeezed table row", cards and all(c["d"] == "grid" and c["w"] <= 390 for c in cards), cards)
        lab = await pg.evaluate("[...document.querySelectorAll('#ownerBrandsTableBody tr:first-child td[data-l]')].map(t=>t.dataset.l)")
        check("phone: the numbers on a card are labelled", {"Health", "Users", "Open"} <= set(lab), lab)
        over = await pg.evaluate("[...document.querySelectorAll('#owner-dashboard *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>window.innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('.rv-own-side')}).slice(0,5).map(e=>e.className||e.tagName)")
        check("phone: nothing sticks out past the right edge", not over, over)
        await pg.evaluate("document.getElementById('rvOwnAttention').scrollIntoView()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, "owner_phone_attention.png"))
        await pg.evaluate("document.getElementById('ownerBrandsSection').scrollIntoView()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, "owner_phone_brands.png"))
        await pg.evaluate("document.getElementById('rvOwnSystem').scrollIntoView()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, "owner_phone_system.png"))
        check("phone: no page errors", not errs, errs)
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
