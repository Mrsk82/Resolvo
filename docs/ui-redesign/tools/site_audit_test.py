"""Website audit: every sitemap page (search tags, share picture, structured data), the new pages, redirects, cookie choice, WhatsApp button,
fade-in fallback, links and phone layout. Runs a throwaway copy of the app on :3923. Run: python docs/ui-redesign/tools/site_audit_test.py"""
import asyncio, html, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = 3923; BASE = f"http://localhost:{PORT}"; LIVE = "https://app.resolvogroup.com"
PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:300]) if d and not ok else ""))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
OPEN = urllib.request.build_opener(NoRedirect)
def get(path, tok=None, body=None, raw=True, follow=True):
    h = {"x-session-token": tok} if tok else {}
    data = None
    if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h)
    try:
        r = (urllib.request.urlopen(req, timeout=40) if follow else OPEN.open(req, timeout=40)); code, hd, b = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e: code, hd, b = e.code, e.headers, e.read()
    return code, hd, b
def jget(path, tok=None, body=None):
    c, h, b = get(path, tok, body)
    try: return json.loads(b.decode("utf-8", "replace"))
    except Exception: return {"_status": c}
tmp = tempfile.mkdtemp(prefix="rv-site-"); app = os.path.join(tmp, "app")
def build():
    skip = {"node_modules", ".next", "docs", "tools", "downloads", "uploads", "slides", "data", ".git", "node"}
    def ignore(d, names):
        rel = os.path.relpath(d, ROOT)
        return [n for n in names if (rel == "." and n in skip) or n.lower().endswith((".pptx", ".pdf", ".bmp", ".zip", ".log", ".apk"))]
    shutil.copytree(ROOT, app, ignore=ignore)
    subprocess.run(["cmd", "/c", "mklink", "/J", os.path.join(app, "node_modules"), os.path.join(ROOT, "node_modules")], check=True, capture_output=True)
    os.makedirs(os.path.join(app, "data", "brands")); shutil.copytree(os.path.join(ROOT, "data", "brands", "demo"), os.path.join(app, "data", "brands", "demo"))
    o = json.load(open(os.path.join(ROOT, "data", "owner.json"), encoding="utf-8")); o["brands"] = [b for b in o["brands"] if b["slug"] == "demo"]; o["prospects"] = []; o.pop("siteSettings", None)
    h = subprocess.run(["node", "-e", "console.log(require(process.argv[1]).hashSync('Owner-test-1',10))", os.path.join(ROOT, "node_modules", "bcryptjs")], capture_output=True, text=True).stdout.strip(); o["passwordHash"] = h
    json.dump(o, open(os.path.join(app, "data", "owner.json"), "w", encoding="utf-8")); return o["email"]
owner_email = build()
srv = subprocess.Popen(["node", "server.js"], cwd=app, env=dict(os.environ, PORT=str(PORT), EMAIL_ENABLED="", BACKUP_DIR=os.path.join(tmp, "bk")), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def page_html(url): return get(url.replace(LIVE, ""))[2].decode("utf-8", "replace")
def meta(s, attr, name):
    m = re.search(r'<meta\s+%s="%s"\s+content="(.*?)"' % (attr, re.escape(name)), s, re.S | re.I); return html.unescape(m.group(1)) if m else None

async def main():
    for _ in range(80):
        try: get("/api/signup-config"); break
        except Exception: time.sleep(0.25)
    # ---------- sitemap ----------
    c, _, b = get("/sitemap.xml"); urls = re.findall(r"<loc>(.*?)</loc>", b.decode())
    check("sitemap: no address is listed twice", len(urls) == len(set(urls)), [u for u in set(urls) if urls.count(u) > 1])
    check("sitemap: the thin /pro page is left out and the new pages are in", not any(u.endswith("/pro") for u in urls) and all(any(u.endswith("/" + p) for u in urls) for p in ("features", "integrations", "security", "customers", "changelog", "shopify-customer-support-india", "tools/whatsapp-templates", "tools/sla-calculator")))
    bad = [u for u in urls if get(u.replace(LIVE, ""))[0] != 200]
    check(f"sitemap: all {len(urls)} addresses load", not bad, bad)
    pages = {u: page_html(u) for u in urls}
    # ---------- every page ----------
    rows = {"title": [], "desc": [], "h1": [], "canon": [], "og": [], "tw": [], "ga": [], "site": [], "ld": [], "resolvoapp": []}
    for u, s in pages.items():
        t = html.unescape((re.search(r"<title>(.*?)</title>", s, re.S) or [0, ""])[1]).strip(); d = meta(s, "name", "description") or ""
        if not (10 <= len(t) <= 62): rows["title"].append((u, len(t)))
        if not (50 <= len(d) <= 160): rows["desc"].append((u, len(d)))
        if len(re.findall(r"<h1[\s>]", s)) != 1 and not u.endswith("/demo"): rows["h1"].append(u)
        cm = re.search(r'rel="canonical" href="(.*?)"', s)
        if not cm or cm.group(1) != u: rows["canon"].append((u, cm.group(1) if cm else None))
        if meta(s, "property", "og:image") is None or meta(s, "property", "og:title") is None or meta(s, "property", "og:description") is None: rows["og"].append(u)
        if meta(s, "name", "twitter:card") != "summary_large_image" or meta(s, "name", "twitter:image") is None: rows["tw"].append(u)
        if re.search(r'<script[^>]*src="https://www\.googletagmanager', s): rows["ga"].append(u)
        if "/js/site.js" not in s: rows["site"].append(u)
        for blk in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            try: json.loads(blk)
            except Exception: rows["ld"].append(u)
        if "resolvo.app" in s: rows["resolvoapp"].append(u)
    n = len(pages)
    check(f"search: every page title is 10 to 62 characters ({n} pages)", not rows["title"], rows["title"][:6])
    check("search: every page description is 50 to 160 characters", not rows["desc"], rows["desc"][:6])
    check("search: every page has exactly one main heading", not rows["h1"], rows["h1"][:6])
    check("search: every page names its own address as canonical", not rows["canon"], rows["canon"][:6])
    check("sharing: every page has a share picture, title and description", not rows["og"], rows["og"][:6])
    check("sharing: every page asks for a large preview card with an image", not rows["tw"], rows["tw"][:6])
    check("privacy: no page loads Google Analytics before a visitor agrees", not rows["ga"], rows["ga"][:6])
    check("privacy: every page includes the cookie-choice script", not rows["site"], rows["site"][:6])
    check("data: all structured data is valid JSON", not rows["ld"], rows["ld"][:6])
    check("search: no page claims another domain (resolvo.app)", not rows["resolvoapp"], rows["resolvoapp"])
    for img in ("og-resolvo", "og-blog", "og-compare"):
        c, h, b = get(f"/img/{img}.png"); w = int.from_bytes(b[16:20], "big"); ht = int.from_bytes(b[20:24], "big")
        check(f"sharing: /img/{img}.png is a real 1200 x 630 picture", c == 200 and h.get("Content-Type") == "image/png" and (w, ht) == (1200, 630), [c, w, ht])
    blogs = [u for u in urls if "/blog/" in u]
    nb = [u for u in blogs if not re.search(r'"@type":\s*"(BlogPosting|Article)"', pages[u])]
    check(f"data: all {len(blogs)} blog posts have article data with a date", not nb and all(re.search(r'"datePublished":\s*"20\d\d-', pages[u]) for u in blogs), nb[:4])
    home = pages[LIVE + "/pitch"]; ld = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)]
    types = [x.get("@type") for x in ld[0]] if ld and isinstance(ld[0], list) else [x.get("@type") for x in ld]
    flat = ld[0] if isinstance(ld[0], list) else ld
    faq = [x for x in flat if x.get("@type") == "FAQPage"]; sw = [x for x in flat if x.get("@type") == "SoftwareApplication"]
    q_visible = len(re.findall(r'class="faq-q"', home))
    check("data: the home page lists the organisation, software, prices and the FAQ", {"Organization", "WebSite", "SoftwareApplication", "FAQPage"} <= set(types), types)
    check("data: the FAQ data matches the questions visible on the page", faq and len(faq[0]["mainEntity"]) == q_visible and q_visible >= 6, [q_visible, len(faq[0]["mainEntity"]) if faq else 0])
    check("data: the three plans are listed with their rupee prices", sw and [o["price"] for o in sw[0]["offers"]] == ["0", "999", "2499"] and all(o["priceCurrency"] == "INR" for o in sw[0]["offers"]))
    c, h, b = get("/pro")
    check("search: /pro asks search engines not to list it", c == 200 and "noindex" in b.decode("utf-8", "replace"))
    # ---------- home page words ----------
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", "", home, flags=re.S))))
    check("pricing: the old 'one flat price / no feature gating' claim is gone", "No feature gating" not in t and "One flat price" not in t and "Priced per brand, not per agent" in t, "")
    check("pricing: says every workspace starts with a 14-day trial, then Free unless you choose Pro or Enterprise", "starts with a 14-day trial of everything, then moves to Free unless you choose Pro or Enterprise" in t)
    check("proof: the home page says it is new and shows no invented customer claims", "New product. Honest about it." in t and not re.search(r"trusted by \d|\d+\+? (customers|brands) (use|trust)", t, re.I))
    check("proof: the dashboard picture is labelled as example data", "Example data" in home)
    check("home: navigation and footer link to Features, Integrations, Security, Customers and What's new", all(('href="/%s"' % p) in home for p in ("features", "integrations", "security", "customers", "changelog")))
    check("home: the Android banner no longer says beta", "(beta)" not in home)
    # ---------- new pages and routes ----------
    for p in ("features", "integrations", "security", "customers", "changelog", "shopify-customer-support-india", "tools/whatsapp-templates", "tools/sla-calculator"):
        c, h, b = get("/" + p); s = b.decode("utf-8", "replace")
        check(f"/{p}: loads with a heading and its own canonical", c == 200 and "<h1>" in s and f'rel="canonical" href="{LIVE}/{p}"' in s)
    sec = page_html(LIVE + "/security")
    check("security: says plainly what is not certified yet", "not</b> completed a SOC 2 or ISO 27001" in sec)
    check("security: lists nightly backups, the recycle bin and the audit trail", all(k in sec for k in ("Every night", "30-day recycle bin", "audit trail")))
    chg = page_html(LIVE + "/changelog"); check("changelog: six dated entries, newest first", len(re.findall(r'<div class="entry"', chg)) == 6 and chg.index("8 November 2026") < chg.index("27 October 2026"))
    integ = page_html(LIVE + "/integrations"); check("integrations: shows the widget line and the ticket API call", "widget.js" in integ and "/api/tickets/public/create" in integ and "x-api-token" in integ)
    cust = page_html(LIVE + "/customers"); check("customers: no invented logos or quotes", "written OK" in cust and not re.search(r'<blockquote|testimonial-card|&ldquo;.{20,}&rdquo; —', cust))
    for src, dst in (("/docs", "/learn"), ("/help", "/learn"), ("/gdpr", "/security#data-rights")):
        c, h, b = get(src, follow=False); check(f"redirect: {src} goes to {dst}", c == 301 and h.get("Location") == dst, [c, h.get("Location")])
    c, h, b = get("/favicon.ico"); check("favicon: /favicon.ico loads as a picture", c == 200 and h.get("Content-Type", "").startswith("image/") and len(b) > 500)
    priv = page_html(LIVE + "/privacy")
    check("privacy: updated for 2026, the cookie choice, AI, WhatsApp, Shopify and backups", all(k in priv for k in ("November 8, 2026", "Cookie settings", "Google Gemini", "Twilio and Meta", "Shopify", "nightly backups")) and "© 2025" not in priv and "&copy; 2025" not in priv)
    # internal links on the new pages, the home page, privacy and partners
    links = set()
    for u in (LIVE + x for x in ("/pitch", "/features", "/integrations", "/security", "/customers", "/changelog", "/privacy", "/partners", "/shopify-customer-support-india", "/tools/whatsapp-templates", "/tools/sla-calculator")):
        for hr in re.findall(r'href="(/[^"#?]*)', pages.get(u) or page_html(u)): links.add(hr)
    dead = [l for l in sorted(links) if l not in ("/download/android",) and get(l, follow=False)[0] not in (200, 301, 302)]
    check(f"links: none of the {len(links)} internal links on those pages is dead", not dead, dead)
    # ---------- site settings and the WhatsApp number ----------
    c0 = jget("/api/site-config"); check("whatsapp: no number set, so the public config is empty", c0.get("success") and c0["whatsapp"] == "", c0)
    tok = jget("/api/login", None, {"email": owner_email, "password": "Owner-test-1"})["token"]
    adm = jget("/api/login", None, {"email": "admin@demo.local", "password": "demo1234"})["token"]
    check("whatsapp: a workspace admin cannot change the website settings", jget("/api/owner/site-settings", adm, {"whatsapp": "919876543210"}).get("success") is False)
    r = jget("/api/owner/site-settings", tok, {"whatsapp": "98765 43210"}); check("whatsapp: a number without the country code is refused with advice", r.get("success") is False and "country code" in r["error"], r)
    r = jget("/api/owner/site-settings", tok, {"whatsapp": "12345"}); check("whatsapp: a too-short number is refused", r.get("success") is False)
    # ---------- browser ----------
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome")
        async def ctx(**kw):
            c = await br.new_context(**kw); reqs = []
            await c.route("**/*", lambda route: route.abort() if re.search(r"googletagmanager|google-analytics|fonts\.g", route.request.url) else route.continue_())
            pg = await c.new_page(); pg.on("request", lambda r: reqs.append(r.url)); return c, pg, reqs
        c1, pg, reqs = await ctx(viewport={"width": 1280, "height": 800})
        await pg.goto(BASE + "/pitch"); await pg.wait_for_timeout(1200)
        check("cookies: a first visit shows the cookie choice", await pg.locator(".rvs-bar").is_visible())
        check("cookies: Google Analytics has not been contacted yet", not any("googletagmanager" in r for r in reqs), [r for r in reqs if "google" in r][:2])
        await pg.screenshot(path=os.path.join(SHOTS, "site_cookie.png"))
        await pg.click('.rvs-bar [data-c=no]'); await pg.wait_for_timeout(300)
        await pg.goto(BASE + "/about"); await pg.wait_for_timeout(900)
        check("cookies: 'No thanks' is remembered and Analytics stays off", await pg.locator(".rvs-bar").count() == 0 and not any("googletagmanager" in r for r in reqs) and await pg.evaluate("JSON.parse(localStorage.rv_consent).v") == "no")
        await pg.evaluate("rvCookieSettings()"); check("cookies: the 'Cookie settings' link in the footer brings the choice back", await pg.locator(".rvs-bar").is_visible())
        await pg.click('.rvs-bar [data-c=yes]'); await pg.wait_for_timeout(700)
        check("cookies: choosing 'Yes' loads Google Analytics", any("googletagmanager.com/gtag/js" in r for r in reqs))
        check("cookies: the gtag calls pages make never fail", await pg.evaluate("typeof gtag==='function'"))
        await c1.close()
        # WhatsApp button
        c2, pg, reqs = await ctx(viewport={"width": 1280, "height": 800}); await pg.goto(BASE + "/pitch"); await pg.wait_for_timeout(1200)
        check("whatsapp: with no number the button is not shown", await pg.locator(".rvs-wa").count() == 0); await c2.close()
        r = jget("/api/owner/site-settings", tok, {"whatsapp": "+91 98765 43210", "whatsappText": "Hi, I want a demo"})
        check("whatsapp: the owner can save a number with spaces and a plus", r.get("success") and r["whatsapp"] == "919876543210", r)
        c3, pg, reqs = await ctx(viewport={"width": 390, "height": 800}, is_mobile=True)
        await pg.goto(BASE + "/features"); await pg.wait_for_selector(".rvs-wa", timeout=8000)
        href = await pg.get_attribute(".rvs-wa", "href")
        check("whatsapp: the button opens a chat with that number and the first message", href.startswith("https://wa.me/919876543210?text=") and "demo" in href, href)
        check("whatsapp: the button does not cover the cookie choice or run off the screen", await pg.evaluate("(()=>{const r=document.querySelector('.rvs-wa').getBoundingClientRect();return r.right<=window.innerWidth&&r.bottom<=window.innerHeight})()"))
        await pg.screenshot(path=os.path.join(SHOTS, "site_whatsapp_phone.png")); await c3.close()
        c4, pg, reqs = await ctx(viewport={"width": 1280, "height": 800}); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1500)
        check("whatsapp: the app itself (login page) has no website WhatsApp button", await pg.locator(".rvs-wa").count() == 0); await c4.close()
        jget("/api/owner/site-settings", tok, {"whatsapp": ""})
        check("whatsapp: removing the number hides the button again", jget("/api/site-config")["whatsapp"] == "")
        # no JavaScript: the home page is still readable
        c5 = await br.new_context(viewport={"width": 1280, "height": 800}, java_script_enabled=False); pg = await c5.new_page(); await pg.goto(BASE + "/pitch")
        ops = await pg.evaluate("[...document.querySelectorAll('.reveal')].map(e=>+getComputedStyle(e).opacity)") if False else None
        await pg.screenshot(path=os.path.join(SHOTS, "site_nojs.png"), full_page=False)
        vis = await pg.locator(".reveal").first.evaluate("e=>getComputedStyle(e).opacity") if await pg.locator(".reveal").count() else "1"
        check("no script: the home page text is visible without JavaScript", float(vis) == 1.0, vis); await c5.close()
        # app page: small page, separate cached files, new version after an update
        c, h, b = get("/"); idx = b.decode("utf-8", "replace"); v1 = re.search(r"app-core\.js\?v=([0-9a-f]+)", idx)
        check("speed: the app page is small (under 100 KB) and links its script and styles as versioned files", c == 200 and len(b) < 100 * 1024 and v1 and "__APPV__" not in idx and "app-core.css?v=" + v1.group(1) in idx, [len(b), v1 and v1.group(1)])
        c, h, b2 = get("/index.html"); check("speed: /index.html gives the same versioned page", c == 200 and b"__APPV__" not in b2)
        c, h, _ = get("/js/app-core.js?v=" + v1.group(1)); check("speed: the versioned files are cached for a year", c == 200 and "immutable" in h.get("Cache-Control", "") and "max-age=31536000" in h.get("Cache-Control", ""), h.get("Cache-Control"))
        c, h, _ = get("/"); check("speed: the page itself is always re-checked, so an update shows at once", "no-cache" in h.get("Cache-Control", ""))
        c7 = await br.new_context(viewport={"width": 1280, "height": 800}); pg = await c7.new_page(); fin = []   # no request interception here: it would switch the browser cache off
        pg.on("requestfinished", lambda r: fin.append(r))
        await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'", timeout=20000); await pg.wait_for_timeout(500)
        first = [(r.url.split("/")[-1].split("?")[0], (await r.sizes())["responseBodySize"]) for r in fin if "app-core" in r.url]
        fin.clear(); await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'", timeout=20000); await pg.wait_for_timeout(500)
        again = [(r.url.split("/")[-1].split("?")[0], (await r.sizes())["responseBodySize"]) for r in fin if "app-core" in r.url]
        check("speed: the app loads, and on the next visit its script and styles come from the browser cache (nothing downloaded)", len(first) == 2 and all(n > 100000 for _, n in first) and all(n < 1000 for _, n in again), [first, again])
        check("cookies: the app itself shows no cookie banner", await pg.locator(".rvs-bar").count() == 0); await c7.close()
        open(os.path.join(app, "public", "js", "app-core.js"), "a", encoding="utf-8").write(chr(10) + "// test edit" + chr(10)); time.sleep(0.3)
        v2 = re.search(r"app-core\.js\?v=([0-9a-f]+)", get("/")[2].decode("utf-8", "replace"))
        check("speed: after an update the version changes, so nobody keeps an old copy", v2 and v1 and v2.group(1) != v1.group(1), [v1 and v1.group(1), v2 and v2.group(1)])
        # phone layout of the new pages
        c6 = await br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = await c6.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        await c6.route("**/*", lambda route: route.abort() if re.search(r"googletagmanager|fonts\.g", route.request.url) else route.continue_())
        for p_ in ("pitch", "features", "integrations", "security", "customers", "changelog", "privacy", "shopify-customer-support-india", "tools/whatsapp-templates", "tools/sla-calculator"):
            await pg.goto(BASE + "/" + p_); await pg.wait_for_timeout(900)
            await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(300)
            ok = await pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1")
            wide = await pg.evaluate("[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>window.innerWidth+2&&!e.closest('pre,.tablewrap,.mobile-panel,nav,.marquee-track,.tabs,.feat-tabs,.cmp-table-wrap,[class*=marquee]')&&getComputedStyle(e).position!=='fixed'}).slice(0,3).map(e=>e.tagName+'.'+e.className)")
            check(f"phone: /{p_} does not scroll sideways", ok and not wide, wide)
        await pg.goto(BASE + "/security"); await pg.wait_for_timeout(600); await pg.screenshot(path=os.path.join(SHOTS, "site_security_phone.png"))
        await pg.goto(BASE + "/pitch"); await pg.wait_for_timeout(1500); await pg.screenshot(path=os.path.join(SHOTS, "site_home_phone.png"))
        check("phone: no script errors on the pages", not errs, errs)
        await c6.close(); await br.close()

async def run():
    try: await main()
    finally:
        srv.terminate(); time.sleep(0.8)
        try: os.rmdir(os.path.join(app, "node_modules"))   # removes only the link, never the real folder
        except OSError: pass
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed"); sys.exit(1 if FAIL else 0)
asyncio.run(run())
