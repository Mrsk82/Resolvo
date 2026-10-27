"""Checks the four SEO pages and the support calculator against the local server (port 3001).
The calculator's send form is mocked, so no real email is ever sent."""
import math, sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:3001"
PAGES = ["/shared-inbox-for-small-teams", "/whatsapp-helpdesk-india", "/helpdesk-pricing-india", "/tools/support-calculator"]
ok = fail = 0

def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1
    print(("PASS " if cond else "FAIL ") + name + (" " + str(extra) if extra and not cond else ""))

def erlang_wait(n, tpd, mins, hrs):
    a = tpd * mins / (hrs * 60); lam = tpd / hrs; mu = 60 / mins
    s, t = 0.0, 1.0
    for k in range(n):
        s += t; t *= a / (k + 1)
    top = t * n / (n - a)
    return top / (s + top) / (n * mu - lam) * 60

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for w, label in [(1280, "desktop"), (390, "phone")]:
        ctx = b.new_context(viewport={"width": w, "height": 900})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for u in PAGES:
            r = pg.goto(BASE + u)
            pg.wait_for_timeout(300)
            check(f"{label} {u} status 200", r.status == 200, r.status)
            check(f"{label} {u} has one h1", pg.locator("h1").count() == 1)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{label} {u} no horizontal page scroll", over <= 0, over)
            check(f"{label} {u} canonical", pg.locator("link[rel=canonical]").get_attribute("href").endswith(u))
        check(f"{label} no JS errors", not errs, errs)
        ctx.close()

    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    sent = []
    def mock(route):
        sent.append(route.request.post_data)
        route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
    pg.route("**/api/contact", mock)
    pg.goto(BASE + "/tools/support-calculator")
    pg.wait_for_timeout(300)

    def setv(i, v):
        pg.fill(f"#{i}", str(v))
    # defaults
    check("default load 40%", pg.inner_text("#sLoad") == "40%", pg.inner_text("#sLoad"))
    check("default people for comfortable load 2", pg.inner_text("#sNeed").startswith("2"), pg.inner_text("#sNeed"))
    w = erlang_wait(3, 60, 6, 5)
    shown = pg.inner_text("#sWait")
    check("default wait matches Erlang C", ("Under 1 min" if w < 1 else str(round(w))) in shown, (w, shown))
    rows = pg.inner_text("#costRows")
    for exp in ["5,016", "14,520", "2,997", "999"]:
        check(f"default cost row has {exp}", exp in rows, rows)
    # busy case
    setv("tpd", 100); setv("agents", 3)
    check("busy: 100 msgs/3 people -> 67% busy but healthy", pg.inner_text("#sLoad") == "67%" and "Busy" in pg.inner_text("#verdict"), (pg.inner_text("#sLoad"), pg.inner_text("#verdict")))
    # overloaded
    setv("tpd", 200)
    check("overloaded verdict", "Overloaded" in pg.inner_text("#verdict"), pg.inner_text("#verdict"))
    check("overloaded wait shows never ends", "Never" in pg.inner_text("#sWait"), pg.inner_text("#sWait"))
    # team size scales cost, Resolvo stays flat
    setv("agents", 10)
    rows = pg.inner_text("#costRows")
    check("10 agents: SachDesk 9,990 and Resolvo 999", "9,990" in rows and "999" in rows, rows)
    check("heading shows 10 people", pg.inner_text("#nTeam") == "10")
    # bad input is clamped, not NaN
    setv("mins", ""); setv("tpd", 0)
    check("empty/zero input does not show NaN", "NaN" not in pg.inner_text("#out"), pg.inner_text("#out"))
    # form: invalid email blocked, valid email sends once
    pg.fill("#em", "nope"); pg.click("#sendBtn")
    check("invalid email blocked", len(sent) == 0 and "valid email" in pg.inner_text("#sendMsg"))
    pg.fill("#em", "test@example.com"); pg.fill("#co", "Test Brand"); pg.click("#sendBtn")
    pg.wait_for_timeout(400)
    check("valid email posts once to /api/contact", len(sent) == 1, len(sent))
    check("payload carries email, topic and numbers", sent and '"test@example.com"' in sent[0] and "Support calculator" in sent[0] and "Messages per day" in sent[0], sent)
    check("thank-you shown", "Thanks" in pg.inner_text("#sendMsg"), pg.inner_text("#sendMsg"))
    ctx.close()
    b.close()

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
