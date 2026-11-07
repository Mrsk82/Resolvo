"""Phone audit of the screens not covered before (390x844): the full ticket page, issue pages, New Issue and New Ticket forms,
knowledge base, customer page and its edit form. For each: nothing wider than the phone, nothing sticking out past the right edge,
no blank page or script error, and the main buttons big enough to tap.
Runs against the local app (RESOLVO_BASE, default http://localhost:3000, demo workspace)."""
import asyncio, json, os, sys, urllib.request
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("RESOLVO_BASE", "http://localhost:3000"); PASS, FAIL = [], []
SHOTS = os.environ.get("SHOTS", os.environ.get("TEMP", "."))
def check(n, ok, d=""):
    (PASS if ok else FAIL).append(n); print(("PASS  " if ok else "FAIL  ") + n + (("  -> " + str(d)[:400]) if d and not ok else ""))
def api(path, tok, body=None):
    h = {"x-session-token": tok, "Content-Type": "application/json"}
    return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h), timeout=40).read().decode())
JS_PROBE = """()=>{
  const W=document.documentElement.clientWidth, out={wide:document.documentElement.scrollWidth>W+1, past:[], small:[], overlap:[]};
  const inScroller=(e)=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/(auto|scroll)/.test(s.overflowX)&&p.scrollWidth>p.clientWidth)return true;if(s.position==='fixed')return false;}return false;};
  const vis=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0';};
  const desc=(e)=>(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).slice(0,2).join('.'):'')+' "'+(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,24)+'"');
  const scope=document.querySelector('.rv-modal, .modal')||document.getElementById('contentArea')||document.body;
  scope.querySelectorAll('*').forEach(e=>{
    if(!vis(e))return; const r=e.getBoundingClientRect();
    if(r.right>W+2&&!inScroller(e)&&getComputedStyle(e).position!=='fixed')out.past.push(desc(e)+' right='+Math.round(r.right));
  });
  scope.querySelectorAll('button,a[href],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,[role=button]').forEach(e=>{
    if(!vis(e)||e.closest('.mobile-bottom-nav'))return; const r=e.getBoundingClientRect();
    if(r.height<30||r.width<30)out.small.push(desc(e)+' '+Math.round(r.width)+'x'+Math.round(r.height));
  });
  out.past=out.past.slice(0,6); out.small=out.small.slice(0,8); return out;}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        await pg.goto(BASE + "/")
        tok = await pg.evaluate("""async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'demo1234'})}).then(x=>x.json());localStorage.clear();localStorage.setItem('tt_session_token',r.token);localStorage.setItem('tt_theme','resolvo');localStorage.setItem('tt_v3b','1');return r.token}""")
        await pg.goto(BASE + "/"); await pg.wait_for_function("typeof App!=='undefined'&&App.currentUser", timeout=30000); await pg.wait_for_timeout(1200)
        tk = api("/api/call", tok, {"fn": "getTickets", "args": [{"status": "all", "limit": 50, "sort": "newest"}]})["tickets"]
        iss = api("/api/call", tok, {"fn": "getIssues", "args": []}).get("issues", [])
        cu = api("/api/crm/customers", tok)["customers"]
        tid, iid, cid = tk[0]["id"], (iss[0]["id"] if iss else None), (cu[0]["id"] if cu else None)
        screens = [("ticket page", f"App.navigate('ticket-detail',{{id:'{tid}'}})"), ("new issue form", "App.navigate('create-issue')"), ("all issues", "App.navigate('issue-list')"), ("my issues", "App.navigate('my-issues')"),
                   ("kanban", "App.navigate('kanban')"), ("sprints", "App.navigate('sprints')"), ("knowledge base", "App.renderUnifiedSettings('knowledge-base')"), ("customer page", f"App.navigate('customer',{{id:'{cid}'}})"),
                   ("new ticket form", "App._shellPrimary()"), ("customer edit form", f"App._custEdit('{cid}')")]
        if iid: screens.insert(1, ("issue page", f"App.navigate('issue-detail',{{id:'{iid}'}})"))
        report = {}
        for name, call in screens:
            errs.clear()
            if name == "customer edit form":
                await pg.evaluate(f"App.navigate('customer',{{id:'{cid}'}})"); await pg.wait_for_timeout(1500)
            await pg.evaluate("document.querySelectorAll('.modal-overlay,.rv-overlay').forEach(m=>m.remove())")
            await pg.evaluate(call); await pg.wait_for_timeout(1700)
            r = await pg.evaluate(JS_PROBE); report[name] = r
            txt = (await pg.evaluate("(document.querySelector('.rv-modal, .modal')||document.getElementById('contentArea')).innerText")).strip()
            check(f"{name}: not wider than the phone", not r["wide"], r)
            check(f"{name}: nothing sticks out past the right edge", not r["past"], r["past"])
            check(f"{name}: shows content and throws no error", len(txt) > 20 and not errs, [errs[:1], txt[:60]])
            check(f"{name}: buttons and fields are at least 30 px to tap", not r["small"], r["small"])
            await pg.screenshot(path=os.path.join(SHOTS, "audit_" + name.replace(" ", "_") + ".png"))
        await b.close()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed"); sys.exit(1 if FAIL else 0)
asyncio.run(main())
