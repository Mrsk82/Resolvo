"""Architecture page (owner only): sign-in, old key links, live facts, documented schedules match the server, search, phone layout.
Runs a throwaway copy of the app on :3933 with mail blanked. Run: python docs/ui-redesign/tools/architecture_test.py"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error, asyncio
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3933; BASE = f"http://localhost:{PORT}"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
OPEN = urllib.request.build_opener(NoRedirect)
def req(path, tok=None, body=None):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    try:
        r = OPEN.open(urllib.request.Request(BASE + path, data=data, headers=h), timeout=60); return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read().decode()
def js(path, tok=None, body=None):
    c, h, b = req(path, tok, body); return json.loads(b)

tmp = tempfile.mkdtemp(prefix="rv-arch-"); app = os.path.join(tmp, "app")
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
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8"))
    h = subprocess.run(["node", "-e", "console.log(require(process.argv[1]).hashSync('Owner-test-1',10))", os.path.join(ROOT, "node_modules", "bcryptjs")], capture_output=True, text=True).stdout.strip()
    o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []; o["passwordHash"] = h
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8"))
    return o["email"], h
owner_email, owner_hash = build()
env = dict(os.environ, PORT=str(PORT), MAIL_CAPTURE=os.path.join(tmp, "mail.jsonl"), EMAIL_ENABLED="", EMAIL_USER="", EMAIL_PASS="", NODE_ENV="test")
LOG = open(os.path.join(tmp, "server.log"), "w"); srv = subprocess.Popen(["node", "server.js"], cwd=app, env=env, stdout=LOG, stderr=LOG)

async def main():
    for _ in range(80):
        try: req("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    owner = js("/api/login", None, {"email": owner_email, "password": "Owner-test-1"})["token"]
    admin = js("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})["token"]

    # ---------- access ----------
    c, h, b = req("/architecture")
    check("access: the page is only a shell: none of the documentation text is in it", c == 200 and "Owner sign-in" in b and "Queue engine" not in b and "owner.json" not in b)
    c, h, b = req("/architecture?key=" + owner_hash)
    check("access: an old address with a key is redirected and the key is dropped", c == 302 and h.get("Location") == "/architecture", [c, h.get("Location")])
    c, h, b = req("/architecture?key=arch_" + owner_hash[:8])
    check("access: the old short-prefix key no longer opens anything", c == 302 and "Queue engine" not in b)
    r = js("/api/owner/architecture")
    check("access: signed-out visitors get nothing", not r.get("success") and "html" not in r, r)
    r = js("/api/owner/architecture", admin)
    check("access: a workspace admin gets nothing", not r.get("success") and "html" not in r, r)
    r = js("/api/owner/architecture", owner)
    check("access: the owner gets the text and live facts", r.get("success") and "<section" in r["html"] and r["live"]["routes"]["total"] > 100, list(r)[:6])
    L = r["live"]; html = r["html"]
    check("secrets: nothing secret is in the answer (no hash, no key file contents, no .env values)", owner_hash not in json.dumps(r) and "EMAIL_PASS" not in json.dumps(L) and "password" not in json.dumps({k: v for k, v in L.items() if k != "listening"}).lower() and all(set(x) == {"id", "label", "paid", "env", "ready"} for x in L["listening"]))

    # ---------- live facts ----------
    check("live: the version, Node and Express are reported", L["build"]["node"].startswith("v") and L["build"]["express"] and L["build"]["uptimeSec"] >= 0)
    check("live: routes are counted by method and prefix", L["routes"]["byMethod"].get("GET", 0) > 50 and any(g["prefix"] == "/api/owner" for g in L["routes"]["groups"]), L["routes"]["groups"][:3])
    check("live: the plan table covers every plan and the feature list", [t["tier"] for t in L["tiers"]] == ["Free", "Trial", "Pro", "Enterprise"] and len(L["matrix"]) > 30)
    check("live: Enterprise has more switches on than Free", L["tiers"][3]["on"] > L["tiers"][0]["on"], L["tiers"])
    check("live: workspaces and storage are counted", L["workspaces"]["total"] == 1 and L["storage"]["brandFolders"] == 1 and L["storage"]["brandDbBytes"] > 0, L["storage"])
    check("live: dependencies come from package.json", any(d["name"] == "express" for d in L["code"]["dependencies"]))

    # ---------- the text matches the server ----------
    import re
    doc = [m for m in re.findall(r'data-cron="([^"]+)"(?! data-optional)', html)]
    live = list(L["cron"])
    left = list(live)
    for c_ in doc:
        if c_ in left: left.remove(c_)
    check("docs: every schedule the server registers is described in the jobs table", not left, left)
    miss = [c_ for c_ in doc if c_ not in live]
    check("docs: every schedule in the jobs table is registered on the server", not miss, miss)
    low = html.lower(); undoc = [d["name"] for d in L["code"]["dependencies"] if d["name"].lower() not in low]
    check("docs: every installed package is mentioned", not undoc, undoc)
    secs = re.findall(r'<section class="a-sec" id="([^"]+)" data-title="([^"]+)"', html)
    check("docs: the sections are there with titles", len(secs) >= 14 and len({s[0] for s in secs}) == len(secs), secs)
    check("docs: no leftovers from the old page (tech names it never used)", not re.search(r"techtrack|apps script|vercel", html, re.I))

    # ---------- the page ----------
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def open_page(w, h, signed=True, scheme="light"):
            ctx = await br.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
            pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" and "Failed to load resource" not in m.text else None)
            if signed:
                await pg.goto(BASE + "/architecture"); await pg.evaluate("t=>localStorage.setItem('tt_session_token',t)", owner)
            await pg.goto(BASE + "/architecture"); await pg.wait_for_timeout(1500)
            return pg, errs
        pg, errs = await open_page(1366, 900, signed=False)
        check("page: signed out shows the sign-in box and no text", await pg.locator("#loginOverlay").is_visible() and await pg.locator("#content").is_hidden())
        await pg.fill("#loginEmail", owner_email); await pg.fill("#loginPass", "wrong-password"); await pg.click("#loginForm button[type=submit]"); await pg.wait_for_timeout(900)
        check("page: a wrong password is refused with a message", "#loginOverlay" and await pg.locator("#loginOverlay").is_visible() and len((await pg.inner_text("#loginErr")).strip()) > 3)
        await pg.fill("#loginPass", "Owner-test-1"); await pg.click("#loginForm button[type=submit]"); await pg.wait_for_selector("#content .a-sec", timeout=15000)
        check("page: the right password opens the page", await pg.locator("#loginOverlay").is_hidden() and await pg.locator("#content .a-sec").count() >= 14)
        await pg.context.close()

        pg, errs = await open_page(1366, 900)
        n = await pg.locator("#content .a-sec").count()
        check("page: signed in, sections load without any script error", n >= 14 and not errs, errs)
        check("page: the side list has a link for every section", await pg.locator("#navList a").count() == n)
        check("page: live numbers are filled in (tiles, plan table, routes, storage)", await pg.locator(".kpi").count() >= 6 and await pg.locator("#tiers .a-table tbody tr").count() > 30 and await pg.locator("#api .a-table tbody tr").count() >= 5 and "KB" in await pg.inner_text("#data"))
        check("page: the top bar shows live status", "Live" in await pg.inner_text("#liveBar") and "routes" in await pg.inner_text("#liveBar"))
        states = await pg.locator("#jobs .cron-state .pill.ok").count(); total = await pg.locator("#jobs [data-cron]").count()
        idle = await pg.locator("#jobs [data-optional] .pill.ok").count(); check("page: every documented schedule shows as running (the mailbox poller may be idle)", states + (0 if idle else 1) >= total and total >= 14, [states, total])
        check("page: the match check says the page matches the server", "matches the server" in await pg.inner_text("#docCheck"), await pg.inner_text("#docCheck"))
        await pg.screenshot(path=os.path.join(SHOTS, "arch_desktop.png"))
        await pg.click("#navList a[data-id=tiers]"); await pg.wait_for_timeout(1800)
        check("page: choosing a section scrolls to it", await pg.evaluate("document.getElementById('tiers').getBoundingClientRect().top < 400"))
        await pg.fill("#q", "round robin"); await pg.wait_for_timeout(400)
        vis = await pg.evaluate("[...document.querySelectorAll('#content .a-sec')].filter(s=>!s.hidden).map(s=>s.id)")
        check("page: search narrows to the sections that mention it and highlights it", "queue" in vis and len(vis) < n and await pg.locator("mark").count() >= 1, vis)
        await pg.fill("#q", "zzzqqq"); await pg.wait_for_timeout(300)
        check("page: a search with no match says so", await pg.locator("#noMatch").is_visible())
        await pg.fill("#q", ""); await pg.wait_for_timeout(300)
        check("page: clearing the search brings every section back", await pg.evaluate("[...document.querySelectorAll('#content .a-sec')].every(s=>!s.hidden)"))
        before = await pg.inner_text("#liveBar"); await pg.click("#refreshBtn"); await pg.wait_for_timeout(700)
        check("page: Refresh keeps the live bar", "Live" in await pg.inner_text("#liveBar"))
        await pg.context.close()

        pg, errs = await open_page(1366, 900, scheme="dark")
        bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor"); fg = await pg.evaluate("getComputedStyle(document.body).color")
        check("dark: follows the system and keeps text readable", bg != "rgb(246, 248, 247)" and bg != fg, [bg, fg])
        await pg.screenshot(path=os.path.join(SHOTS, "arch_dark.png"))
        await pg.click("#themeBtn"); await pg.wait_for_timeout(200)
        check("dark: the Theme button switches to light", await pg.evaluate("document.documentElement.getAttribute('data-theme')") == "light")
        await pg.context.close()

        pg, errs = await open_page(390, 844)
        check("phone: no sideways scrolling", await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"))
        wide = await pg.evaluate("[...document.querySelectorAll('#content *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>window.innerWidth+2&&!e.closest('.a-scroll,.diagram')}).slice(0,3).map(e=>e.tagName+'.'+e.className)")
        check("phone: nothing pokes out except tables and the diagram, which scroll inside their own box", not wide, wide)
        check("phone: the side list is closed until Sections is tapped", await pg.locator("#nav").is_hidden())
        await pg.click("#menuBtn"); await pg.wait_for_timeout(300)
        check("phone: Sections opens the list", await pg.locator("#nav").is_visible())
        await pg.click("#navList a[data-id=security]"); await pg.wait_for_timeout(1800)
        check("phone: choosing a section closes the list and scrolls to it", await pg.locator("#nav").is_hidden() and await pg.evaluate("document.getElementById('security').getBoundingClientRect().top < 300"))
        await pg.screenshot(path=os.path.join(SHOTS, "arch_phone.png"))
        await pg.context.close()
        await br.close()

try:
    asyncio.run(main())
finally:
    srv.terminate(); print("SERVER LOG TAIL:", open(os.path.join(tmp, "server.log"), errors="replace").read()[-600:])
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
