"""The Android app page (/app), the download, and the mobile-app section on the main site (/pitch)."""
import asyncio, hashlib, json, os, re, sys, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("RESOLVO_BASE", "http://localhost:3001"); PASS, FAIL = [], []
APK = r"C:\Users\Asif\Desktop\New\TechTrack\downloads\Resolvo-Android-1.1.0.apk"
COUNT = r"C:\Users\Asif\Desktop\New\TechTrack\data\app_downloads.json"
SHOTS = "C:/Users/Asif/Desktop/New/Resolvo-UI-files/mobile-audit/site_"
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:250]) if d and not ok else ""))
def count():
    try: return json.load(open(COUNT)).get("total", 0)
    except Exception: return 0
async def main():
    sha = hashlib.sha256(open(APK, "rb").read()).hexdigest(); size = os.path.getsize(APK)
    # ---------- the download itself ----------
    c0 = count()
    r = urllib.request.urlopen(BASE + "/download/android", timeout=30); body = r.read(); h = r.headers
    check("download: serves the APK with the Android file type", h.get("Content-Type", "").startswith("application/vnd.android.package-archive"), h.get("Content-Type"))
    check("download: arrives as a file named Resolvo-Android-1.1.0.apk", "attachment" in h.get("Content-Disposition", "") and "Resolvo-Android-1.1.0.apk" in h.get("Content-Disposition", ""), h.get("Content-Disposition"))
    check("download: complete file, same fingerprint as the build", len(body) == size and hashlib.sha256(body).hexdigest() == sha, (len(body), size))
    check("download: it is a valid package (zip with the Android manifest)", body[:2] == b"PK" and b"AndroidManifest.xml" in body[:200000] + body[-200000:])
    check("download: a daily counter goes up by one", count() == c0 + 1, (c0, count()))
    try: code = urllib.request.urlopen(BASE + "/downloads/Resolvo-Android-1.1.0.apk").status
    except urllib.error.HTTPError as e: code = e.code
    check("download: the file is only reachable through the download route (direct path gives 404)", code == 404, code)
    page = urllib.request.urlopen(BASE + "/app").read().decode("utf-8")
    check("download: the direct /downloads path is not served as a file", code != 200 or page.startswith("<!DOCTYPE") is False, code)
    check("page: shows the real fingerprint of the file", sha in page)
    check("sitemap lists /app", "https://app.resolvogroup.com/app<" in urllib.request.urlopen(BASE + "/sitemap.xml").read().decode())
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for name, vp, mobile in [("phone", {"width": 390, "height": 844}, True), ("desktop", {"width": 1440, "height": 900}, False)]:
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1, accept_downloads=True); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150])); pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" and "googletagmanager" not in m.text and "fonts.g" not in m.text and "ERR_" not in m.text else None)
            await pg.goto(BASE + "/app"); await pg.wait_for_timeout(1800)
            check(f"/app {name}: title and one main heading", "Android" in await pg.title() and await pg.locator("h1").count() == 1)
            check(f"/app {name}: no sideways scroll", await pg.evaluate("document.documentElement.scrollWidth") <= vp["width"] + 1, await pg.evaluate("document.documentElement.scrollWidth"))
            bt = await pg.locator("#dlMain").bounding_box()
            check(f"/app {name}: Download button is visible without scrolling", bt and bt["y"] + bt["height"] < vp["height"], bt)
            if mobile: check("/app phone: button is thumb-sized", bt["height"] >= 44 and bt["width"] >= 200, bt)
            broken = await pg.evaluate("[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src.split('/').pop())")
            await pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')"); await pg.wait_for_timeout(1500)
            broken = await pg.evaluate("[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src.split('/').pop())")
            check(f"/app {name}: every screenshot loads", not broken, broken)
            links = await pg.evaluate("[...new Set([...document.querySelectorAll('a[href^=\"/\"]')].map(a=>a.getAttribute('href').split('#')[0]))]")
            bad = []
            for l in links:
                if l in ("/download/android",): continue
                try: s = await pg.evaluate("(u)=>fetch(u,{redirect:'follow'}).then(r=>r.status)", l)
                except Exception: s = 0
                if s >= 400 or s == 0: bad.append((l, s))
            check(f"/app {name}: every link on the page works", not bad, bad)
            async with pg.expect_download() as dl: await pg.locator("#dlMain").click()
            d = await dl.value; path = await d.path()
            check(f"/app {name}: clicking Download saves the same file", d.suggested_filename == "Resolvo-Android-1.1.0.apk" and hashlib.sha256(open(path, "rb").read()).hexdigest() == sha, d.suggested_filename)
            txt = await pg.evaluate("document.body.textContent")
            check(f"/app {name}: install steps, FAQ and honest notes are there", all(t in txt for t in ["Why does Android show a warning", "Is there an iPhone app", "Does it work without internet", "On our list for the next updates"]))
            check(f"/app {name}: no console errors", not errs, errs[:2])
            await pg.screenshot(path=SHOTS + f"app_{name}.png", full_page=True)
            await ctx.close()
        # main site
        for name, vp, mobile in [("phone", {"width": 390, "height": 844}, True), ("desktop", {"width": 1440, "height": 900}, False)]:
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
            await pg.goto(BASE + "/pitch"); await pg.wait_for_timeout(1800)
            check(f"/pitch {name}: the announcement bar points to the app", "Android" in await pg.locator(".topbar").inner_text() and await pg.locator(".topbar a").get_attribute("href") == "/app")
            sec = pg.locator("#app")
            check(f"/pitch {name}: the mobile app section is there with a download button", await sec.count() == 1 and await sec.locator("a[href='/download/android']").count() == 1)
            await sec.scroll_into_view_if_needed(); await pg.wait_for_timeout(1500)
            check(f"/pitch {name}: its phone pictures load", await pg.evaluate("[...document.querySelectorAll('#app img')].every(i=>i.complete&&i.naturalWidth>0)"))
            check(f"/pitch {name}: the page is not wider than the screen", await pg.evaluate("document.documentElement.scrollWidth") <= vp["width"] + 1, await pg.evaluate("document.documentElement.scrollWidth"))
            if not mobile: check("/pitch desktop: 'Mobile app' is in the menu and footer", await pg.locator("nav a[href='/app']").count() >= 1 and await pg.locator("footer a[href='/app']").count() == 1)
            else:
                await pg.locator("#navBurger").tap(); await pg.wait_for_timeout(400)
                check("/pitch phone: 'Mobile app' is in the phone menu", await pg.locator("#mobilePanel a[href='/app']").is_visible())
            await sec.scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
            await pg.screenshot(path=SHOTS + f"pitch_{name}.png")
            check(f"/pitch {name}: no page errors", not errs, errs[:2])
            await ctx.close()
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL: print("FAILED:", *FAIL, sep="\n  "); sys.exit(1)
asyncio.run(main())
