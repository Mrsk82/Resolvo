import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))

BASE = __import__("os").environ.get("RESOLVO_BASE", "http://localhost:3001")
OUT = r"C:\Users\Asif\Desktop\New\Resolvo-UI-files\baseline"
TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
THEME = sys.argv[2] if len(sys.argv) > 2 else "resolvo"

ROUTES = [
    ("dashboard", "dashboard", {}), ("ticket-inbox", "ticket-inbox", {}), ("customers", "customers", {}),
    ("create-issue", "create-issue", {}), ("issue-list", "issue-list", {}), ("my-issues", "my-issues", {}),
    ("kanban", "kanban", {}), ("sprints", "sprints", {}), ("settings-knowledge", "settings", {"tab": "knowledge-base"}),
    ("settings-automation", "settings", {"tab": "automation"}), ("settings-escalation", "settings", {"tab": "escalation"}),
    ("reports", "reports", {}), ("analytics", "analytics", {}), ("workload", "workload", {}),
    ("customer-health", "customer-health", {}), ("export", "export", {}), ("integration-marketplace", "integration-marketplace", {}),
    ("user-management", "user-management", {}), ("teams", "teams", {}), ("ai-hub", "ai-hub", {}), ("announcements", "announcements", {}),
    ("platform-admin", "platform-admin", {}), ("settings-general", "settings", {}), ("api-integration", "api-integration", {}),
    ("release-notes", "release-notes", {}), ("audit-trail", "audit-trail", {}), ("email-ticketing", "email-ticketing", {}),
    ("escalations", "escalations", {}), ("sla-settings", "sla-settings", {}),
]

JS = """() => {
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  const take = (sel, f) => [...document.querySelectorAll('#contentArea ' + sel)].map(f).filter(Boolean);
  const label = e => clean(e.getAttribute('aria-label') || e.title || e.innerText || e.value || e.placeholder || e.name || e.id);
  return {
    buttons: take('button, [role=button], .btn-primary, .btn-secondary', label),
    links: take('a[href], a[onclick]', label),
    inputs: take('input:not([type=hidden]):not([type=checkbox]), textarea', e => clean(e.placeholder || e.name || e.id || e.type)),
    selects: take('select', e => clean(e.id || e.name || (e.options[0] && e.options[0].text))),
    checkboxes: take('input[type=checkbox]', e => clean(e.id || e.name || 'checkbox')),
    onclicks: take('[onclick]', e => (e.getAttribute('onclick') || '').slice(0, 60)).length,
    tables: document.querySelectorAll('#contentArea table').length,
    textLen: (document.getElementById('contentArea') || {innerText: ''}).innerText.trim().length
  };
}"""

async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(BASE + "/")
        await pg.evaluate("""async(th)=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme',th);localStorage.setItem('tt_v3b','1')}""", THEME)
        await pg.goto(BASE + "/"); await pg.wait_for_timeout(2500)
        for label, route, params in ROUTES:
            await pg.evaluate("([r,p])=>App.navigate(r,p)", [route, params]); await pg.wait_for_timeout(1500)
            out[label] = await pg.evaluate(JS)
        # the sidebar + topbar controls too
        out["_shell"] = await pg.evaluate("""() => { const c = s => [...document.querySelectorAll(s)].map(e => (e.getAttribute('aria-label') || e.title || e.innerText || e.id || '').replace(/\\s+/g,' ').trim().slice(0,32)).filter(Boolean); return { sidebarItems: c('.sidebar .nav-item'), topbar: c('.topbar button, .topbar a, .topbar input') }; }""")
        await b.close()
    json.dump(out, open(os.path.join(OUT, f"inventory_{TAG}.json"), "w"), indent=1)
    tot = {f: sum(len(v[f]) for kk, v in out.items() if kk != '_shell') for f in ("buttons", "links", "inputs", "selects", "checkboxes")}
    print("routes inventoried:", len(out) - 1, "| totals:", tot)
    print("sidebar items:", len(out["_shell"]["sidebarItems"]), "| topbar controls:", len(out["_shell"]["topbar"]))
    for k, v in out.items():
        if k == "_shell": continue
        print(f"  {k:26} buttons={len(v['buttons']):3} links={len(v['links']):3} inputs={len(v['inputs']):2} selects={len(v['selects']):2} tables={v['tables']}")

asyncio.run(main())
