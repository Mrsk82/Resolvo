import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001")
OUT = r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline"
os.makedirs(OUT, exist_ok=True)
THEME = sys.argv[1] if len(sys.argv) > 1 else "resolvo"
TAG = sys.argv[2] if len(sys.argv) > 2 else "before"

# (label, route, params)
ROUTES = [
    ("dashboard", "dashboard", {}), ("my-dashboard", "my-dashboard", {}),
    ("ticket-inbox", "ticket-inbox", {}), ("customers", "customers", {}),
    ("create-issue", "create-issue", {}), ("issue-list", "issue-list", {}), ("my-issues", "my-issues", {}),
    ("kanban", "kanban", {}), ("sprints", "sprints", {}),
    ("settings-knowledge", "settings", {"tab": "knowledge-base"}), ("settings-automation", "settings", {"tab": "automation"}),
    ("settings-escalation", "settings", {"tab": "escalation"}), ("reports", "reports", {}), ("analytics", "analytics", {}),
    ("workload", "workload", {}), ("customer-health", "customer-health", {}), ("export", "export", {}),
    ("integration-marketplace", "integration-marketplace", {}), ("user-management", "user-management", {}),
    ("teams", "teams", {}), ("ai-hub", "ai-hub", {}), ("announcements", "announcements", {}),
    ("platform-admin", "platform-admin", {}), ("settings-general", "settings", {}), ("api-integration", "api-integration", {}),
    ("release-notes", "release-notes", {}), ("audit-trail", "audit-trail", {}),
    ("email-ticketing", "email-ticketing", {}), ("escalations", "escalations", {}), ("sla-settings", "sla-settings", {}),
]
WIDTHS = [1440, 1280, 1024, 768, 390]

CHECK = """() => {
  const ca = document.getElementById('contentArea');
  const txt = (ca ? ca.innerText : '').trim();
  let wide = [];
  document.querySelectorAll('#contentArea *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 2 && r.width > 0 && wide.length < 3) { const cs = getComputedStyle(e); let p = e.parentElement, scrollable = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scrollable = true; break; } p = p.parentElement; } if (!scrollable) wide.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' right=' + Math.round(r.right)); } });
  return { overflow: document.documentElement.scrollWidth > innerWidth + 2, scrollW: document.documentElement.scrollWidth, textLen: txt.length, denied: /access denied|not available on your plan|upgrade/i.test(txt.slice(0, 200)), head: txt.slice(0, 70).replace(/\\n/g, ' | '), wide };
}"""

async def main():
    results = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        for w in WIDTHS:
            ctx = await b.new_context(viewport={"width": w, "height": 900})
            pg = await ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append("PAGE:" + str(e)[:140]))
            pg.on("console", lambda m: errs.append("CONSOLE:" + m.text[:140]) if m.type == "error" else None)
            await pg.goto(BASE + "/")
            await pg.evaluate("""async(th)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme',th);localStorage.setItem('tt_v3b','1')}""", THEME)
            await pg.goto(BASE + "/"); await pg.wait_for_timeout(2500)
            for label, route, params in ROUTES:
                errs.clear()
                try:
                    await pg.evaluate("([r,p])=>App.navigate(r,p)", [route, params])
                    await pg.wait_for_timeout(1400)
                    info = await pg.evaluate(CHECK)
                except Exception as e:
                    info = {"overflow": None, "textLen": 0, "head": "EXC " + str(e)[:80], "wide": [], "denied": False}
                info.update({"route": label, "width": w, "errors": list(dict.fromkeys(errs))[:3]})
                results.append(info)
                if w in (1440, 390):
                    await pg.screenshot(path=os.path.join(OUT, f"{TAG}_{label}_{w}.png"))
            await ctx.close()
        await b.close()
    json.dump(results, open(os.path.join(OUT, f"results_{TAG}.json"), "w"), indent=1)
    bad = [r for r in results if r["overflow"] or r["errors"] or r["textLen"] < 20]
    print("checked", len(results), "route/width combinations;", len(bad), "with a finding")
    by = {}
    for r in bad:
        by.setdefault(r["route"], []).append(r)
    for k, v in by.items():
        ws = ",".join(str(x["width"]) for x in v)
        why = set()
        for x in v:
            if x["overflow"]: why.add("overflow")
            if x["errors"]: why.add("errors:" + x["errors"][0][:70])
            if x["textLen"] < 20: why.add("empty")
        print(f"  {k:26} widths[{ws}] {sorted(why)}")

asyncio.run(main())
